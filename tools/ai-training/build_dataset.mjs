// STAGES 2 & 5(partial) â€” Build the provenance-tracked dataset with merchant-family-disjoint splits.
import fs from 'node:fs';
import path from 'node:path';
import {
  FAMILIES, PREFIXES, SUFFIXES, FIRST_NAMES, LAST_NAMES,
  TRANSFER_TEMPLATES, FEE_TEMPLATES, AMBIGUOUS_TEMPLATES,
} from './merchants.mjs';
import { ADVERSARIAL } from './adversarial.mjs';

const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const LABEL = { SUB: 'SUBSCRIPTION_SERVICE', RETAIL: 'ONE_OFF_RETAIL', GAMBLING: 'GAMBLING', BILL: 'BILL_OR_CREDIT', TRANSFER: 'TRANSFER_OR_CASH', FEE: 'BANK_FEE', AMBIGUOUS: 'AMBIGUOUS' };

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rng = mulberry32(cfg.seed);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---- OCR-style corruption (applied to a copy of the text) ----
const SUBS = { O: '0', '0': 'O', I: '1', '1': 'I', L: '1', S: '5', B: '8', E: '3', A: '4', G: '6' };
function corrupt(text) {
  const chars = [...text];
  const idxs = chars.map((c, i) => (/[A-Z0-9]/.test(c) ? i : -1)).filter((i) => i >= 0);
  if (idxs.length < 3) return text;
  const n = 1 + Math.floor(rng() * 2);
  for (let k = 0; k < n; k++) {
    const i = pick(idxs), mode = Math.floor(rng() * 4);
    if (mode === 0 && SUBS[chars[i]]) chars[i] = SUBS[chars[i]];
    else if (mode === 1) chars[i] = '';
    else if (mode === 2) chars[i] = chars[i] + ' ';
    else if (i + 1 < chars.length) { const t = chars[i]; chars[i] = chars[i + 1]; chars[i + 1] = t; }
  }
  return chars.join('').replace(/\s+/g, ' ').trim();
}
const mixedCase = (s) => s.split(' ').map((w) => (w.length > 2 ? w[0] + w.slice(1).toLowerCase() : w)).join(' ');

function decorate(type, name, noiseRate) {
  const prefixes = PREFIXES[type] ?? [''];
  let t = pick(prefixes) + name + pick(SUFFIXES);
  if (rng() < 0.1) t = mixedCase(t);
  if (rng() < noiseRate) t = corrupt(t.toUpperCase());
  return t.replace(/\s+/g, ' ').trim();
}

// ---- Families: catalogue + authored ----
const catalogue = JSON.parse(fs.readFileSync('../../src/data/monetry_database.json', 'utf8')).presets;
const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const authoredKeys = new Set(FAMILIES.map((f) => norm(f.family)));
const catalogueFamilies = catalogue.map((p) => {
  const base = p.name.replace(/\b(UK|STANDARD|PREMIUM|INDIVIDUAL|FAMILY|CORE|PLUS|\(.*?\))\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return { family: `CAT:${norm(p.name)}`, type: 'SUB', cat: p.category, names: [...new Set([p.name.toUpperCase(), base.toUpperCase()])], source: 'monetry-catalogue (src/data/monetry_database.json)', forceSplit: 'train' };
});

const authored = FAMILIES.map((f) => ({ ...f, source: 'monetry-authored-family (public brand names, synthetic descriptors)' }));

// ---- Family-disjoint split (stratified by type; SUB also by category) ----
const split = {};
const groups = new Map();
for (const f of authored) {
  const key = f.type + (f.cat ? `|${f.cat}` : '');
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(f);
}
for (const [, list] of groups) {
  const sh = shuffle(list);
  sh.forEach((f, i) => {
    const q = i / sh.length;
    split[f.family] = sh.length < 3 ? 'train' : q < cfg.dataset.splitFractions.train ? 'train' : q < cfg.dataset.splitFractions.train + cfg.dataset.splitFractions.val ? 'val' : 'test';
  });
}
for (const f of catalogueFamilies) split[f.family] = 'train';

const rows = [];
let id = 0;
const seen = new Set();
const add = (r) => { const k = `${r.split}|${r.text}`; if (seen.has(k)) return false; seen.add(k); rows.push({ id: id++, ...r }); return true; };

for (const f of [...authored, ...catalogueFamilies]) {
  const sp = split[f.family];
  const label = LABEL[f.type];
  const noiseRate = sp === 'test' ? 0 : cfg.dataset.noiseRateTrainVal;
  const target = f.family.startsWith('CAT:') ? 8 : cfg.dataset.variantsPerFamily;
  let tries = 0, made = 0;
  while (made < target && tries++ < target * 6) {
    const name = pick(f.names);
    const type = f.type === 'SUB' ? 'SUB' : f.type;
    if (add({ text: decorate(type, name, noiseRate), label, category: f.cat ?? null, family: f.family, split: sp, noisy: false, source: f.source })) made++;
  }
  if (sp === 'test') {
    // separate OCR-corrupted copy of the test families (robustness measurement)
    for (let k = 0; k < cfg.dataset.noisyTestCopies * 8; k++) {
      add({ text: decorate(f.type, pick(f.names), 1), label, category: f.cat ?? null, family: f.family, split: 'test_ocr', noisy: true, source: f.source });
    }
  }
}

// ---- Template-based synthetic classes (transfers, fees, ambiguous) ----
const person = () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
const refCode = () => Array.from({ length: 6 + Math.floor(rng() * 6) }, () => pick('ABCDEFGHJKLMNPQRSTUVWXYZ0123456789')).join('');
const places = ['HIGH ST LONDON', 'MARKET PLACE LEEDS', 'STATION RD CORBY', 'QUEEN ST CARDIFF', 'BROAD ST BIRMINGHAM'];
const fill = (t) => t.replace('{N}', person()).replace('{R}', refCode()).replace('{R2}', refCode()).replace('{L}', pick(places)).replace('{D}', `${String(1 + Math.floor(rng() * 28)).padStart(2, '0')}/${String(1 + Math.floor(rng() * 12)).padStart(2, '0')}`);
const T_PREFIX = ['', '', '', 'DEB ', 'DD ', 'BANK ', 'CHG ', 'CARD ', 'ONLINE ', 'MOB ', 'FP '];
const T_SUFFIX = ['', '', '', ' JUN', ' MAY 2026', ' 31/05', ' GB', ' LONDON', ' REF 88', ' 1042', ' MANCHESTER', ' 07/11'];
function templateRows(templates, type, source) {
  const order = shuffle(templates.map((_, i) => i));
  const nTrain = Math.round(order.length * 0.7), nVal = Math.round(order.length * 0.15);
  order.forEach((ti, pos) => {
    const sp = pos < nTrain ? 'train' : pos < nTrain + nVal ? 'val' : 'test';
    const want = sp === 'train' ? 16 : 7;
    let made = 0, tries = 0;
    while (made < want && tries++ < want * 8) {
      let t = (pick(T_PREFIX) + fill(templates[ti]) + pick(T_SUFFIX)).replace(/\s+/g, ' ').trim();
      if (rng() < cfg.dataset.noiseRateTrainVal && sp !== 'test') t = corrupt(t.toUpperCase());
      if (add({ text: t, label: LABEL[type], category: null, family: `TPL:${type}:${ti}`, split: sp, noisy: false, source })) made++;
    }
    if (sp === 'test') for (let k = 0; k < 3; k++) add({ text: corrupt((pick(T_PREFIX) + fill(templates[ti]) + pick(T_SUFFIX)).toUpperCase()), label: LABEL[type], category: null, family: `TPL:${type}:${ti}`, split: 'test_ocr', noisy: true, source });
  });
}templateRows(TRANSFER_TEMPLATES, 'TRANSFER', 'monetry-authored-template-synthetic (random synthetic person names)');
templateRows(FEE_TEMPLATES, 'FEE', 'monetry-authored-template-synthetic (UK bank fee terminology)');
templateRows(AMBIGUOUS_TEMPLATES, 'AMBIGUOUS', 'monetry-authored-template-synthetic (merchant-free descriptors)');

// ---- Identity gallery + identity test (variants of gallery merchants with fresh decoration) ----
const galleryFamilies = [...authored.filter((f) => split[f.family] === 'train'), ...catalogueFamilies];
const gallery = galleryFamilies.map((f) => ({ canonical: f.family.replace(/^CAT:/, ''), type: f.type, category: f.cat ?? null, aliases: f.names.slice(0, 2) }));
const identityTest = [];
for (const f of authored.filter((x) => split[x.family] === 'train')) {
  for (let k = 0; k < 4; k++) identityTest.push({ text: decorate(f.type, pick(f.names), k < 2 ? 0 : 0.5), canonical: f.family });
}
const unseenForIdentity = rows.filter((r) => r.split === 'test' && r.label !== 'AMBIGUOUS' && !r.family.startsWith('TPL')).map((r) => ({ text: r.text, canonical: null }));

// ---- Leakage checks ----
const famSplit = new Map();
for (const r of rows) {
  const s = r.split === 'test_ocr' ? 'test' : r.split;
  if (famSplit.has(r.family) && famSplit.get(r.family) !== s) throw new Error(`LEAK: family ${r.family} in two splits`);
  famSplit.set(r.family, s);
}
const advNorm = ADVERSARIAL.map((a) => norm(a.text));
const leakAdv = rows.filter((r) => advNorm.includes(norm(r.text)));
if (leakAdv.length) throw new Error(`LEAK: adversarial text present in dataset: ${leakAdv[0].text}`);

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/dataset.jsonl', rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
fs.writeFileSync('data/gallery.json', JSON.stringify(gallery, null, 1));
fs.writeFileSync('data/identity_test.json', JSON.stringify({ seen: identityTest, unseen: unseenForIdentity.slice(0, 400) }, null, 1));

const count = (pred) => rows.filter(pred).length;
const stats = {};
for (const sp of ['train', 'val', 'test', 'test_ocr']) {
  stats[sp] = { rows: count((r) => r.split === sp), families: new Set(rows.filter((r) => r.split === sp).map((r) => r.family)).size };
  for (const l of Object.values(LABEL)) stats[sp][l] = count((r) => r.split === sp && r.label === l);
}
const bySource = {};
for (const r of rows) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
const prov = {
  seed: cfg.seed,
  generatedAt: new Date().toISOString(),
  totalRows: rows.length,
  splits: stats,
  bySource,
  galleryMerchants: gallery.length,
  identityTest: { seen: identityTest.length, unseen: Math.min(400, unseenForIdentity.length) },
  adversarialRows: ADVERSARIAL.length,
  leakageChecks: 'PASSED: every family confined to exactly one split; no adversarial text appears in the dataset',
  externalDatasets: [
    { name: 'Xenova/all-MiniLM-L6-v2 (pretrained encoder, NOT a dataset; used as frozen foundation)', url: 'https://huggingface.co/Xenova/all-MiniLM-L6-v2', revision: '751bff37182d3f1213fa05d7196b954e230abad9', licence: 'apache-2.0', permittedUse: 'commercial use and redistribution permitted with notice', recordsUsed: 0 },
    { name: 'mitulshah/transaction-categorization', url: 'https://huggingface.co/datasets/mitulshah/transaction-categorization', licence: 'mit (per dataset card metadata)', status: 'NOT USED', reason: 'data files are gated (HTTP restricted without authentication); no access control was bypassed. Card also describes the data as machine-generated, so it would not add authentic UK ground truth.', recordsUsed: 0 },
    { name: 'Sumeetgpt/indian-transaction-categorization-synthetic, Karthik-Eswar/indian-transaction-categorization-synthetic', url: 'https://huggingface.co/datasets?search=transaction%20categorization', licence: 'mit', status: 'NOT USED', reason: 'Indian merchants; synthetic; no UK relevance', recordsUsed: 0 },
    { name: 'qppd/bank-transaction-fraud and other "bank transaction" datasets', url: 'https://huggingface.co/datasets?search=bank%20transaction', licence: 'mixed / frequently unspecified', status: 'NOT USED', reason: 'fraud-detection or numeric tables without UK merchant descriptions; unspecified licences cannot be relied on', recordsUsed: 0 },
  ],
};
fs.writeFileSync('data/provenance.json', JSON.stringify(prov, null, 2));
console.log(JSON.stringify({ total: rows.length, ...stats }, null, 1));

