import {Database} from 'bun:sqlite';
import {test,expect} from 'bun:test';
import {privateKeyToAccount} from 'viem/accounts';
import {prepareGoogleWalletLink,completeGoogleWalletLink,initGoogleWalletLink} from './googleWalletLink';
const owner=privateKeyToAccount(`0x${'11'.repeat(32)}`),other=privateKeyToAccount(`0x${'22'.repeat(32)}`);
const session='a'.repeat(64),origin='https://carpan.app';
function setup(){
 const db=new Database(':memory:');
 db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,google_id TEXT UNIQUE,email TEXT UNIQUE,wallet_address TEXT UNIQUE,wallet_verified_at TEXT,is_demo INTEGER,role TEXT,auth_method TEXT,x_id TEXT,public_name TEXT);
 CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT,auth_method TEXT,created_at TEXT,expires_at TEXT);
 CREATE TABLE free_slots_ledger(user_id TEXT,reason TEXT,delta INTEGER);
 CREATE TABLE referral_batches(user_id TEXT,source TEXT,project_id TEXT,total_slots INTEGER,remaining_slots INTEGER);
 CREATE TABLE requests(user_id TEXT,data TEXT);`);
 initGoogleWalletLink(db);initGoogleWalletLink(db);
 const at=new Date().toISOString();
 db.run("INSERT INTO users VALUES('google','google-sub','owner@example.test',NULL,NULL,0,'user','google','google:google-sub','New profile',NULL)");
 db.run("INSERT INTO users VALUES('wallet',NULL,NULL,?,?,0,'admin','x','123','Existing profile',NULL)",[owner.address.toLowerCase(),at]);
 db.run("INSERT INTO sessions VALUES(?,'google','google',?,?)",[session,at,new Date(Date.now()+3600_000).toISOString()]);
 db.run("INSERT INTO sessions VALUES(?,'google','google',?,?)",['b'.repeat(64),at,new Date(Date.now()+3600_000).toISOString()]);
 db.run("INSERT INTO sessions VALUES(?,'wallet','wallet',?,?)",['c'.repeat(64),at,new Date(Date.now()+3600_000).toISOString()]);
 db.run("INSERT INTO free_slots_ledger VALUES('google','initial_free_grant',5)");
 db.run("INSERT INTO referral_batches VALUES('google','initial',NULL,5,5)");
 return db;
}
function newSession(db:Database){return (id:string)=>{db.run('INSERT INTO sessions VALUES(?,?,?,?,?)',['d'.repeat(64),id,'google',new Date().toISOString(),new Date(Date.now()+3600_000).toISOString()]);return 'test-bearer';};}
async function signed(db:Database){const preview=prepareGoogleWalletLink(db,'google',session,owner.address,origin);return {preview,input:{nonce:preview.nonce,signature:await owner.signMessage({message:preview.message})}};}
test('explicit dual proof links Google to the existing wallet account without replacing records, role or grants',async()=>{
 const db=setup();try{
  db.run("INSERT INTO requests VALUES('wallet','Existing request')");
  const {preview,input}=await signed(db);expect(preview.message).toContain(origin);expect(preview.message).toContain('Existing permissions: admin');expect(preview.message).toContain('owner@example.test');
  expect(await completeGoogleWalletLink(db,'google',session,input,newSession(db))).toEqual({userId:'wallet',sessionToken:'test-bearer'});
  expect(db.query("SELECT google_id,email,role,wallet_address,public_name FROM users WHERE id='wallet'").get()).toEqual({google_id:'google-sub',email:'owner@example.test',role:'admin',wallet_address:owner.address.toLowerCase(),public_name:'Existing profile'});
  expect(db.query("SELECT google_id,email,merged_into FROM users WHERE id='google'").get()).toEqual({google_id:null,email:null,merged_into:'wallet'});
  expect(db.query("SELECT count(*) AS n FROM sessions WHERE user_id='google'").get()).toEqual({n:0});
  expect(db.query("SELECT count(*) AS n FROM sessions WHERE user_id='wallet'").get()).toEqual({n:2});
  expect(db.query('SELECT count(*) AS n FROM account_identity_link_audit').get()).toEqual({n:1});
  expect(db.query('SELECT count(*) AS n FROM users').get()).toEqual({n:2});expect(db.query('SELECT * FROM requests').get()).toEqual({user_id:'wallet',data:'Existing request'});
  expect(db.query('SELECT sum(delta) AS n FROM free_slots_ledger').get()).toEqual({n:5});
  await expect(completeGoogleWalletLink(db,'google',session,input,newSession(db))).rejects.toThrow();
 }finally{db.close();}
});
test('ordinary wallet-login signatures, foreign wallets and sessions cannot authorize identity linking',async()=>{
 const db=setup();try{const {preview}=await signed(db);
  for(const signature of [await owner.signMessage({message:'Carpan wallet login'}),await other.signMessage({message:preview.message})])await expect(completeGoogleWalletLink(db,'google',session,{nonce:preview.nonce,signature},newSession(db))).rejects.toThrow('signature');
  const signature=await owner.signMessage({message:preview.message});await expect(completeGoogleWalletLink(db,'google','b'.repeat(64),{nonce:preview.nonce,signature},newSession(db))).rejects.toThrow('expired');
  expect(db.query('SELECT count(*) AS n FROM account_identity_link_audit').get()).toEqual({n:0});
 }finally{db.close();}
});
test('fresh real Google-only sessions and verified non-demo targets are required',()=>{
 for(const sql of ["UPDATE sessions SET auth_method='email'","UPDATE sessions SET created_at='2020-01-01'","UPDATE sessions SET expires_at='2020-01-01'","UPDATE users SET role='admin' WHERE id='google'","UPDATE users SET is_demo=1 WHERE id='google'","UPDATE users SET x_id='456' WHERE id='google'","UPDATE users SET is_demo=1 WHERE id='wallet'","UPDATE users SET wallet_verified_at=NULL WHERE id='wallet'","UPDATE users SET google_id='someone-else' WHERE id='wallet'","UPDATE users SET email='someone@example.test' WHERE id='wallet'"]){const db=setup();try{db.run(sql);expect(()=>prepareGoogleWalletLink(db,'google',session,owner.address,origin)).toThrow();}finally{db.close();}}
});
test('existing source activity or consumed/assigned credits prevent automatic linking',()=>{
 for(const sql of ["INSERT INTO requests VALUES('google','Private record')","UPDATE free_slots_ledger SET reason='referral_verified'","UPDATE referral_batches SET project_id='assigned'","UPDATE referral_batches SET remaining_slots=4"]){const db=setup();try{db.run(sql);expect(()=>prepareGoogleWalletLink(db,'google',session,owner.address,origin)).toThrow('activity');expect(db.query("SELECT google_id FROM users WHERE id='google'").get()).toEqual({google_id:'google-sub'});}finally{db.close();}}
});
test('expiry, refreshed challenges and changes after preview preserve both accounts',async()=>{
 for(const sql of ["UPDATE google_wallet_link_challenges SET expires_at='2020-01-01'","UPDATE users SET role='user' WHERE id='wallet'","INSERT INTO requests VALUES('google','New activity')"]){const db=setup();try{const {input}=await signed(db);db.run(sql);await expect(completeGoogleWalletLink(db,'google',session,input,newSession(db))).rejects.toThrow();expect(db.query('SELECT count(*) AS n FROM account_identity_link_audit').get()).toEqual({n:0});}finally{db.close();}}
 const db=setup();try{const {input}=await signed(db);prepareGoogleWalletLink(db,'google',session,owner.address,origin);await expect(completeGoogleWalletLink(db,'google',session,input,newSession(db))).rejects.toThrow('used');}finally{db.close();}
});
test('a session-creation failure rolls back identities, session revocation, nonce consumption and audit',async()=>{
 const db=setup();try{const {input}=await signed(db);await expect(completeGoogleWalletLink(db,'google',session,input,()=>{throw Error('Session insert failed');})).rejects.toThrow('Session insert failed');
  expect(db.query("SELECT google_id,merged_into FROM users WHERE id='google'").get()).toEqual({google_id:'google-sub',merged_into:null});expect(db.query("SELECT google_id FROM users WHERE id='wallet'").get()).toEqual({google_id:null});
  expect(db.query('SELECT count(*) AS n FROM sessions').get()).toEqual({n:3});expect(db.query('SELECT used FROM google_wallet_link_challenges').get()).toEqual({used:0});expect(db.query('SELECT count(*) AS n FROM account_identity_link_audit').get()).toEqual({n:0});
 }finally{db.close();}
});
test('simultaneous completions create only one link and retain target permission boundaries',async()=>{
 const db=setup();try{const {input}=await signed(db);const results=await Promise.allSettled([completeGoogleWalletLink(db,'google',session,input,newSession(db)),completeGoogleWalletLink(db,'google',session,input,newSession(db))]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(db.query('SELECT count(*) AS n FROM account_identity_link_audit').get()).toEqual({n:1});}finally{db.close();}
});
