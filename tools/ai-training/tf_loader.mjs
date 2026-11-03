// Shared dev-time loader. The native onnxruntime-node binding cannot load on this machine
// (Visual C++ runtime DLLs are missing), so the pretrained encoder is executed with
// onnxruntime-web's WASM CPU backend instead. The tokenizer comes from transformers.js' web build.
import fs from 'node:fs';
import path from 'node:path';

export const MODEL = 'Xenova/all-MiniLM-L6-v2';
export const REV = '751bff37182d3f1213fa05d7196b954e230abad9';
const BASE = `https://huggingface.co/${MODEL}/resolve/${REV}`;
export const CACHE = path.resolve('./work/hf-cache');

export async function fetchCached(rel) {
  const target = path.join(CACHE, REV, rel);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const res = await fetch(`${BASE}/${rel}`);
    if (!res.ok) throw new Error(`download failed ${rel}: ${res.status}`);
    fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  }
  return target;
}

export async function loadEncoder() {
  const ort = await import('onnxruntime-web');
  ort.env.wasm.numThreads = 1;
  const modelPath = await fetchCached('onnx/model_quantized.onnx');
  const session = await ort.InferenceSession.create(fs.readFileSync(modelPath), { executionProviders: ['wasm'] });
  return { ort, session, inputNames: session.inputNames };
}

export async function loadReferenceTokenizer() {
  const { Tokenizer } = await import('@huggingface/tokenizers');
  const tj = JSON.parse(fs.readFileSync(await fetchCached('tokenizer.json'), 'utf8'));
  const tc = JSON.parse(fs.readFileSync(await fetchCached('tokenizer_config.json'), 'utf8'));
  return new Tokenizer(tj, tc);
}
/** Runs the real encoder on token-id batches; returns last_hidden_state as Float32Array [n, len, 384]. */
export async function runEncoder(enc, idsRows, maskRows) {
  const n = idsRows.length, len = idsRows[0].length;
  const ids = new BigInt64Array(n * len), mask = new BigInt64Array(n * len), types = new BigInt64Array(n * len);
  for (let i = 0; i < n; i++) for (let j = 0; j < len; j++) {
    ids[i * len + j] = BigInt(idsRows[i][j]);
    mask[i * len + j] = BigInt(maskRows[i][j]);
  }
  const T = (d) => new enc.ort.Tensor('int64', d, [n, len]);
  const feeds = { input_ids: T(ids), attention_mask: T(mask) };
  if (enc.inputNames.includes('token_type_ids')) feeds.token_type_ids = T(types);
  const out = await enc.session.run(feeds);
  return out[enc.session.outputNames[0]].data;
}

