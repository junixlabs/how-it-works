// Narration engines. kokoro: neural English TTS with per-word timestamps. say: macOS placeholder
// (no timestamps). none: silent, duration estimated from text so timing and captions still work.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const KOKORO_PY = process.env.HIW_PYTHON || path.join(ROOT, '.venv-tts/bin/python');

const probe = f => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim();

// Returns { [sceneId]: { wav|null, dur, words|null } } for scenes that have narration.
export function synthesize(sb, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const items = sb.scenes.filter(s => s.narration).map(s => ({ id: s.id, text: s.narration }));
  const out = {};
  const tts = sb.tts;
  if (tts.engine === 'kokoro') {
    fs.writeFileSync(`${dir}/in.json`, JSON.stringify(items));
    execFileSync(KOKORO_PY, [path.join(ROOT, 'lib/tts_kokoro.py'), `${dir}/in.json`, dir, tts.voice || 'af_heart', String(tts.speed || 1)], { stdio: ['ignore', 'ignore', 'pipe'] });
    fs.rmSync(`${dir}/in.json`);
    for (const it of items) out[it.id] = { wav: `${dir}/${it.id}.wav`, dur: probe(`${dir}/${it.id}.wav`), words: JSON.parse(fs.readFileSync(`${dir}/${it.id}.words.json`, 'utf8')) };
  } else if (tts.engine === 'say') {
    for (const it of items) {
      const aiff = `${dir}/${it.id}.aiff`, wav = `${dir}/${it.id}.wav`;
      execFileSync('say', ['-v', tts.voice || 'Samantha', '-r', String(tts.rate || 175), '-o', aiff, it.text]);
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', aiff, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB', '-ar', '48000', '-ac', '1', wav]);
      fs.rmSync(aiff);
      out[it.id] = { wav, dur: probe(wav), words: null };
    }
  } else {
    for (const it of items) out[it.id] = { wav: null, dur: Math.max(2, it.text.length / 15), words: null };
  }
  return out;
}

// Karaoke timing: real TTS timestamps when available, else proportional with pauses at punctuation.
export function wordTimes(text, vo) {
  if (vo?.words) return vo.words.map(w => ({ w: w.w, s: w.s }));
  const toks = text.split(/\s+/).filter(Boolean);
  const wt = toks.map(w => 1 + (/[.,!?]$/.test(w) ? 1.6 : 0));
  const sum = wt.reduce((a, b) => a + b, 0);
  let acc = 0;
  return toks.map((w, k) => { const s = (acc / sum) * (vo?.dur || 1); acc += wt[k]; return { w, s: +s.toFixed(3) }; });
}
