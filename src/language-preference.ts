export function initialLanguage(stored:unknown,explicit:unknown):'tr'|'en'{
 if(explicit==='tr'||explicit==='en')return explicit;
 if(stored==='tr'||stored==='en')return stored;
 return 'en';
}
