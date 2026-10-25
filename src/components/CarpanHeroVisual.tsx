import type { CSSProperties } from 'react';

const scenes = ['finance', 'terminal', 'social'] as const;
const artwork = {finance:'carpan-cinema-finance-usdc-v3.webp',terminal:'carpan-cinema-terminal-v2.webp',social:'carpan-cinema-social-arc-v3.webp'};
const particles = Array.from({ length: 16 }, (_, index) => ({
  left: `${45 + (index * 19 % 52)}%`,
  top: `${12 + (index * 23 % 73)}%`,
  '--particle-delay': `${-index * 1.7}s`,
  '--particle-duration': `${7 + index % 5}s`,
} as CSSProperties));

/** Decorative original artwork. It does not represent live onchain activity. */
export function CarpanHeroVisual({ variant }: { variant: number }) {
  return <div className="carpan-cinema" aria-hidden="true">
    {scenes.map((scene, index) => <div key={scene} className={`carpan-cinema-scene cinema-${scene}${index === variant ? ' is-active' : ''}`}>
      <img className="carpan-cinema-art" src={`/images/${artwork[scene]}`} alt="" decoding="async" fetchPriority={index === 0 ? 'high' : 'low'}/>
      <div className="carpan-cinema-aura"/>
    </div>)}
    <div className="carpan-cinema-shade"/>
    <svg className="carpan-cinema-trails" viewBox="0 0 1440 600" preserveAspectRatio="none" fill="none">
      <path d="M430 585C680 440 705 535 980 380S1240 140 1470 155"/>
      <path d="M670-20C1070 90 680 470 1470 490"/>
      <path d="M720 620C730 345 1330 360 1450 50"/>
    </svg>
    <div className="carpan-cinema-particles">{particles.map((style, index) => <i key={index} style={style}/>)}</div>
    <div className="carpan-cinema-edge"/>
  </div>;
}
