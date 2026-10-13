import type {FinanceDecision} from './arc-finance';
type Draft={wallet:string;id:string;decision:FinanceDecision};
/** Serialize edits to each row so a slow earlier response cannot overwrite a newer note. */
export class FinanceSaveQueue{
  pending=new Map<string,Draft>();
  errors=new Map<string,string>();
  private running=new Map<string,Promise<void>>();
  constructor(private write:(wallet:string,id:string,decision:FinanceDecision)=>Promise<unknown>,private notify:()=>void){}
  set(wallet:string,id:string,decision:FinanceDecision){const key=`${wallet}/${id}`;this.pending.set(key,{wallet,id,decision});this.errors.delete(key);this.notify();return key;}
  flush(key:string):Promise<void>{
    const existing=this.running.get(key);if(existing)return existing;
    if(!this.pending.has(key))return Promise.resolve();
    const task=(async()=>{
      while(this.pending.has(key)){
        const draft=this.pending.get(key)!;
        try{await this.write(draft.wallet,draft.id,draft.decision);this.errors.delete(key);if(this.pending.get(key)===draft)this.pending.delete(key);}
        catch(e){this.errors.set(key,e instanceof Error?e.message:'Kaydedilemedi.');break;}
      }
    })();
    this.running.set(key,task);this.notify();
    return task.finally(()=>{this.running.delete(key);this.notify();});
  }
  overlay(wallet:string,saved:Record<string,FinanceDecision>){const values={...saved};for(const draft of this.pending.values())if(draft.wallet===wallet)values[draft.id]=draft.decision;return values;}
}
