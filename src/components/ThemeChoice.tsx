import {Moon,Sun} from 'lucide-react';
import {useTheme} from '../theme';
import {useI18n} from '../i18n';

export function ThemeChoice(){const {theme,setTheme}=useTheme(),{language}=useI18n();return <div className="carpan-theme-choice" role="group" aria-label={language==='en'?'Appearance':'Görünüm'}>{(['light','dark'] as const).map(value=><button key={value} type="button" aria-pressed={theme===value} onClick={()=>setTheme(value)}>{value==='light'?<Sun size={16}/>:<Moon size={16}/>}<span>{language==='en'?(value==='light'?'Light':'Dark'):(value==='light'?'Açık':'Koyu')}</span></button>)}</div>;}
