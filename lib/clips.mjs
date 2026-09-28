// Timestamped screencast frames -> constant-frame-rate clips (video) and GIFs (guide).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// Frames in [t0, t1], each held until the next frame's timestamp; optional freeze at head/tail.
function concatList(capDir, ev, sc, head = 0, tail = 0) {
  const fr = ev.frames;
  let i0 = fr.findIndex(f => f.t > sc.t0) - 1;
  if (i0 < 0) i0 = 0;
  const sel = [];
  for (let i = i0; i < fr.length && fr[i].t <= sc.t1; i++) sel.push(i);
  const lines = [];
  const add = (file, d) => lines.push(`file '${capDir}/${file}'`, `duration ${Math.max(d, 0.001).toFixed(4)}`);
  if (head > 0) add(fr[sel[0]].file, head);
  sel.forEach((idx, k) => {
    const start = Math.max(fr[idx].t, sc.t0);
    const end = k + 1 < sel.length ? fr[sel[k + 1]].t : sc.t1;
    add(fr[idx].file, end - start + (k + 1 === sel.length ? tail : 0));
  });
  lines.push(`file '${capDir}/${fr[sel.at(-1)].file}'`);
  return lines.join('\n');
}

export function sceneClip(capDir, ev, id, { head = 0, tail = 0, out, fps = 30 }) {
  const sc = ev.scenes.find(s => s.id === id);
  const list = `${out}.txt`;
  fs.writeFileSync(list, concatList(capDir, ev, sc, head, tail));
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', `fps=${fps},scale=${ev.viewport.width * 2}:${ev.viewport.height * 2}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14',
    '-movflags', '+faststart', out]);
  fs.rmSync(list);
  return out;
}

export function sceneGif(capDir, ev, id, { out, width = 960, fps = 15 }) {
  // Built from the same CFR clip as the video so timing is identical (VFR frames give a GIF ~1/3 as long).
  const tmp = `${out}.tmp.mp4`;
  sceneClip(capDir, ev, id, { head: 0.3, tail: 1.0, out: tmp });
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', tmp, '-vf',
    `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
    '-loop', '0', out]);
  fs.rmSync(tmp);
  return out;
}
