// Hämtar snödata från SMHI, YR (MET Norway) och MET Norge Frost och skriver data.json.
// Körs av GitHub Actions (.github/workflows/update.yml). Node 20+.
import { writeFileSync, readFileSync } from 'node:fs';
async function collect(){
const LOC = [
 ["Narvik",68.430,17.449],
 ["Riksgränsen",68.426,18.125],
 ["Björkliden",68.408,18.680],
 ["Abisko",68.349,18.831],
 ["Dundret",67.094,20.552],
 ["Pullinki",66.370,23.680],
 ["Kåbdalis",66.150,19.960],
 ["Galtispouda",66.070,17.820],
 ["Rönäs",65.850,14.767],
 ["Hemavan",65.816,15.093],
 ["Tärnaby",65.716,15.262],
 ["Kittelfjäll",65.255,15.517],
 ["Storklinta",65.190,20.040],
 ["Söderbodan (Östanbäck)",64.867,21.100],
 ["Stora Blåsjön",64.800,14.070],
 ["Åre",63.399,13.081],
 ["Örnsköldsvik",63.290,18.716],
 ["Ramundberget",62.700,12.395],
 ["Funäsdalen",62.538,12.545],
 ["Tänndalen",62.525,12.325],
 ["Tännäskröket",62.470,12.470],
 ["Sundsvall",62.391,17.307],
 ["Stranda",62.290,6.840],
 ["Idre",61.890,12.700],
 ["Järvsö",61.712,16.155],
 ["Trysil",61.311,12.210],
 ["Sälen",61.160,13.230],
 ["Hemsedal",60.858,8.535],
 ["Kungsberget",60.775,16.475],
 ["Källviksbacken",60.565,15.615],
 ["Romme",60.393,15.380],
 ["Flottsbro",59.236,17.888]];
globalThis.__LOC=LOC;
const tz='Europe/Stockholm';
const dstr = d => new Date(d).toLocaleDateString('sv-SE',{timeZone:tz});
const today = dstr(Date.now());
const addDays=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const FD=[...Array(10)].map((_,i)=>addDays(today,i+1));   // forecast days
const PD=[...Array(10)].map((_,i)=>addDays(today,i-9));   // past days incl today
const r1=x=>x==null||!isFinite(x)?null:Math.round(x*10)/10;
const hav=(a,b,c,d)=>{const R=6371,t=Math.PI/180;const x=Math.sin((c-a)*t/2)**2+Math.cos(a*t)*Math.cos(c*t)*Math.sin((d-b)*t/2)**2;return 2*R*Math.asin(Math.sqrt(x))};
const UA={'User-Agent':'POW-WOW/1.0 github.com/davidgrehn-ui/POW-WOW'};
const J=async u=>{for(let i=0;i<3;i++){try{const r=await fetch(u,{headers:UA});if(r.ok)return await r.json();if(r.status===404)return null}catch(e){}await new Promise(s=>setTimeout(s,800))}return null};
const emptyDay=()=>({tn:null,tx:null,w:null,g:null,p:0,s:0,pr:0,wd:null});

async function smhi(lat,lon){
  const j=await J(`https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${lon}/lat/${lat}/data.json`);
  const days=Object.fromEntries(FD.map(d=>[d,emptyDay()]));
  if(!j) return null;
  for(const t of j.timeSeries){
    const dd=t.data; const end=Date.parse(t.time); const st=Date.parse(t.intervalParametersStartTime||t.time);
    const day=dstr((st+end)/2); const D=days[day]; if(!D) continue;
    const T=dd.air_temperature;
    if(T!=null){D.tn=D.tn==null?T:Math.min(D.tn,T);D.tx=D.tx==null?T:Math.max(D.tx,T)}
    if(dd.wind_speed!=null){if(dd.wind_from_direction!=null&&dd.wind_speed>=(D.w??-1))D.wd=dd.wind_from_direction;D.w=Math.max(D.w??0,dd.wind_speed);}
    if(dd.wind_speed_of_gust!=null)D.g=Math.max(D.g??0,dd.wind_speed_of_gust);
    const p=Math.max(0,dd.precipitation_amount_mean??0); D.p+=p;
    let f=dd.precipitation_frozen_part; f=(f==null||f<0)?(T<=0.5?1:T>=2?0:(2-T)/1.5):f/100;
    D.s+=p*f;if(dd.probability_of_precipitation!=null)D.pr=Math.max(D.pr,dd.probability_of_precipitation*f); // ~1 mm vatten = ~1 cm snö
  }
  return FD.map(d=>{const D=days[d];return [r1(D.s),r1(D.p),r1(D.tn),r1(D.tx),r1(D.w),r1(D.g),Math.round(D.pr),D.wd==null?null:Math.round(D.wd)]});
}
async function yr(lat,lon){
  const j=await J(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`);
  if(!j) return null;
  const ts=j.properties.timeseries; const days=Object.fromEntries(FD.map(d=>[d,emptyDay()]));
  let covered=0;
  for(let i=0;i<ts.length;i++){
    const t=ts[i], tm=Date.parse(t.time), nx=i+1<ts.length?Date.parse(ts[i+1].time):tm+6*3600e3;
    const inst=t.data.instant.details; const D=days[dstr(tm)];
    if(D){const T=inst.air_temperature;D.tn=D.tn==null?T:Math.min(D.tn,T);D.tx=D.tx==null?T:Math.max(D.tx,T);
      if(inst.wind_from_direction!=null&&(inst.wind_speed??0)>=(D.w??-1))D.wd=inst.wind_from_direction;D.w=Math.max(D.w??0,inst.wind_speed??0); if(inst.wind_speed_of_gust!=null)D.g=Math.max(D.g??0,inst.wind_speed_of_gust);}
    if(tm<covered) continue;
    let p=null,len=0;
    if(nx-tm<=3600e3&&t.data.next_1_hours){p=t.data.next_1_hours.details.precipitation_amount;len=1}
    else if(t.data.next_6_hours){p=t.data.next_6_hours.details.precipitation_amount;len=6}
    if(p==null) continue; covered=tm+len*3600e3;
    const Dp=days[dstr(tm+len*1800e3)]; if(!Dp) continue;
    const T=inst.air_temperature; const f=T<=0.5?1:T>=2?0:(2-T)/1.5;
    Dp.p+=p; Dp.s+=p*f;{const pq=(len===1?t.data.next_1_hours:t.data.next_6_hours).details.probability_of_precipitation;if(pq!=null)Dp.pr=Math.max(Dp.pr,pq*f);}
  }
  return FD.map(d=>{const D=days[d];return D.tn==null?null:[r1(D.s),r1(D.p),r1(D.tn),r1(D.tx),r1(D.w),r1(D.g),Math.round(D.pr),D.wd==null?null:Math.round(D.wd)]});
}
// observations
const PAR={sd:8,p:5,tn:19,tx:20,w:4};
const lists={};
for(const [k,p] of Object.entries(PAR)){const j=await J(`https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/${p}.json`);lists[k]=(j?.station||[]).filter(s=>s.active)}
const cutoff=Date.now()-12*864e5;
async function obs(k,lat,lon){
  const st=lists[k].map(s=>({s,d:hav(lat,lon,s.latitude,s.longitude)})).filter(x=>x.d<120).sort((a,b)=>a.d-b.d).slice(0,4);
  for(const {s,d} of st){
    const j=await J(`https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/${PAR[k]}/station/${s.key}/period/latest-months/data.json`);
    const v=(j?.value||[]).filter(x=>(x.date??x.to)>=cutoff&&x.value!==''&&x.value!=null);
    if(v.length<3) continue;
    const by={};
    for(const x of v){
      let day=x.ref?x.ref:dstr(x.date); const val=parseFloat(x.value);
      if(k==='w'){by[day]=Math.max(by[day]??0,val)} else by[day]=val;
    }
    return {st:s.name,km:Math.round(d),v:PD.map(dd=>by[dd]==null?null:(k==='sd'?Math.round(by[dd]*100):r1(by[dd])))};
  }
  return null;
}
const FROST_ID=process.env.FROST_CLIENT_ID||'';
const NOR=new Set(FROST_ID?["Trysil","Hemsedal","Stranda","Narvik"]:[]);
const FH={headers:{...UA,Authorization:'Basic '+Buffer.from(FROST_ID+':').toString('base64')}};
const FJ=async u=>{for(let i=0;i<2;i++){try{const r=await fetch(u,FH);if(r.ok)return await r.json();if(r.status===404||r.status===412)return null}catch(e){}await new Promise(s=>setTimeout(s,800))}return null};
const FEL={sd:['surface_snow_thickness','last'],p:['sum(precipitation_amount P1D)','first'],tn:['min(air_temperature P1D)','min'],tx:['max(air_temperature P1D)','max'],w:['max(wind_speed PT1H)','max']};
async function frost(k,lat,lon){
  const [el,how]=FEL[k];
  const src=await FJ(`https://frost.met.no/sources/v0.jsonld?types=SensorSystem&geometry=nearest(POINT(${lon}%20${lat}))&nearestmaxcount=4&elements=${encodeURIComponent(el)}&validtime=now`);
  for(const s of (src?.data||[])){
    if(s.distance>60) break;
    const j=await FJ(`https://frost.met.no/observations/v0.jsonld?sources=${s.id}&referencetime=${PD[0]}/${addDays(today,1)}&elements=${encodeURIComponent(el)}`);
    const by={};
    for(const d of (j?.data||[])){ const day=el.includes('P1D')?d.referenceTime.slice(0,10):dstr(d.referenceTime); const v=d.observations?.[0]?.value; if(v==null) continue;
      if(how==='max') by[day]=Math.max(by[day]??-1e9,v); else if(how==='min') by[day]=Math.min(by[day]??1e9,v); else if(how==='first'){ if(by[day]==null) by[day]=v; } else by[day]=v; }
    const v=PD.map(dd=>by[dd]==null?null:(k==='sd'?Math.max(0,Math.round(by[dd])):r1(by[dd])));
    if(v.filter(x=>x!=null).length<3) continue;
    const name=s.name.split(' ').map(w=>w.length>2?w[0]+w.slice(1).toLowerCase():w).join(' ');
    return {st:name+' (MET)',km:Math.round(s.distance),v};
  }
  return null;
}
const out={gen:new Date().toISOString(),today,FD,PD,loc:[]};
for(const [n,lat,lon] of LOC){
  const [s,y]=await Promise.all([smhi(lat,lon),yr(lat,lon)]);
  const o={};
  for(const k of Object.keys(PAR)) o[k]=NOR.has(n)?await frost(k,lat,lon):await obs(k,lat,lon);
  out.loc.push({n,lat,lon,smhi:s,yr:y,obs:o});
}
const red=JSON.stringify({gen:out.gen,FD:out.FD,PD:out.PD,loc:out.loc.map(l=>({n:l.n,smhi:l.smhi,yr:l.yr,obs:l.obs}))});

return {red, snow10:out.loc.map(l=>[l.n,Math.round((l.smhi||[]).reduce((a,d)=>a+d[0],0)),Math.round((l.yr||[]).filter(Boolean).reduce((a,d)=>a+d[0],0))])};
}
const {red, snow10} = await collect();
const d = JSON.parse(red);
const okF = d.loc.filter(l=>l.smhi||l.yr).length;
if (okF < d.loc.length/2) { console.error('För få prognoser hämtades – avbryter utan att skriva.'); process.exit(1); }
// --- Snödjup i rutnät över Sverige och Norge (Open-Meteo, modellanalys) ---
async function snowGrid(){
  const M=JSON.parse(readFileSync(new URL('./gridmask.json', import.meta.url),'utf8'));
  const v=new Array(M.nla*M.nlo).fill(null); let ok=0;
  for(let b=0;b<M.idx.length;b+=100){
    const chunk=M.idx.slice(b,b+100);
    const la=chunk.map(k=>(M.la0+Math.floor(k/M.nlo)*M.dla).toFixed(2)), lo=chunk.map(k=>(M.lo0+(k%M.nlo)*M.dlo).toFixed(2));
    const u=`https://api.open-meteo.com/v1/forecast?latitude=${la.join(',')}&longitude=${lo.join(',')}&current=snow_depth&timezone=GMT`;
    let j=null;
    for(let t=0;t<3&&!j;t++){ try{const r=await fetch(u,{headers:{'User-Agent':'POW-WOW/1.0 github.com/davidgrehn-ui/POW-WOW'}}); if(r.ok) j=await r.json(); else await new Promise(s=>setTimeout(s,15000));}catch(e){await new Promise(s=>setTimeout(s,5000))} }
    if(Array.isArray(j)) j.forEach((x,i)=>{const sd=x?.current?.snow_depth; if(sd!=null){v[chunk[i]]=Math.max(0,Math.round(sd*100)); ok++;}});
    if(b+100<M.idx.length) await new Promise(s=>setTimeout(s,11000));
  }
  return ok>M.idx.length*0.8 ? {t:new Date().toISOString(),la0:M.la0,lo0:M.lo0,dla:M.dla,dlo:M.dlo,nla:M.nla,nlo:M.nlo,v} : null;
}
// --- Sannolikhet: ECMWF ensemble (51 scenarier) via Open-Meteo ---
async function ensemble(){
  const LOC=globalThis.__LOC, FD=d.FD;
  const out={}, sleep=ms=>new Promise(r=>setTimeout(r,ms));
  for(let b=0;b<LOC.length;b+=8){
    const ch=LOC.slice(b,b+8);
    const u=`https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${ch.map(x=>x[1]).join(',')}&longitude=${ch.map(x=>x[2]).join(',')}&daily=snowfall_sum&models=ecmwf_ifs025&forecast_days=12&timezone=Europe%2FStockholm`;
    let j=null;
    for(let t=0;t<3&&!j;t++){ try{const r=await fetch(u,{headers:{'User-Agent':'POW-WOW/1.0 github.com/davidgrehn-ui/POW-WOW'}}); if(r.ok) j=await r.json(); else await sleep(15000);}catch(e){await sleep(5000)} }
    const arr=Array.isArray(j)?j:(j?[j]:[]);
    arr.forEach((x,i)=>{
      const n=ch[i]?.[0]; const dl=x?.daily; if(!n||!dl) return;
      const ks=Object.keys(dl).filter(k=>k.startsWith('snowfall_sum')); if(ks.length<10) return;
      const i0=dl.time.indexOf(FD[0]); if(i0<0) return;
      // Open-Meteo: cm snö = mm vatten × 0,7. Appen räknar 1 mm = 1 cm, så dela med 0,7.
      const tot=ks.map(k=>dl[k].slice(i0,i0+10).reduce((a,v)=>a+(v||0),0)/0.7).sort((a,b)=>a-b);
      const q=p=>Math.round(tot[Math.round(p*(tot.length-1))]), pr=th=>Math.round(100*tot.filter(v=>v>th).length/tot.length);
      const day=FD.map((_,k)=>Math.round(100*ks.filter(m=>(dl[m][i0+k]||0)/0.7>=1).length/ks.length));
      out[n]={p10:pr(10),p30:pr(30),q10:q(.1),q50:q(.5),q90:q(.9),m:ks.length,day};
    });
    await sleep(2000);
  }
  return Object.keys(out).length>LOC.length*0.6 ? {t:new Date().toISOString(),src:'ECMWF ENS',loc:out} : null;
}
let ens=null; try{ ens=await ensemble(); }catch(e){ console.error('Ensemble misslyckades', e); }
let prev=null; try{ prev=JSON.parse(readFileSync(new URL('../data.json', import.meta.url),'utf8')); }catch(e){}
const prevSg=prev?.sg||null;
await new Promise(r=>setTimeout(r,65000)); // låt Open-Meteos minutgräns återställas efter ensemblen
let sg=null; try{ sg=await snowGrid(); }catch(e){ console.error('Snödjupsrutnät misslyckades', e); }
if(!sg) console.error('Behåller tidigare snödjupsrutnät.');
d.sg = sg || prevSg || undefined;
d.ens = ens || (prev?.ens && prev.FD?.[0]===d.FD[0] ? prev.ens : undefined);
writeFileSync(new URL('../data.json', import.meta.url), JSON.stringify(d));
console.log('Skrev data.json', d.gen);

// --- Snölarm via ntfy (push till mobilen). Prenumerera på ämnet i appen ntfy. ---
const TOPIC = process.env.NTFY_TOPIC || 'powwow-snolarm-e97854';
const LIMIT = 30;
const tot = a => (a||[]).reduce((s,x)=>s+(x?x[0]||0:0),0);
const alarmsOf = data => new Map((data?.loc||[]).map(l=>{const s=tot(l.smhi), y=tot(l.yr); return [l.n,{s,y,b:Math.max(s,y)}];}).filter(([,v])=>v.b>LIMIT));
const now = alarmsOf(d), before = alarmsOf(prev);
// Dagens första körning (svensk tid) = morgonsammanfattning, även om GitHub startar jobbet sent.
const dSE = t => new Date(t).toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm'});
const morning = !prev?.gen || dSE(prev.gen) !== dSE(Date.now());
const fresh = [...now.keys()].filter(n=>!before.has(n));
const list = morning ? [...now.keys()] : fresh;
if (list.length) {
  const line = n => { const v=now.get(n); const e=d.ens?.loc?.[n]; return `${n.replace(' (Östanbäck)','')}: ${Math.round(v.b)} cm (SMHI ${Math.round(v.s)} · YR ${Math.round(v.y)})${e?` · ${e.p30} % chans >30 cm`:''}`; };
  const sorted = list.sort((a,b)=>now.get(b).b-now.get(a).b);
  const title = morning ? `Snölarm: ${sorted.length} ${sorted.length===1?'ort':'orter'} över ${LIMIT} cm` : `Nytt snölarm: ${sorted.map(n=>n.replace(' (Östanbäck)','')).join(', ')}`;
  const body = sorted.map(line).join('\n') + '\nVäntad nysnö kommande 10 dagar.';
  try {
    const r = await fetch('https://ntfy.sh/', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ topic:TOPIC, title, message:body, tags:['snowflake'], click:'https://davidgrehn-ui.github.io/POW-WOW/', priority: morning?3:4 }) });
    console.log('ntfy', r.status, title);
  } catch(e) { console.error('ntfy misslyckades', e); }
} else console.log('Inget snölarm att skicka', morning?'(morgon)':'', [...now.keys()]);
for (const [n,s,y] of snow10) console.log(`${n}: SMHI ${s} cm, YR ${y} cm`);
