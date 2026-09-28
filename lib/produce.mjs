// Media production around the pure composer: footage clips, audio master, HyperFrames project, render.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sceneClip } from './clips.mjs';
import { TIMING } from './compose.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HYPERFRAMES = 'hyperframes@0.8.80';
const f2 = n => +(+n).toFixed(3);

export function writeProject(dir, html) {
  for (const d of ['assets/clips', 'assets/audio', 'renders']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  fs.writeFileSync(path.join(dir, 'hyperframes.json'), JSON.stringify({ $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json', paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' }, media: { autoProxy: true } }, null, 2));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ id: 'video', name: 'video' }));
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

// One clip per ui scene: head hold + real action + tail hold (with margin; the composition trims by data-duration).
export function buildClips(dir, capDir, ev, scenes) {
  for (const sc of scenes.filter(x => x.kind === 'ui')) {
    const e = ev.scenes.find(x => x.id === sc.id);
    const span = e.t1 - e.t0;
    sceneClip(capDir, ev, sc.id, { head: TIMING.HEAD, tail: Math.max(0.2, sc.dur - TIMING.HEAD - span) + 1.4, out: path.join(dir, `assets/clips/${sc.id}.mp4`) });
  }
}

// VO + SFX on real events + music bed ducked under the voice, mastered to -14 LUFS.
export function mixAudio(dir, { cues, vo, scenes, OUT0, TOTAL, music, sfxOn }) {
  const inputs = [], filt = [];
  let n = 0;
  const vox = scenes.filter(s => vo[s.id]?.wav).map(s => {
    inputs.push('-i', vo[s.id].wav); const k = n++;
    filt.push(`[${k}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round((s.start + TIMING.VO_LEAD) * 1000)}:all=1[v${k}]`);
    return `[v${k}]`;
  });
  const silence = () => { inputs.push('-f', 'lavfi', '-t', String(TOTAL), '-i', 'anullsrc=r=48000:cl=stereo'); return `[${n++}:a]`; };
  const voIn = vox.length ? vox.join('') : silence();
  filt.push(`${voIn}amix=inputs=${Math.max(1, vox.length)}:normalize=0,asplit=2[vo][vokey]`);

  const sx = (sfxOn ? cues : []).map(c => {
    inputs.push('-i', path.join(ROOT, `assets/sfx/${c.name}.wav`)); const k = n++;
    const rt = c.rate && c.rate !== 1 ? `asetrate=${Math.round(48000 * c.rate)},aresample=48000,` : '';
    filt.push(`[${k}:a]aresample=48000,aformat=channel_layouts=stereo,${rt}volume=${c.vol},adelay=${Math.max(0, Math.round(c.at * 1000))}:all=1[x${k}]`);
    return `[x${k}]`;
  });
  filt.push(sx.length ? `${sx.join('')}amix=inputs=${sx.length}:normalize=0[sfx]` : `${silence()}anull[sfx]`);

  // The default track is not redistributable, so a fresh clone has none: render without a music bed.
  const def = path.join(ROOT, 'assets/music/default.mp3');
  const track = music === 'default' ? (fs.existsSync(def) ? def : null) : music;
  if (track) {
    if (music === 'default') {
      // Default track: main bed from 4.0 s, outro bed from its 39.0 s ending phrase.
      inputs.push('-i', track); const a = n++; inputs.push('-i', track); const b = n++;
      const bedA = f2(OUT0 + 0.4), bedB = f2(TIMING.OUTRO + 0.6);
      filt.push(`[${a}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=4.0:${f2(4.0 + bedA)},asetpts=PTS-STARTPTS,afade=t=in:d=0.4,afade=t=out:st=${f2(bedA - 0.5)}:d=0.5,volume=0.5[ba]`);
      filt.push(`[${b}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=39.0:${f2(39.0 + bedB)},asetpts=PTS-STARTPTS,afade=t=in:d=0.25,afade=t=out:st=${f2(bedB - 1.8)}:d=1.8,volume=0.5,adelay=${Math.round((OUT0 - 0.1) * 1000)}:all=1[bb]`);
      filt.push('[ba][bb]amix=inputs=2:normalize=0[bgm]');
    } else {
      inputs.push('-stream_loop', '-1', '-i', track); const a = n++;
      filt.push(`[${a}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${TOTAL},asetpts=PTS-STARTPTS,afade=t=in:d=0.6,afade=t=out:st=${f2(TOTAL - 1.8)}:d=1.8,volume=0.45[bgm]`);
    }
    filt.push('[bgm][vokey]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=450:makeup=1[bgmd]');
  } else {
    filt.push(`${silence()}anull[bgmd]`, '[vokey]anullsink');
  }
  filt.push(`[vo][bgmd][sfx]amix=inputs=3:normalize=0,apad,atrim=0:${TOTAL},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[out]`);
  const script = path.join(dir, 'assets/audio/filter.txt');
  fs.writeFileSync(script, filt.join(';\n'));
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex_script', script, '-map', '[out]', '-ac', '2', path.join(dir, 'assets/audio/master.wav')], { maxBuffer: 1 << 26 });
  fs.rmSync(script);
}

export function hyperframes(dir, args) {
  return spawnSync('npx', ['--yes', HYPERFRAMES, ...args], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26 });
}

export function checkComposition(dir) {
  const r = hyperframes(dir, ['check']);
  const out = (r.stdout || '') + (r.stderr || '');
  return { ok: r.status === 0 && /Check passed/.test(out), output: out.replace(/\x1b\[[0-9;]*m/g, '').trim().split('\n').slice(-12).join('\n') };
}

export function renderVideo(dir, outMp4) {
  const r = hyperframes(dir, ['render', '--quality', 'high', '--output', path.resolve(outMp4)]);
  return { ok: r.status === 0 && fs.existsSync(outMp4), output: ((r.stdout || '') + (r.stderr || '')).replace(/\x1b\[[0-9;]*m/g, '').trim().split('\n').slice(-6).join('\n') };
}
