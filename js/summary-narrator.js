// js/summary-narrator.js
// Prose summary from ?cpc= and ?opt= only.
// - Subtypes in prose (no parentheses)
// - Natural subjects per step + "first" on the very first step
// - Omits negatives: addition=nothing, thermal=no, contactDuringDrying=no
// - "Lastly," only if total steps >= 3

import { SUB_LABELS, $ } from './common.js';

/* ========= WORDS ========= */
const WORDS = {
  then:    'Then,',
  after:   'After that,',
  next:    'Next,',
  subseq:  'Subsequently,',
  lastly:  'Lastly,',

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

/* ========= parse/normalize ========= */
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

/* ========= subjects per step ========= */
function subjectFor(main) {
  // L (floating) → cherries; D (drying) & H (hulling) → beans; others → coffee/it
  switch (main) {
    case 'L': return { np: 'the cherries', be: 'were' };
    case 'D': return { np: 'the beans',    be: 'were' };
    case 'H': return { np: 'the beans',    be: 'were' }; // wanted: "the beans were wet hulled"
    default:  return { np: 'the coffee',   be: 'was'  }; // P,F,W,R defaults
  }
}

/* ========= helpers / formatters ========= */
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
    // no space before °C
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
  // subtype → prose (no parentheses); tailored for natural English
  subtypeProse(main, sub) {
    if (!sub) return '';
    const key = (main||'') + (sub||'');
    const label = SUB_LABELS[key] || SUB_LABELS[sub] || '';
    if (!label) return '';

    switch (key) {
      // Fermentation
      case 'FA': return 'under aerobic conditions';
      case 'FN': return 'under anaerobic conditions';
      case 'FC': return 'with carbonic maceration';
      case 'FI': return 'by immersion';
      // Washing (WR must be a clean sentence part, not "washed rinsed…")
      case 'WM': return 'using mechanical demucilagers';
      case 'WK': return 'manually with the Kenyan process';
      case 'WR': return 'rinsed with water';
      // Drying
      case 'DR': return 'on raised beds';
      case 'DP': return 'on patios';
      case 'DM': return 'in a mechanical dryer';
      // Resting
      case 'RC': return 'in cherries';
      case 'RP': return 'in parchment';
      // Hulling
      case 'HW': return 'wet hulled';
      case 'HD': return 'hulled'; // treat "Dry" as the default; no adjective
      default:   return label.toLowerCase();
    }
  }
};

/* ========= connectors ========= */
function connector(index, total, useLastly) {
  if (index === 0) return ''; // first sentence handled with "first" after was/were
  if (index === total - 1 && useLastly && total >= 3) return WORDS.lastly;
  const rot = [WORDS.then, WORDS.after, WORDS.next, WORDS.subseq];
  return rot[(index - 1) % rot.length];
}

/* ========= utilities ========= */
function capFirst(str){ return str ? str[0].toUpperCase()+str.slice(1) : str; }
function end(arr){ return arr.join(' ') + '.'; }

/* ========= templates ========= */
const TPL = {
  // L — Floating
  L(step, ctx) {
    const s = subjectFor('L');
    const parts = [];
    if (ctx.conn) parts.push(ctx.conn);
    // "The cherries were first floated in water."
    const first = ctx.isFirst ? ' first' : '';
    parts.push(capFirst(`${s.np} ${s.be}${first} ${WORDS.floated}`));
    return end(parts);
  },

  // P — Depulping
  P(step, ctx) {
    const s = subjectFor('P');
    const parts = [];
    if (ctx.conn) parts.push(ctx.conn);
    const first = ctx.isFirst ? ' first' : '';
    let sentence = `${s.np} ${s.be}${first} ${WORDS.depulped}`;
    const mp = fmt.mucilagePct(step.extras);
    if (mp) sentence += `, ${mp}`;
    parts.push(capFirst(sentence));
    return end(parts);
  },

  // F — Fermentation
  F(step, ctx) {
    const s = subjectFor('F');
    const parts = [];
    if (ctx.conn) parts.push(ctx.conn);

    const chunks = [];
    const first = ctx.isFirst ? ' first' : '';
    chunks.push(`${s.np} ${s.be}${first} ${WORDS.fermented}`);

    const sub = fmt.subtypeProse(step.main, step.sub);
    if (sub) chunks.push(sub);

    const dur = fmt.duration(step);
    if (dur) chunks.push(dur);

    const vess = fmt.vessel(step.extras);
    if (vess) chunks.push(vess);

    const temp = fmt.temperature(step.extras);
    if (temp) chunks.push(temp);

    const add = fmt.addition(step.extras);
    if (add) chunks.push(add);

    if (step.extras.Th === 'yes') chunks.push(`${WORDS.with} a thermal shock`);

    parts.push(capFirst(chunks.join(' ')));
    return end(parts);
  },

  // W — Washing
  W(step, ctx) {
    const s = subjectFor('W');
    const parts = [];
    if (ctx.conn) parts.push(ctx.conn);
    const first = ctx.isFirst ? ' first' : '';

    const sub = fmt.subtypeProse(step.main, step.sub);
    // If WR (rinsed with water), don't say "washed rinsed…": use the rinsed sentence directly.
    if (sub === 'rinsed with water') {
      parts.push(capFirst(`${s.np} ${s.be}${first} ${sub}`));
      return end(parts);
    }

    const base = `${s.np} ${s.be}${first} ${WORDS.washed}`;
    parts.push(capFirst(sub ? `${base} ${sub}` : base));
    return end(parts);
  },

  // D — Drying
  D(step, ctx) {
    const s = subjectFor('D');
    const parts = [];
    if (ctx.conn) parts.push(ctx.conn);
    const first = ctx.isFirst ? ' first' : '';

    const chunks = [];
    chunks.push(`${s.np} ${s.be}${first} ${WORDS.dried}`);

    const sub = fmt.subtypeProse(step.main, step.sub);
    if (sub) chunks.push(sub);

    const dur = fmt.duration(step);
    if (dur) chunks.push(dur);

    const contact = fmt.contact(step.extras);
    if (contact) chunks.push(contact);

    parts.push(capFirst(chunks.join(' ')));
    return end(parts);
  },

  // R — Resting
  R(step, ctx) {
    const s = subjectFor('R');
    const parts = [];
    if (ctx.conn) parts.push(ctx.conn);
    const first = ctx.isFirst ? ' first' : '';

    const chunks = [];
    chunks.push(`${s.np} ${s.be}${first} ${WORDS.rested}`);

    const sub = fmt.subtypeProse(step.main, step.sub);
    if (sub) chunks.push(sub);

    const dur = fmt.duration(step);
    if (dur) chunks.push(dur);

    parts.push(capFirst(chunks.join(' ')));
    return end(parts);
  },

  // H — Hulling
  H(step, ctx) {
    const s = subjectFor('H');
    const parts = [];
    if (ctx.conn) parts.push(ctx.conn);
    const first = ctx.isFirst ? ' first' : '';

    // subtype prose decides wording; for HD we avoid "dry", for HW we say "wet hulled"
    const sub = fmt.subtypeProse(step.main, step.sub); // "wet hulled" | "hulled"
    // Build: "the beans were (first) hulled" or "the beans were (first) wet hulled"
    const verb = sub || WORDS.hulled; // sub returns "wet hulled" or "hulled"
    parts.push(capFirst(`${s.np} ${s.be}${first} ${verb}`));
    return end(parts);
  }
};

/* ========= compose/render ========= */
function compose(steps, { useLastly }) {
  return steps.map((step, i) => {
    const conn = connector(i, steps.length, useLastly);
    const fn = TPL[step.main] || ((st, ctx) => {
      const s = subjectFor('?');
      const first = ctx.isFirst ? ' first' : '';
      const start = ctx.conn ? ctx.conn + ' ' : '';
      return capFirst(`${start}${s.np} ${s.be}${first} processed.`);
    });
    return fn(step, { conn, isFirst: i === 0 });
  });
}
function render(targetSel, text) {
  const host = $(targetSel) || document.querySelector(targetSel);
  if (!host) return;
  host.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = text;
  host.appendChild(p);
}

/* ========= public API ========= */
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
