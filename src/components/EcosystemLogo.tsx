import {useState} from 'react';
import type {EcosystemEntry} from '../ecosystem';
import './ecosystem-logo.css';

export function EcosystemLogo({project,size='small'}:{project:EcosystemEntry;size?:'small'|'large'|'cover'}){
  const [failed,setFailed]=useState(false);
  const logo=project.logo;
  return <span className={`eco-logo eco-logo-${size}`} style={{color:project.color,background:logo&&!failed?logo.background:undefined}} aria-hidden="true">
    {logo&&!failed?<img src={logo.src} alt="" width={64} height={64} loading={size==='large'?'eager':'lazy'} onError={()=>setFailed(true)}/>:project.name.slice(0,2).toUpperCase()}
  </span>;
}
