// STAGE 3a — Distil a static token-embedding table from the pretrained MiniLM encoder.
//
// Every WordPiece vocabulary entry is passed through the REAL pretrained encoder as
// [CLS] <token> [SEP]; the contextual output is stored. The result is a static copy of the
// encoder's lexical knowledge that runs with plain array maths inside the app (no ONNX
// runtime, no WASM). This is Model2Vec-style distillation, not a keyword list.
//
// Foundation model (verified through the Hugging Face API on 2026-11-03):
//   Xenova/all-MiniLM-L6-v2  revision 751bff37182d3f1213fa05d7196b954e230abad9  licence apache-2.0
import fs from 'node:fs';
import { loadEncoder, fetchCached, runEncoder, MODEL, REV } from './tf_loader.mjs';

fs.mkdirSync('work', { recursive: true });
const vocab = fs.readFileSync(await fetchCached('vocab.txt'), 'utf8').split('\n').map((s) => s.replace(/\r$/, ''));
while (vocab.length && vocab[vocab.length - 1] === '') vocab.pop();
const V = vocab.length, H = 384;
fs.writeFileSync('work/vocab.txt', vocab.join('\n'));
const enc = await loadEncoder();

const SKIP = (id) => id === 0 || (id >= 100 && id <= 103) || /^\[unused\d+\]$/.test(vocab[id]);
const mean3 = new Float32Array(V * H), tok1 = new Float32Array(V * H);
const BATCH = 128, t0 = Date.now();
for (let start = 0; start < V; start += BATCH) {
  const n = Math.min(BATCH, V - start);
  const ids = [], mask = [];
  for (let i = 0; i < n; i++) { ids.push([101, start + i, 102]); mask.push([1, 1, 1]); }
  const d = await runEncoder(enc, ids, mask);
  for (let i = 0; i < n; i++) {
    const id = start + i;
    if (SKIP(id)) continue;
    for (let h = 0; h < H; h++) {
      const a = d[(i * 3) * H + h], b = d[(i * 3 + 1) * H + h], c = d[(i * 3 + 2) * H + h];
      mean3[id * H + h] = (a + b + c) / 3;
      tok1[id * H + h] = b;
    }
  }
  if ((start / BATCH) % 20 === 0) console.log(`distilled ${start + n}/${V} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
fs.writeFileSync('work/static_mean3.f32', Buffer.from(mean3.buffer));
fs.writeFileSync('work/static_tok1.f32', Buffer.from(tok1.buffer));
fs.writeFileSync('work/distill_meta.json', JSON.stringify({ model: MODEL, revision: REV, vocabSize: V, hidden: H, quantization: 'onnx model_quantized.onnx (int8) via onnxruntime-web wasm', seconds: (Date.now() - t0) / 1000 }, null, 2));
console.log('done in', ((Date.now() - t0) / 1000).toFixed(1), 's');
