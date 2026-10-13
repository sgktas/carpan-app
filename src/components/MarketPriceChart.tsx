import {useEffect, useId, useRef, useState} from 'react';
import {Activity, CandlestickChart, ChevronLeft, ChevronRight, LineChart} from 'lucide-react';
import {useI18n} from '../i18n';
import type {MarketCandle, MarketRange} from '../markets';

function formatPrice(value:number,language:string,step:number){
  if(value>0&&value<1e-8)return new Intl.NumberFormat(language==='en'?'en-US':'tr-TR',{style:'currency',currency:'USD',notation:'scientific',maximumSignificantDigits:6}).format(value);
  const digits=Math.min(10,Math.max(value>=100?2:4,Math.ceil(-Math.log10(Math.max(step,1e-10)))+1));
  return new Intl.NumberFormat(language==='en'?'en-US':'tr-TR',{style:'currency',currency:'USD',minimumFractionDigits:Math.min(2,digits),maximumFractionDigits:digits}).format(value);
}

function formatVolume(value:number,language:string){
  return new Intl.NumberFormat(language==='en'?'en-US':'tr-TR',{style:'currency',currency:'USD',notation:value>=1000?'compact':'standard',maximumFractionDigits:2}).format(value);
}

export function MarketPriceChart({candles,range,symbol}:{candles:MarketCandle[];range:MarketRange;symbol:string}){
  const {language}=useI18n(),s=(en:string,tr:string)=>language==='en'?en:tr;
  const wrapper=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(640),[active,setActive]=useState<number|null>(null),[pointerY,setPointerY]=useState<number|null>(null);
  const [announcedIndex,setAnnouncedIndex]=useState<number|null>(null);
  const [style,setStyle]=useState<'candles'|'line'>('candles');
  const chartId=useId().replace(/:/g,'');
  useEffect(()=>{
    const element=wrapper.current;
    if(!element)return;
    const observer=new ResizeObserver(entries=>{
      const value=entries[0]?.contentRect.width;
      if(value&&value>0)setWidth(Math.round(value));
    });
    observer.observe(element);
    return()=>observer.disconnect();
  },[]);

  const low=candles.length?Math.min(...candles.map(c=>c.low)):0,high=candles.length?Math.max(...candles.map(c=>c.high)):1;
  const padding=Math.max((high-low)*.09,high*.00001,1e-12),min=Math.max(0,low-padding),max=high+padding,priceStep=(max-min)/4;
  const height=width<480?322:416;
  const axisCharacters=Math.max(formatPrice(min,language,priceStep).length,formatPrice(max,language,priceStep).length);
  const left=10,right=Math.max(width<480?76:88,Math.ceil(axisCharacters*(width<480?5.4:6)+17)),top=22,bottom=34;
  const volumeHeight=width<480?46:58,volumeBottom=height-bottom,volumeTop=volumeBottom-volumeHeight;
  const priceBottom=volumeTop-24,plotHeight=priceBottom-top,plotWidth=Math.max(1,width-left-right);
  const first=candles[0]?.time??0,last=candles.at(-1)?.time??0,interval=range==='24h'?900:3600;
  const span=Math.max(last-first+interval,interval);
  const x=(time:number)=>left+(time-first+interval*.5)/span*plotWidth;
  const y=(price:number)=>top+(max-price)/(max-min)*plotHeight;
  const volumeMax=Math.max(...candles.map(c=>c.volume),1);
  const candleWidth=Math.max(1,Math.min(10,plotWidth*interval/span*.62));
  const selected=candles[Math.min(active??candles.length-1,candles.length-1)];
  const announced=announcedIndex===null?undefined:candles[Math.min(announcedIndex,candles.length-1)];
  const lastCandle=candles.at(-1);
  const date=(time:number,full=false)=>new Date(time*1000).toLocaleString(language==='en'?'en-GB':'tr-TR',full?{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}:range==='7d'?{month:'short',day:'numeric'}:{hour:'2-digit',minute:'2-digit'});
  const inspect=(index:number)=>{const next=Math.max(0,Math.min(candles.length-1,index));setActive(next);setAnnouncedIndex(next);setPointerY(null);};
  const segments:MarketCandle[][]=[];
  candles.forEach((c,index)=>{
    if(!index||c.time-candles[index-1].time>interval*1.5)segments.push([]);
    segments[segments.length-1].push(c);
  });
  const path=(segment:MarketCandle[])=>segment.map((c,index)=>`${index?'L':'M'} ${x(c.time)} ${y(c.close)}`).join(' ');
  const cursorPrice=pointerY===null?selected?.close:max-(pointerY-top)/plotHeight*(max-min);
  const tickCount=width<480?3:5;

  return <div className="em-chart" ref={wrapper}>
    <div className="em-chart-reading-bar">
      <div className="em-chart-mode" aria-label={s('Chart style','Grafik türü')}><button type="button" aria-pressed={style==='candles'} aria-label={s('Candlestick chart','Mum grafiği')} onClick={()=>setStyle('candles')}><CandlestickChart size={16}/><span>{s('Candles','Mumlar')}</span></button><button type="button" aria-pressed={style==='line'} aria-label={s('Line chart','Çizgi grafiği')} onClick={()=>setStyle('line')}><LineChart size={16}/><span>{s('Line','Çizgi')}</span></button></div>
      <span className="em-chart-currency">{symbol} / USD</span>
    </div>
    {!selected?<div className="em-chart-empty"><Activity size={28}/><strong>{s('No trades in this window','Bu aralıkta işlem yok')}</strong><span>{s('The source returned no candles. Try the other time window.','Kaynak mum verisi döndürmedi. Diğer zaman aralığını dene.')}</span></div>:<>
      <div className="em-chart-reading"><time dateTime={new Date(selected.time*1000).toISOString()}>{date(selected.time,true)}</time><dl>{[[s('Open','Açılış'),selected.open],[s('High','Yüksek'),selected.high],[s('Low','Düşük'),selected.low],[s('Close','Kapanış'),selected.close]].map(([label,value])=><div key={String(label)}><dt>{label}</dt><dd>{formatPrice(Number(value),language,priceStep)}</dd></div>)}</dl></div>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={s(`${symbol} price chart and USD trading volume. Use left and right arrow keys to inspect candles.`,`${symbol} fiyat grafiği ve USD işlem hacmi. Mumları incelemek için sol ve sağ ok tuşlarını kullan.`)} tabIndex={0}
        onKeyDown={e=>{
          if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();inspect((active??candles.length-1)+(e.key==='ArrowLeft'?-1:1));}
          else if(e.key==='Home'){e.preventDefault();inspect(0);}
          else if(e.key==='End'){e.preventDefault();inspect(candles.length-1);}
          else if(e.key==='Escape'){setActive(null);setAnnouncedIndex(null);setPointerY(null);}
        }}
        onPointerMove={e=>{
          const bounds=e.currentTarget.getBoundingClientRect(),point=(e.clientX-bounds.left)/bounds.width*width;
          if(point<left||point>width-right)return;
          const time=first+(point-left)/plotWidth*span-interval*.5;
          const index=candles.reduce((best,c,i)=>Math.abs(c.time-time)<Math.abs(candles[best].time-time)?i:best,0);
          setActive(index);
          setPointerY(Math.max(top,Math.min(priceBottom,(e.clientY-bounds.top)/bounds.height*height)));
        }}
        onPointerLeave={()=>{setActive(null);setPointerY(null);}}>
        <title>{s(`${symbol} pool price / USD`,`${symbol} havuz fiyatı / USD`)}</title><desc>{s('OHLCV from actual source trades. Empty intervals have no generated candles.','Gerçek kaynak işlemlerinden OHLCV. Boş aralıklar için mum üretilmez.')}</desc>
        <defs><clipPath id={`${chartId}-price`}><rect x={left} y={top} width={plotWidth} height={plotHeight}/></clipPath><linearGradient id={`${chartId}-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8ee9b8" stopOpacity=".2"/><stop offset="100%" stopColor="#8ee9b8" stopOpacity="0"/></linearGradient></defs>
        {[0,.25,.5,.75,1].map(part=><g key={part}><line className="em-grid" x1={left} x2={width-right} y1={top+plotHeight*part} y2={top+plotHeight*part}/><text className="em-price-axis" x={width-right+10} y={top+plotHeight*part+4}>{formatPrice(max-(max-min)*part,language,priceStep)}</text></g>)}
        <line className="em-axis-border" x1={width-right} x2={width-right} y1={top} y2={volumeBottom}/>
        <g clipPath={`url(#${chartId}-price)`}>
          {style==='candles'?candles.map(c=><g key={c.time} className={c.close>=c.open?'em-candle up':'em-candle down'}><line x1={x(c.time)} x2={x(c.time)} y1={y(c.high)} y2={y(c.low)}/><rect x={x(c.time)-candleWidth/2} y={Math.min(y(c.open),y(c.close))} width={candleWidth} height={Math.max(1,Math.abs(y(c.close)-y(c.open)))}/></g>):segments.map((segment,index)=><g key={index}>{segment.length>1&&<path d={`${path(segment)} L ${x(segment.at(-1)!.time)} ${priceBottom} L ${x(segment[0].time)} ${priceBottom} Z`} fill={`url(#${chartId}-area)`}/>}<path className="em-price-line" d={path(segment)}/>{segment.length===1&&<circle cx={x(segment[0].time)} cy={y(segment[0].close)} r={2} fill="#8ee9b8"/>}</g>)}
          {lastCandle&&<line className="em-last-price-line" x1={left} x2={width-right} y1={y(lastCandle.close)} y2={y(lastCandle.close)}/>}
        </g>
        {lastCandle&&<g className={`em-last-price ${lastCandle.close>=lastCandle.open?'up':'down'}`}><rect x={width-right+1} y={y(lastCandle.close)-10} width={right-2} height={20} rx={2}/><text x={width-right+8} y={y(lastCandle.close)+4}>{formatPrice(lastCandle.close,language,priceStep)}</text></g>}
        <line className="em-volume-separator" x1={left} x2={width-right} y1={volumeTop-12} y2={volumeTop-12}/>
        <text className="em-volume-label" x={left} y={volumeTop-16}>{s('VOLUME','HACİM')} · {formatVolume(selected.volume,language)}</text>
        {candles.map(c=><rect key={`volume:${c.time}`} className={`em-volume-bar ${c.close>=c.open?'up':'down'}`} x={x(c.time)-candleWidth/2} y={volumeBottom-c.volume/volumeMax*volumeHeight} width={candleWidth} height={Math.max(c.volume>0?1:0,c.volume/volumeMax*volumeHeight)}/>)}
        <text className="em-volume-axis" x={width-right+10} y={volumeTop+9}>{formatVolume(volumeMax,language)}</text>
        <text className="em-volume-axis" x={width-right+10} y={volumeBottom}>{formatVolume(0,language)}</text>
        {active!==null&&<g><line className="em-crosshair" x1={x(selected.time)} x2={x(selected.time)} y1={top} y2={volumeBottom}/><line className="em-crosshair" x1={left} x2={width-right} y1={y(cursorPrice!)} y2={y(cursorPrice!)}/><circle className="em-crosshair-point" cx={x(selected.time)} cy={y(selected.close)} r={3}/><g className="em-cursor-label"><rect x={width-right+1} y={y(cursorPrice!)-10} width={right-2} height={20} rx={2}/><text x={width-right+8} y={y(cursorPrice!)+4}>{formatPrice(cursorPrice!,language,priceStep)}</text></g></g>}
        {Array.from({length:tickCount},(_,index)=>index/(tickCount-1)).map(part=><text className="em-time-axis" key={part} x={left+part*plotWidth} y={height-10} textAnchor={part===0?'start':part===1?'end':'middle'}>{date(first+(last-first)*part)}</text>)}
      </svg>
      <div className="em-chart-inspection"><span>{s('Source OHLCV · gaps are not filled','Kaynak OHLCV · boşluklar doldurulmaz')}</span><div><button type="button" aria-label={s('Previous candle','Önceki mum')} disabled={(active??candles.length-1)===0} onClick={()=>inspect((active??candles.length-1)-1)}><ChevronLeft size={15}/></button><span>{s('Inspect','İncele')} <kbd>←</kbd><kbd>→</kbd></span><button type="button" aria-label={s('Next candle','Sonraki mum')} disabled={(active??candles.length-1)===candles.length-1} onClick={()=>inspect((active??candles.length-1)+1)}><ChevronRight size={15}/></button></div></div>
      <div className="em-chart-accessible-reading" role="status" aria-live="polite" aria-atomic="true">{announced?`${date(announced.time,true)}. ${s('Open','Açılış')} ${formatPrice(announced.open,language,priceStep)}. ${s('High','Yüksek')} ${formatPrice(announced.high,language,priceStep)}. ${s('Low','Düşük')} ${formatPrice(announced.low,language,priceStep)}. ${s('Close','Kapanış')} ${formatPrice(announced.close,language,priceStep)}. ${s('Volume','Hacim')} ${formatVolume(announced.volume,language)}.`:''}</div>
    </>}
  </div>;
}
