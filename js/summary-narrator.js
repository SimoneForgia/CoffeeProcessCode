// js/summary-narrator.js
// Prose summary from ?cpc= and ?opt= only.
// - First step: "This coffee ... first ..."
// - Subjects: before depulping -> cherries; after depulping -> beans (for D/H), otherwise coffee
// - Subtypes in prose (no parentheses). For Washing:
//     WR => "rinsed with water" (no 'washed')
//     WK => "manually washed with the Kenyan process"
//     WM => "washed using mechanical demucilagers"
// - Negatives omitted (addition=nothing, thermal=no, contactDuringDrying=no)
// - °C without a space (e.g., 18°C)
// - Connectors: "then/next/subsequently" used **inline** ("was then ..."),
//               "After that," and "Lastly," stay **leading** (start of sentence).
// - "Lastly," only if total steps >= 3.

import { SUB_LABELS, $ } from './common.js';

/* ========= WORDS ========= */
const WORDS = {
  then:   'then',
  next:   'next',
  subseq: 'subsequently',
  after:  'After that,',
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

/* ========= subject selection =========
   Rule:
   - First sentence: "This coffee"
   - Before the FIRST Depulping (P): prefer "the cherries"
   - After (or at) the FIRST Depulping:
       * Drying (D) or Hulling (H) -> "the beans"
       * otherwise -> "the coffee"
   Articles are lowercase unless they start the sentence (handled by capFirst).
*/
function computeDepulpIndex(steps) {
  const idx = steps.findIndex(s => s.main === 'P');
  return idx < 0 ? Number.POSITIVE_INFINITY : idx;
}
function subjectFor(i, step, depulpIdx) {
  if (i === 0) return { np: 'this coffee', be: 'was', forceCap: true }; // "This coffee"
  if (i < depulpIdx) return { np: 'the cherries', be: 'were' };
  if (step.main === 'D' || step.main === 'H') return { np: 'the beans', be: 'were' };
  return { np: 'the coffee', be: 'was' };
}

/* ========= connector placement =========
   Returns {lead: string|null, inline: string|null}
   - inline adverbs: then / next / subsequently
   - leading: After that, / Lastly,
*/
function connectorPlacement(i, total, useLastly) {
  if (i === 0) return { lead: null, inline: null };
  const rot = ['then', 'after', 'next', 'subseq']; // cycle
  const key = rot[(i - 1) % rot.length];

  // Last sentence rule
  if (i === total - 1 && useLastly && total >= 3) {
    return { lead: WORDS.lastly, inline: null };
  }

  if (key === 'after') return { lead: WORDS.after, inline: null };
  if (key === 'then')  return { lead: null, inline: WORDS.then };
  if (key === 'next')  return { lead: null, inline: WORDS.next };
  return { lead: null, inline: WORDS.subseq }; // 'subsequently'
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
    return `${WORDS.at} ${ex.T}°C`; // no space before °C
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
      // Fermentation
      case 'FA': return 'under aerobic conditions';
      case 'FN': return 'under anaerobic conditions';
      case 'FC': return 'with carbonic maceration';
      case 'FI': return 'by immersion';
      // Washing (special handling in template)
      case 'WM': return 'using mechanical demucilagers';
      case 'WK': return 'manually washed with the Kenyan process';
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
      case 'HD': return 'hulled';
      default:   return label.toLowerCase();
    }
  }
};

/* ========= small utils ========= */
function capFirst(str){ return str ? str[0].toUpperCase()+str.slice(1) : str; }
function end(arr){ return arr.join(' ') + '.'; }

/* ========= templates ========= */
const TPL = {
  L(step, ctx) {
    const { np, be, forceCap } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';
    const sent = `${np} ${be}${first}${inline} ${WORDS.floated}`;
    parts.push(forceCap ? capFirst(sent) : capFirst(sent));
    return end(parts);
  },

  P(step, ctx) {
    const { np, be, forceCap } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';
    let sent = `${np} ${be}${first}${inline} ${WORDS.depulped}`;
    const mp = fmt.mucilagePct(step.extras);
    if (mp) sent += `, ${mp}`;
    parts.push(forceCap ? capFirst(sent) : capFirst(sent));
    return end(parts);
  },

  F(step, ctx) {
    const { np, be, forceCap } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';

    const chunks = [];
    chunks.push(`${np} ${be}${first}${inline} ${WORDS.fermented}`);

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

    const sent = chunks.join(' ');
    parts.push(forceCap ? capFirst(sent) : capFirst(sent));
    return end(parts);
  },

  W(step, ctx) {
    const { np, be, forceCap } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';

    const sub = fmt.subtypeProse(step.main, step.sub);
    let baseVerb = WORDS.washed; // default

    // Special verbing for WR / WK
    if (sub === 'rinsed with water') {
      const sent = `${np} ${be}${first}${inline} ${sub}`;
      parts.push(forceCap ? capFirst(sent) : capFirst(sent));
      return end(parts);
    }
    if (sub === 'manually washed with the Kenyan process') {
      const sent = `${np} ${be}${first}${inline} ${sub}`;
      parts.push(forceCap ? capFirst(sent) : capFirst(sent));
      return end(parts);
    }

    const sent = sub
      ? `${np} ${be}${first}${inline} ${baseVerb} ${sub}`
      : `${np} ${be}${first}${inline} ${baseVerb}`;
    parts.push(forceCap ? capFirst(sent) : capFirst(sent));
    return end(parts);
  },

  D(step, ctx) {
    const { np, be, forceCap } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';

    const chunks = [];
    chunks.push(`${np} ${be}${first}${inline} ${WORDS.dried}`);

    const sub = fmt.subtypeProse(step.main, step.sub);
    if (sub) chunks.push(sub);

    const dur = fmt.duration(step);
    if (dur) chunks.push(dur);

    const contact = fmt.contact(step.extras);
    if (contact) chunks.push(contact);

    const sent = chunks.join(' ');
    parts.push(forceCap ? capFirst(sent) : capFirst(sent));
    return end(parts);
  },

  R(step, ctx) {
    const { np, be, forceCap } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';

    const chunks = [];
    chunks.push(`${np} ${be}${first}${inline} ${WORDS.rested}`);

    const sub = fmt.subtypeProse(step.main, step.sub);
    if (sub) chunks.push(sub);

    const dur = fmt.duration(step);
    if (dur) chunks.push(dur);

    const sent = chunks.join(' ');
    parts.push(forceCap ? capFirst(sent) : capFirst(sent));
    return end(parts);
  },

  H(step, ctx) {
    const { np, be, forceCap } = ctx.subject;
    const parts = [];
    if (ctx.lead) parts.push(ctx.lead);
    const first = ctx.isFirst ? ' first' : '';
    const inline = ctx.inline ? ` ${ctx.inline}` : '';

    // subtypeProse: HW -> "wet hulled", HD -> "hulled" (default)
    const sub = fmt.subtypeProse(step.main, step.sub); // "wet hulled" | "hulled"
    const verb = sub || WORDS.hulled;

    const sent = `${np} ${be}${first}${inline} ${verb}`;
    parts.push(forceCap ? capFirst(sent) : capFirst(sent));
    return end(parts);
  }
};

/* ========= compose/render ========= */
function compose(steps, { useLastly }) {
  const depulpIdx = computeDepulpIndex(steps);

  return steps.map((step, i) => {
    const place = connectorPlacement(i, steps.length, useLastly);
    const subject = subjectFor(i, step, depulpIdx);
    const fn = TPL[step.main] || ((st, ctx) => {
      const first = ctx.isFirst ? ' first' : '';
      const inline = ctx.inline ? ` ${ctx.inline}` : '';
      const start = ctx.lead ? ctx.lead + ' ' : '';
      const sent = `${subject.np} ${subject.be}${first}${inline} processed`;
      return capFirst(`${start}${sent}`) + '.';
    });
    return fn(step, {
      lead: place.lead,
      inline: place.inline,
      isFirst: i === 0,
      subject
    });
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
