import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const LABELS = config.model.labels;
const labelMap = new Map(LABELS.map((l, i) => [l, i]));

const rows = fs.readFileSync('data/dataset.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l));
const adversarial = (await import('./adversarial.mjs')).ADVERSARIAL;

const trainIdx = [], valIdx = [], testIdx = [], ocrIdx = [];
for (let i = 0; i < rows.length; i++) {
  const sp = rows[i].split;
  if (sp === 'train') trainIdx.push(i);
  else if (sp === 'val') valIdx.push(i);
  else if (sp === 'test') testIdx.push(i);
  else if (sp === 'test_ocr') ocrIdx.push(i);
}

function trainMultinomial(embData, dim, numClasses, trainIndices, labels, epochs = 40, lr = 0.1, l2 = 1e-4) {
  const W = new Float32Array(numClasses * dim);
  const b = new Float32Array(numClasses);
  const n = trainIndices.length;

  for (let ep = 0; ep < epochs; ep++) {
    // Mini-batch or full batch SGD with momentum / Adam or simple SGD
    const curLr = lr / (1 + ep * 0.05);
    for (let i = 0; i < n; i++) {
      const idx = trainIndices[i];
      const target = labels[idx];
      const offset = idx * dim;

      // Logits
      let maxLogit = -1e9;
      const logits = new Float32Array(numClasses);
      for (let c = 0; c < numClasses; c++) {
        let sum = b[c];
        const wOff = c * dim;
        for (let d = 0; d < dim; d++) sum += W[wOff + d] * embData[offset + d];
        logits[c] = sum;
        if (sum > maxLogit) maxLogit = sum;
      }

      // Softmax
      let expSum = 0;
      for (let c = 0; c < numClasses; c++) {
        logits[c] = Math.exp(logits[c] - maxLogit);
        expSum += logits[c];
      }
      for (let c = 0; c < numClasses; c++) logits[c] /= expSum;

      // Gradient step
      for (let c = 0; c < numClasses; c++) {
        const error = logits[c] - (c === target ? 1 : 0);
        const wOff = c * dim;
        for (let d = 0; d < dim; d++) {
          W[wOff + d] -= curLr * (error * embData[offset + d] + l2 * W[wOff + d]);
        }
        b[c] -= curLr * error;
      }
    }
  }
  return { W, b, dim, numClasses };
}

function evaluateModel(model, embData, indices, rowsList, name) {
  const { W, b, dim, numClasses } = model;
  const subIdx = labelMap.get('SUBSCRIPTION_SERVICE');
  let correct = 0, total = indices.length;
  let subTp = 0, subFp = 0, subFn = 0, subTn = 0;

  for (let i = 0; i < total; i++) {
    const idx = indices[i];
    const trueLabel = labelMap.get(rowsList[idx].label);
    const offset = idx * dim;

    let maxLogit = -1e9;
    const logits = new Float32Array(numClasses);
    for (let c = 0; c < numClasses; c++) {
      let sum = b[c];
      const wOff = c * dim;
      for (let d = 0; d < dim; d++) sum += W[wOff + d] * embData[offset + d];
      logits[c] = sum;
      if (sum > maxLogit) maxLogit = sum;
    }
    let expSum = 0;
    for (let c = 0; c < numClasses; c++) {
      logits[c] = Math.exp(logits[c] - maxLogit);
      expSum += logits[c];
    }
    let pred = 0, maxP = 0;
    for (let c = 0; c < numClasses; c++) {
      logits[c] /= expSum;
      if (logits[c] > maxP) { maxP = logits[c]; pred = c; }
    }

    if (pred === trueLabel) correct++;
    const isTrueSub = (trueLabel === subIdx);
    const isPredSub = (pred === subIdx);
    if (isTrueSub && isPredSub) subTp++;
    else if (!isTrueSub && isPredSub) subFp++;
    else if (isTrueSub && !isPredSub) subFn++;
    else subTn++;
  }

  const acc = (correct / total) * 100;
  const subPrec = subTp + subFp > 0 ? (subTp / (subTp + subFp)) * 100 : 0;
  const subRec = subTp + subFn > 0 ? (subTp / (subTp + subFn)) * 100 : 0;
  const subF1 = subPrec + subRec > 0 ? (2 * subPrec * subRec) / (subPrec + subRec) : 0;
  console.log(`${name} (${total} items): Acc: ${acc.toFixed(2)}% | Sub Prec: ${subPrec.toFixed(2)}% | Sub Rec: ${subRec.toFixed(2)}% | Sub F1: ${subF1.toFixed(2)}% (FP: ${subFp}, FN: ${subFn})`);
  return { acc, subPrec, subRec, subF1, subFp, subFn };
}

function evaluateAdversarial(model, embData, advList, startOffset) {
  const { W, b, dim, numClasses } = model;
  const subIdx = labelMap.get('SUBSCRIPTION_SERVICE');
  let unsafeClaims = 0;
  const details = [];

  for (let i = 0; i < advList.length; i++) {
    const item = advList[i];
    const offset = (startOffset + i) * dim;

    let maxLogit = -1e9;
    const logits = new Float32Array(numClasses);
    for (let c = 0; c < numClasses; c++) {
      let sum = b[c];
      const wOff = c * dim;
      for (let d = 0; d < dim; d++) sum += W[wOff + d] * embData[offset + d];
      logits[c] = sum;
      if (sum > maxLogit) maxLogit = sum;
    }
    let expSum = 0;
    for (let c = 0; c < numClasses; c++) {
      logits[c] = Math.exp(logits[c] - maxLogit);
      expSum += logits[c];
    }
    let pred = 0, maxP = 0;
    for (let c = 0; c < numClasses; c++) {
      logits[c] /= expSum;
      if (logits[c] > maxP) { maxP = logits[c]; pred = c; }
    }

    const predLabel = LABELS[pred];
    const isUnsafe = (item.expect === 'NOT_SUB' || item.expect === 'ABSTAIN') && predLabel === 'SUBSCRIPTION_SERVICE';
    if (isUnsafe) {
      unsafeClaims++;
      details.push(`UNSAFE: "${item.text}" (${item.expect}, ${item.note}) -> ${predLabel} (${(maxP*100).toFixed(1)}%)`);
    }
  }
  console.log(`Adversarial Evaluation (${advList.length} items): Unsafe Subscription Claims: ${unsafeClaims}`);
  if (details.length > 0) {
    console.log('Unsafe details:\n  ' + details.slice(0, 10).join('\n  '));
  }
  return unsafeClaims;
}

const labelsArray = rows.map(r => labelMap.get(r.label));

// 1. Evaluate on Reference Embeddings (Full MiniLM)
console.log('\n--- EVALUATING MODEL ON REFERENCE EMBEDDINGS (Full MiniLM L6 v2) ---');
const refBuf = fs.readFileSync('work/ref_embeddings.f32');
const refData = new Float32Array(refBuf.buffer, refBuf.byteOffset, refBuf.byteLength / 4);
const refModel = trainMultinomial(refData, 384, LABELS.length, trainIdx, labelsArray, 30, 0.2);
evaluateModel(refModel, refData, valIdx, rows, 'VAL (MiniLM)');
evaluateModel(refModel, refData, testIdx, rows, 'TEST (MiniLM)');
evaluateModel(refModel, refData, ocrIdx, rows, 'OCR (MiniLM)');
evaluateAdversarial(refModel, refData, adversarial, rows.length);

// 2. Evaluate on Static Embeddings (Distilled WordPiece)
console.log('\n--- EVALUATING MODEL ON STATIC EMBEDDINGS (Distilled WordPiece) ---');
const staticBuf = fs.readFileSync('work/static_embeddings.f32');
const staticData = new Float32Array(staticBuf.buffer, staticBuf.byteOffset, staticBuf.byteLength / 4);
const staticModel = trainMultinomial(staticData, 384, LABELS.length, trainIdx, labelsArray, 30, 0.2);
evaluateModel(staticModel, staticData, valIdx, rows, 'VAL (Static)');
evaluateModel(staticModel, staticData, testIdx, rows, 'TEST (Static)');
evaluateModel(staticModel, staticData, ocrIdx, rows, 'OCR (Static)');
evaluateAdversarial(staticModel, staticData, adversarial, rows.length);
