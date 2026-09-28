# Kokoro-82M (Apache 2.0) narration: one wav + per-word timestamps per scene.
# usage: tts.py in.json out_dir voice speed
import json, sys, numpy as np, soundfile as sf
from kokoro import KPipeline

items, out, voice, speed = json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3], float(sys.argv[4])
pipe = KPipeline(lang_code=voice[0], repo_id='hexgrad/Kokoro-82M')
SR = 24000
for it in items:
    audio, words, off, cur = [], [], 0.0, None
    for r in pipe(it['text'], voice=voice, speed=speed):
        for t in r.tokens:
            if cur is None:
                cur = {'w': '', 's': None}
            cur['w'] += t.text
            if cur['s'] is None and t.start_ts is not None and t.text.strip(".,!?;:"):
                cur['s'] = round(off + t.start_ts, 3)
            if t.whitespace:
                words.append(cur); cur = None
        a = r.audio.numpy() if hasattr(r.audio, 'numpy') else np.asarray(r.audio)
        audio.append(a); off += len(a) / SR
    if cur: words.append(cur)
    for k, w in enumerate(words):  # fill any gap from neighbours
        if w['s'] is None: w['s'] = words[k - 1]['s'] if k else 0.0
    sf.write(f"{out}/{it['id']}.wav", np.concatenate(audio), SR)
    json.dump(words, open(f"{out}/{it['id']}.words.json", 'w'), ensure_ascii=False)
    print(it['id'], f"{off:.2f}s", ' '.join(f"{w['w']}@{w['s']}" for w in words))
