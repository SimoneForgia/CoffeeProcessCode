// js/summary-narrator.js
// Prose summary from ?cpc= and ?opt= only (EN).

import { SUB_LABELS, $ } from './common.js';

/* ===== WORDS ===== */
const WORDS = {
  then:   'then',
  subseq: 'subsequently',
  after:  'After that,',
  next:   'Next,',
  lastly: 'Lastly,',

  floated:   'floated in water',
  depulped:  'depulped',
  fermented: 'fermented',
  washed:    'washed',
  dried:     'dried',
  rested:    'rested',
  hulled:    'hulled',

  leavingPct: 'leaving {pct}% of the mucilage',
  for:        'for',
  at:         'at',
  hour:       'hour',
  hours:      'hours',
  day:        'day',
  days:       'days',
  with:       'with',
  using:      'using',
  contactTxt: 'in contact with other products'
};

const VESSEL = {
  concrete: 'concrete tank',
  metal:    'metal tank',
  plastic:  'plastic barrel',
  wood:     'wood barrel',
  clay:     'clay pot'
};

const DESCRIPTIVE_ADDITIONS = new Set(['fruits','herbs','spices','flowers','essential','other']);
const STANDALONE_ADDITIONS  = new Set(['salt','sugar','yeast','bacteria','koji','mosto']);

/* ===== parse/normalize ===== */
function parseCPC(cpc) {
  if (!cpc) return [];
  return cpc.split('.').filter(Boolean).map(tok => {
    const m = tok.match(/^([A-Z])([A-Z]?)(\d{0,3})([hd])?$/);
    if (!m) return { raw: tok, main: '?', sub: '', hours: '', unit: '' };
    return { raw: tok, main: m[1], sub: m[2] || '', hours: m[3] || '', unit: m[4] || '' };
  });
}
function parseOPT(optB64) {
  if (!optB64) return {};
  try {
    const json = JSON.parse(decodeURIComponent(escape(atob(optB64))));
    const map = {};
    (json.steps || []).forEach(e => {
      map[e.i] = {
        MP: e.MP || '', Ct: e.Ct || '',
        Add: e.Add || '', AddK: (e.AddK || ''),
        Th: e.Th || '', T: e.T || '', pH: e.pH || '',
        CD: e.CD || '', CDK: (e.CDK || '')
      };
    });
    return map;
  } catch { return {}; }
}
function normalize(cpc, optB64) {
  const steps = parseCPC(cpc);
  const extrasByIndex = parseOPT(optB64);
  return steps.map((s,i)=>({ ...s, extras: extrasByIndex[i] || {} }));
}

/* ===== subject logic =====
   1) First sentence: "this coffee"
   2) Before first Depulping: alternate "the coffee cherries" / "the cherries"
   3) At/after first Depulping: for ALL steps alternate "the coffee" / "the coffee beans"
*/
function firstDepulpIndex(steps) {
  const idx = steps.findIndex(s => s.main === 'P');
  return idx < 0 ? Number.POSITIVE_INFINITY : idx;
}
function makeSubjectPicker(steps) {
  const depIdx = firstDepulpIndex(steps);
  let preCherryToggle = 0;
  let postToggle = 0; // alternates coffee vs coffee beans after depulp
  return function pick(i) {
    if (i === 0) return { np: 'this coffee', be: 'was', forceCap: true };
    if (i < depIdx) {
      const np = (preCherryToggle++ % 2 === 0) ? 'the coffee cherries' : 'the cherries';
      return { np, be: 'were' };
    }
    const useCoffee = (postToggle++ % 2 === 0);
    return useCoffee ? { np: 'the coffee', be: 'was' } : { np: 'the coffee beans', be: 'were' };
  };
}

/* ===== connectors =====
   - Next, After that, Lastly, are LEADING
   - then, subsequently are INLINE (…was then…, …was subsequently…)
   - We also return andFlag (eligible to connect with 'and')
*/
function connectorPlacement(i, total, useLastly) {
  if (i === 0) return { lead: null, inline: null, andFlag: false };
  if (i === total - 1 && useLastly && total >= 3) {
    return { lead: WORDS.lastly, inline: null, andFlag: false };
  }
  const cycle = ['then', 'after', 'next', 'subseq'];
  const key = cycle[(i - 1) % cycle.length];
  if (key === 'after')  return { lead: WORDS.after, inline: null, andFlag: false };
  if (key === 'next')   return { lead: WORDS.next,  inline: null, andFlag: false };
  if (key === 'then')   return { lead: null, inline: WORDS.then,   andFlag: true  };
  /* subseq */          return { lead: null, inline: WORDS.subseq, andFlag: true  };
}

/* ===== formatters ===== */
const fmt = {
  duration(step) {
    const n = step.hours ? parseInt(step.hours, 10) : NaN;
    if (!Number.isFinite(n)) return '';
    const isDays = step.unit === 'd';
    const unit = isDays ? (n===1?WORDS.day:WORDS.days) : (n===1?WORDS.hour:WORDS.hours);
    return `${WORDS.for} ${n} ${unit}`;
  },
  temperature(ex) {
    if (!ex.T) return '';
    return `${WORDS.at} ${ex.T}°C`;
  },
  vessel(ex) {
    if (!ex.Ct || !VESSEL[ex.Ct]) return '';
    const noun = VESSEL[ex.Ct];
    const art = /^[aeiou]/i.test(noun) ? 'an' : 'a';
    return `in ${art} ${noun}`;
  },
  mucilagePct(ex) {
    if (!ex.MP) return '';
    return WORDS.leavingPct.replace('{pct}', String(ex.MP));
  },
  addition(ex) {
    const add  = (ex.Add || '').toLowerCase().trim();
    const kind = (ex.AddK || '').toLowerCase().trim();
    if (!add || add === 'nothing') return '';
    if (kind) {
      const isMulti = /[, ]/.test(kind);
      if (isMulti && DESCRIPTIVE_ADDITIONS.has(add)) {
        const category = (add === 'essential') ? 'essential oils' : add;
        return `${WORDS.with} ${category} (${kind})`;
      }
      return `${WORDS.with} ${kind}`;
    }
    if (STANDALONE_ADDITIONS.has(add)) return `${WORDS.with} ${add}`;
    return '';
  },
  contact(ex) {
    if (ex.CD !== 'yes') return '';
    const kind = (ex.CDK || '').trim().toLowerCase();
    return kind ? `${WORDS.contactTxt} (${kind})` : WORDS.contactTxt;
  },
  subtypeProse(main, sub) {
    if (!sub) return '';
    const key = (main||'') + (sub||'');
    const label = SUB_LABELS[key] || SUB_LABELS[sub] || '';
    if (!label) return '';
    switch (key) {
      case 'FA': return 'under aerobic conditions';
      case 'FN': return 'under anaerobic conditions';
      case 'FC': return 'with carbonic maceration';
      case 'FI': return 'by immersion';
      case 'WM': return 'using mechanical demucilagers';
      case 'WK': return 'manually washed with the Kenyan process';
      case 'WR': return 'rinsed with water';
      case 'DR': return 'on raised beds';
      case 'DP': return 'on patios';
      case 'DM': return 'in a mechanical dryer';
      case 'RC': return 'in cherries';
      case 'RP': return 'in parchment';
      case 'HW': return 'wet hulled';
      case 'HD': return 'hulled';
      default:   return label.toLowerCase();
    }
  }
};

/* ===== tiny utils ===== */
function capFirst(str){ return str ? str[0].toUpperCase()+str.slice(1) : str; }
function startLower(str){ return str ? str[0].toLowerCase()+str.slice(1) : str; }
function end(arr){ return arr.join(' ') + '.'; }

/* ===== templates (no 'and' here; merging happens later) ===== */
const TPL = {
  L(step, ctx) {
    const { np, be } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';
    const sent = `${np} ${be}${first}${inline} ${WORDS.floated}`;
    parts.push(ctx.lead ? startLower(sent) : capFirst(sent));
    return end(parts);
  },
  P(step, ctx) {
    const { np, be } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';
    let sent = `${np} ${be}${first}${inline} ${WORDS.depulped}`;
    const mp = fmt.mucilagePct(step.extras);
    if (mp) sent += `, ${mp}`;
    parts.push(ctx.lead ? startLower(sent) : capFirst(sent));
    return end(parts);
  },
  F(step, ctx) {
    const { np, be } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';
    const chunks = [];
    chunks.push(`${np} ${be}${first}${inline} ${WORDS.fermented}`);
    const sub = fmt.subtypeProse(step.main, step.sub); if (sub) chunks.push(sub);
    const dur = fmt.duration(step); if (dur) chunks.push(dur);
    const vess = fmt.vessel(step.extras); if (vess) chunks.push(vess);
    const temp = fmt.temperature(step.extras); if (temp) chunks.push(temp);
    const add = fmt.addition(step.extras); if (add) chunks.push(add);
    if (step.extras.Th === 'yes') chunks.push(`${WORDS.with} a thermal shock`);
    const sent = chunks.join(' ');
    parts.push(ctx.lead ? startLower(sent) : capFirst(sent));
    return end(parts);
  },
  W(step, ctx) {
    const { np, be } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';
    const sub = fmt.subtypeProse(step.main, step.sub);
    if (sub === 'rinsed with water' || sub === 'manually washed with the Kenyan process') {
      const sent = `${np} ${be}${first}${inline} ${sub}`;
      parts.push(ctx.lead ? startLower(sent) : capFirst(sent));
      return end(parts);
    }
    const baseVerb = WORDS.washed;
    const sent = sub ? `${np} ${be}${first}${inline} ${baseVerb} ${sub}` : `${np} ${be}${first}${inline} ${baseVerb}`;
    parts.push(ctx.lead ? startLower(sent) : capFirst(sent));
    return end(parts);
  },
  D(step, ctx) {
    const { np, be } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';
    const chunks = [];
    chunks.push(`${np} ${be}${first}${inline} ${WORDS.dried}`);
    const sub = fmt.subtypeProse(step.main, step.sub); if (sub) chunks.push(sub);
    const dur = fmt.duration(step); if (dur) chunks.push(dur);
    const contact = fmt.contact(step.extras); if (contact) chunks.push(contact);
    const sent = chunks.join(' ');
    parts.push(ctx.lead ? startLower(sent) : capFirst(sent));
    return end(parts);
  },
  R(step, ctx) {
    const { np, be } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';
    const chunks = [];
    chunks.push(`${np} ${be}${first}${inline} ${WORDS.rested}`);
    const sub = fmt.subtypeProse(step.main, step.sub); if (sub) chunks.push(sub);
    const dur = fmt.duration(step); if (dur) chunks.push(dur);
    const sent = chunks.join(' ');
    parts.push(ctx.lead ? startLower(sent) : capFirst(sent));
    return end(parts);
  },
  H(step, ctx) {
    const { np, be } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';
    const sub = fmt.subtypeProse(step.main, step.sub); // "wet hulled" | "hulled"
    const verb = sub || WORDS.hulled;
    const sent = `${np} ${be}${first}${inline} ${verb}`;
    parts.push(ctx.lead ? startLower(sent) : capFirst(sent));
    return end(parts);
  }
};

/* ===== compose + AND-MERGE ===== */
function compose(steps, { useLastly }) {
  const pickSubject = makeSubjectPicker(steps);
  const raw = steps.map((step, i) => {
    const place = connectorPlacement(i, steps.length, useLastly);
    const subject = pickSubject(i, step);
    const tpl = TPL[step.main] || ((st, ctx) => {
      const first = ctx.isFirst ? ' first' : '';
      const inline = ctx.inline ? ` ${ctx.inline}` : '';
      const start = ctx.lead ? ctx.lead + ' ' : '';
      const sent = `${subject.np} ${subject.be}${first}${inline} processed`;
      return (ctx.lead ? startLower(start + sent) : capFirst(start + sent)) + '.';
    });
    return { text: tpl(step, { lead: place.lead, inline: place.inline, isFirst: i === 0, subject }), andCandidate: place.andFlag };
  });

  // merge with "and" when eligible:
  const out = [];
  let usedAndLast = false;
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i];
    if (
      cur.andCandidate &&
      !usedAndLast &&
      out.length > 0 &&
      !/\sand\s[^.]*\.$/i.test(out[out.length - 1]) // previous doesn't already end with " and …."
    ) {
      // join with previous: remove trailing ".", lowercase start of current, drop its period
      const prev = out.pop().replace(/\.\s*$/, '');
      const curNoCap = cur.text.trim().replace(/^\s*([A-Z])/, (m,c)=>c.toLowerCase()).replace(/\.$/, '');
      out.push(prev + ' and ' + curNoCap + '.');
      usedAndLast = true;
    } else {
      out.push(cur.text);
      // if we didn't merge, reset the flag; also avoid toggling when current already contains " and "
      usedAndLast = false;
    }
  }
  return out;
}

function render(targetSel, text) {
  const host = $(targetSel) || document.querySelector(targetSel);
  if (!host) return;
  host.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = text;
  host.appendChild(p);
}

/* ===== public API ===== */
export const SummaryNarrator = {
  init({ target = '#processSummary', useLastly = true } = {}) {
    const p = new URLSearchParams(location.search);
    const cpc = p.get('cpc') || '';
    const opt = p.get('opt') || '';

    if (!cpc) { render(target, 'A process summary will appear once a code is generated.'); return; }
    const steps = normalize(cpc, opt);
    if (!steps.length) { render(target, 'A process summary will appear once a code is generated.'); return; }

    const sentences = compose(steps, { useLastly });
    render(target, sentences.join(' '));
  }
};
window.SummaryNarrator = SummaryNarrator;
