// Pure composer: (storyboard, evidence, diagrams, narration, layout) -> HyperFrames HTML + audio cue list.
// No I/O and no clocks, so the same inputs always produce the same bytes (golden-tested).
import { wordTimes } from './tts.mjs';

const f2 = n => +(+n).toFixed(3);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const ACC = '#ff5a4e', ACC2 = '#7c9cff', OK = '#34d399';
export const TIMING = { INTRO: 3.6, OUTRO: 5.2, HEAD: 0.9, VO_LEAD: 0.55, TAIL: 1.1 };

export function layout(format, vp = { width: 1280, height: 720 }) {
  if (format === 'video-9x16') {
    const W = 1080, H = 1920, FW = 1000, S = FW / vp.width, FH = vp.height * S, BAR = 34, FX = 40;
    // Center the frame + chip + ~3 caption lines as one block.
    const FY = Math.round((H - (FH + BAR + 150 + 3 * 64)) / 2);
    return { format, W, H, S, FW, FH, BAR, FX, FY, capX: FX, capY: FY + FH + BAR + 150, capW: W - 2 * FX, capSize: 44, chipX: FX, chipY: FY + FH + BAR + 70,
      chipSize: 30, titleSize: 92, title2Size: 54, subSize: 32, outroSize: 84, liSize: 38, zMax: 2.4, dZMax: 2.6, progY: FY - 40 };
  }
  const W = 1920, H = 1080, S = 1.15 * 1280 / vp.width, FW = vp.width * S, FH = vp.height * S, BAR = 40, FX = (W - FW) / 2, FY = 52;
  return { format: 'video-16x9', W, H, S, FW, FH, BAR, FX, FY, capX: FX + 430, capY: FY + FH + BAR + 34, capW: W - FX - (FX + 430), capSize: 30, chipX: FX,
    chipY: FY + FH + BAR + 40, chipSize: 25, titleSize: 112, title2Size: 64, subSize: 28, outroSize: 96, liSize: 36, zMax: 1.85, dZMax: 2.1, progY: FY + FH + BAR + 20 };
}

export function defaultCopy(sb) {
  const c = sb.copy || {};
  const content = sb.scenes.filter(s => s.kind !== 'title');
  const k = sb.kind;
  const intro = {
    kicker: k === 'feature-release' ? `NEW · v${sb.release.version}` : k === 'architecture-explainer' ? 'HOW IT WORKS' : `QUICK GUIDE · ${content.length} STEPS`,
    title: sb.title.split(/\s+/),
    sub: k === 'feature-release' ? sb.release.highlights.slice(0, 3).join(' · ') : (sb.outcome || ''),
    ...(c.intro || {}),
  };
  const outro = {
    kicker: k === 'feature-release' ? `SHIPPED IN v${sb.release.version}` : k === 'architecture-explainer' ? 'RECAP' : 'ALL DONE',
    title: k === 'feature-release' ? 'Try it today' : k === 'architecture-explainer' ? "That's how it works" : "You're all set",
    learned: k === 'feature-release' ? sb.release.highlights.slice(0, 3) : content.slice(0, 3).map(s => s.title),
    ...(c.outro || {}),
  };
  return { intro, outro };
}

// Scene timing. ui: real action span + holds; diagram/title: narration-driven.
export function timeline(sb, ev, vo) {
  const { INTRO, HEAD, VO_LEAD, TAIL } = TIMING;
  let t = INTRO;
  const scenes = sb.scenes.map((s, i) => {
    const v = vo[s.id];
    const voDur = v ? v.dur : 0;
    const sc = { s, i, start: f2(t), vo: f2(voDur) };
    if (s.kind === 'ui') {
      const e = ev.scenes.find(x => x.id === s.id);
      sc.e = e; sc.span = e.t1 - e.t0;
      sc.dur = f2(Math.max(HEAD + sc.span + TAIL, VO_LEAD + voDur + 0.9, 4.6));
      sc.at = ts => f2(sc.start + HEAD + (ts - e.t0));
      sc.events = ev.events.filter(x => x.t >= e.t0 && x.t <= e.t1).map(x => ({ ...x, ct: sc.at(x.t) }));
    } else if (s.kind === 'diagram') {
      sc.dur = f2(Math.max(VO_LEAD + voDur + 1.0, 4.2));
      sc.events = [];
    } else {
      sc.dur = f2(Math.max(VO_LEAD + voDur + 0.8, 3.0));
      sc.events = [];
    }
    t += sc.dur;
    return sc;
  });
  return { scenes, OUT0: f2(t), TOTAL: f2(t + TIMING.OUTRO) };
}

// Consecutive scenes that share one visual stage (same kind; diagrams also share the same diagram).
function groups(scenes) {
  const out = [];
  for (const sc of scenes) {
    const key = sc.s.kind === 'diagram' ? `diagram:${sc.s.diagram}` : sc.s.kind === 'title' ? `title:${sc.s.id}` : 'ui';
    const last = out.at(-1);
    if (last && last.key === key) last.scenes.push(sc);
    else out.push({ key, kind: sc.s.kind, scenes: [sc] });
  }
  return out.map((g, n) => ({ ...g, id: `g${n}`, start: g.scenes[0].start, end: f2(g.scenes.at(-1).start + g.scenes.at(-1).dur) }));
}

function uiCam(L, boxes) {
  const P = 30, b = boxes.filter(Boolean);
  if (!b.length) return { z: 1, x: 0, y: 0 };
  const x0 = Math.min(...b.map(q => q.x)) - P, y0 = Math.min(...b.map(q => q.y)) - P;
  const x1 = Math.max(...b.map(q => q.x + q.w)) + P, y1 = Math.max(...b.map(q => q.y + q.h)) + P;
  const z = Math.max(1.12, Math.min(L.zMax, (L.FW * 0.9) / ((x1 - x0) * L.S), (L.FH * 0.82) / ((y1 - y0) * L.S)));
  const cx = (x0 + x1) / 2 * L.S, cy = (y0 + y1) / 2 * L.S;
  return { z: f2(z), x: f2(Math.min(0, Math.max(L.FW - z * L.FW, L.FW / 2 - z * cx))), y: f2(Math.min(0, Math.max(L.FH - z * L.FH, L.FH / 2 - z * cy))) };
}

export function compose({ sb, ev, diagrams = {}, vo, format }) {
  const L = layout(format, sb.product?.viewport);
  const { INTRO, OUTRO, HEAD, VO_LEAD } = TIMING;
  const { scenes, OUT0, TOTAL } = timeline(sb, ev, vo);
  const G = groups(scenes);
  const copy = defaultCopy(sb);
  const SC0 = scenes[0].start;
  const T = x => f2(x);
  const cues = [];
  const sfx = (name, at, vol = 0.45, rate = 1) => cues.push({ name, at: f2(at), vol, rate });
  let html = '', js = '';

  // ---------- background ----------
  html += `<div id="bg" class="clip" data-start="0" data-duration="${TOTAL}" data-track-index="0">
  <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="grid"></div><div class="vig"></div></div>`;
  js += `
  tl.fromTo('.b1', { x: -120, y: -60 }, { x: 260, y: 120, duration: ${TOTAL}, ease: 'sine.inOut' }, 0);
  tl.fromTo('.b2', { x: 180, y: 80 }, { x: -220, y: -90, duration: ${TOTAL}, ease: 'sine.inOut' }, 0);
  tl.fromTo('.b3', { x: 0, y: 140, scale: 0.9 }, { x: 140, y: -60, scale: 1.2, duration: ${TOTAL}, ease: 'sine.inOut' }, 0);
  tl.fromTo('.grid', { y: 0 }, { y: 240, duration: ${TOTAL}, ease: 'none' }, 0);`;

  // ---------- intro ----------
  const I = copy.intro;
  html += `<div id="intro" class="clip" data-start="0" data-duration="${INTRO}" data-track-index="1">
  <div class="kicker"><span class="dot"></span>${esc(I.kicker)}</div>
  <h1 class="ttl">${I.title.map(w => `<span class="w">${esc(w)}</span>`).join(' ')}</h1>
  ${I.product ? `<h2 class="ttl2">${I.with ? `<span class="w2">${esc(I.with)}</span> ` : ''}<span class="w2 accent">${esc(I.product)}</span></h2>` : ''}
  <div class="sweep"></div>
  ${I.sub ? `<div class="sub">${esc(I.sub)}</div>` : ''}</div>`;
  js += `
  tl.from('#intro .kicker', { opacity: 0, y: 18, duration: 0.7, ease: 'power3.out' }, 0.25);
  tl.from('#intro .w', { opacity: 0, y: 70, filter: 'blur(14px)', duration: 0.75, ease: 'power4.out', stagger: 0.07 }, 1.25);
  ${I.product ? `tl.from('#intro .w2', { opacity: 0, y: 40, scale: 0.9, duration: 0.6, ease: 'back.out(2)', stagger: 0.12 }, 1.7);` : ''}
  tl.fromTo('#intro .sweep', { x: -900, opacity: 0 }, { x: 900, opacity: 0.9, duration: 0.9, ease: 'power2.inOut' }, 2.0);
  ${I.sub ? `tl.from('#intro .sub', { opacity: 0, y: 12, duration: 0.5 }, 2.15);` : ''}
  tl.to('#intro', { scale: 1.08, opacity: 0, filter: 'blur(10px)', duration: 0.55, ease: 'power2.in' }, ${INTRO - 0.55});`;
  sfx('riser', 0, 0.3); sfx('impact', 1.25, 0.55); sfx('whoosh', INTRO - 0.5, 0.4);

  // ---------- stages ----------
  for (const g of G) {
    const gd = f2(g.end - g.start);
    const isLast = g === G.at(-1);
    if (g.kind === 'ui') js += uiGroup(g, gd, isLast);
    else if (g.kind === 'diagram') js += diagramGroup(g, gd);
    else js += titleGroup(g, gd);
  }

  function frameShell(g, gd, inner, hud = '') {
    return `<div id="${g.id}" class="clip stage" data-start="${g.start}" data-duration="${gd}" data-track-index="1">
  <div class="persp"><div class="enter"><div class="drift"><div class="frame">
    <div class="bar"><span></span><span></span><span></span><div class="addr">${esc((sb.product?.url || '').replace(/^https?:\/\//, ''))}</div></div>
    <div class="view" data-layout-allow-overflow><div class="cam" data-layout-allow-overflow>${inner}</div>${hud}</div>
  </div></div></div></div></div>`;
  }

  function enterExit(g, gd) {
    sfx('whoosh', g.start - 0.05, 0.35);
    return `
  tl.fromTo('#${g.id} .enter', { y: 260, rotateX: 34, scale: 0.78, opacity: 0 }, { y: 0, rotateX: 0, scale: 1, opacity: 1, duration: 1.1, ease: 'power4.out' }, ${T(g.start - 0.05)});
  tl.fromTo('#${g.id} .drift', { rotateY: -3.5, rotateX: 3 }, { rotateY: 3, rotateX: 1, duration: ${gd}, ease: 'sine.inOut' }, ${g.start});
  tl.to('#${g.id} .enter', { y: -120, rotateX: -22, scale: 0.72, opacity: 0, duration: 0.8, ease: 'power3.in' }, ${T(g.end - 0.8)});`;
  }

  function uiGroup(g, gd, isLast) {
    let inner = '', hud = '', j = enterExit(g, gd);
    j += `\n  tl.set('#${g.id} .cam', { transformOrigin: '0px 0px' }, 0);`;
    for (const sc of g.scenes) {
      const { e, s, i, start, dur } = sc;
      const id = `s${i}`;
      inner += `<video id="clip-${s.id}" class="clip shot" data-start="${start}" data-duration="${f2(dur + (isLast && sc === g.scenes.at(-1) ? 1.1 : 0))}" data-track-index="2" src="assets/clips/${s.id}.mp4" muted playsinline></video>`;
      const same = JSON.stringify(s.focus) === JSON.stringify(s.actions.find(a => a.target)?.target);
      const fb = same ? e.focusBefore : e.focusAfter;
      const S = L.S, p = 10;
      if (fb && s.callout !== false) {
        inner += `<div class="spot" id="${id}-spot" style="left:${f2((fb.x - p) * S)}px;top:${f2((fb.y - p) * S)}px;width:${f2((fb.w + p * 2) * S)}px;height:${f2((fb.h + p * 2) * S)}px"></div>`;
        const above = fb.y > 90;
        inner += `<div class="tip ${above ? 'up' : 'down'}" id="${id}-tip" style="left:${f2((fb.x + Math.min(fb.w, 220) / 2) * S)}px;top:${f2((above ? fb.y - p - 12 : fb.y + fb.h + p + 12) * S)}px"><b>${i + 1}</b>${esc(e.label)}</div>`;
      }
      if (s.fx === 'celebrate') sc.events.filter(x => x.type === 'click').forEach((c, k) => {
        inner += `<div class="burst" id="${id}-burst${k}" style="left:${f2(c.x * S)}px;top:${f2(c.y * S)}px">${Array.from({ length: 14 }, (_, n) => `<i data-a="${(n * 360 / 14).toFixed(1)}" data-d="${48 + (n % 3) * 16}" style="background:${[OK, ACC2, '#fbbf24'][n % 3]}"></i>`).join('')}<u></u></div>`;
      });
      sc.events.filter(x => x.type === 'enter').forEach((x, k) => { hud += `<div class="key" id="${id}-key${k}"><span>⏎</span> ${esc(x.key)}</div>`; });

      const actStart = start + HEAD + 0.25;
      const cam = s.callout === false ? { z: 1.08, x: f2(-L.FW * 0.04), y: 0 } : uiCam(L, [e.focusAfter, ...e.actions.map(a => a.box)]);
      j += `
  tl.to('#${g.id} .cam', { scale: ${cam.z}, x: ${cam.x}, y: ${cam.y}, duration: 1.15, ease: 'power3.inOut' }, ${T(s.callout === false ? start + 0.6 : actStart - 0.35)});
  tl.to('#${g.id} .cam', { scale: 1, x: 0, y: 0, duration: 0.9, ease: 'power2.inOut' }, ${T(start + dur - 0.95)});`;
      if (fb && s.callout !== false) {
        const lastEv = sc.events.at(-1);
        const on = f2(same ? actStart + 0.2 : (lastEv ? lastEv.ct + 0.35 : actStart));
        const clickOnly = s.actions.some(a => a.do === 'click' || a.do === 'check') && !s.actions.some(a => a.do === 'type');
        const off = same && clickOnly && lastEv ? f2(lastEv.ct + 0.15) : f2(start + dur - 1.0);
        j += `
  tl.fromTo('#${id}-spot', { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'power3.out' }, ${on});
  tl.fromTo('#${id}-tip', { opacity: 0, y: 12, scale: 0.8 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'back.out(2.2)' }, ${T(on + 0.12)});
  tl.to(['#${id}-spot', '#${id}-tip'], { opacity: 0, duration: 0.3 }, ${off});`;
      }
      sc.events.filter(x => x.type === 'enter').forEach((x, k) => {
        j += `
  tl.fromTo('#${id}-key${k}', { opacity: 0, y: 24, scale: 0.7 }, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'back.out(3)' }, ${T(x.ct - 0.36)});
  tl.to('#${id}-key${k}', { scale: 0.9, duration: 0.08, yoyo: true, repeat: 1 }, ${T(x.ct)});
  tl.to('#${id}-key${k}', { opacity: 0, y: 10, duration: 0.3 }, ${T(x.ct + 0.9)});`;
      });
      if (s.fx === 'celebrate') sc.events.filter(x => x.type === 'click').forEach((x, k) => {
        j += `
  tl.fromTo('#${id}-burst${k} i', { x: 0, y: 0, scale: 1, opacity: 1 }, { x: (n, el) => Math.cos(el.dataset.a * Math.PI / 180) * el.dataset.d, y: (n, el) => Math.sin(el.dataset.a * Math.PI / 180) * el.dataset.d, scale: 0.2, opacity: 0, duration: 0.85, ease: 'power3.out' }, ${T(x.ct + 0.08)});
  tl.fromTo('#${id}-burst${k} u', { scale: 0.2, opacity: 0.9 }, { scale: 2.6, opacity: 0, duration: 0.7, ease: 'power2.out' }, ${T(x.ct + 0.05)});`;
      });
      // SFX on the real events
      if (sc !== g.scenes[0]) sfx('whoosh', start + 0.02, 0.18);
      const KV = [0.3, 0.38, 0.27, 0.42, 0.33, 0.36, 0.25, 0.4], KR = [1.0, 0.96, 1.04, 0.98, 1.06, 0.94, 1.02, 0.99];
      let kk = 0;
      for (const x of sc.events) {
        if (x.type === 'key') { sfx('key', x.ct, KV[kk % 8] + 0.15, KR[kk % 8]); kk++; }
        if (x.type === 'enter') { sfx('enter', x.ct, 0.6); sfx('pop', x.ct + 0.12, 0.35); }
        if (x.type === 'click') {
          sfx('click', x.ct, 0.6);
          if (s.fx === 'celebrate') { sfx('sparkle', x.ct + 0.06, 0.4); sfx('chime', x.ct + 0.1, 0.22); }
          if (s.fx === 'filter') sfx('whoosh', x.ct + 0.1, 0.3);
        }
      }
    }
    html += frameShell(g, gd, inner, hud);
    return j;
  }

  function diagramGroup(g, gd) {
    const name = g.scenes[0].s.diagram;
    const D = diagrams[name];
    const PW = L.FW, PH = L.FH + L.BAR;
    const pad = 0.94;
    const s0 = Math.min(PW * pad / D.viewBox.w, PH * pad / D.viewBox.h);
    const ox = (PW - D.viewBox.w * s0) / 2, oy = (PH - D.viewBox.h * s0) / 2;
    // Trace overlays + focus rings live inside the SVG so they share its coordinate space.
    let overlays = '';
    const traced = new Set(g.scenes.flatMap(sc => sc.s.trace || []));
    for (const eid of traced) {
      const e = D.edges[eid];
      overlays += `<path class="trace" data-trace="${esc(eid)}" d="${esc(e.d)}" style="fill:none;stroke:${ACC};stroke-width:3.4;stroke-linecap:round;stroke-dasharray:${e.length};stroke-dashoffset:${e.length};filter:drop-shadow(0 0 6px ${ACC})"/>`;
    }
    for (const nid of new Set(g.scenes.flatMap(sc => sc.s.focus))) {
      const n = D.nodes[nid];
      overlays += `<rect class="ring" data-ring="${esc(nid)}" x="${n.x - 6}" y="${n.y - 6}" width="${n.w + 12}" height="${n.h + 12}" rx="12" style="fill:none;stroke:${ACC};stroke-width:3;opacity:0;filter:drop-shadow(0 0 10px ${ACC})"/>`;
    }
    const svg = D.svg.replace(/<svg([^>]*)>/, (m, a) => `<svg${a.replace(/\sstyle="[^"]*"/, '')} id="${g.id}-svg" style="position:absolute;left:${f2(ox)}px;top:${f2(oy)}px;width:${f2(D.viewBox.w * s0)}px;height:${f2(D.viewBox.h * s0)}px">`).replace(/<\/svg>\s*$/, `${overlays}</svg>`);
    html += `<div id="${g.id}" class="clip stage" data-start="${g.start}" data-duration="${gd}" data-track-index="1">
  <div class="persp dpersp"><div class="enter"><div class="drift"><div class="dpanel" style="background:${D.background}">
    <div class="dview" data-layout-allow-overflow><div class="cam" data-layout-allow-overflow>${svg}</div></div>
  </div></div></div></div></div>`;
    let j = enterExit(g, gd);
    j += `\n  tl.set('#${g.id} .cam', { transformOrigin: '0px 0px' }, 0);`;
    const N = `#${g.id}-svg g[data-node-id]`, E = `#${g.id}-svg path[data-edge-id]`;
    for (const sc of g.scenes) {
      const { s, start, dur } = sc;
      const bx = [...s.focus.map(n => D.nodes[n]), ...(s.trace || []).map(e => D.edges[e])];
      const P = 40;
      const x0 = Math.min(...bx.map(b => b.x)) - P, y0 = Math.min(...bx.map(b => b.y)) - P;
      const x1 = Math.max(...bx.map(b => b.x + b.w)) + P, y1 = Math.max(...bx.map(b => b.y + b.h)) + P;
      const z = f2(Math.max(1, Math.min(L.dZMax, PW * 0.86 / ((x1 - x0) * s0), PH * 0.8 / ((y1 - y0) * s0))));
      const cx = ox + (x0 + x1) / 2 * s0, cy = oy + (y0 + y1) / 2 * s0;
      const tx = f2(Math.min(0, Math.max(PW - z * PW, PW / 2 - z * cx))), ty = f2(Math.min(0, Math.max(PH - z * PH, PH / 2 - z * cy)));
      const whole = s.focus.length >= Object.keys(D.nodes).length;
      const t0 = start + 0.15;
      const focusSel = s.focus.map(n => `#${g.id}-svg g[data-node-id="${n}"]`).join(', ');
      const edgeKeep = Object.entries(D.edges).filter(([id, e]) => (s.trace || []).includes(id) || (s.focus.includes(e.from) && s.focus.includes(e.to))).map(([id]) => `#${g.id}-svg path[data-edge-id="${id}"]`);
      j += `
  tl.to('#${g.id} .cam', { scale: ${whole ? 1 : z}, x: ${whole ? 0 : tx}, y: ${whole ? 0 : ty}, duration: 1.1, ease: 'power3.inOut' }, ${T(t0)});
  tl.to('${N}', { opacity: ${whole ? 1 : 0.2}, duration: 0.45 }, ${T(t0 + 0.1)});
  tl.to('${E}', { opacity: ${whole ? 1 : 0.15}, duration: 0.45 }, ${T(t0 + 0.1)});
  tl.to('${focusSel}', { opacity: 1, duration: 0.45 }, ${T(t0 + 0.1)});${edgeKeep.length ? `
  tl.to('${edgeKeep.join(', ')}', { opacity: 1, duration: 0.45 }, ${T(t0 + 0.1)});` : ''}
  tl.to('#${g.id}-svg .ring', { opacity: 0, duration: 0.3 }, ${T(t0)});`;
      sfx('whoosh', t0, 0.22);
      if (!whole) s.focus.forEach((n, k) => {
        const at = t0 + 0.55 + k * 0.18;
        j += `
  tl.fromTo('#${g.id}-svg rect[data-ring="${n}"]', { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.out' }, ${T(at)});`;
        sfx('pop', at, 0.3, 1 + k * 0.06);
      });
      // Draw each traced edge in narration order across the voiced span.
      const tr = s.trace || [];
      const span = Math.max(0.6, (sc.vo || 2) - 0.6);
      tr.forEach((eid, k) => {
        const at = start + VO_LEAD + 0.3 + (span * k) / Math.max(1, tr.length);
        j += `
  tl.to('#${g.id}-svg path[data-trace="${eid}"]', { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut' }, ${T(at)});`;
        sfx('click', at, 0.25, 1.2);
      });
      if (tr.length) j += `
  tl.to('#${g.id}-svg .trace', { opacity: 0, duration: 0.3 }, ${T(start + dur - 0.35)});
  tl.set('#${g.id}-svg .trace', { strokeDashoffset: (n, el) => el.getTotalLength(), opacity: 1 }, ${T(start + dur - 0.02)});`;
    }
    return j;
  }

  function titleGroup(g, gd) {
    const sc = g.scenes[0], s = sc.s;
    html += `<div id="${g.id}" class="clip tcard" data-start="${g.start}" data-duration="${gd}" data-track-index="1">
  <div class="kicker"><span class="dot"></span>${esc(s.title.toUpperCase())}</div>
  <h1 class="ttl">${s.heading.split(/\s+/).map(w => `<span class="w">${esc(w)}</span>`).join(' ')}</h1>
  ${s.sub ? `<div class="sub">${esc(s.sub)}</div>` : ''}</div>`;
    sfx('whoosh', g.start, 0.35); sfx('impact', g.start + 0.35, 0.35);
    return `
  tl.from('#${g.id} .kicker', { opacity: 0, y: 16, duration: 0.5, ease: 'power3.out' }, ${T(g.start + 0.1)});
  tl.from('#${g.id} .w', { opacity: 0, y: 60, filter: 'blur(12px)', duration: 0.65, ease: 'power4.out', stagger: 0.06 }, ${T(g.start + 0.3)});
  ${s.sub ? `tl.from('#${g.id} .sub', { opacity: 0, y: 12, duration: 0.5 }, ${T(g.start + 0.8)});` : ''}
  tl.to('#${g.id}', { opacity: 0, scale: 1.05, filter: 'blur(8px)', duration: 0.45, ease: 'power2.in' }, ${T(g.end - 0.45)});`;
  }

  // ---------- captions, chips, progress (one overlay across all scenes) ----------
  html += `<div id="overlay" class="clip" data-start="${SC0}" data-duration="${f2(OUT0 - SC0)}" data-track-index="3">
  <div class="progress"><div class="fill"></div></div>
  ${scenes.map(sc => sc.s.kind === 'title' ? '' : `<div class="chip" id="s${sc.i}-chip"><em>${String(sc.i + 1).padStart(2, '0')}</em>${esc(sc.s.title)}</div>`).join('')}
  ${scenes.map(sc => sc.s.narration && sc.s.kind !== 'title' ? `<div class="cap" id="s${sc.i}-cap">${wordTimes(sc.s.narration, vo[sc.s.id]).map((w, k) => `<span id="s${sc.i}-w${k}">${esc(w.w)}</span>`).join(' ')}</div>` : '').join('')}
</div>`;
  js += `
  tl.fromTo('#overlay .fill', { scaleX: 0 }, { scaleX: 1, duration: ${f2(OUT0 - SC0)}, ease: 'none' }, ${SC0});`;
  for (const sc of scenes) {
    if (sc.s.kind === 'title') continue;
    const { i, start, dur, s } = sc;
    js += `
  tl.fromTo('#s${i}-chip', { x: -40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }, ${T(start + 0.05)});
  tl.to('#s${i}-chip', { x: 30, opacity: 0, duration: 0.35, ease: 'power2.in' }, ${T(start + dur - 0.4)});`;
    if (!s.narration) continue;
    js += `
  tl.fromTo('#s${i}-cap', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' }, ${T(start + VO_LEAD - 0.15)});
  tl.to('#s${i}-cap', { opacity: 0, y: -10, duration: 0.3 }, ${T(start + dur - 0.35)});`;
    wordTimes(s.narration, vo[s.id]).forEach((w, k) => {
      js += `
  tl.to('#s${i}-w${k}', { opacity: 1, color: '#ffffff', duration: 0.12 }, ${T(start + VO_LEAD + w.s)});`;
    });
  }

  // ---------- outro ----------
  const O = copy.outro;
  html += `<div id="outro" class="clip" data-start="${OUT0}" data-duration="${OUTRO}" data-track-index="4">
  <div class="card"><div class="kicker"><span class="dot"></span>${esc(O.kicker)}</div><h2 class="ttl">${esc(O.title)}</h2>
    <ul>${O.learned.map((l, k) => `<li id="li${k}"><svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="none" stroke="${OK}" stroke-width="3"/><path class="tick" d="M10 17.5 L15 22.5 L24.5 12" fill="none" stroke="${OK}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="24" stroke-dashoffset="24"/></svg>${esc(l)}</li>`).join('')}</ul>
  </div></div>`;
  js += `
  tl.from('#outro .kicker', { opacity: 0, y: 16, duration: 0.5, ease: 'power3.out' }, ${T(OUT0 + 0.55)});
  tl.from('#outro .ttl', { opacity: 0, y: 50, filter: 'blur(12px)', duration: 0.7, ease: 'power4.out' }, ${T(OUT0 + 0.7)});`;
  O.learned.forEach((_, k) => {
    const at = OUT0 + 1.35 + k * 0.42;
    js += `
  tl.from('#li${k}', { opacity: 0, x: -30, duration: 0.45, ease: 'power3.out' }, ${T(at)});
  tl.to('#li${k} .tick', { strokeDashoffset: 0, duration: 0.35, ease: 'power2.out' }, ${T(at + 0.18)});`;
    sfx('pop', at + 0.18, 0.4, 1 + k * 0.08);
  });
  js += `
  tl.to('#outro .card', { scale: 1.03, duration: ${f2(OUTRO - 0.6)}, ease: 'none' }, ${T(OUT0 + 0.6)});
  tl.to(['#outro', '#bg'], { opacity: 0, duration: 0.6, ease: 'power2.in' }, ${T(TOTAL - 0.6)});`;
  sfx('whoosh-long', OUT0 - 0.35, 0.3); sfx('impact', OUT0 + 0.65, 0.45); sfx('chime', OUT0 + 2.8, 0.28);

  html += `\n<audio id="master" data-start="0" data-duration="${TOTAL}" data-track-index="5" data-volume="1" src="assets/audio/master.wav"></audio>`;
  const fonts = [...new Set(Object.values(diagrams).map(d => d.fonts))].join('\n');
  const page = pageHtml(L, sb, TOTAL, html, js, fonts);
  return { html: page, cues, scenes: scenes.map(({ s, start, dur, vo: v }) => ({ id: s.id, kind: s.kind, start, dur, vo: v, narration: s.narration || '' })), OUT0, TOTAL, layout: L };
}

function pageHtml(L, sb, TOTAL, html, js, fonts) {
  const { W, H, FW, FH, BAR, FX, FY } = L;
  return `<!doctype html>
<html lang="${esc(sb.language)}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
  ${fonts}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #07080b; }
  #root { width: 100%; height: 100%; position: relative; overflow: hidden; font-family: "SF Pro Display", "Helvetica Neue", system-ui, sans-serif; color: #f4f5f7; }
  .clip { position: absolute; inset: 0; }
  #bg { background: #07080b; overflow: hidden; }
  .blob { position: absolute; border-radius: 50%; filter: blur(90px); opacity: .55; }
  .b1 { width: 900px; height: 900px; left: -200px; top: -300px; background: radial-gradient(circle, #3b2bd6 0%, transparent 65%); }
  .b2 { width: 1000px; height: 1000px; right: -300px; top: 100px; background: radial-gradient(circle, #ff4e3a 0%, transparent 62%); opacity: .38; }
  .b3 { width: 800px; height: 800px; left: ${W / 2 - 440}px; bottom: -520px; background: radial-gradient(circle, #10b3a3 0%, transparent 62%); opacity: .42; }
  .grid { position: absolute; left: 0; right: 0; top: -300px; bottom: 0; background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px); background-size: 60px 60px; }
  .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,.65) 100%); }
  #intro, .tcard { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 10px; padding: 0 60px; }
  .kicker { display: inline-flex; align-items: center; gap: 12px; font-size: ${Math.round(L.subSize * 0.8)}px; font-weight: 700; letter-spacing: .22em; color: #ffb4ad; margin-bottom: 18px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: ${ACC}; box-shadow: 0 0 18px ${ACC}; }
  .ttl { font-size: ${L.titleSize}px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.1; }
  .ttl .w { display: inline-block; }
  .ttl2 { font-size: ${L.title2Size}px; font-weight: 600; color: #c9ccd3; letter-spacing: -0.02em; }
  .ttl2 .w2 { display: inline-block; }
  .accent { background: linear-gradient(90deg, #ff7a6e, #ffb86b); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .sweep { position: absolute; width: 260px; height: 520px; top: ${H / 2 - 260}px; left: ${W / 2 - 130}px; background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent); transform: skewX(-18deg); mix-blend-mode: overlay; }
  .sub { margin-top: 26px; font-size: ${L.subSize}px; color: #9aa0ab; max-width: ${W - 160}px; }
  .persp { position: absolute; left: ${FX}px; top: ${FY}px; width: ${FW}px; height: ${FH + BAR}px; perspective: 2600px; }
  .enter, .drift { position: absolute; inset: 0; transform-style: preserve-3d; }
  .frame, .dpanel { position: absolute; inset: 0; border-radius: 16px; overflow: hidden; background: #f5f5f5;
           box-shadow: 0 60px 140px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.08), 0 0 80px rgba(124,156,255,.12); }
  .bar { height: ${BAR}px; background: #16181d; display: flex; align-items: center; gap: 8px; padding: 0 16px; }
  .bar > span { width: 12px; height: 12px; border-radius: 50%; background: #ff5f57; } .bar > span:nth-child(2) { background: #febc2e; } .bar > span:nth-child(3) { background: #28c840; }
  .addr { margin-left: 16px; display: flex; align-items: center; height: 26px; padding: 0 14px; border-radius: 8px; background: #23262d; color: #a8adb6; font-size: 14px; }
  .view { position: relative; width: ${FW}px; height: ${FH}px; overflow: hidden; }
  .dview { position: relative; width: ${FW}px; height: ${FH + BAR}px; overflow: hidden; }
  .cam { position: absolute; left: 0; top: 0; width: ${FW}px; height: ${FH + BAR}px; }
  .shot { position: absolute; inset: 0; width: ${FW}px; height: ${FH}px; object-fit: cover; }
  .spot { position: absolute; border-radius: 12px; box-shadow: 0 0 0 4px ${ACC}, 0 0 0 5000px rgba(8,10,16,.42), 0 0 40px 6px rgba(255,90,78,.55); opacity: 0; }
  .tip { position: absolute; display: flex; align-items: center; gap: 8px; white-space: nowrap; padding: 7px 14px 7px 8px; border-radius: 999px; background: #111318; color: #fff;
         font-size: 17px; font-weight: 600; box-shadow: 0 10px 30px rgba(0,0,0,.35); opacity: 0; transform-origin: 50% 100%; }
  .tip.up { translate: -50% -100%; } .tip.down { translate: -50% 0; transform-origin: 50% 0; }
  .tip b { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: ${ACC}; font-size: 13px; }
  .burst { position: absolute; width: 0; height: 0; }
  .burst i { position: absolute; width: 9px; height: 9px; margin: -4.5px; border-radius: 50%; opacity: 0; }
  .burst u { position: absolute; width: 40px; height: 40px; margin: -20px; border-radius: 50%; border: 3px solid ${OK}; opacity: 0; }
  .key { position: absolute; right: 36px; bottom: 36px; display: flex; align-items: center; gap: 10px; padding: 14px 22px; border-radius: 14px;
         background: linear-gradient(#2a2d35, #1a1c21); color: #fff; font-size: 26px; font-weight: 700; box-shadow: 0 6px 0 #0b0c0f, 0 18px 40px rgba(0,0,0,.45); opacity: 0; }
  .key span { font-size: 30px; color: #ffb4ad; }
  .progress { position: absolute; left: ${FX}px; top: ${L.progY}px; width: ${FW}px; height: 4px; border-radius: 4px; background: rgba(255,255,255,.1); overflow: hidden; }
  .progress .fill { width: 100%; height: 100%; background: linear-gradient(90deg, ${ACC}, #ffb86b); transform-origin: 0 50%; }
  .chip { position: absolute; left: ${L.chipX}px; top: ${L.chipY}px; display: flex; align-items: center; gap: 12px; font-size: ${L.chipSize}px; font-weight: 700; color: #fff; opacity: 0; }
  .chip em { font-style: normal; color: ${ACC}; font-variant-numeric: tabular-nums; }
  .cap { position: absolute; left: ${L.capX}px; width: ${L.capW}px; top: ${L.capY}px; font-size: ${L.capSize}px; line-height: 1.45; font-weight: 600; opacity: 0; }
  .cap span { opacity: .32; color: #c9ccd3; }
  #outro { display: flex; align-items: center; justify-content: center; }
  #outro .card { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; padding: 0 60px; }
  #outro .ttl { font-size: ${L.outroSize}px; }
  #outro ul { list-style: none; margin-top: 30px; display: flex; flex-direction: column; gap: 18px; text-align: left; }
  #outro li { display: flex; align-items: center; gap: 18px; font-size: ${L.liSize}px; font-weight: 600; color: #e7e9ee; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="${W}" data-height="${H}">
${html}
</div>
<script>
  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true });
  ${js}
  window.__timelines["main"] = tl;
  tl.seek(0);
</script>
</body>
</html>`;
}
