import {CATALOG,SUB_LABELS,DESCRIPTIONS,$} from './common.js';

const summaryEl = $('#summary');

function parseCPC(cpc){
  if(!cpc) return [];
  return cpc.split('.').filter(Boolean).map(tok=>{
    const m = tok.match(/^([A-Z])([A-Z]?)(\d{0,3})$/);
    if(!m) return {raw:tok, main:'?', sub:'', hours:''};
    return {raw:tok, main:m[1], sub:m[2]||'', hours:m[3]||''};
  });
}
function makeDetails(titleKey, titleText, descKey){
  const det=document.createElement('details');
  const sum=document.createElement('summary');
  sum.className='sum-title';
  const caret=document.createElement('i'); caret.className='caret-small';
  const lbl=document.createElement('span'); lbl.textContent=titleText;
  sum.appendChild(caret); sum.appendChild(lbl);
  det.appendChild(sum);
  const p=document.createElement('div'); p.className='sum-desc'; p.textContent = DESCRIPTIONS[descKey] || '—';
  det.appendChild(p);
  return det;
}
function renderVerticalSummary(cpc){
  summaryEl.innerHTML='';
  const groups = parseCPC(cpc);
  if(groups.length===0){ const li=document.createElement('li'); li.className='tiny'; li.textContent='No CPC in link.'; summaryEl.appendChild(li); return; }
  groups.forEach((g,idx)=>{
    const row=document.createElement('li'); row.className='sum-row';
    const code=document.createElement('div'); code.className='sum-code mono'; code.textContent=g.main; row.appendChild(code);
    const right=document.createElement('div');
    const mainLabel=(CATALOG.find(x=>x.main===g.main)||{}).label || 'Unknown';
    right.appendChild(makeDetails(g.main, mainLabel, g.main));
    if(g.sub){
      const subRow=document.createElement('div'); subRow.style.marginTop='6px'; subRow.className='inline';
      const code2=document.createElement('div'); code2.className='sum-code mono'; code2.style.width='40px'; code2.textContent=g.sub; subRow.appendChild(code2);
      subRow.appendChild(makeDetails('S'+g.sub, SUB_LABELS[g.sub]||g.sub, 'S'+g.sub));
      right.appendChild(subRow);
    }
    if(g.hours){
      const hrRow=document.createElement('div'); hrRow.style.marginTop='6px'; hrRow.className='inline';
      const code3=document.createElement('div'); code3.className='sum-code mono'; code3.style.width='40px'; code3.textContent=g.hours; hrRow.appendChild(code3);
      const label=document.createElement('div'); label.textContent=`${parseInt(g.hours,10)} hours`; hrRow.appendChild(label);
      right.appendChild(hrRow);
    }
    row.appendChild(right); summaryEl.appendChild(row);
    if(idx<groups.length-1){
      const dot=document.createElement('li'); dot.className='sum-row';
      const codeDot=document.createElement('div'); codeDot.className='sum-code mono'; codeDot.textContent='.'; dot.appendChild(codeDot);
      const txt=document.createElement('div'); txt.textContent=''; dot.appendChild(txt);
      summaryEl.appendChild(dot);
    }
  });
}

(function(){
  const p=new URLSearchParams(location.search);
  const cpc=p.get('cpc')||'';
  // opt non obbligatorio; se serve, puoi decodificare con atob/JSON.parse
  renderVerticalSummary(cpc);
})();
