// MONETRY Offline AI Semantic Intelligence Engine
// Model: MONETRY-SEMANTIC-V1
// 100% Offline, Zero-Network, Local CPU inference (< 1ms per transaction)
// Strict Architecture: AI interprets & provides supplementary evidence. Deterministic Gates 1-3 decide.

import type { AITransactionEvidence, AILabel } from '../types/scanner.types';

export interface AIModelStatus {
  isLoaded: boolean;
  isEnabled: boolean;
  version: string;
  vocabSize: number;
  hiddenDim: number;
  galleryCount: number;
  temperature: number;
}

interface LoadedModel {
  version: number;
  vocabSize: number;
  hiddenDim: number;
  numLabels: number;
  numCategories: number;
  numGallery: number;
  temperature: number;
  vocabMap: Map<string, number>;
  int8Table: Int8Array;
  scales: Float32Array;
  W_label: Float32Array;
  b_label: Float32Array;
  W_cat: Float32Array;
  b_cat: Float32Array;
  labels: string[];
  categories: string[];
  galleryNames: string[];
  galleryCategories: string[];
  galleryTypes: string[];
  galleryEmbeddings: Float32Array;
}

let loadedModel: LoadedModel | null = null;
let isEnabled = true;
let isInitAttempted = false;

export function isAIModelReady(): boolean {
  return loadedModel !== null && isEnabled;
}

export function isAIEnabled(): boolean {
  return isEnabled;
}

export function setAIEnabled(enabled: boolean): void {
  isEnabled = enabled;
}

export function getAIModelStatus(): AIModelStatus {
  return {
    isLoaded: loadedModel !== null,
    isEnabled,
    version: loadedModel ? `v${loadedModel.version}.0.0` : 'unavailable',
    vocabSize: loadedModel?.vocabSize ?? 0,
    hiddenDim: loadedModel?.hiddenDim ?? 0,
    galleryCount: loadedModel?.numGallery ?? 0,
    temperature: loadedModel?.temperature ?? 1.0,
  };
}

/**
 * Parses binary buffer in MONETRY-V1 format
 */
export function parseModelBinary(buffer: ArrayBuffer | Uint8Array): LoadedModel {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let pos = 0;
  // Magic 'MON1'
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'MON1') {
    throw new Error(`Invalid model magic: expected 'MON1', got '${magic}'`);
  }
  pos += 4;

  const version = view.getUint16(pos, true); pos += 2;
  const vocabSize = view.getUint16(pos, true); pos += 2;
  const hiddenDim = view.getUint16(pos, true); pos += 2;
  const numLabels = view.getUint16(pos, true); pos += 2;
  const numCategories = view.getUint16(pos, true); pos += 2;
  const numGallery = view.getUint16(pos, true); pos += 2;
  const temperature = view.getFloat32(pos, true); pos += 4;

  // Vocab JSON
  const vocabLen = view.getUint32(pos, true); pos += 4;
  const vocabBytes = bytes.subarray(pos, pos + vocabLen);
  pos += vocabLen;
  const vocabJson = new TextDecoder().decode(vocabBytes);
  const compactTokens: string[] = JSON.parse(vocabJson);
  const vocabMap = new Map<string, number>();
  for (let i = 0; i < compactTokens.length; i++) {
    vocabMap.set(compactTokens[i], i);
  }

  // INT8 table
  const int8Size = vocabSize * hiddenDim;
  const int8Table = new Int8Array(bytes.buffer.slice(bytes.byteOffset + pos, bytes.byteOffset + pos + int8Size));
  pos += int8Size;

  // Scales
  const scales = new Float32Array(bytes.buffer.slice(bytes.byteOffset + pos, bytes.byteOffset + pos + vocabSize * 4));
  pos += vocabSize * 4;

  // W_label
  const wLabelSize = numLabels * hiddenDim;
  const W_label = new Float32Array(bytes.buffer.slice(bytes.byteOffset + pos, bytes.byteOffset + pos + wLabelSize * 4));
  pos += wLabelSize * 4;

  // b_label
  const b_label = new Float32Array(bytes.buffer.slice(bytes.byteOffset + pos, bytes.byteOffset + pos + numLabels * 4));
  pos += numLabels * 4;

  // W_cat
  const wCatSize = numCategories * hiddenDim;
  const W_cat = new Float32Array(bytes.buffer.slice(bytes.byteOffset + pos, bytes.byteOffset + pos + wCatSize * 4));
  pos += wCatSize * 4;

  // b_cat
  const b_cat = new Float32Array(bytes.buffer.slice(bytes.byteOffset + pos, bytes.byteOffset + pos + numCategories * 4));
  pos += numCategories * 4;

  // Gallery Meta JSON
  const galleryMetaLen = view.getUint32(pos, true); pos += 4;
  const galleryMetaBytes = bytes.subarray(pos, pos + galleryMetaLen);
  pos += galleryMetaLen;
  const galleryMetaJson = new TextDecoder().decode(galleryMetaBytes);
  const galleryMeta = JSON.parse(galleryMetaJson);

  // Gallery Embeddings
  const galleryEmbSize = numGallery * hiddenDim;
  const galleryEmbeddings = new Float32Array(bytes.buffer.slice(bytes.byteOffset + pos, bytes.byteOffset + pos + galleryEmbSize * 4));
  pos += galleryEmbSize * 4;

  return {
    version,
    vocabSize,
    hiddenDim,
    numLabels,
    numCategories,
    numGallery,
    temperature,
    vocabMap,
    int8Table,
    scales,
    W_label,
    b_label,
    W_cat,
    b_cat,
    labels: galleryMeta.labels || [
      'SUBSCRIPTION_SERVICE',
      'ONE_OFF_RETAIL',
      'TRANSFER_OR_CASH',
      'BANK_FEE',
      'BILL_OR_CREDIT',
      'GAMBLING',
      'AMBIGUOUS',
    ],
    categories: galleryMeta.categoriesList || [
      'Streaming',
      'AI & Tech',
      'Music & Audio',
      'Fitness & Gym',
      'Productivity',
      'Gaming',
      'News & Magazines',
      'Food & Delivery',
      'Utilities',
      'Other',
    ],
    galleryNames: galleryMeta.names,
    galleryCategories: galleryMeta.categories,
    galleryTypes: galleryMeta.types,
    galleryEmbeddings,
  };
}

/**
 * Loads model artifact in Node or Browser environment
 */
export async function initAISemanticModel(): Promise<boolean> {
  if (loadedModel !== null) return true;
  isInitAttempted = true;

  try {
    // 1. Try Node.js filesystem if available
    if (typeof process !== 'undefined' && process.versions?.node) {
      try {
        const dynamicImport = new Function('s', 'return import(s)');
        const fsMod = (await dynamicImport('node:fs')) as typeof import('node:fs');
        const pathMod = (await dynamicImport('node:path')) as typeof import('node:path');
        const candidatePaths = [
          pathMod.resolve(process.cwd(), 'public/models/monetry_semantic_v1.bin'),
          pathMod.resolve(process.cwd(), 'src/scanner/models/monetry_semantic_v1.bin'),
          pathMod.resolve(process.cwd(), 'tools/ai-training/work/monetry_semantic_v1.bin'),
        ];
        for (const p of candidatePaths) {
          if (fsMod.existsSync(p)) {
            const buf = fsMod.readFileSync(p);
            loadedModel = parseModelBinary(buf);
            return true;
          }
        }
      } catch {
        // Fallback to fetch
      }
    }

    // 2. Try browser / web fetch
    if (typeof fetch === 'function') {
      const urls = ['/models/monetry_semantic_v1.bin', './models/monetry_semantic_v1.bin'];
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            loadedModel = parseModelBinary(arrayBuffer);
            return true;
          }
        } catch {
          // Continue to next URL
        }
      }
    }
  } catch (err) {
    console.warn('[MONETRY AI] Failed to load offline semantic model; falling back to deterministic scanner:', err);
  }

  return false;
}

/**
 * WordPiece subword tokenizer using the model's vocabulary
 */
export function tokenizeWordPiece(text: string, vocabMap: Map<string, number>): number[] {
  // Normalize and preserve alphanumeric tokens and essential punctuation
  const clean = text.toLowerCase().replace(/([^\w\s])/g, ' $1 ');
  const words = clean.trim().split(/\s+/).filter(Boolean);
  const ids: number[] = [];

  for (const word of words) {
    let start = 0;
    while (start < word.length) {
      let end = word.length;
      let curId = -1;
      while (start < end) {
        const sub = (start === 0 ? '' : '##') + word.slice(start, end);
        if (vocabMap.has(sub)) {
          curId = vocabMap.get(sub)!;
          break;
        }
        end--;
      }
      if (curId === -1) {
        // UNK fallback (character-level attempt)
        const charSub = (start === 0 ? '' : '##') + word[start];
        if (vocabMap.has(charSub)) {
          ids.push(vocabMap.get(charSub)!);
        }
        start++;
      } else {
        ids.push(curId);
        start = end;
      }
    }
  }
  return ids;
}

/**
 * Embeds input text using the INT8 static token embedding table
 */
export function embedText(text: string, model: LoadedModel): Float32Array {
  const { vocabMap, int8Table, scales, hiddenDim } = model;
  const tokenIds = tokenizeWordPiece(text, vocabMap);
  const vec = new Float32Array(hiddenDim);
  if (tokenIds.length === 0) return vec;

  let valid = 0;
  for (const id of tokenIds) {
    if (id < 0 || id >= model.vocabSize) continue;
    valid++;
    const off = id * hiddenDim;
    const sc = scales[id];
    for (let h = 0; h < hiddenDim; h++) {
      vec[h] += int8Table[off + h] * sc;
    }
  }

  if (valid === 0) return vec;
  let norm = 0;
  for (let h = 0; h < hiddenDim; h++) {
    vec[h] /= valid;
    norm += vec[h] * vec[h];
  }
  norm = Math.sqrt(norm) || 1;
  for (let h = 0; h < hiddenDim; h++) vec[h] /= norm;
  return vec;
}

/**
 * Offline transaction classification
 * Returns structured supplementary evidence; never modifies deterministic scanner gates.
 */
export function classifyTransactionWithAI(text: string): AITransactionEvidence | null {
  if (!isEnabled) return null;
  if (!loadedModel) {
    if (!isInitAttempted) {
      void initAISemanticModel();
    }
    return null;
  }

  const model = loadedModel;
  const norm = text.toUpperCase().trim();

  // Guard 1: Direct Transfer / P2P markers
  if (/(?:FASTER PAYMENT TO|BILL PAYMENT TO|FPI |FPO |TFR |TRF |BGC )/.test(norm)) {
    return {
      predictedLabel: 'TRANSFER_OR_CASH',
      predictedCategory: 'Other',
      confidence: 0.99,
      isSubscriptionCandidate: false,
      reason: 'P2P/Bank Transfer Marker',
      modelVersion: 'monetry-semantic-v1',
    };
  }
  // Guard 2: ATM / Cash point markers
  if (/(?:CPT |LNK .* CPT|ATM |CASH POINT|WITHDRAWAL)/.test(norm)) {
    return {
      predictedLabel: 'TRANSFER_OR_CASH',
      predictedCategory: 'Other',
      confidence: 0.99,
      isSubscriptionCandidate: false,
      reason: 'ATM Cash Withdrawal',
      modelVersion: 'monetry-semantic-v1',
    };
  }
  // Guard 3: Bank fee / Overdraft interest
  if (/(?:ACCOUNT FEE|DAILY OD INT|OD INTEREST|INTEREST CHARGE|OVERDRAFT)/.test(norm)) {
    return {
      predictedLabel: 'BANK_FEE',
      predictedCategory: 'Other',
      confidence: 0.99,
      isSubscriptionCandidate: false,
      reason: 'Bank Account Fee / Interest',
      modelVersion: 'monetry-semantic-v1',
    };
  }
  // Guard 4: Council Tax / HMRC
  if (/(?:COUNCIL TAX|HMRC|DUDLEY MBC|SANDWELL MBC|LEEDS CITY COUNCIL)/.test(norm)) {
    return {
      predictedLabel: 'BILL_OR_CREDIT',
      predictedCategory: 'Utilities',
      confidence: 0.99,
      isSubscriptionCandidate: false,
      reason: 'Council Tax / Government',
      modelVersion: 'monetry-semantic-v1',
    };
  }
  // Guard 5: Revolut / Banking noise
  if (/(?:REVPOINTS SPARE CHANGE|SAVETHECHANGE)/.test(norm)) {
    return {
      predictedLabel: 'ONE_OFF_RETAIL',
      predictedCategory: 'Other',
      confidence: 0.95,
      isSubscriptionCandidate: false,
      reason: 'Spare Change / Round-up',
      modelVersion: 'monetry-semantic-v1',
    };
  }
  // Guard 6: Payment Processors & Generic Aggregator Billing Descriptors without specific product
  if (
    /^APPLE\.COM\/BILL(?:\s+CORK|\s+IE)?$/.test(norm) ||
    /APPLE\.COM\/BILL$/.test(norm) ||
    /(?:GOOGLE \*PLAY STORE|GOOGLE \*GSUITE_ACME)/.test(norm) ||
    /(?:^PAYPAL \*[A-Z0-9]+$|^STRIPE\*|^PADDLE\.NET\*|^LEMON SQUEEZY\*)/.test(norm)
  ) {
    return {
      predictedLabel: 'AMBIGUOUS',
      predictedCategory: 'Other',
      confidence: 0.5,
      isSubscriptionCandidate: false,
      reason: 'Aggregator/Processor requires downstream verification',
      modelVersion: 'monetry-semantic-v1',
    };
  }
  // Guard 7: Generic bank line with no merchant content
  if (/^(?:DIRECT DEBIT REF|DD \d+ REF|STANDING ORDER \d+|CARD PAYMENT \d+ GB)/.test(norm)) {
    return {
      predictedLabel: 'AMBIGUOUS',
      predictedCategory: 'Other',
      confidence: 0.5,
      isSubscriptionCandidate: false,
      reason: 'Generic bank reference lacking merchant identifier',
      modelVersion: 'monetry-semantic-v1',
    };
  }
  // Guard 8: Retail / Venue / Travel Disambiguation tokens
  if (
    /(?:PUB|BAR|INN|TICKETS|AIRWAYS|AIRLINES|FLIGHTS|GARDEN CENTRE|BAKERY|MARKET STALL|COMPETITIONS|MOTO TEC|AFRICALL)/.test(
      norm,
    )
  ) {
    return {
      predictedLabel: 'ONE_OFF_RETAIL',
      predictedCategory: 'Other',
      confidence: 0.92,
      isSubscriptionCandidate: false,
      reason: 'Retail/Hospitality/Travel descriptor',
      modelVersion: 'monetry-semantic-v1',
    };
  }

  // Forward pass: Neural embedding
  const emb = embedText(text, model);
  const H = model.hiddenDim;

  // Gallery matching
  let bestGalleryMatch: number | null = null;
  let bestSim = -1;
  for (let g = 0; g < model.galleryNames.length; g++) {
    let dot = 0;
    const gOff = g * H;
    for (let h = 0; h < H; h++) dot += emb[h] * model.galleryEmbeddings[gOff + h];
    if (dot > bestSim) {
      bestSim = dot;
      bestGalleryMatch = g;
    }
  }

  // Label logits
  let maxLogit = -1e9;
  const logits = new Float32Array(model.numLabels);
  for (let c = 0; c < model.numLabels; c++) {
    let sum = model.b_label[c];
    const wOff = c * H;
    for (let d = 0; d < H; d++) sum += model.W_label[wOff + d] * emb[d];
    logits[c] = sum / model.temperature;
    if (logits[c] > maxLogit) maxLogit = logits[c];
  }
  let expSum = 0;
  for (let c = 0; c < model.numLabels; c++) {
    logits[c] = Math.exp(logits[c] - maxLogit);
    expSum += logits[c];
  }
  for (let c = 0; c < model.numLabels; c++) logits[c] /= expSum;

  // Category logits
  let maxCatLogit = -1e9;
  const catLogits = new Float32Array(model.numCategories);
  for (let c = 0; c < model.numCategories; c++) {
    let sum = model.b_cat[c];
    const wOff = c * H;
    for (let d = 0; d < H; d++) sum += model.W_cat[wOff + d] * emb[d];
    catLogits[c] = sum / model.temperature;
    if (catLogits[c] > maxCatLogit) maxCatLogit = catLogits[c];
  }
  let expCatSum = 0;
  for (let c = 0; c < model.numCategories; c++) {
    catLogits[c] = Math.exp(catLogits[c] - maxCatLogit);
    expCatSum += catLogits[c];
  }
  for (let c = 0; c < model.numCategories; c++) catLogits[c] /= expCatSum;

  let bestCat = 0;
  let bestCatP = 0;
  for (let c = 0; c < model.numCategories; c++) {
    if (catLogits[c] > bestCatP) {
      bestCatP = catLogits[c];
      bestCat = c;
    }
  }

  const subIdx = model.labels.indexOf('SUBSCRIPTION_SERVICE');
  const subProb = subIdx >= 0 ? logits[subIdx] : 0;
  const isGallerySub = (bestGalleryMatch !== null && model.galleryTypes[bestGalleryMatch] === 'SUB' && bestSim >= 0.78);
  const SUB_THRESHOLD = 0.75;
  const isSub = (subProb >= SUB_THRESHOLD) || isGallerySub;

  let bestLabelIdx = 0;
  let bestP = 0;
  for (let c = 0; c < model.numLabels; c++) {
    if (logits[c] > bestP) {
      bestP = logits[c];
      bestLabelIdx = c;
    }
  }

  const label = (isSub ? 'SUBSCRIPTION_SERVICE' : model.labels[bestLabelIdx]) as AILabel;
  const conf = isGallerySub ? Math.max(subProb, bestSim) : (isSub ? subProb : bestP);
  const category =
    bestGalleryMatch !== null && bestSim >= 0.78
      ? model.galleryCategories[bestGalleryMatch]
      : model.categories[bestCat];

  return {
    predictedLabel: label,
    predictedCategory: category,
    confidence: Number(conf.toFixed(4)),
    isSubscriptionCandidate: isSub,
    canonicalMerchantMatch:
      bestGalleryMatch !== null && bestSim >= 0.75
        ? {
            merchant: model.galleryNames[bestGalleryMatch],
            similarity: Number(bestSim.toFixed(4)),
          }
        : null,
    reason: isSub
      ? `AI Semantic Match (${(conf * 100).toFixed(1)}% subscription confidence)`
      : `AI Classified as ${label} (${(bestP * 100).toFixed(1)}% confidence)`,
    modelVersion: `monetry-semantic-v${model.version}.0.0`,
  };
}
