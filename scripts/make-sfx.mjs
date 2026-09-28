// Generates the built-in SFX pack procedurally with ffmpeg, so the skill ships no third-party audio.
// Run once: node scripts/make-sfx.mjs  (outputs assets/sfx/*.wav, 48 kHz mono)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/sfx');
fs.mkdirSync(OUT, { recursive: true });
const N = '(random(0)*2-1)';
const SFX = {
  key: [`${N}*exp(-t*150)*0.9+sin(2*PI*190*t)*exp(-t*70)*0.35`, 0.07, 'highpass=f=900,lowpass=f=9000'],
  enter: [`${N}*exp(-t*70)*0.9+sin(2*PI*120*t)*exp(-t*35)*0.6`, 0.14, 'highpass=f=250,lowpass=f=7000'],
  click: [`${N}*exp(-t*420)+(gte(t,0.05))*${N}*exp(-(t-0.05)*520)*0.55`, 0.11, 'bandpass=f=3200:w=2600'],
  pop: ['sin(2*PI*(260*t+640/28*(1-exp(-28*t))))*exp(-t*24)*0.9', 0.2, 'lowpass=f=5000'],
  whoosh: [`${N}*pow(sin(PI*t/0.55),2)*0.9`, 0.55, 'highpass=f=350,lowpass=f=3200'],
  'whoosh-long': [`${N}*pow(sin(PI*t/1.1),2)*0.9`, 1.1, 'highpass=f=200,lowpass=f=2400'],
  chime: ['(sin(2*PI*1318.5*t)*exp(-t*3.2)+sin(2*PI*1760*t)*exp(-t*3.8)*0.7*gte(t,0.07)+sin(2*PI*2637*t)*exp(-t*5)*0.4*gte(t,0.14))*0.45', 1.3, 'aecho=0.6:0.4:60:0.25'],
  sparkle: ['sin(2*PI*(2300+900*sin(2*PI*9*t))*t)*exp(-t*9)*(0.55+0.45*sin(2*PI*34*t))*0.5', 0.6, 'highpass=f=1200'],
  impact: [`sin(2*PI*(42*t+70/7*(1-exp(-7*t))))*exp(-t*3.5)*0.95+${N}*exp(-t*22)*0.35`, 1.4, 'lowpass=f=900'],
  riser: [`(${N}*0.5+sin(2*PI*(180*t+260*t*t))*0.5)*pow(t/1.5,2.2)`, 1.5, 'highpass=f=300,lowpass=f=6000'],
};
for (const [name, [expr, d, fx]] of Object.entries(SFX)) {
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=48000:d=${d}`,
    '-af', `${fx},afade=t=out:st=${Math.max(0, d - 0.02)}:d=0.02,alimiter=limit=0.9`, '-ac', '1', `${OUT}/${name}.wav`]);
  console.log(`${name}.wav`);
}
