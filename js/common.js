export const CATALOG = [
  { main:'W', label:'Washing', duration:false, extras:false },
  { main:'P', label:'Depulping', duration:false, extras:false },
  { main:'F', label:'Fermentation', duration:true, extras:true, sub:['A','N','C','I','H'] },
  { main:'D', label:'Drying', duration:true, extras:false, sub:['R','P','M','S'] },
  { main:'R', label:'Rest in parchment', duration:true, extras:false }
];
export const SUB_LABELS = {A:'Aerobic',N:'Anaerobic',C:'Carbonic',I:'Immersion',H:'Cherry',R:'Raised',P:'Patio',M:'Mechanical',S:'Shade'};

export const DESCRIPTIONS = {
  W:'Washing: removal of mucilage with water to control fermentation and clean parchment.',
  P:'Depulping: removal of the outer skin/pulp from the cherry using mechanical depulpers.',
  F:'Fermentation: controlled microbial activity that transforms mucilage and impacts flavor.',
  D:'Drying: reduction of moisture to safe storage levels on patios, raised beds, shade or machines.',
  R:'Rest in parchment: conditioning period allowing moisture equilibration before hulling.',
  SA:'Aerobic fermentation: oxygen available during the process.',
  SN:'Anaerobic fermentation: oxygen-limited or tank-sealed environment.',
  SC:'Carbonic maceration: whole-cherry in CO₂-rich environment (wine-inspired).',
  SI:'Immersion: cherries or parchment submerged in water during fermentation.',
  SH:'Cherry/on-fruit: fermentation occurs with whole cherries.',
  SR:'Raised beds: suspended mesh beds improving airflow and uniformity.',
  SP:'Patio: open air patios, typically concrete or tiled floors.',
  SM:'Mechanical: assisted/mechanical dryers to accelerate moisture removal.',
  SS:'Shade: drying under shade to slow rate and protect from direct sun.'
};

export const $ = (s, root=document) => root.querySelector(s);
export const $$ = (s, root=document) => [...root.querySelectorAll(s)];
export const blankStep = () => ({ main:'', sub:'', hours:'', extras:{ temp:'', ph:'' } });

export function tokenForStep(s){
  if(!s || !s.main) return '';
  const HRS = (s.hours!=='' && /^\d{1,3}$/.test(String(s.hours))) ? String(parseInt(s.hours,10)) : '';
  return `${s.main}${s.sub||''}${HRS}`;
}
export function buildCPC(steps){ return steps.map(tokenForStep).filter(Boolean).join('.'); }
export function safeB64Encode(obj){ return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); }
export function buildOpt(steps){
  const list=[]; steps.forEach((s,i)=>{ const ex=s.extras||{}; const payload={};
    if(ex.temp) payload.T=ex.temp; if(ex.ph) payload.pH=ex.ph;
    if(Object.keys(payload).length) list.push({i, ...payload});
  });
  return list.length? {steps:list}:null;
}

// Hash + PRNG for BeanTag
export async function strongHash(str){
  try{ const enc=new TextEncoder(); const d=await crypto.subtle.digest('SHA-256', enc.encode(str)); return new Uint32Array(d.slice(0,16)); }
  catch(e){ let h=2166136261>>>0; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619);} return new Uint32Array([h,h^0x9e3779b9,h^0x85ebca6b,h^0xc2b2ae35]); }
}
export function prng32(seed){ let x=seed|0; return ()=>{ x^=x<<13; x^=x>>>17; x^=x<<5; return (x>>>0)/4294967296; }; }
