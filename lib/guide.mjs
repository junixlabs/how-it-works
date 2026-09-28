// Guide builder: task tutorial, release notes, or architecture explainer, from the storyboard plus evidence.
// Every bold UI term must exist in the captured product (or diagram) — the label gate.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { sceneGif } from './clips.mjs';
import { diag } from './validate.mjs';

const ACCENT = '#e0564a';
const EN = {
  audience: 'This guide is for: {audience}.', outcome: 'When you finish, you will be able to {outcome}.',
  steps: 'Steps', result: 'Result', whatsNew: "What's new", howTo: 'How to use it', howItWorks: 'How it works',
  overview: 'Overview', altAction: 'Step {n}: action', altResult: 'Step {n}: result',
};
const lc = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;

async function uiStills(page, sb, ev, dir, capDir) {
  const VW = ev.viewport.width, VH = ev.viewport.height, CROP = { w: 820, h: 460 };
  const out = {};
  let n = 0;
  for (const s of sb.scenes.filter(x => x.kind === 'ui')) {
    n++;
    const e = ev.scenes.find(x => x.id === s.id), box = e.focusAfter;
    const cx = box ? box.x + box.w / 2 : VW / 2, cy = box ? box.y + box.h / 2 : CROP.h / 2;
    const c = { x: Math.round(Math.min(Math.max(cx - CROP.w / 2, 0), VW - CROP.w)), y: Math.round(Math.min(Math.max(cy - CROP.h / 2, 0), VH - CROP.h)) };
    const src = 'data:image/png;base64,' + fs.readFileSync(`${capDir}/${s.id}-after.png`).toString('base64');
    const pad = 8;
    const callout = s.callout === false || !box ? '' : `<svg width="${VW}" height="${VH}" style="position:absolute;left:0;top:0">
      <rect x="${box.x - pad}" y="${box.y - pad}" width="${box.w + pad * 2}" height="${box.h + pad * 2}" rx="10" fill="none" stroke="${ACCENT}" stroke-width="3"/>
      <circle cx="${box.x - pad}" cy="${box.y - pad}" r="15" fill="${ACCENT}"/>
      <text x="${box.x - pad}" y="${box.y - pad + 6}" text-anchor="middle" font-family="Helvetica,Arial" font-size="17" font-weight="700" fill="#fff">${n}</text></svg>`;
    await page.setViewportSize({ width: CROP.w, height: CROP.h });
    await page.setContent(`<!doctype html><html><body style="margin:0;overflow:hidden"><div style="position:absolute;left:${-c.x}px;top:${-c.y}px;width:${VW}px;height:${VH}px"><img src="${src}" style="width:${VW}px;height:${VH}px;display:block">${callout}</div></body></html>`);
    const base = `img/${String(n).padStart(2, '0')}-${s.id}`;
    await page.screenshot({ path: `${dir}/${base}.png` });
    let gif = null;
    if (s.callout !== false) { gif = `${base}.gif`; sceneGif(capDir, ev, s.id, { out: `${dir}/${gif}` }); }
    out[s.id] = { img: `${base}.png`, gif, label: e.label };
  }
  return out;
}

async function diagramStill(page, D, focus, file) {
  const dim = focus ? Object.keys(D.nodes).filter(k => !focus.includes(k)) : [];
  const rings = (focus || []).map(k => { const b = D.nodes[k]; return `<rect x="${b.x - 6}" y="${b.y - 6}" width="${b.w + 12}" height="${b.h + 12}" rx="12" fill="none" stroke="${ACCENT}" stroke-width="3"/>`; }).join('');
  const svg = D.svg.replace(/<\/svg>\s*$/, `${rings}</svg>`);
  const css = dim.map(k => `g[data-node-id="${k}"]{opacity:.22 !important}`).join('') + (focus ? `path[data-edge-id]{opacity:.25 !important}` : '');
  const keep = focus ? Object.entries(D.edges).filter(([, e]) => focus.includes(e.from) && focus.includes(e.to)).map(([id]) => `path[data-edge-id="${id}"]{opacity:1 !important}`).join('') : '';
  await page.setViewportSize({ width: Math.ceil(D.viewBox.w), height: Math.ceil(D.viewBox.h) });
  await page.setContent(`<!doctype html><html><head><style>${D.fonts} body{margin:0;background:${D.background}} ${css} ${keep}</style></head><body>${svg}</body></html>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: file });
}

export async function buildGuide({ sb, ev, capDir, diagrams, dir }) {
  fs.mkdirSync(`${dir}/img`, { recursive: true });
  const C = { ...EN, ...(sb.copy?.guide || {}) };
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  const ui = ev ? await uiStills(page, sb, ev, dir, capDir) : {};
  const md = [`# ${sb.title}${sb.kind === 'feature-release' ? ` — v${sb.release.version}` : ''}`, ''];
  if (sb.kind === 'feature-release' && sb.release.date) md.push(`_${sb.release.date}_`, '');
  if (sb.audience) md.push(C.audience.replace('{audience}', lc(sb.audience)));
  if (sb.outcome) md.push(C.outcome.replace('{outcome}', lc(sb.outcome)));
  md.push('');

  const labels = new Set(Object.values(ui).map(u => u.label).filter(Boolean));
  if (sb.kind === 'feature-release') md.push(`## ${C.whatsNew}`, '', ...sb.release.highlights.map(h => `- ${h}`), '');

  if (sb.kind === 'architecture-explainer') {
    const first = Object.keys(diagrams)[0];
    if (first) { await diagramStill(page, diagrams[first], null, `${dir}/img/00-overview.png`); md.push(`## ${C.overview}`, '', `![${C.overview}](img/00-overview.png)`, ''); }
    md.push(`## ${C.howItWorks}`, '');
  } else {
    md.push(`## ${sb.kind === 'feature-release' ? C.howTo : C.steps}`, '');
  }

  let n = 0;
  for (const s of sb.scenes) {
    if (s.kind === 'title') { md.push(`### ${s.heading}`, ''); continue; }
    n++;
    if (s.kind === 'ui') {
      const u = ui[s.id];
      const text = (s.guide?.step || s.narration).replaceAll('{label}', `**${u.label}**`);
      md.push(`${n}. ${text}`, '');
      if (u.gif) md.push(`   ![${C.altAction.replace('{n}', n)}](${u.gif})`, '');
      md.push(`   ![${C.altResult.replace('{n}', n)}](${u.img})`, '');
    } else {
      const D = diagrams[s.diagram];
      for (const k of s.focus) labels.add(D.nodes[k].label);
      const text = (s.guide?.step || s.narration).replaceAll('{label}', `**${D.nodes[s.focus[0]].label}**`);
      const img = `img/${String(n).padStart(2, '0')}-${s.id}.png`;
      await diagramStill(page, D, s.focus, `${dir}/${img}`);
      md.push(`### ${n}. ${s.title}`, '', text, '', `![${s.title}](${img})`, '');
    }
  }
  if (C.resultText) md.push(`## ${C.result}`, '', C.resultText, '');
  await browser.close();
  const text = md.join('\n');
  const file = sb.kind === 'feature-release' ? 'release-notes.md' : 'guide.md';
  fs.writeFileSync(`${dir}/${file}`, text);

  // Label gate: bold terms must be real UI text, a captured focus label, a diagram node label, or a key name.
  const KEYS = new Set(['Enter', 'Esc', 'Escape', 'Tab', 'Space', 'Backspace']);
  const dom = ev ? ev.scenes.map(s => s.domText).join('\n') : '';
  const terms = [...text.matchAll(/\*\*(.+?)\*\*/g)].map(m => m[1]);
  const diagnostics = terms.filter(t => !(KEYS.has(t) || dom.includes(t) || labels.has(t))).map(t =>
    diag('guide/unknown-ui-label', `Guide names "${t}", which does not appear in the captured product or diagram.`, { file, term: t }, { knownLabels: [...labels] },
      [...[...labels].slice(0, 5).map(l => `use the real label "${l}"`), 'remove the bold marker if it is not a UI name']));
  return { file, terms, diagnostics };
}
