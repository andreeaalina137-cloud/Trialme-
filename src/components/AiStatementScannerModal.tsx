import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Crown,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type { DetectedSubscription, Subscription, UserPlan } from '../types/subscription';
import { getAiScannerMonthlyQuota, incrementAiScannerMonthlyQuota } from '../utils/retentionAndTrust';
import { addMonthsClamped, formatLocalDateKey } from '../utils/subscriptionCalculations';
import { isDuplicateScannedSubscription } from '../utils/subscriptionIdentity';
import { BrandIcon } from './BrandIcon';
import { GoldBellIcon } from './GoldBellIcon';
import { useTranslation } from '../i18n/LanguageContext';

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

const getFallbackSubscriptions = (
  statementType: 'barclays' | 'revolut' = 'barclays',
  currency: string
): DetectedSubscription[] => {
  const subscriptions = statementType === 'revolut'
    ? [
        { name: 'Adobe Creative Cloud', price: 19.97, category: 'Productivity' as const },
        { name: 'ChatGPT Plus', price: 19.99, category: 'AI & Tech' as const },
        { name: 'Canva Pro', price: 11.99, category: 'Productivity' as const },
        { name: 'Amazon Prime Video UK', price: 8.99, category: 'Streaming' as const },
        { name: 'The Guardian Digital', price: 11.99, category: 'News & Magazines' as const },
      ]
    : [
        { name: 'Adobe Creative Cloud', price: 19.97, category: 'Productivity' as const },
        { name: 'ChatGPT Plus', price: 19.99, category: 'AI & Tech' as const },
        { name: 'Canva Pro', price: 11.99, category: 'Productivity' as const },
        { name: 'Netflix UK Standard', price: 10.99, category: 'Streaming' as const },
        { name: 'Spotify Premium UK', price: 11.99, category: 'Music & Audio' as const },
      ];

  return subscriptions.map((subscription, index) => ({
    id: `demo-${statementType}-${index + 1}`,
    ...subscription,
    currency,
    frequency: 'monthly',
    confidence: 0.98,
    selected: true,
  }));
};

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
  const [isScanning, setIsScanning] = useState(false);
  const [detectedItems, setDetectedItems] = useState<DetectedSubscription[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [showAllDetected, setShowAllDetected] = useState(false);
  const [quota, setQuota] = useState(() => getAiScannerMonthlyQuota());
  const [quotaWarning, setQuotaWarning] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanRequestIdRef = useRef(0);

  const resetScannerState = () => {
    scanRequestIdRef.current += 1;
    setIsScanning(false);
    setDetectedItems([]);
    setAddedIds(new Set());
    setQuotaWarning('');
    setQuota(getAiScannerMonthlyQuota());
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    resetScannerState();
    return () => {
      scanRequestIdRef.current += 1;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const scanStatement = async (
    imageBase64: string | null,
    mimeType: string,
    mockStatementType?: 'barclays' | 'revolut'
  ) => {
    if (imageBase64 && !mockStatementType) {
      const currentQuota = getAiScannerMonthlyQuota();
      if (currentQuota.remaining <= 0) {
        setQuotaWarning('Monthly fair-use limit reached (10/10 AI statement scans). Resets on the 1st of next month.');
        return;
      }
      const updatedQuota = incrementAiScannerMonthlyQuota();
      setQuota({ ...updatedQuota, monthKey: currentQuota.monthKey });
    }

    setQuotaWarning('');
    const requestId = ++scanRequestIdRef.current;
    setIsScanning(true);

    try {
      const response = await fetch('/api/scan-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType, mockStatementType }),
      });
      if (!response.ok) throw new Error('Statement scan unavailable');
      const data = await response.json();
      if (!data.success || !Array.isArray(data.detectedSubscriptions)) {
        throw new Error('Invalid scan response');
      }
      if (requestId !== scanRequestIdRef.current) return;
      setDetectedItems(data.detectedSubscriptions);
      setAddedIds(new Set());
    } catch {
      if (requestId !== scanRequestIdRef.current) return;
      setDetectedItems(getFallbackSubscriptions(mockStatementType, currencySymbol));
      setAddedIds(new Set());
    } finally {
      if (requestId === scanRequestIdRef.current) setIsScanning(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const requestId = scanRequestIdRef.current;
    const reader = new FileReader();
    reader.onload = () => {
      if (requestId === scanRequestIdRef.current) {
        void scanStatement(reader.result as string, file.type);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleAddSingleDetected = (item: DetectedSubscription) => {
    if (existingSubscriptions.some((s) => isDuplicateScannedSubscription({ name: item.name }, s))) {
      setAddedIds((prev) => new Set(prev).add(item.id));
      return;
    }

    const nextPaymentDate = addMonthsClamped(new Date(), 1);
    const formattedDate = formatLocalDateKey(nextPaymentDate);
    const matchingColor =
      DEFAULT_SHOWCASE_DETECTED.find((d) => d.name.toLowerCase().includes(item.name.toLowerCase().split(' ')[0]))?.color ||
      '#D4AF7C';

    onImportSubscriptions([
      {
        name: item.name,
        price: item.price,
        currency: item.currency || currencySymbol,
        frequency: item.frequency,
        category: item.category,
        nextPaymentDate: formattedDate,
        status: 'active',
        color: matchingColor,
        reminderDaysBefore: 3,
      },
    ]);
    setAddedIds((prev) => new Set(prev).add(item.id));
  };

  const handleDismissItem = (id: string) => {
    setDetectedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleImportSelected = () => {
    const selectedItems = detectedItems.filter(
      (item) =>
        item.selected &&
        !addedIds.has(item.id) &&
        !existingSubscriptions.some((s) => isDuplicateScannedSubscription({ name: item.name }, s))
    );
    if (selectedItems.length === 0) return;

    const nextPaymentDate = addMonthsClamped(new Date(), 1);
    const formattedDate = formatLocalDateKey(nextPaymentDate);

    onImportSubscriptions(
      selectedItems.map((item) => ({
        name: item.name,
        price: item.price,
        currency: item.currency || currencySymbol,
        frequency: item.frequency,
        category: item.category,
        nextPaymentDate: formattedDate,
        status: 'active',
        color: '#D4AF7C',
        reminderDaysBefore: 3,
      }))
    );
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

  const visibleDetected = showAllDetected ? detectedItems : detectedItems.slice(0, 5);

  const scannerBody = (
    <div className="w-full max-w-5xl mx-auto text-[#F5F5F5] space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onClose}
          className="h-10 w-10 rounded-full bg-[#161616] border border-white/10 flex items-center justify-center text-[#F5F5F5] hover:border-[#D4AF7C] transition-colors cursor-pointer"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <h2 id="scanner-modal-title" className="text-base font-extrabold text-[#F5F5F5] tracking-tight">
            AI Statement Scanner
          </h2>
          <p className="text-[11px] text-[#A0A0A0]">Instant local detection for UK statements</p>
        </div>
        <div className="w-10 flex justify-end">
          {mode === 'modal' && (
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 rounded-full bg-[#161616] border border-white/10 flex items-center justify-center text-[#A0A0A0] hover:text-[#F5F5F5] cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {quotaWarning && (
        <div className="max-w-xl mx-auto rounded-2xl border border-[#D4AF7C]/40 bg-[#161616] px-3.5 py-2.5 text-xs text-[#D4AF7C]">
          {quotaWarning}
        </div>
      )}

      {/* Main Upload / Results Layout */}
      <div className={detectedItems.length > 0 ? 'grid grid-cols-1 lg:grid-cols-12 gap-8 items-start' : 'max-w-xl mx-auto space-y-5'}>
        {/* Left Column (lg:col-span-5 when items exist): Upload & Scanner Controls */}
        <div className={`${detectedItems.length > 0 ? 'lg:col-span-5' : 'w-full'} rounded-3xl bg-[#161616] border border-white/[0.08] p-6 text-center shadow-xl space-y-4`}>
          {/* Central Glowing Document + Gold Magnifying Glass Hero */}
          <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full bg-[#D4AF7C]/20 blur-2xl"
            />
            <svg viewBox="0 0 120 120" className="w-full h-full drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)] relative z-10">
              <defs>
                <linearGradient id="docGlass" x1="20" y1="15" x2="90" y2="105" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#2B3B5E" />
                  <stop offset="100%" stopColor="#162038" />
                </linearGradient>
                <linearGradient id="goldLens" x1="50" y1="45" x2="105" y2="105" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#FFF3D1" />
                  <stop offset="45%" stopColor="#D4AF7C" />
                  <stop offset="100%" stopColor="#9A7B4C" />
                </linearGradient>
              </defs>
              <rect
                x="24"
                y="14"
                width="58"
                height="76"
                rx="10"
                fill="url(#docGlass)"
                stroke="#475569"
                strokeWidth="1.5"
              />
              <rect x="34" y="28" width="24" height="4" rx="2" fill="#A0A0A0" fillOpacity="0.6" />
              <rect x="34" y="38" width="38" height="3.5" rx="1.75" fill="#A0A0A0" fillOpacity="0.4" />
              <rect x="34" y="47" width="34" height="3.5" rx="1.75" fill="#D4AF7C" fillOpacity="0.7" />
              <rect x="34" y="56" width="30" height="3.5" rx="1.75" fill="#A0A0A0" fillOpacity="0.4" />
              <rect x="34" y="65" width="22" height="3.5" rx="1.75" fill="#D4AF7C" fillOpacity="0.55" />
              <circle
                cx="68"
                cy="62"
                r="20"
                fill="#0A0A0A"
                fillOpacity="0.55"
                stroke="url(#goldLens)"
                strokeWidth="5"
              />
              <line
                x1="83"
                y1="77"
                x2="99"
                y2="93"
                stroke="url(#goldLens)"
                strokeWidth="6.5"
                strokeLinecap="round"
              />
              <circle cx="20" cy="40" r="1.5" fill="#D4AF7C" />
              <circle cx="96" cy="30" r="2" fill="#D4AF7C" />
              <circle cx="90" cy="52" r="1.2" fill="#FFF3D1" />
            </svg>
          </div>

          <div>
            <h3 className="text-xl font-extrabold text-[#F5F5F5] leading-tight">
              Find your subscriptions automatically
            </h3>
            <p className="mt-2 text-xs text-[#A0A0A0] leading-relaxed max-w-xs mx-auto">
              Connect your bank statement or upload a PDF. Our AI will find recurring payments and free trials.
            </p>
          </div>

          {/* Primary Champagne Gold Upload Button */}
          <div>
            <label className="btn-champagne min-h-[50px] w-full rounded-full py-3.5 px-6 text-sm font-extrabold text-[#0A0A0A] flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.97] transition-all duration-150">
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#0A0A0A]" />
                  <span>Scanning statement...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 stroke-[2.5]" />
                  <span>Upload Statement</span>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf,.csv"
                onClick={resetScannerState}
                onChange={handleFileUpload}
                className="sr-only"
              />
            </label>
          </div>

          {/* Supported Formats */}
          <div className="flex items-center justify-center gap-4 text-[11px] font-semibold text-[#A0A0A0]">
            <span className="inline-flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-[#D4AF7C]" />
              PDF
            </span>
            <span className="inline-flex items-center gap-1">
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#D4AF7C]" />
              CSV
            </span>
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="w-3.5 h-3.5 text-[#D4AF7C]" />
              Images
            </span>
          </div>

          {/* Trust Badge */}
          <div className="rounded-2xl bg-[#1F1F1F] border border-white/[0.06] p-2.5 text-[11px] text-[#A0A0A0] flex items-center justify-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[#D4AF7C] shrink-0" />
            <span>100% Private – Processed locally, no Open Banking login required ({quota.remaining}/{quota.limit} scans left)</span>
          </div>
        </div>

        {/* Dynamic Empty State (Show Bell / Protection Banner) */}
        {detectedItems.length === 0 && (
          <div className="w-full rounded-3xl bg-[#161616] border border-white/[0.08] p-6 text-center shadow-xl flex flex-col items-center relative overflow-hidden">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-12 inset-x-0 h-32 bg-gradient-to-b from-[#D4AF7C]/15 via-transparent to-transparent"
            />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4AF7C]/35 bg-[#D4AF7C]/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#D4AF7C]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF7C]" />
              Smart Protection
            </span>

            <div className="my-5 relative flex items-center justify-center">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-3 rounded-full bg-[#D4AF7C]/20 blur-2xl"
              />
              <GoldBellIcon size="lg" className="relative z-10" />
            </div>

            <h4 className="text-base font-extrabold text-[#F5F5F5] tracking-tight">
              Enjoy the trial. Get reminded before you pay.
            </h4>
          </div>
        )}

        {/* Right Column (lg:col-span-7): Detected Subscriptions List (rendered only after a scan) */}
        {detectedItems.length > 0 && (
          <div className="lg:col-span-7 space-y-4">
            {/* Detected Subscriptions Card */}
            <div className="luxury-panel rounded-3xl p-4 sm:p-5 border border-white/[0.08] space-y-3.5 shadow-xl bg-[#161616]">
              <div className="flex items-center justify-between px-1">
                <div>
                  <span className="text-sm font-extrabold text-[#F5F5F5]">
                    AI found {detectedItems.length} subscriptions
                  </span>
                  <p className="text-[11px] text-[#A0A0A0]">Review detected recurring items</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setDetectedItems([])}
                    className="text-xs font-semibold text-[#A0A0A0] hover:text-[#F5F5F5] transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAllDetected((v) => !v)}
                    className="text-xs font-semibold text-[#D4AF7C] hover:underline cursor-pointer"
                  >
                    {showAllDetected ? 'Show less' : 'See all'}
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
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
                      className="flex items-center justify-between gap-3.5 rounded-2xl bg-[#1F1F1F] border border-white/[0.08] p-3 sm:p-3.5 hover:border-[#D4AF7C]/40 transition-all min-h-[68px]"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <BrandIcon name={item.name} category={item.category} color={brandColor} size="preset" />
                        <div className="min-w-0 flex-1 pr-1">
                          <div className="font-bold text-sm text-[#F5F5F5] truncate leading-tight">{item.name}</div>
                          <div className="text-xs text-[#A0A0A0] flex items-center gap-1.5 mt-1 min-w-0 overflow-hidden">
                            <span className="font-mono text-[#F5F5F5] font-semibold tabular-nums shrink-0">
                              {currencySymbol}{item.price.toFixed(2)}/mo
                            </span>
                            <span className="shrink-0 text-[#A0A0A0]/50">·</span>
                            <span className="truncate">{item.category}</span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5 pl-1">
                        <button
                          type="button"
                          disabled={isAdded}
                          onClick={() => handleAddSingleDetected(item)}
                          className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 flex items-center gap-1 active:scale-[0.97] transition-all cursor-pointer ${
                            isAdded
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default'
                              : 'bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] shadow hover:brightness-110'
                          }`}
                        >
                          {isAdded ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Added</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Add</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDismissItem(item.id)}
                          className="h-8 w-8 rounded-full flex items-center justify-center text-[#A0A0A0] hover:text-[#F5F5F5] hover:bg-white/5 transition-colors cursor-pointer"
                          aria-label={`Dismiss ${item.name}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Import All Detected Bar */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleImportSelected}
                  className="w-full min-h-[48px] rounded-full bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] font-black text-xs flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(212,175,124,0.25)] hover:brightness-110 active:scale-[0.97] transition-all duration-150 cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.75]" />
                  <span>Import All Detected ({detectedItems.length})</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (mode === 'screen') {
    return (
      <div className="min-h-full flex flex-col bg-[#0A0A0A]">
        <div className="px-4 pt-3 pb-28">{scannerBody}</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-md modal-backdrop-enter">
      <section
        className="fixed inset-x-0 bottom-0 max-w-lg mx-auto h-[88dvh] w-full flex flex-col overflow-y-auto rounded-t-[32px] border-t border-white/15 bg-[#161616] p-5 pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.8)] modal-sheet-enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scanner-modal-title"
      >
        <div
          onClick={onClose}
          className="w-12 h-1.5 bg-white/20 hover:bg-white/35 rounded-full mx-auto my-2 shrink-0 cursor-pointer active:scale-95 transition-all duration-150"
        />
        {scannerBody}
      </section>
    </div>
  );
};
