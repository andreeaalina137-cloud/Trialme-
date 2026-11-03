// Reference experiment: embed every dataset text with the REAL pretrained MiniLM encoder
// (sentence-transformers style: mean pooling + L2 normalise). Used ONLY to measure how much the
// distilled static table loses versus running the full encoder; it is not shipped in the app.
import fs from 'node:fs';
import { loadEncoder, loadReferenceTokenizer, runEncoder } from './tf_loader.mjs';
import { ADVERSARIAL } from './adversarial.mjs';

const rows = fs.readFileSync('data/dataset.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const texts = [...rows.map((r) => r.text), ...ADVERSARIAL.map((a) => a.text)];
const tok = await loadReferenceTokenizer();
const enc = await loadEncoder();
const H = 384, MAXLEN = 40, BATCH = 64;
const out = new Float32Array(texts.length * H);
const t0 = Date.now();
for (let s = 0; s < texts.length; s += BATCH) {
  const batch = texts.slice(s, s + BATCH);
  const ids = batch.map((t) => tok.encode(t).ids.slice(0, MAXLEN - 1).concat([102]).slice(0, MAXLEN));
  const len = Math.max(...ids.map((x) => x.length));
  const idsP = ids.map((x) => x.concat(new Array(len - x.length).fill(0)));
  const mask = ids.map((x) => x.map(() => 1).concat(new Array(len - x.length).fill(0)));
  const d = await runEncoder(enc, idsP, mask);
  batch.forEach((_, i) => {
    const v = new Float32Array(H); let n = 0;
    for (let j = 0; j < len; j++) if (mask[i][j]) { n++; for (let h = 0; h < H; h++) v[h] += d[(i * len + j) * H + h]; }
    let norm = 0; for (let h = 0; h < H; h++) { v[h] /= n; norm += v[h] * v[h]; }
    norm = Math.sqrt(norm) || 1;
    for (let h = 0; h < H; h++) out[(s + i) * H + h] = v[h] / norm;
  });
  if ((s / BATCH) % 25 === 0) console.log(`embedded ${Math.min(s + BATCH, texts.length)}/${texts.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
fs.writeFileSync('work/ref_embeddings.f32', Buffer.from(out.buffer));
fs.writeFileSync('work/ref_embeddings.meta.json', JSON.stringify({ count: texts.length, hidden: H, datasetRows: rows.length, adversarial: ADVERSARIAL.length, seconds: (Date.now() - t0) / 1000 }));
console.log('done', ((Date.now() - t0) / 1000).toFixed(1), 's');
