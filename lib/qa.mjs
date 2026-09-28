// Deterministic quality gates on delivered media. Each gate: { name, ok, detail }.
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const ffprobeJson = f => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f]).toString());

export function videoGates(mp4, { W, H, TOTAL, scenes, label }) {
  const gates = [];
  const g = (name, ok, detail) => gates.push({ name: `${label}: ${name}`, ok, detail });
  const p = ffprobeJson(mp4);
  const v = p.streams.find(s => s.codec_type === 'video'), a = p.streams.find(s => s.codec_type === 'audio');
  g(`spec ${W}x${H}`, v?.width === W && v?.height === H, v ? `${v.width}x${v.height} ${v.codec_name} ${v.r_frame_rate}` : 'no video');
  g('audio track', !!a, a ? `${a.codec_name} ${a.sample_rate}Hz` : 'missing');
  const dur = +p.format.duration;
  g('duration matches composition', Math.abs(dur - TOTAL) < 0.5, `${dur.toFixed(2)}s vs ${TOTAL}s`);
  const bd = spawnSync('ffmpeg', ['-i', mp4, '-vf', 'blackdetect=d=0.5:pix_th=0.05', '-an', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const blacks = [...bd.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map(m => `${m[1]}-${m[2]}s`);
  g('no black gaps', blacks.length === 0, blacks.join(', ') || 'none');
  if (a) {
    const lo = spawnSync('ffmpeg', ['-i', mp4, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const I = +(lo.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop()?.match(/-?[\d.]+/)[0];
    g('loudness -14 LUFS ±2', Math.abs(I + 14) <= 2, `${I} LUFS`);
  }
  for (const s of scenes.filter(x => x.narration && x.vo > 0)) {
    const cps = +(s.narration.length / s.vo).toFixed(1);
    g(`caption speed ${s.id}`, cps <= 20, `${cps} chars/s`);
  }
  return gates;
}

export function gifGates(dir, ev) {
  const gates = [];
  if (!fs.existsSync(`${dir}/img`)) return gates;
  for (const f of fs.readdirSync(`${dir}/img`).filter(f => f.endsWith('.gif'))) {
    const id = f.replace(/^\d+-/, '').replace('.gif', '');
    const sc = ev.scenes.find(s => s.id === id);
    const d = execFileSync('ffprobe', ['-v', 'error', '-show_frames', '-select_streams', 'v', '-show_entries', 'frame=duration_time', '-of', 'csv=p=0', `${dir}/img/${f}`])
      .toString().trim().split('\n').reduce((a, b) => a + +b, 0);
    gates.push({ name: `guide: gif covers action ${id}`, ok: d >= sc.t1 - sc.t0, detail: `${d.toFixed(2)}s vs ${(sc.t1 - sc.t0).toFixed(2)}s` });
  }
  return gates;
}
