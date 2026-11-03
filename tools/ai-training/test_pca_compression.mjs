import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const LABELS = config.model.labels;
const labelMap = new Map(LABELS.map((l, i) => [l, i]));
const subIdx = labelMap.get('SUBSCRIPTION_SERVICE');

const rows = fs.readFileSync('data/dataset.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l));
const adv = (await import('./adversarial.mjs')).ADVERSARIAL;

const trainIdx = [], valIdx = [], testIdx = [], ocrIdx = [];
for (let i = 0; i < rows.length; i++) {
  const sp = rows[i].split;
  if (sp === 'train') trainIdx.push(i);
  else if (sp === 'val') valIdx.push(i);
  else if (sp === 'test') testIdx.push(i);
  else if (sp === 'test_ocr') ocrIdx.push(i);
}

const staticBuf = fs.readFileSync('work/static_embeddings.f32');
const staticData = new Float32Array(staticBuf.buffer, staticBuf.byteOffset, staticBuf.byteLength / 4);
const H = 384;

// 1. Compute Mean of Training Embeddings
const mean = new Float32Array(H);
for (const idx of trainIdx) {
  const off = idx * H;
  for (let h = 0; h < H; h++) mean[h] += staticData[off + h] / trainIdx.length;
}

// 2. Compute Covariance Matrix on Train (384 x 384)
console.log('Computing Covariance Matrix...');
const cov = new Float64Array(H * H);
for (const idx of trainIdx) {
  const off = idx * H;
  for (let r = 0; r < H; r++) {
    const vr = staticData[off + r] - mean[r];
    for (let c = r; c < H; c++) {
      const v = vr * (staticData[off + c] - mean[c]);
      cov[r * H + c] += v;
    }
  }
}
for (let r = 0; r < H; r++) {
  for (let c = 0; c < r; c++) cov[r * H + c] = cov[c * H + r];
  for (let c = 0; c < H; c++) cov[r * H + c] /= trainIdx.length;
}

// 3. Power Iteration to extract top K eigenvectors (PCA)
const K = 64;
console.log(`Extracting top ${K} eigenvectors...`);
const V = new Float32Array(K * H); // K x H projection matrix

const covCopy = new Float64Array(cov);
for (let k = 0; k < K; k++) {
  let v = new Float64Array(H);
  for (let h = 0; h < H; h++) v[h] = Math.sin(k * 100 + h); // deterministic init
  let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  for (let h = 0; h < H; h++) v[h] /= norm;

  for (let iter = 0; iter < 40; iter++) {
    const vNext = new Float64Array(H);
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < H; c++) vNext[r] += covCopy[r * H + c] * v[c];
    }
    norm = Math.sqrt(vNext.reduce((s, x) => s + x * x, 0)) || 1;
    for (let h = 0; h < H; h++) v[h] = vNext[h] / norm;
  }

  // Store eigenvector
  for (let h = 0; h < H; h++) V[k * H + h] = v[h];

  // Deflate covariance matrix: cov -= lambda * v * v^T
  let lambda = 0;
  for (let r = 0; r < H; r++) {
    let rowDot = 0;
    for (let c = 0; c < H; c++) rowDot += covCopy[r * H + c] * v[c];
    lambda += v[r] * rowDot;
  }
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < H; c++) {
      covCopy[r * H + c] -= lambda * v[r] * v[c];
    }
  }
}

// 4. Project all embeddings to K dimensions (L2 normalised)
console.log('Projecting all embeddings to 64 dimensions...');
const totalRows = rows.length + adv.length;
const proj = new Float32Array(totalRows * K);

for (let i = 0; i < totalRows; i++) {
  const off = i * H;
  const pOff = i * K;
  for (let k = 0; k < K; k++) {
    let sum = 0;
    const vOff = k * H;
    for (let h = 0; h < H; h++) sum += (staticData[off + h] - mean[h]) * V[vOff + h];
    proj[pOff + k] = sum;
  }
  let pNorm = 0;
  for (let k = 0; k < K; k++) pNorm += proj[pOff + k] * proj[pOff + k];
  pNorm = Math.sqrt(pNorm) || 1;
  for (let k = 0; k < K; k++) proj[pOff + k] /= pNorm;
}

// 5. Train Multiclass Logistic Regression on 64 dimensions
console.log('Training Classifier on 64 dimensions...');
const numClasses = LABELS.length;
const W = new Float32Array(numClasses * K);
const b = new Float32Array(numClasses);
const mW = new Float32Array(numClasses * K), vW = new Float32Array(numClasses * K);
const mb = new Float32Array(numClasses), vb = new Float32Array(numClasses);
const lr = 0.005, beta1 = 0.9, beta2 = 0.999, eps = 1e-8, l2 = 1e-4;
const batchSize = 64;
const epochs = 40;

let t = 0;
for (let ep = 0; ep < epochs; ep++) {
  for (let i = trainIdx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = trainIdx[i]; trainIdx[i] = trainIdx[j]; trainIdx[j] = tmp;
  }

  for (let start = 0; start < trainIdx.length; start += batchSize) {
    t++;
    const bLen = Math.min(batchSize, trainIdx.length - start);
    const gradW = new Float32Array(numClasses * K);
    const gradb = new Float32Array(numClasses);

    for (let k = 0; k < bLen; k++) {
      const idx = trainIdx[start + k];
      const target = labelMap.get(rows[idx].label);
      const offset = idx * K;

      let maxLogit = -1e9;
      const logits = new Float32Array(numClasses);
      for (let c = 0; c < numClasses; c++) {
        let sum = b[c];
        const wOff = c * K;
        for (let d = 0; d < K; d++) sum += W[wOff + d] * proj[offset + d];
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
        const wOff = c * K;
        for (let d = 0; d < K; d++) gradW[wOff + d] += (err * proj[offset + d]) / bLen;
      }
    }

    const alpha = lr * Math.sqrt(1 - Math.pow(beta2, t)) / (1 - Math.pow(beta1, t));
    for (let c = 0; c < numClasses; c++) {
      mb[c] = beta1 * mb[c] + (1 - beta1) * gradb[c];
      vb[c] = beta2 * vb[c] + (1 - beta2) * gradb[c] * gradb[c];
      b[c] -= alpha * mb[c] / (Math.sqrt(vb[c]) + eps);

      const wOff = c * K;
      for (let d = 0; d < K; d++) {
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
    const wOff = c * K;
    for (let d = 0; d < K; d++) sum += W[wOff + d] * proj[offset + d];
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

// Evaluate across thresholds
console.log('\n--- 64-DIMENSIONAL PCA MODEL EVALUATION ON HELD-OUT TEST (1309 unseen families) ---');
for (const thresh of [0.5, 0.70, 0.80, 0.85, 0.90, 0.95]) {
  let tp = 0, fp = 0, fn = 0;
  for (const idx of testIdx) {
    const isSub = (rows[idx].label === 'SUBSCRIPTION_SERVICE');
    const p = predict(idx * K)[subIdx];
    const predSub = (p >= thresh);
    if (predSub && isSub) tp++;
    else if (predSub && !isSub) fp++;
    else if (!predSub && isSub) fn++;
  }
  const prec = tp + fp > 0 ? (tp / (tp + fp)) * 100 : 0;
  const rec = tp + fn > 0 ? (tp / (tp + fn)) * 100 : 0;
  console.log(`Thresh ${thresh.toFixed(2)} -> Sub Precision: ${prec.toFixed(2)}% | Recall: ${rec.toFixed(2)}% | (TP: ${tp}, FP: ${fp}, FN: ${fn})`);
}

// Adversarial evaluation
const advStart = rows.length;
console.log('\n--- 64-DIMENSIONAL PCA MODEL ADVERSARIAL EVALUATION (50 strict cases) ---');
for (const thresh of [0.75, 0.85, 0.90]) {
  let unsafeCount = 0;
  for (let i = 0; i < adv.length; i++) {
    const item = adv[i];
    const p = predict((advStart + i) * K);
    const subP = p[subIdx];
    const claimedSub = (subP >= thresh);
    if ((item.expect === 'NOT_SUB' || item.expect === 'ABSTAIN') && claimedSub) {
      unsafeCount++;
      console.log(`  Unsafe: "${item.text}" (${item.expect}) -> subP: ${(subP*100).toFixed(1)}%`);
    }
  }
  console.log(`Thresh ${thresh.toFixed(2)} -> Total Unsafe Adversarial Claims: ${unsafeCount}/50`);
}
