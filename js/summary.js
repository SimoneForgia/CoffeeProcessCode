import {CATALOG,SUB_LABELS,DESCRIPTIONS,$} from './common.js';

const summaryEl = $('#summary');

function parseCPC(cpc){
  if(!cpc) return [];
  return cpc.split('.').filter(Boolean).map(tok=>{
    // Formati supportati:
    // 1) L*
    // 2) FI24h*
    // 3) P25%*
    // 4) WK (senza tempo)
    const m = tok.match(/^([A-Z])([A-Z]?)(?:(\d{1,3})([hd])|(\d{1,3})%)?(\*)?$/);
    if(!m) return {raw:tok, main:'?', sub:'', hours:'', unit:'', pct:'', star:false};
    return {
      raw: tok,
      main: m[1],
      sub: m[2] || '',
      hours: m[3] || '',
      unit: m[4] || '',
      pct:  m[5] || '',
      star: !!m[6]
    };
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

function decodeOpt(){
  const p = new URLSearchParams(location.search);
  const opt = p.get('opt');
  if (!opt) return null;
  try{
    return JSON.parse(decodeURIComponent(escape(atob(opt))));
  }catch(e){ return null; }
}

function extrasKeywordsForIndex(optObj, idx){
  if (!optObj || !optObj.steps) return '';
  const rec = optObj.steps.find(x => x.i === idx);
  if (!rec) return '';

  const parts = [];

  // Fermentation
  if (rec.T) {
    const unit = (rec.TU === 'F') ? '°F' : '°C';
    parts.push(`${rec.T}${unit}`);
  }
  if (rec.Ct) {
    const map = {
      plastic:'plastic barrel',
      wood:'wood barrel',
      metal:'metal tank',
      concrete:'concrete',
      clay:'clay pot'
    };
    parts.push(map[rec.Ct] || rec.Ct);
  }
  if (rec.Th === 'yes') parts.push('thermal shock');

  if (rec.Add && rec.Add !== 'nothing') {
    // Se è descrittivo e c'è AddK, usa solo il valore (es. "strawberries")
    const descriptive = ['fruits','herbs','spices','flowers','essential','other'];
    if (descriptive.includes(rec.Add) && rec.AddK) {
      parts.push(rec.AddK);
    } else {
      // altrimenti etichetta semplice (Salt, Sugar, Yeast, Bacteria, Koji, Mosto…)
      const map = { essential:'essential oils' };
      const label = map[rec.Add] || (rec.Add[0].toUpperCase()+rec.Add.slice(1));
      parts.push(label);
      if (rec.AddK) parts.push(rec.AddK); // eventuale dettaglio extra
    }
  }

  // Drying: contatto
  if (rec.CD === 'yes' && rec.CDK) parts.push(rec.CDK);

  return parts.join(', ');
}


function renderVerticalSummary(cpc){
  summaryEl.innerHTML='';
  const groups = parseCPC(cpc);
  const optObj = decodeOpt();

  if(groups.length===0){
    const li=document.createElement('li');
    li.className='tiny';
    li.textContent='No CPC in link.';
    summaryEl.appendChild(li);
    return;
  }

  groups.forEach((g, idx) => {
    const frag = document.createDocumentFragment();

    // HEADER "Step 1" prima della prima categoria
    if (idx === 0) {
      const liStepHdr = document.createElement('li');
      liStepHdr.className = 'sum-row';
      const leftBlank = document.createElement('div');
      leftBlank.className = 'sum-code mono';
      leftBlank.textContent = '';
      liStepHdr.appendChild(leftBlank);
      const rightHdr = document.createElement('div');
      rightHdr.innerHTML = '<b>Step 1</b>';
      liStepHdr.appendChild(rightHdr);
      frag.appendChild(liStepHdr);
    }

    // MAIN ROW (lettera principale)
    const liMain = document.createElement('li');
    liMain.className = 'sum-row';

    const codeMain = document.createElement('div');
    codeMain.className = 'sum-code mono';
    codeMain.textContent = g.main;
    liMain.appendChild(codeMain);

    const rightMain = document.createElement('div');
    const mainLabel = (CATALOG.find(x => x.main === g.main) || {}).label || 'Unknown';
    rightMain.appendChild(makeDetails(g.main, mainLabel, g.main));
    liMain.appendChild(rightMain);
    frag.appendChild(liMain);

    // SUB ROW (se presente)
    if (g.sub) {
      const liSub = document.createElement('li');
      liSub.className = 'sum-row';

      const codeSub = document.createElement('div');
      codeSub.className = 'sum-code mono';
      codeSub.textContent = g.sub;
      liSub.appendChild(codeSub);

      const rightSub = document.createElement('div');
      const subKey = g.main + g.sub;
      const subLabel = SUB_LABELS[subKey] || SUB_LABELS[g.sub] || g.sub;
      rightSub.appendChild(makeDetails(subKey, subLabel, subKey));
      liSub.appendChild(rightSub);

      frag.appendChild(liSub);
    }

    // TIME ROW (se presente)
    if (g.hours) {
      const liTime = document.createElement('li');
      liTime.className = 'sum-row';

      const codeTime = document.createElement('div');
      codeTime.className = 'sum-code mono';
      codeTime.textContent = `${g.hours}${g.unit||''}`;
      liTime.appendChild(codeTime);

      const n = parseInt(g.hours, 10);
      const unitFull = (g.unit === 'd') ? 'day' : 'hour';
      const rightTime = document.createElement('div');
      rightTime.textContent = `${n} ${unitFull}${n === 1 ? '' : 's'}`;
      liTime.appendChild(rightTime);

      frag.appendChild(liTime);
    }

    // PERCENT ROW per Depulping (es. 25%)
    if (g.pct) {
      const liPct = document.createElement('li');
      liPct.className = 'sum-row';

      const codePct = document.createElement('div');
      codePct.className = 'sum-code mono';
      codePct.textContent = `${g.pct}%`;
      liPct.appendChild(codePct);

      const rightPct = document.createElement('div');
      rightPct.textContent = `${g.pct}% mucilage left`;
      liPct.appendChild(rightPct);

      frag.appendChild(liPct);
    }

    // STAR ROW (se presente) → * --> parole-chiave
    if (g.star) {
      const kw = extrasKeywordsForIndex(optObj, idx);
      if (kw) {
        const liStar = document.createElement('li');
        liStar.className = 'sum-row';

        const codeStar = document.createElement('div');
        codeStar.className = 'sum-code mono';
        codeStar.textContent = '*';
        liStar.appendChild(codeStar);

        const rightStar = document.createElement('div');
        rightStar.textContent = kw;   // niente "* -->"
        liStar.appendChild(rightStar);


        frag.appendChild(liStar);
      }
    }

    // SEPARATORE con "Step N+1"
    if (idx < groups.length - 1) {
      const liDot = document.createElement('li');
      liDot.className = 'sum-row';

      const codeDot = document.createElement('div');
      codeDot.className = 'sum-code mono';
      codeDot.textContent = '.';
      liDot.appendChild(codeDot);

      const rightDot = document.createElement('div');
      rightDot.innerHTML = `<b>Step ${idx + 2}</b>`;
      liDot.appendChild(rightDot);

      frag.appendChild(liDot);
    }

    summaryEl.appendChild(frag);
  });
}




(function(){
  const p=new URLSearchParams(location.search);
  const cpc=p.get('cpc')||'';
  renderVerticalSummary(cpc);
})();

