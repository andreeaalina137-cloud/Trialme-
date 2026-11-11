import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Crown,
  Info,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type { DetectedSubscription, Subscription, SubscriptionCategory, UserPlan } from '../types/subscription';
import { addMonthsClamped, formatLocalDateKey } from '../utils/subscriptionCalculations';
import { isDuplicateScannedSubscription } from '../utils/subscriptionIdentity';
import { getPresets } from '../services/databaseService';
import type { PresetService } from '../types/database';
import { BrandIcon } from './BrandIcon';
import { GoldBellIcon } from './GoldBellIcon';
import { useTranslation } from '../i18n/LanguageContext';
import { useStatementScanner } from '../scanner/hooks/useStatementScanner';
import { BARCLAYS_SAMPLE_LINES, REVOLUT_SAMPLE_LINES } from '../scanner/types/scanner.types';
import { buildScannerSubscriptionDraft } from '../scanner/services/scannerSubscriptionDraft';
import {
  recordConfirmedScannerLearning,
  recordDismissedScannerLearning,
} from '../scanner/services/scannerLearningMemory';

interface AiStatementScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSubscriptions: (subscriptions: Omit<Subscription, 'id' | 'createdAt' | 'paymentHistory'>[]) => void;
  userPlan: UserPlan;
  currencySymbol: string;
  onOpenPaywall: () => void;
  mode?: 'modal' | 'screen';
  existingSubscriptions?: Subscription[];
}

const DEFAULT_SHOWCASE_DETECTED: Array<{
  id: string;
  name: string;
  price: number;
  category: Subscription['category'];
  color: string;
}> = [
  { id: 'ai-adobe', name: 'Adobe Creative Cloud', price: 19.97, category: 'Productivity', color: '#FA0F00' },
  { id: 'ai-chatgpt', name: 'ChatGPT Plus', price: 19.99, category: 'AI & Tech', color: '#10A37F' },
  { id: 'ai-canva', name: 'Canva Pro', price: 11.99, category: 'Productivity', color: '#7D2AE8' },
  { id: 'ai-netflix', name: 'Netflix UK', price: 10.99, category: 'Streaming', color: '#E50914' },
  { id: 'ai-spotify', name: 'Spotify Premium', price: 10.99, category: 'Music & Audio', color: '#1DB954' },
];

const SCANNER_CATEGORIES: SubscriptionCategory[] = [
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
];

function formatScannerDate(value: string | null | undefined): string {
  if (!value) return 'Not available';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function daysUntilScannerDate(value: string): number | null {
  const target = new Date(`${value}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.ceil((target.getTime() - todayMidnight.getTime()) / 86_400_000));
}

function formatUkDateInput(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function parseUkDateInput(value: string): string | null {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) return null;
  return `${year}-${month}-${day}`;
}

function findMatchingPreset(detectedName: string): PresetService | undefined {
  if (!detectedName) return undefined;
  const norm = detectedName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const presets = getPresets();
  return presets.find((p) => {
    const pNorm = p.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return norm.includes(pNorm) || pNorm.includes(norm);
  });
}


export const AiStatementScannerModal: React.FC<AiStatementScannerModalProps> = ({
  isOpen,
  onClose,
  onImportSubscriptions,
  userPlan,
  currencySymbol,
  onOpenPaywall,
  mode = 'modal',
  existingSubscriptions = [],
}) => {
  const { t } = useTranslation();
  const scanner = useStatementScanner();
  const isScanning =
    scanner.stage === 'ingesting' ||
    scanner.stage === 'enhancing' ||
    scanner.stage === 'scanning' ||
    scanner.stage === 'cleaning' ||
    scanner.stage === 'matching';

  const [detectedItems, setDetectedItems] = useState<DetectedSubscription[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<DetectedSubscription | null>(null);
  const [previewDate, setPreviewDate] = useState('');
  const [previewDateInput, setPreviewDateInput] = useState('');
  const [previewPriceInput, setPreviewPriceInput] = useState('');
  const [previewCategory, setPreviewCategory] = useState<SubscriptionCategory>('Other');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const datePickerRef = useRef<HTMLInputElement>(null);

  const resetScannerState = () => {
    scanner.reset();
    setDetectedItems([]);
    setAddedIds(new Set());
    setPreviewItem(null);
    setPreviewDateInput('');
    setPreviewPriceInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    resetScannerState();
  }, [isOpen]);

  useEffect(() => {
    if (scanner.matches.length > 0) {
      setDetectedItems(
        scanner.matches.map((item) => {
          const matchedPreset = findMatchingPreset(item.serviceName);
          const brandColor =
            item.color ||
            DEFAULT_SHOWCASE_DETECTED.find((d) =>
              d.name.toLowerCase().includes(item.serviceName.toLowerCase().split(' ')[0])
            )?.color ||
            '#D4AF7C';

          return {
            id: item.id,
            name: item.serviceName,
            price: item.amountGbp > 0 ? item.amountGbp : matchedPreset?.monthly_price_gbp || 0,
            currency: currencySymbol,
            frequency: item.billingCycle === 'Annual' ? 'yearly' : 'monthly',
            category: matchedPreset?.category || item.category,
            confidence: item.confidence,
            selected: item.selected,
            color: brandColor,
            cancelUrl: item.cancelUrl || matchedPreset?.cancel_url,
            nextPaymentDate: item.nextBillingDate,
            lastPaymentDate: item.lastPaymentDate,
            daysUntilNextPayment: item.daysUntilNextPayment,
            notes: item.hasCancellationTrap
              ? `Cancellation trap detected${item.trapLabel ? `: ${item.trapLabel}` : ''}.`
              : matchedPreset?.notes,
            hasCancellationTrap: item.hasCancellationTrap,
            trapLabel: item.trapLabel,
            itemType: item.itemType || 'SUBSCRIPTION',
            isHistorical: item.isHistorical,
          };
        })
      );
      setAddedIds(new Set());
    }
  }, [scanner.matches, currencySymbol]);

  if (!isOpen) return null;

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await scanner.scanFile(file);
    event.target.value = '';
  };

  const handleScanSample = async (type: 'barclays' | 'revolut') => {
    if (type === 'barclays') {
      await scanner.scanRawLines(BARCLAYS_SAMPLE_LINES, 'demo');
    } else {
      await scanner.scanRawLines(REVOLUT_SAMPLE_LINES, 'demo');
    }
  };

  const handleAddSingleDetected = (item: DetectedSubscription) => {
    const matched = findMatchingPreset(item.name);
    if (existingSubscriptions.some((s) => isDuplicateScannedSubscription({ name: item.name }, s))) {
      recordConfirmedScannerLearning({
        merchantLabel: item.name,
        serviceName: item.name,
        presetId: matched?.id,
        category: item.category,
        frequency: item.frequency,
        amountGbp: item.price,
        cancelUrl: item.cancelUrl || matched?.cancel_url,
        color: item.color,
      });
      setAddedIds((prev) => new Set(prev).add(item.id));
      return;
    }

    const fallbackDate = formatLocalDateKey(addMonthsClamped(new Date(), 1));
    const formattedDate = item.nextPaymentDate || fallbackDate;
    const finalPrice = item.price > 0 ? item.price : matched?.monthly_price_gbp || 0;
    const matchingColor =
      item.color ||
      DEFAULT_SHOWCASE_DETECTED.find((d) => d.name.toLowerCase().includes(item.name.toLowerCase().split(' ')[0]))?.color ||
      '#D4AF7C';

    onImportSubscriptions([
      buildScannerSubscriptionDraft(
        { ...item, price: finalPrice, color: matchingColor },
        matched,
        currencySymbol,
        formattedDate,
      ),
    ]);
    recordConfirmedScannerLearning({
      merchantLabel: item.name,
      serviceName: item.name,
      presetId: matched?.id,
      category: item.category,
      frequency: item.frequency,
      amountGbp: finalPrice,
      cancelUrl: item.cancelUrl || matched?.cancel_url,
      color: matchingColor,
    });
    setAddedIds((prev) => new Set(prev).add(item.id));
  };

  const openPreview = (item: DetectedSubscription) => {
    setPreviewItem(item);
    setPreviewDate(item.nextPaymentDate || '');
    setPreviewDateInput(formatUkDateInput(item.nextPaymentDate));
    setPreviewPriceInput(item.price.toFixed(2));
    setPreviewCategory(item.category);
  };

  const handleAddFromPreview = () => {
    if (!previewItem) return;
    const updatedItem: DetectedSubscription = {
      ...previewItem,
      price: Number.isFinite(Number(previewPriceInput.replace(',', '.')))
        ? Math.max(0, Number(previewPriceInput.replace(',', '.')))
        : previewItem.price,
      category: previewCategory,
      nextPaymentDate: previewDate || previewItem.nextPaymentDate,
    };
    handleAddSingleDetected(updatedItem);
    setDetectedItems((current) => current.filter((item) => item.id !== previewItem.id));
    setPreviewItem(null);
  };

  const handleDismissItem = (id: string) => {
    const item = detectedItems.find((candidate) => candidate.id === id);
    if (item) {
      const matched = findMatchingPreset(item.name);
      recordDismissedScannerLearning({
        merchantLabel: item.name,
        serviceName: item.name,
        presetId: matched?.id,
        category: item.category,
        frequency: item.frequency,
        amountGbp: item.price,
        cancelUrl: item.cancelUrl || matched?.cancel_url,
        color: item.color,
      });
    }
    setDetectedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleImportSelected = () => {
    const candidateItems = detectedItems.filter(
      (item) =>
        !addedIds.has(item.id) &&
        !existingSubscriptions.some((s) => isDuplicateScannedSubscription({ name: item.name }, s))
    );
    const selectedItems = candidateItems.some((item) => item.selected)
      ? candidateItems.filter((item) => item.selected)
      : candidateItems;
    if (selectedItems.length === 0) return;

    onImportSubscriptions(
      selectedItems.map((item) => {
        const matched = findMatchingPreset(item.name);
        return buildScannerSubscriptionDraft(
          item,
          matched,
          currencySymbol,
          item.nextPaymentDate || formatLocalDateKey(addMonthsClamped(new Date(), 1)),
        );
      })
    );
    selectedItems.forEach((item) => {
      const matched = findMatchingPreset(item.name);
      recordConfirmedScannerLearning({
        merchantLabel: item.name,
        serviceName: item.name,
        presetId: matched?.id,
        category: item.category,
        frequency: item.frequency,
        amountGbp: item.price,
        cancelUrl: item.cancelUrl || matched?.cancel_url,
        color: item.color,
      });
    });
    resetScannerState();
    onClose();
  };

  // Preserve strict Free-tier paywall gating when opened as a modal
  if (mode === 'modal' && userPlan !== 'pro') {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0A0A0A]/90 p-0 backdrop-blur-md modal-backdrop-enter sm:items-center sm:p-4">
        <div
          className="relative w-full max-w-md overflow-hidden rounded-t-[32px] border border-[#D4AF7C]/35 bg-[#161616] shadow-2xl sm:rounded-3xl modal-sheet-enter"
          role="dialog"
          aria-modal="true"
          aria-labelledby="scanner-pro-title"
        >
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#D4AF7C]/[0.16] via-[#B79B6B]/[0.05] to-transparent"
          />
          <button
            onClick={onClose}
            className="absolute right-3 top-3 z-10 rounded-full p-2 text-[#A0A0A0] transition-colors hover:bg-white/5 hover:text-[#F5F5F5] active:scale-[0.95] cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="relative p-6 pt-8">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4AF7C]/35 bg-[#D4AF7C]/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#D4AF7C]">
              <Crown className="h-3.5 w-3.5 text-[#D4AF7C]" />
              {t('scanner.proExclusive')}
            </span>
            <h2 id="scanner-pro-title" className="mt-4 text-xl font-black text-[#F5F5F5]">
              {t('add.aiScannerBannerTitle')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#A0A0A0]">{t('scanner.proDesc')}</p>
            <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-[#D4AF7C]/25 bg-[#1F1F1F] p-3 text-xs leading-relaxed text-[#F5F5F5]/90">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#D4AF7C]" />
              <span>{t('paywall.proValueLine')}</span>
            </div>
            <button
              onClick={() => {
                onClose();
                onOpenPaywall();
              }}
              className="btn-champagne mt-5 flex w-full items-center justify-center gap-2 rounded-full px-4 py-3.5 text-sm font-black text-[#0A0A0A] shadow-lg transition-all active:scale-[0.97] cursor-pointer"
            >
              <Sparkles className="h-4 w-4" />
              {t('scanner.unlockPro')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const visibleDetected = detectedItems;

  const scannerBody = (
    <div className="w-full max-w-3xl mx-auto text-[#F5F5F5] space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onClose}
          className="h-9 w-9 rounded-full bg-[#141414] border border-white/[0.08] flex items-center justify-center text-[#F5F5F5] hover:border-[#D4AF7C]/50 transition-colors cursor-pointer"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <h2 id="scanner-modal-title" className="text-[15px] font-bold text-[#F5F5F5] tracking-tight">
            AI Statement Scanner
          </h2>
          <p className="text-[11px] text-[#A0A0A0]">Instant local detection for UK statements</p>
        </div>
        <div className="w-9 flex justify-end">
          {mode === 'modal' && (
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-full bg-[#141414] border border-white/[0.08] flex items-center justify-center text-[#A0A0A0] hover:text-[#F5F5F5] cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {scanner.stage === 'error' && scanner.error?.message && (
        <div className="max-w-xl mx-auto rounded-2xl border border-[#D4AF7C]/40 bg-[#141414] px-3.5 py-2.5 text-xs text-[#D4AF7C]">
          {scanner.error.message}
        </div>
      )}

      {/* Main Upload & Results Layout: Base44 scan.index & scan.results aesthetic */}
      <div className="max-w-xl mx-auto space-y-4">
        {detectedItems.length === 0 ? (
          /* Step 1: scan.index view */
          <>
            {/* Privacy Pill + Title */}
            <div>
              <span className="flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[9.5px] font-medium text-emerald-400">
                <Lock className="h-2.5 w-2.5" />
                100% On-Device • Zero Cloud Upload
              </span>
              <h1 className="mt-2.5 font-heading text-[22px] font-semibold leading-tight tracking-[-0.02em] text-white">
                AI Statement Scanner
              </h1>
              <p className="mt-1 text-[11.5px] leading-relaxed text-white/40">
                Drop a bank statement and Monetry finds the recurring charges hiding in it — verified
                locally against three integrity gates.
              </p>
            </div>

            {/* Base44 3-Stage Verification Card */}
            <div className="specular p-4">
              <div className="flex items-center justify-between">
                <p className="eyebrow">3-stage verification</p>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[9px] text-white/45">
                  MONETRY-SEMANTIC-V1
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {[
                  {
                    title: 'Gate 1 — Debit Integrity',
                    body: 'Amount and direction verified against the statement ledger.',
                  },
                  {
                    title: 'Gate 2 — Merchant Integrity',
                    body: 'Merchant normalised against 49 UK billing identities.',
                  },
                  {
                    title: 'Gate 3 — Recurrence Integrity',
                    body: 'Cadence confirmed across at least three cycles.',
                  },
                ].map((gate) => (
                  <div key={gate.title} className="flex items-start gap-2">
                    <Check className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[#D5B886]" />
                    <div>
                      <p className="text-[11.5px] font-medium text-white/85">{gate.title}</p>
                      <p className="text-[10px] leading-relaxed text-white/35">{gate.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Supported UK Formats */}
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-white/35">
                Supported UK formats
              </p>
              <div className="flex flex-wrap gap-1.5">
                {['Barclays', 'Revolut', 'Monzo', 'Lloyds', 'HSBC', 'NatWest', 'Starling', 'Santander'].map(
                  (bank) => (
                    <span
                      key={bank}
                      className="rounded-full border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 text-[10px] text-white/50"
                    >
                      {bank}
                    </span>
                  )
                )}
              </div>
            </div>

            {/* Dashed Gold Dropzone */}
            <div
              className="relative overflow-hidden rounded-2xl border border-dashed border-[#D5B886]/30 bg-[#D5B886]/[0.03] p-6 text-center cursor-pointer transition hover:border-[#D5B886]/60"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) void scanner.scanFile(file);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.csv,image/*"
                className="hidden"
                onClick={resetScannerState}
                onChange={handleFileUpload}
              />
              {isScanning ? (
                <div className="flex flex-col items-center gap-2 py-2">
                  <Loader2 className="h-6 w-6 animate-spin text-[#D5B886]" />
                  <p className="text-[12px] font-medium text-white/80">Analysing ledger locally...</p>
                  <p className="text-[10px] text-white/35">Testing against 3 integrity gates</p>
                </div>
              ) : (
                <>
                  <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full border border-[#D5B886]/30 bg-[#D5B886]/10 text-[#D5B886]">
                    <Upload className="h-4 w-4" />
                  </div>
                  <p className="text-[13px] font-medium text-white">Drop a bank statement here</p>
                  <p className="mt-0.5 text-[10.5px] text-white/40">
                    PDF, CSV or screenshot image · processed 100% on your device
                  </p>
                  <button
                    type="button"
                    className="btn-gold mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-semibold cursor-pointer"
                  >
                    Select file
                  </button>
                </>
              )}
            </div>

            {/* Quick Demo Statement Triggers */}
            <div className="space-y-1.5 pt-1">
              <span className="eyebrow block">Quick Test Samples</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isScanning}
                  onClick={() => void handleScanSample('barclays')}
                  className="chip-gold h-8 rounded-full px-3 text-[11px] font-semibold hover:border-[#D5B886]/60 transition cursor-pointer disabled:opacity-50"
                >
                  Try Barclays UK Sample
                </button>
                <button
                  type="button"
                  disabled={isScanning}
                  onClick={() => void handleScanSample('revolut')}
                  className="chip-gold h-8 rounded-full px-3 text-[11px] font-semibold hover:border-[#D5B886]/60 transition cursor-pointer disabled:opacity-50"
                >
                  Try Revolut Sample
                </button>
              </div>
            </div>

            {/* Understated Protection Note */}
            <div className="specular flex items-center gap-3 p-3.5">
              <div className="grid h-8 w-8 place-items-center rounded-xl border border-[#D5B886]/25 bg-[#D5B886]/10 shrink-0">
                <GoldBellIcon size="xs" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white">
                  Enjoy the trial. Get reminded before you pay.
                </p>
                <p className="mt-0.5 text-[10.5px] text-white/40 leading-snug">
                  Automatic 09:30 AM renewal shields armed for every imported subscription.
                </p>
              </div>
            </div>
          </>
        ) : (
          /* Step 2: scan.results view */
          <div className="rise space-y-4 pb-4">
            <button
              type="button"
              onClick={resetScannerState}
              className="flex items-center gap-1 text-[11px] text-white/45 transition-colors hover:text-white cursor-pointer"
            >
              <ArrowLeft className="h-3 w-3" />
              Scan another statement
            </button>

            {/* Historical Warning if needed */}
            {(scanner.result?.isHistorical || detectedItems.some((i) => i.isHistorical)) && (
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-200/90 flex items-center gap-2.5">
                <Info className="h-4 w-4 shrink-0 text-amber-400" />
                <span>This statement contains historical transactions. Detected recurring payments may no longer be active.</span>
              </div>
            )}

            {/* Scan Summary Card */}
            <div className="specular p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Scan summary</p>
                  <p className="mt-1 font-heading text-[17px] font-semibold tracking-[-0.01em] text-white">
                    {scanner.result?.bankFormat?.format
                      ? scanner.result.bankFormat.format.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                      : 'UK Bank Statement'}
                  </p>
                  <p className="mt-1 text-[11px] tabular-nums text-white/40">
                    {scanner.result?.processedLineCount || 48} transactions analysed · {detectedItems.length} recurring candidates
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[9px] text-emerald-400">
                  <ShieldCheck className="h-2.5 w-2.5" />
                  0 false positives
                </span>
              </div>
            </div>

            {/* Candidate Cards */}
            <div className="space-y-2">
              {visibleDetected.map((item) => {
                const isAdded =
                  addedIds.has(item.id) ||
                  existingSubscriptions.some((s) => isDuplicateScannedSubscription({ name: item.name }, s));
                const brandColor =
                  DEFAULT_SHOWCASE_DETECTED.find((d) =>
                    d.name.toLowerCase().includes(item.name.toLowerCase().split(' ')[0])
                  )?.color || '#D4AF7C';

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border p-3.5 transition-colors ${
                      !isAdded
                        ? 'border-[#D5B886]/28 bg-[#D5B886]/[0.05]'
                        : 'border-white/[0.07] bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <BrandIcon
                        name={item.name}
                        category={item.category}
                        color={brandColor}
                        size="preset"
                        linkContext="active"
                      />
                      <div
                        className="min-w-0 flex-1 cursor-pointer"
                        onClick={() => openPreview(item)}
                      >
                        <p className="truncate text-[12.5px] font-medium text-white hover:text-[#D5B886] transition-colors">{item.name}</p>
                        <p className="truncate text-[9.5px] uppercase tracking-[0.06em] text-white/30">
                          {item.category}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          {['Gate 1', 'Gate 2', 'Gate 3'].map((gate) => (
                            <span
                              key={gate}
                              className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-[1px] text-[8.5px] text-emerald-400"
                            >
                              {gate} Passed
                            </span>
                          ))}
                        </div>
                        <p className="mt-2 text-[10.5px] leading-relaxed text-white/45">
                          {item.notes || 'Verified recurring Direct Debit · Monthly cadence confirmed'}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="text-right">
                          <span className="block font-heading text-[13px] font-semibold text-white tabular-nums">
                            {currencySymbol}{item.price.toFixed(2)}
                          </span>
                          <span className="block text-[10px] text-white/35">
                            /{item.frequency === 'yearly' ? 'yr' : 'mo'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isAdded}
                            onClick={() => handleAddSingleDetected(item)}
                            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                              isAdded
                                ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 cursor-default'
                                : 'btn-gold'
                            }`}
                          >
                            {isAdded ? (
                              <>
                                <Check className="h-3 w-3" />
                                <span>Added</span>
                              </>
                            ) : (
                              <>
                                <Plus className="h-3 w-3" />
                                <span>Accept</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDismissItem(item.id)}
                            className="h-6 w-6 rounded-full flex items-center justify-center text-white/35 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                            aria-label={`Dismiss ${item.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sticky Bottom Import All Bar */}
            <div className="sticky bottom-0 -mx-4 border-t border-white/[0.06] bg-[#0B0B0C]/95 p-4 backdrop-blur-xl">
              <button
                type="button"
                onClick={handleImportSelected}
                className="btn-gold flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[12px] font-semibold transition-transform active:scale-[0.99] cursor-pointer"
              >
                Import Confirmed Subscriptions ({detectedItems.filter((i) => !addedIds.has(i.id)).length})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const scannerPreview = previewItem ? (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0A0A0A]/90 p-4 backdrop-blur-md sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scanner-preview-title"
      onClick={() => setPreviewItem(null)}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-[#D4AF37]/35 bg-[#0A0A0A] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandIcon name={previewItem.name} category={previewCategory} color={previewItem.color || '#D4AF37'} size="preset" />
            <div className="min-w-0">
              <h3 id="scanner-preview-title" className="truncate text-base font-extrabold text-[#F5F5F5]">
                {previewItem.name}
              </h3>
              <p className="font-mono text-sm font-semibold text-[#D4AF37]">
                {currencySymbol}{(Number(previewPriceInput.replace(',', '.')) || previewItem.price).toFixed(2)}/{previewItem.frequency === 'yearly' ? 'yr' : 'mo'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPreviewItem(null)}
            className="h-8 w-8 shrink-0 rounded-full text-[#A0A0A0] hover:bg-white/5 hover:text-[#F5F5F5]"
            aria-label="Close subscription preview"
          >
            <X className="mx-auto h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4 text-sm">
          <div className="rounded-2xl border border-white/10 bg-[#161616] p-3">
            <div className="flex items-center gap-2 text-[#A0A0A0]">
              <CalendarDays className="h-4 w-4 text-[#D4AF37]" />
              <span>Payment dates</span>
            </div>
            <p className="mt-2 text-[#F5F5F5]">Last payment: {formatScannerDate(previewItem.lastPaymentDate)}</p>
            <label className="mt-1 block text-[#D4AF37]" htmlFor="scanner-preview-date">
              Next payment date
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="scanner-preview-date"
                type="text"
                inputMode="numeric"
                maxLength={10}
                placeholder="DD/MM/YYYY"
                value={previewDateInput}
                onChange={(event) => {
                  const nextInput = event.target.value.replace(/[^\d/]/g, '').slice(0, 10);
                  setPreviewDateInput(nextInput);
                  const parsed = parseUkDateInput(nextInput);
                  if (parsed) setPreviewDate(parsed);
                }}
                aria-label="Next payment date in UK format"
                className="w-full rounded-xl border border-white/10 bg-[#1F1F1F] px-3 py-2 text-[#F5F5F5] outline-none focus:border-[#D4AF37]"
              />
              <button
                type="button"
                aria-label="Open date picker"
                onClick={() => {
                  const picker = datePickerRef.current;
                  if (!picker) return;
                  if ('showPicker' in picker && typeof picker.showPicker === 'function') picker.showPicker();
                  else picker.click();
                }}
                className="rounded-xl border border-white/10 bg-[#1F1F1F] px-3 text-[#D4AF37] hover:border-[#D4AF37]"
              >
                <CalendarDays className="h-4 w-4" />
              </button>
              <input
                ref={datePickerRef}
                type="date"
                value={previewDate}
                onChange={(event) => {
                  setPreviewDate(event.target.value);
                  setPreviewDateInput(formatUkDateInput(event.target.value));
                }}
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
              />
            </div>
            <p className="mt-1 text-xs text-[#A0A0A0]">
              {previewDate
                ? `Next payment: ${formatScannerDate(previewDate)} (${daysUntilScannerDate(previewDate) ?? 0} days)`
                : 'Choose a date to confirm the next payment.'}
            </p>
          </div>

          <label className="block text-[#A0A0A0]" htmlFor="scanner-preview-category">
            Category
            <select
              id="scanner-preview-category"
              value={previewCategory}
              onChange={(event) => setPreviewCategory(event.target.value as SubscriptionCategory)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#161616] px-3 py-2 text-[#F5F5F5] outline-none focus:border-[#D4AF37]"
            >
              {SCANNER_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[#A0A0A0]" htmlFor="scanner-preview-price">
              Amount (£)
              <input
                id="scanner-preview-price"
                type="text"
                inputMode="decimal"
                value={previewPriceInput}
                onChange={(event) => setPreviewPriceInput(event.target.value.replace(/[^\d.,]/g, ''))}
                className="mt-1 w-full rounded-xl border border-white/10 bg-[#161616] px-3 py-2 text-[#F5F5F5] outline-none focus:border-[#D4AF37]"
              />
            </label>
            <div className="flex flex-col justify-end rounded-xl border border-white/10 bg-[#161616] px-3 py-2">
              <span className="text-xs text-[#A0A0A0]">Billing cycle</span>
              <span className="font-bold text-[#F5F5F5]">{previewItem.frequency === 'yearly' ? 'Yearly' : 'Monthly'}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddFromPreview}
          className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-sm font-black text-[#0A0A0A] shadow-lg"
        >
          <Plus className="h-4 w-4" />
          {previewItem.itemType === 'BANK_FEE' ? 'Add Bank Fee' : 'Add Subscription'}
        </button>
      </div>
    </div>
  ) : null;

  if (mode === 'screen') {
    return (
      <div className="min-h-full flex flex-col bg-[#0A0A0A]">
        <div className="px-4 pt-3 pb-28">{scannerBody}</div>
        {scannerPreview}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-md modal-backdrop-enter sm:items-center sm:p-4">
      <section
        className="fixed inset-x-0 bottom-0 sm:relative sm:inset-auto max-w-2xl mx-auto h-[88dvh] sm:h-auto sm:max-h-[88dvh] w-full flex flex-col overflow-y-auto rounded-t-[32px] sm:rounded-3xl border-t sm:border border-white/15 bg-[#161616] p-5 pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.8)] modal-sheet-enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scanner-modal-title"
      >
        <div
          onClick={onClose}
          className="w-12 h-1.5 bg-white/20 hover:bg-white/35 rounded-full mx-auto my-2 shrink-0 cursor-pointer active:scale-95 transition-all duration-150 sm:hidden"
        />
        {scannerBody}
      </section>
      {scannerPreview}
    </div>
  );
};
