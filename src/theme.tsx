import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';

type Theme='dark'|'light';
const key='carpan.theme';
function readTheme():Theme{try{return localStorage.getItem(key)==='light'?'light':'dark';}catch{return 'dark';}}
function applyTheme(theme:Theme){document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='light'?'#f4f6fa':'#09090c');}
applyTheme(readTheme());
const ThemeContext=createContext<{theme:Theme;setTheme:(theme:Theme)=>void}>({theme:'dark',setTheme:()=>{}});
export function ThemeProvider({children}:{children:ReactNode}){
 const [theme,setValue]=useState<Theme>(readTheme);
 function setTheme(value:Theme){applyTheme(value);setValue(value);try{localStorage.setItem(key,value);}catch{/* This tab can still change theme when storage is unavailable. */}}
 useEffect(()=>{const sync=(event:StorageEvent)=>{if(event.key===key||event.key===null){const value=readTheme();applyTheme(value);setValue(value);}};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
 return <ThemeContext.Provider value={{theme,setTheme}}>{children}</ThemeContext.Provider>;
}
export const useTheme=()=>useContext(ThemeContext);
