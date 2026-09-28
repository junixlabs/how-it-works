// UI capture: drives the real product for every "ui" scene, records a CDP screencast (2x DPR, timestamped
// frames), an event log (mouse path, clicks, keystrokes) and per-scene evidence (boxes, DOM text, assertions).
import { chromium } from 'playwright';
import fs from 'node:fs';

// In-page cursor so footage, GIFs and stills all show the pointer exactly where the real mouse is.
const CURSOR = `(() => {
  if (window.__cur) return;
  const c = document.createElement('div');
  c.innerHTML = '<svg width="22" height="27" viewBox="0 0 30 36"><path d="M3 2 L3 29 L10 22.5 L15 33 L20 30.6 L15 20.4 L25 20.4 Z" fill="#111" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/></svg>';
  Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none',
    filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))', transform: 'translate(-2px,-1px)', transition: 'scale .08s' });
  document.documentElement.appendChild(c);
  const r = document.createElement('div');
  Object.assign(r.style, { position: 'fixed', width: '34px', height: '34px', margin: '-17px 0 0 -17px', borderRadius: '50%',
    border: '3px solid #e0564a', opacity: '0', zIndex: 2147483646, pointerEvents: 'none' });
  document.documentElement.appendChild(r);
  addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', e => {
    c.style.scale = '0.85';
    r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
    r.animate([{ transform: 'scale(.3)', opacity: .9 }, { transform: 'scale(1.9)', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.2,.7,.3,1)' });
  }, true);
  addEventListener('mouseup', () => { c.style.scale = '1'; }, true);
  window.__cur = c;
})()`;

export function loc(page, t) {
  let l;
  if (t.role) l = page.getByRole(t.role, t.name ? { name: t.name, exact: true } : {});
  else if (t.placeholder) l = page.getByPlaceholder(t.placeholder);
  else if (t.testId) l = page.getByTestId(t.testId);
  if (t.hasText) l = l.filter({ hasText: t.hasText });
  if (t.text) l = l.filter({ hasText: t.text });
  if (t.child) l = loc(l, t.child);
  return l.first();
}
const box = async l => { const b = await l.boundingBox({ timeout: 5000 }); return b && { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
const label = async (l, t) => t.placeholder ? l.getAttribute('placeholder') : (await l.innerText({ timeout: 5000 })).trim().split('\n')[0];

async function check(page, e) {
  const [kind, spec] = Object.entries(e)[0];
  try {
    if (kind === 'visible') { await loc(page, spec).waitFor({ state: 'visible', timeout: 3000 }); return { kind, ok: true }; }
    if (kind === 'text') { const v = await loc(page, spec).innerText(); return { kind, ok: v.includes(spec.contains), observed: v }; }
    if (kind === 'class') { const v = await loc(page, spec).getAttribute('class'); return { kind, ok: (v || '').includes(spec.contains), observed: v }; }
    if (kind === 'count') { const n = await page.getByTestId(spec.testId).count(); return { kind, ok: n === spec.equals, observed: n }; }
    if (kind === 'url') { const u = page.url(); return { kind, ok: u.includes(spec.contains), observed: u }; }
  } catch (err) { return { kind, ok: false, error: err.message.split('\n')[0] }; }
  return { kind, ok: false, error: 'unknown expectation' };
}


export async function capture(sb, OUT) {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(`${OUT}/frames`, { recursive: true });
  const scenes = sb.scenes.filter(s => s.kind === 'ui');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: sb.product.viewport, deviceScaleFactor: 2, locale: sb.locale || 'en-US' });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  await page.goto(sb.product.url);
  await page.evaluate(CURSOR);

  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async f => {
    const file = `frames/${String(frames.length).padStart(5, '0')}.jpg`;
    fs.writeFileSync(`${OUT}/${file}`, Buffer.from(f.data, 'base64'));
    frames.push({ t: f.metadata.timestamp, file });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  const vp = sb.product.viewport;
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: vp.width * 2, maxHeight: vp.height * 2, everyNthFrame: 1 });

  const now = () => Date.now() / 1000;
  const sleep = ms => page.waitForTimeout(ms);
  const events = [];
  let cursor = { x: vp.width / 2, y: vp.height * 0.82 };
  async function moveTo(pt, ms = 650) {
    const steps = Math.round(ms / 16), from = { ...cursor };
    for (let k = 1; k <= steps; k++) {
      const u = k / steps, e = u < .5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;
      await page.mouse.move(from.x + (pt.x - from.x) * e, from.y + (pt.y - from.y) * e - Math.sin(u * Math.PI) * 18);
      await sleep(16);
    }
    cursor = { ...pt };
    events.push({ t: now(), type: 'move', x: pt.x, y: pt.y });
  }
  const RHYTHM = [95, 120, 80, 140, 105, 90, 160, 85, 115, 100, 130, 75];
  const evidence = { storyboard: sb.id, url: sb.product.url, capturedAt: new Date().toISOString(), viewport: vp, scenes: [] };
  await page.mouse.move(cursor.x, cursor.y);
  await sleep(600);

  for (const s of scenes) {
    for (const a of s.actions.filter(a => a.do === 'goto')) {
      await page.goto(new URL(a.path, sb.product.url).href);
      await page.evaluate(CURSOR);
      await page.mouse.move(cursor.x, cursor.y);
    }
    await sleep(350);
    const rec = { id: s.id, t0: now(), actions: [] };
    await page.screenshot({ path: `${OUT}/${s.id}-before.png` });
    const focus = loc(page, s.focus);
    rec.focusBefore = await box(focus).catch(() => null);
    await sleep(500);
    for (const a of s.actions.filter(a => a.do !== 'goto')) {
      const t = loc(page, a.target);
      let b;
      try { b = await box(t); } catch { b = null; }
      if (!b) { rec.error = { code: 'capture/target-not-found', action: a }; break; }
      const pt = { x: +(b.x + Math.min(b.w / 2, 60)).toFixed(1), y: +(b.y + b.h / 2).toFixed(1) };
      if (a.do === 'click' || a.do === 'check') {
        if (Math.hypot(pt.x - cursor.x, pt.y - cursor.y) > 4) await moveTo(pt);
        await sleep(180);
        events.push({ t: now(), type: 'click', x: pt.x, y: pt.y, scene: s.id });
        await page.mouse.down(); await sleep(70); await page.mouse.up();
      }
      if (a.do === 'type') {
        let k = 0;
        for (const ch of a.text) {
          events.push({ t: now(), type: 'key', key: ch, scene: s.id });
          await page.keyboard.type(ch);
          await sleep(ch === ' ' ? 170 : RHYTHM[k++ % RHYTHM.length]);
        }
      }
      if (a.do === 'press') {
        await sleep(260);
        events.push({ t: now(), type: 'enter', key: a.key, scene: s.id });
        await page.keyboard.press(a.key);
      }
      rec.actions.push({ do: a.do, target: a.target, box: b, point: pt });
      await sleep(220);
    }
    await sleep(900);
    await page.screenshot({ path: `${OUT}/${s.id}-after.png` });
    rec.focusAfter = await box(focus).catch(() => null);
    rec.label = await label(focus, s.focus).catch(() => null);
    rec.domText = await page.locator('body').innerText();
    rec.checks = [];
    for (const e of s.expect) rec.checks.push(await check(page, e));
    rec.ok = !rec.error && rec.checks.every(c => c.ok);
    rec.t1 = now();
    evidence.scenes.push(rec);
  }
  await sleep(300);
  await cdp.send('Page.stopScreencast');
  await ctx.close();
  await browser.close();
  evidence.frames = frames;
  evidence.events = events;
  fs.writeFileSync(`${OUT}/evidence.json`, JSON.stringify(evidence, null, 2));
  return evidence;
}
