import React, {createContext,useContext,useEffect,useMemo,useState} from 'react';
import en from './en.json';
import extra from './extra-en.json';
import finance from './finance-en.json';
import platform from './platform-en.json';
import sessions from './sessions-en.json';
import solana from './solana-en.json';
import grant from './grant-en.json';
import invoices from './invoices-en.json';
import {initialLanguage} from '../language-preference';
const dictionary:Record<string,string>={...en,...extra,...finance,...platform,...sessions,...solana,...grant,...invoices};
export type Language='tr'|'en';
let language:Language='en';
if(typeof window!=='undefined'){let stored:unknown;try{stored=localStorage.getItem('carpan-language');}catch{/* Private browsing */}language=initialLanguage(stored,new URLSearchParams(window.location.search).get('lang'));}
export function t(value:string,values:unknown[]=[]):string {
  const text=language==='en'?dictionary[value]??value:value;
  return text.replace(/\{(\d+)\}/g,(match,index)=>Number(index)<values.length?String(values[Number(index)]):match);
}
export const getLocale=()=>language==='en'?'en-US':'tr-TR';
const Context=createContext({language,setLanguage:(_value:Language)=>{},t});
export function I18nProvider({children}:{children:React.ReactNode}){
  const [current,setCurrent]=useState(language);
  const value=useMemo(()=>({language:current,t,setLanguage:(next:Language)=>{
    language=next;setCurrent(next);try{localStorage.setItem('carpan-language',next);}catch{/* Private browsing */}
  }}),[current]);
  useEffect(()=>{document.documentElement.lang=current;document.title=current==='en'?'Carpan — Arc Finance, Terminal & Ecosystem':'Carpan — Arc Finans, Terminal ve Ekosistem';},[current]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useI18n=()=>useContext(Context);
/** Static interface dictionaries only; never apply to API or user content. */
export function localized<T>(value:T):T {
  if(typeof value==='string')return t(value) as T;
  if(!value||typeof value!=='object')return value;
  if(React.isValidElement(value))return React.cloneElement(value as React.ReactElement<{children?:React.ReactNode}>,{},localized((value.props as {children?:React.ReactNode}).children)) as T;
  if(Array.isArray(value))return new Proxy(value,{get(target,key,receiver){return localized(Reflect.get(target,key,receiver));}}) as T;
  if(Object.getPrototypeOf(value)!==Object.prototype)return value;
  return new Proxy(value,{get(target,key,receiver){return localized(Reflect.get(target,key,receiver));}});
}

