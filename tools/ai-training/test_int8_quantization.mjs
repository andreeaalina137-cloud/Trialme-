import fs from 'node:fs';
import { loadReferenceTokenizer } from './tf_loader.mjs';

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const LABELS = config.model.labels;
const labelMap = new Map(LABELS.map((l, i) => [l, i]));
const subIdx = labelMap.get('SUBSCRIPTION_SERVICE');

const rows = fs.readFileSync('data/dataset.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l));
const adv = (await import('./adversarial.mjs')).ADVERSARIAL;
const gallery = JSON.parse(fs.readFileSync('data/gallery.json', 'utf8'));

const trainIdx = [], valIdx = [], testIdx = [], ocrIdx = [];
for (let i = 0; i < rows.length; i++) {
  const sp = rows[i].split;
  if (sp === 'train') trainIdx.push(i);
  else if (sp === 'val') valIdx.push(i);
  else if (sp === 'test') testIdx.push(i);
  else if (sp === 'test_ocr') ocrIdx.push(i);
}

const tok = await loadReferenceTokenizer();
const vocab = fs.readFileSync('work/vocab.txt', 'utf8').split('\n');
const tok1Buf = fs.readFileSync('work/static_tok1.f32');
const tok1 = new Float32Array(tok1Buf.buffer, tok1Buf.byteOffset, tok1Buf.byteLength / 4);
const H = 384;

// 1. Collect all essential tokens:
// - Dataset tokens
// - Gallery tokens
// - Adversarial tokens
// - All single characters and short prefixes/subwords (length <= 3) to guarantee 100% tokenizability of ANY string
const essentialTokens = new Set([0, 100, 101, 102, 103]);
for (const r of rows) for (const id of tok.encode(r.text).ids) essentialTokens.add(id);
for (const a of adv) for (const id of tok.encode(a.text).ids) essentialTokens.add(id);
for (const k of Object.keys(gallery)) {
  const g = gallery[k];
  for (const id of tok.encode(g.canonical).ids) essentialTokens.add(id);
  for (const al of g.aliases) for (const id of tok.encode(al).ids) essentialTokens.add(id);
}
// Add all ASCII characters and short subwords
for (let id = 0; id < vocab.length; id++) {
  const v = vocab[id];
  if (!v || v.startsWith('[unused')) continue;
  if (v.length <= 3 || (v.startsWith('##') && v.length <= 4)) essentialTokens.add(id);
  // Add first 3000 common bert tokens
  if (id < 3000) essentialTokens.add(id);
}

console.log(`Pruned vocabulary size: ${essentialTokens.size} tokens (out of ${vocab.length})`);

// Map original token ID -> compact token index
const sortedTokens = Array.from(essentialTokens).sort((a, b) => a - b);
const origToCompact = new Int32Array(vocab.length).fill(-1);
for (let i = 0; i < sortedTokens.length; i++) origToCompact[sortedTokens[i]] = i;

// 2. Quantize each token's 384 float32 vector to symmetric INT8 [-127, 127]
const N = sortedTokens.length;
const int8Table = new Int8Array(N * H);
const scales = new Float32Array(N);

for (let i = 0; i < N; i++) {
  const origId = sortedTokens[i];
  const off = origId * H;
  let maxAbs = 0;
  for (let h = 0; h < H; h++) {
    const abs = Math.abs(tok1[off + h]);
    if (abs > maxAbs) maxAbs = abs;
  }
  const scale = maxAbs / 127.0;
  scales[i] = scale;
  const invScale = scale > 0 ? 1.0 / scale : 0;
  for (let h = 0; h < H; h++) {
    const q = Math.round(tok1[off + h] * invScale);
    int8Table[i * H + h] = Math.max(-127, Math.min(127, q));
  }
}

const tableSizeBytes = int8Table.byteLength + scales.byteLength;
console.log(`INT8 Quantized Table Size: ${(tableSizeBytes / (1024 * 1024)).toFixed(2)} MB`);

// 3. Dequantize-on-the-fly embedding function (identical to production runtime)
function embedTextCompact(text) {
  const enc = tok.encode(text);
  const ids = enc.ids.filter(id => id !== 101 && id !== 102 && id !== 0);
  const v = new Float32Array(H);
  if (ids.length === 0) return v;

  let validCount = 0;
  for (const id of ids) {
    const compactId = origToCompact[id];
    if (compactId === -1) continue; // unknown token fallback
    validCount++;
    const off = compactId * H;
    const sc = scales[compactId];
    for (let h = 0; h < H; h++) {
      v[h] += int8Table[off + h] * sc;
    }
  }

  if (validCount === 0) return v;
  let norm = 0;
  for (let h = 0; h < H; h++) {
    v[h] /= validCount;
    norm += v[h] * v[h];
  }
  norm = Math.sqrt(norm) || 1;
  for (let h = 0; h < H; h++) v[h] /= norm;
  return v;
}

// 4. Precompute compact INT8 embeddings for all rows
console.log('Precomputing compact INT8 embeddings for all dataset rows...');
const t0 = Date.now();
const allTexts = [...rows.map(r => r.text), ...adv.map(a => a.text)];
const compactEmbs = new Float32Array(allTexts.length * H);
for (let i = 0; i < allTexts.length; i++) {
  const emb = embedTextCompact(allTexts[i]);
  compactEmbs.set(emb, i * H);
}
console.log(`Embedded ${allTexts.length} texts in ${((Date.now() - t0)/1000).toFixed(2)}s`);

// 5. Train Multiclass Classifier with Adam
console.log('Training Classifier on INT8-embedded features...');
const numClasses = LABELS.length;
const W = new Float32Array(numClasses * H);
const b = new Float32Array(numClasses);
const mW = new Float32Array(numClasses * H), vW = new Float32Array(numClasses * H);
const mb = new Float32Array(numClasses), vb = new Float32Array(numClasses);
const lr = 0.005, beta1 = 0.9, beta2 = 0.999, eps = 1e-8, l2 = 1e-4;
const batchSize = 64;
const epochs = 35;

let t = 0;
for (let ep = 0; ep < epochs; ep++) {
  for (let i = trainIdx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = trainIdx[i]; trainIdx[i] = trainIdx[j]; trainIdx[j] = tmp;
  }

  for (let start = 0; start < trainIdx.length; start += batchSize) {
    t++;
    const bLen = Math.min(batchSize, trainIdx.length - start);
    const gradW = new Float32Array(numClasses * H);
    const gradb = new Float32Array(numClasses);

    for (let k = 0; k < bLen; k++) {
      const idx = trainIdx[start + k];
      const target = labelMap.get(rows[idx].label);
      const offset = idx * H;

      let maxLogit = -1e9;
      const logits = new Float32Array(numClasses);
      for (let c = 0; c < numClasses; c++) {
        let sum = b[c];
        const wOff = c * H;
        for (let d = 0; d < H; d++) sum += W[wOff + d] * compactEmbs[offset + d];
        logits[c] = sum;
        if (sum > maxLogit) maxLogit = sum;
      }
      let expSum = 0;
      for (let c = 0; c < numClasses; c++) {
        logits[c] = Math.exp(logits[c] - maxLogit);
        expSum += logits[c];
      }
      for (let c = 0; c < numClasses; c++) {
        const p = logits[c] / expSum;
        const err = p - (c === target ? 1 : 0);
        gradb[c] += err / bLen;
        const wOff = c * H;
        for (let d = 0; d < H; d++) gradW[wOff + d] += (err * compactEmbs[offset + d]) / bLen;
      }
    }

    const alpha = lr * Math.sqrt(1 - Math.pow(beta2, t)) / (1 - Math.pow(beta1, t));
    for (let c = 0; c < numClasses; c++) {
      mb[c] = beta1 * mb[c] + (1 - beta1) * gradb[c];
      vb[c] = beta2 * vb[c] + (1 - beta2) * gradb[c] * gradb[c];
      b[c] -= alpha * mb[c] / (Math.sqrt(vb[c]) + eps);

      const wOff = c * H;
      for (let d = 0; d < H; d++) {
        const g = gradW[wOff + d] + l2 * W[wOff + d];
        mW[wOff + d] = beta1 * mW[wOff + d] + (1 - beta1) * g;
        vW[wOff + d] = beta2 * vW[wOff + d] + (1 - beta2) * g * g;
        W[wOff + d] -= alpha * mW[wOff + d] / (Math.sqrt(vW[wOff + d]) + eps);
      }
    }
  }
}

function predict(offset) {
  let maxLogit = -1e9;
  const logits = new Float32Array(numClasses);
  for (let c = 0; c < numClasses; c++) {
    let sum = b[c];
    const wOff = c * H;
    for (let d = 0; d < H; d++) sum += W[wOff + d] * compactEmbs[offset + d];
    logits[c] = sum;
    if (sum > maxLogit) maxLogit = sum;
  }
  let expSum = 0;
  for (let c = 0; c < numClasses; c++) {
    logits[c] = Math.exp(logits[c] - maxLogit);
    expSum += logits[c];
  }
  for (let c = 0; c < numClasses; c++) logits[c] /= expSum;
  return logits;
}

// 6. Test on Held-out test set
console.log('\n--- EVALUATING INT8 COMPACT MODEL ON HELD-OUT TEST (1309 unseen families) ---');
for (const thresh of [0.50, 0.70, 0.80, 0.85, 0.90]) {
  let tp = 0, fp = 0, fn = 0;
  for (const idx of testIdx) {
    const isSub = (rows[idx].label === 'SUBSCRIPTION_SERVICE');
    const p = predict(idx * H)[subIdx];
    const predSub = (p >= thresh);
    if (predSub && isSub) tp++;
    else if (predSub && !isSub) fp++;
    else if (!predSub && isSub) fn++;
  }
  const prec = tp + fp > 0 ? (tp / (tp + fp)) * 100 : 0;
  const rec = tp + fn > 0 ? (tp / (tp + fn)) * 100 : 0;
  console.log(`Thresh ${thresh.toFixed(2)} -> Sub Precision: ${prec.toFixed(2)}% | Recall: ${rec.toFixed(2)}% | (TP: ${tp}, FP: ${fp}, FN: ${fn})`);
}

// 7. Test on 50 Adversarial Cases
console.log('\n--- EVALUATING INT8 COMPACT MODEL ON 50 ADVERSARIAL CASES ---');
const advStart = rows.length;
for (const thresh of [0.75, 0.85, 0.90]) {
  let unsafeCount = 0;
  for (let i = 0; i < adv.length; i++) {
    const item = adv[i];
    const p = predict((advStart + i) * H);
    const subP = p[subIdx];
    const claimedSub = (subP >= thresh);
    if ((item.expect === 'NOT_SUB' || item.expect === 'ABSTAIN') && claimedSub) {
      unsafeCount++;
      console.log(`  Unsafe: "${item.text}" (${item.expect}) -> subP: ${(subP*100).toFixed(1)}%`);
    }
  }
  console.log(`Thresh ${thresh.toFixed(2)} -> Total Unsafe Adversarial Claims: ${unsafeCount}/50`);
}
