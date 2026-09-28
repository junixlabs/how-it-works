// Diagram scenes: render an Archify spec through Archify's own acceptance gate, then flatten the
// single inline SVG into a standalone, style-inlined SVG with measured node/edge boxes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

export function archifyHome() {
  return process.env.ARCHIFY_HOME || path.join(os.homedir(), '.claude/skills/archify');
}

export function archifyCli() {
  const cli = path.join(archifyHome(), 'bin/archify.mjs');
  return fs.existsSync(cli) ? cli : null;
}

// Runs `archify deliver --json`; returns { ok, receipt, html }.
export function archifyDeliver(type, specPath, outHtml) {
  const cli = archifyCli();
  if (!cli) return { ok: false, error: 'archify not found', receipt: null };
  const r = spawnSync(process.execPath, [cli, 'deliver', type, specPath, outHtml, '--quality', 'showcase', '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  let receipt = null;
  try { receipt = JSON.parse(r.stdout); } catch { /* non-JSON failure */ }
  return { ok: r.status === 0 && receipt?.ok !== false, receipt, error: r.status === 0 ? null : (receipt?.error || r.stderr.trim().split('\n')[0]) };
}

const PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap',
  'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'text-anchor',
  'dominant-baseline', 'display'];

// Flatten the delivered HTML's SVG (dark theme) and measure every node and edge in viewBox units.
export async function flattenDiagram(html, { theme = 'dark' } = {}) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
    await page.goto('file://' + path.resolve(html));
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForTimeout(300);
    return await page.evaluate(({ PROPS }) => {
      const svg = document.querySelector('svg');
      const vb = svg.viewBox.baseVal;
      const sr = svg.getBoundingClientRect();
      const k = vb.width / sr.width;
      const toVb = r => ({ x: +((r.left - sr.left) * k + vb.x).toFixed(1), y: +((r.top - sr.top) * k + vb.y).toFixed(1), w: +(r.width * k).toFixed(1), h: +(r.height * k).toFixed(1) });
      const nodes = {}, edges = {};
      for (const g of svg.querySelectorAll('[data-node-id]')) {
        if (g.tagName.toLowerCase() !== 'g') continue;
        nodes[g.dataset.nodeId] = { ...toVb(g.getBoundingClientRect()), label: g.dataset.nodeLabel || g.dataset.nodeId };
      }
      for (const p of svg.querySelectorAll('path[data-edge-id]')) {
        edges[p.dataset.edgeId] = { ...toVb(p.getBoundingClientRect()), from: p.dataset.edgeFrom, to: p.dataset.edgeTo, label: p.dataset.edgeLabel || '', length: +p.getTotalLength().toFixed(1), d: p.getAttribute('d') };
      }
      const clone = svg.cloneNode(true);
      const src = [svg, ...svg.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
      src.forEach((el, i) => {
        const cs = getComputedStyle(el);
        const style = PROPS.map(p => { const v = cs.getPropertyValue(p); return v ? `${p}:${v}` : ''; }).filter(Boolean).join(';');
        const d = dst[i];
        d.setAttribute('style', style);
        for (const a of ['tabindex', 'role', 'aria-pressed', 'aria-label', 'class']) d.removeAttribute(a);
      });
      clone.removeAttribute('style');
      clone.querySelectorAll('style, script, foreignObject').forEach(n => n.remove());
      clone.setAttribute('width', vb.width); clone.setAttribute('height', vb.height);
      const bg = getComputedStyle(document.body).backgroundColor;
      const fonts = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch { return []; } })
        .filter(r => r.type === CSSRule.FONT_FACE_RULE).map(r => r.cssText).join('\n');
      return { viewBox: { x: vb.x, y: vb.y, w: vb.width, h: vb.height }, nodes, edges, svg: clone.outerHTML, fonts, background: bg };
    }, { PROPS });
  } finally {
    await browser.close();
  }
}
