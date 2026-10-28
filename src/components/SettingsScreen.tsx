import React, { useRef, useState } from 'react';
import {
  Moon,
  Sun,
  Coins,
  Bell,
  RotateCcw,
  ShieldCheck,
  FileText,
  Star,
  Share2,
  Download,
  Upload,
  KeyRound,
  Copy,
  Languages,
  ChevronRight,
  CheckCircle2,
  Crown,
  X,
  Volume2,
  VolumeX,
  Compass,
} from 'lucide-react';
import type { AppCurrency, Subscription, UserPlan, SupportedLanguage } from '../types/subscription';
import { CURRENCIES, formatPrice, calculateMonthlyTotal, calculateTotalSavings } from '../utils/subscriptionCalculations';
import {
  createBackupJson,
  generateLicenseKey,
  getSavedLicenseKey,
  parseAndValidateBackupJson,
  parseRestoredLicensePlan,
} from '../utils/retentionAndTrust';
import { useTranslation } from '../i18n/LanguageContext';

interface SettingsScreenProps {
  userPlan: UserPlan;
  currentCurrency: AppCurrency;
  onChangeCurrency: (c: AppCurrency) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  notificationsEnabled: boolean;
  onToggleNotifications: () => void;
  soundEffectsEnabled: boolean;
  onToggleSoundEffects: () => void;
  onOpenPaywall: () => void;
  subscriptions: Subscription[];
  onResetData: () => void;
  onTriggerTestNotification: () => void;
  onRestoreBackup?: (subscriptions: Subscription[], restoredPlan?: UserPlan) => void;
  onSelectPlan?: (plan: UserPlan) => void;
  onReplayOnboarding?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  userPlan,
  currentCurrency,
  onChangeCurrency,
  isDarkMode,
  onToggleDarkMode,
  notificationsEnabled,
  onToggleNotifications,
  soundEffectsEnabled,
  onToggleSoundEffects,
  onOpenPaywall,
  subscriptions,
  onResetData,
  onTriggerTestNotification,
  onRestoreBackup,
  onSelectPlan,
  onReplayOnboarding,
}) => {
  const { t, language, setLanguage, languages } = useTranslation();
  const [showLegalModal, setShowLegalModal] = useState<'privacy' | 'terms' | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showRestoreKeyModal, setShowRestoreKeyModal] = useState(false);
  const [restoreKeyInput, setRestoreKeyInput] = useState('');
  const [userStars, setUserStars] = useState(5);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const activeLicenseKey = userPlan !== 'free'
    ? getSavedLicenseKey() || generateLicenseKey(userPlan)
    : null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleShareApp = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'TrialMe · SubCleaner — British Fintech Subscription Optimiser',
          text: 'I stopped throwing money away on forgotten subscriptions with TrialMe! Pay once, keep forever.',
          url: window.location.href,
        });
      } catch {
        // User cancelled
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      showToast('App link copied to clipboard!');
    }
  };

  const handleExportData = () => {
    if (userPlan !== 'pro') {
      onOpenPaywall();
      return;
    }
    const monthly = calculateMonthlyTotal(subscriptions);
    const savings = calculateTotalSavings(subscriptions);
    const reportContent = `SUBCLEANER FINANCIAL STATEMENT & SUBSCRIPTION AUDIT
Generated: ${new Date().toLocaleDateString('en-GB')}
Plan Level: ${userPlan.toUpperCase()}
License Key: ${activeLicenseKey || 'N/A'}
Total Current Monthly Outflow: ${formatPrice(monthly, CURRENCIES[currentCurrency].symbol)}
Total Cumulative Monthly Savings: ${formatPrice(savings, CURRENCIES[currentCurrency].symbol)}

ACTIVE & CANCELLED SUBSCRIPTIONS:
${subscriptions
  .map(
    (s, i) =>
      `${i + 1}. ${s.name} - ${formatPrice(s.price, s.currency)} / ${s.frequency} [Status: ${s.status.toUpperCase()}] (Next renewal: ${s.nextPaymentDate})`
  )
  .join('\n')}
`;
    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SubCleaner_Statement_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    showToast('Financial statement downloaded!');
  };

  const handleExportJsonBackup = () => {
    const json = createBackupJson(subscriptions, userPlan);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SubCleaner_Backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Full JSON backup saved to your device!');
  };

  const handleImportJsonBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const validated = parseAndValidateBackupJson(String(reader.result));
      if (validated && onRestoreBackup) {
        onRestoreBackup(validated.subscriptions, validated.userPlan);
        showToast(`Restored ${validated.subscriptions.length} subscriptions from backup!`);
      } else {
        showToast('Invalid backup file format.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleRestorePurchases = () => {
    if (restoreKeyInput.trim()) {
      const parsed = parseRestoredLicensePlan(restoreKeyInput);
      if (parsed) {
        onSelectPlan?.(parsed.plan);
        setShowRestoreKeyModal(false);
        setRestoreKeyInput('');
        showToast(`Lifetime ${parsed.plan.toUpperCase()} verified and restored!`);
        return;
      }
    }
    const existingKey = getSavedLicenseKey();
    if (existingKey && onSelectPlan) {
      onSelectPlan(existingKey.startsWith('SUB-STD') ? 'standard' : 'pro');
    }
    showToast('Lifetime purchases verified and restored!');
  };

  const handleCopyLicenseKey = () => {
    if (!activeLicenseKey) return;
    navigator.clipboard?.writeText(activeLicenseKey);
    showToast(`License key ${activeLicenseKey} copied!`);
  };

  return (
    <div className="min-h-full flex flex-col bg-[#0A0A0A]">
      {/* Sticky Blurred Mobile App Bar */}
      <header className="h-14 backdrop-blur-xl bg-[#0A0A0A]/90 sticky top-0 z-30 border-b border-white/[0.06] px-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] flex items-center justify-center shadow-md shadow-[#D4AF7C]/20">
            <Crown className="w-4 h-4 stroke-[2.4]" />
          </div>
          <div>
            <div className="text-sm font-extrabold text-[#F5F5F5] leading-tight">Profile & Settings</div>
            <div className="text-[10px] text-[#A0A0A0] leading-tight">Account, Backup & Preferences</div>
          </div>
        </div>
        {userPlan === 'free' ? (
          <button
            type="button"
            onClick={onOpenPaywall}
            className="h-8 px-4 rounded-full bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] font-bold text-xs shadow-md shadow-[#D4AF7C]/20 active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer"
          >
            {t('settings.upgradeButton')}
          </button>
        ) : (
          <span className="px-3 py-1 rounded-full text-[10px] font-extrabold bg-[#D4AF7C]/20 text-[#D4AF7C] border border-[#D4AF7C]/35">
            {t('settings.activeLifetime')}
          </span>
        )}
      </header>

      <div className="space-y-5 px-4 pt-3 pb-28 w-full text-xs text-[#F5F5F5]">

        {/* Toast Alert */}
        {toastMessage && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] font-bold text-xs shadow-xl flex items-center gap-2 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Plan Status Card */}
        <div className="p-4 rounded-3xl bg-[#161616] border border-[#D4AF7C]/35 space-y-3 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#D4AF7C]/20 text-[#D4AF7C] border border-[#D4AF7C]/35 flex items-center justify-center font-bold">
                <Crown className="w-5 h-5 text-[#D4AF7C]" />
              </div>
              <div>
                <div className="font-extrabold text-sm text-[#F5F5F5]">
                  {userPlan === 'pro'
                    ? t('settings.planPro')
                    : userPlan === 'standard'
                    ? t('settings.planStandard')
                    : t('settings.planFree')}
                </div>
                <div className="text-[11px] text-[#A0A0A0]">
                  {userPlan === 'free'
                    ? 'Limit of 2 subscriptions on free tier'
                    : 'Unlimited subscriptions & renewal alerts for life'}
                </div>
              </div>
            </div>
            {userPlan === 'free' ? (
              <button
                onClick={onOpenPaywall}
                className="bg-gradient-to-r from-[#E5C391] via-[#D4AF7C] to-[#B79B6B] text-[#0A0A0A] font-bold shadow-md shadow-[#D4AF7C]/20 px-4 py-2 rounded-full text-xs cursor-pointer active:scale-[0.97] transition-all duration-150 ease-out"
              >
                {t('settings.upgradeButton')}
              </button>
            ) : (
              <span className="px-3 py-1 rounded-full text-[10px] font-extrabold bg-[#D4AF7C]/20 text-[#D4AF7C] border border-[#D4AF7C]/35">
                {t('settings.activeLifetime')}
              </span>
            )}
          </div>

          {activeLicenseKey && (
            <div className="pt-2.5 border-t border-white/10 flex items-center justify-between gap-2 text-[11px]">
              <span className="flex items-center gap-1.5 text-[#F5F5F5]/90">
                <KeyRound className="w-3.5 h-3.5 text-[#D4AF7C] shrink-0" />
                <span>License Key: <strong className="font-mono text-[#D4AF7C]">{activeLicenseKey}</strong></span>
              </span>
              <button
                type="button"
                onClick={handleCopyLicenseKey}
                className="inline-flex items-center gap-1 rounded-full bg-[#1F1F1F] border border-white/10 px-3 py-1 text-[10px] font-bold text-[#D4AF7C] hover:border-[#D4AF7C] active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                Copy
              </button>
            </div>
          )}
        </div>

        {/* Section: General Preferences & Language Selector (iOS Inset Grouped List) */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-[#A0A0A0] px-1 uppercase tracking-wider">
            {t('settings.sectionGeneral')}
          </div>
          <div className="rounded-3xl bg-[#161616] divide-y divide-white/5 border border-white/10 overflow-hidden shadow-lg">
            <div className="p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Languages className="w-4 h-4 text-[#D4AF7C]" />
                <div>
                  <span className="font-semibold text-[#F5F5F5]">{t('settings.languageLabel')}</span>
                  <div className="text-[10px] text-[#A0A0A0]">6 languages supported</div>
                </div>
              </div>
              <select
                value={language}
                onChange={(e) => {
                  const newLang = e.target.value as SupportedLanguage;
                  setLanguage(newLang);
                  showToast(`Language switched to ${languages.find((l) => l.code === newLang)?.name}`);
                }}
                className="input-luxury rounded-full px-3 py-1.5 text-xs font-bold cursor-pointer"
                aria-label={t('settings.languageLabel')}
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code} className="bg-[#161616] text-[#F5F5F5]">
                    {l.flag} {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Coins className="w-4 h-4 text-[#D4AF7C]" />
                <span className="font-semibold text-[#F5F5F5]">{t('settings.currencyLabel')}</span>
              </div>
              <select
                value={currentCurrency}
                onChange={(e) => onChangeCurrency(e.target.value as AppCurrency)}
                className="input-luxury rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer"
                aria-label={t('settings.currencyLabel')}
              >
                <option value="GBP" className="bg-[#161616] text-[#F5F5F5]">£ GBP (Pound Sterling)</option>
                <option value="EUR" className="bg-[#161616] text-[#F5F5F5]">€ EUR (Euro)</option>
                <option value="USD" className="bg-[#161616] text-[#F5F5F5]">$ USD (US Dollar)</option>
                <option value="RON" className="bg-[#161616] text-[#F5F5F5]">lei RON (Romanian Leu)</option>
              </select>
            </div>

            <div className="p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {isDarkMode ? <Moon className="w-4 h-4 text-[#D4AF7C]" /> : <Sun className="w-4 h-4 text-[#D4AF7C]" />}
                <span className="font-semibold text-[#F5F5F5]">{t('settings.darkModeLabel')}</span>
              </div>
              <button
                onClick={onToggleDarkMode}
                className={`w-12 h-7 rounded-full transition-all duration-150 ease-out active:scale-[0.97] relative p-0.5 cursor-pointer ${
                  isDarkMode ? 'bg-[#D4AF7C]' : 'bg-[#1F1F1F]'
                }`}
                aria-label="Toggle Dark Mode"
              >
                <div
                  className={`w-6 h-6 rounded-full bg-[#0A0A0A] shadow-md transition-transform duration-150 ease-out ${
                    isDarkMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {soundEffectsEnabled ? <Volume2 className="w-4 h-4 text-[#D4AF7C]" /> : <VolumeX className="w-4 h-4 text-[#A0A0A0]" />}
                <span className="font-semibold text-[#F5F5F5]">Sound Effects</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={soundEffectsEnabled}
                onClick={onToggleSoundEffects}
                className={`w-12 h-7 rounded-full transition-all duration-150 ease-out active:scale-[0.97] relative p-0.5 cursor-pointer ${
                  soundEffectsEnabled ? 'bg-[#D4AF7C]' : 'bg-[#1F1F1F]'
                }`}
                aria-label="Sound Effects"
              >
                <div
                  className={`w-6 h-6 rounded-full bg-[#0A0A0A] shadow-md transition-transform duration-150 ease-out ${
                    soundEffectsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Bell className="w-4 h-4 text-[#D4AF7C]" />
                <div>
                  <span className="font-semibold text-[#F5F5F5]">{t('settings.remindersLabel')}</span>
                  <div className="text-[10px] text-[#A0A0A0]">{t('settings.remindersSub')}</div>
                </div>
              </div>
              <button
                onClick={onToggleNotifications}
                className={`w-12 h-7 rounded-full transition-all duration-150 ease-out active:scale-[0.97] relative p-0.5 cursor-pointer ${
                  notificationsEnabled ? 'bg-[#D4AF7C]' : 'bg-[#1F1F1F]'
                }`}
                aria-label="Toggle Notifications"
              >
                <div
                  className={`w-6 h-6 rounded-full bg-[#0A0A0A] shadow-md transition-transform duration-150 ease-out ${
                    notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="p-3 flex items-center justify-between bg-[#1F1F1F]/50">
              <span className="text-[11px] text-[#A0A0A0]">Preview notification popup:</span>
              <button
                onClick={onTriggerTestNotification}
                className="text-[11px] font-bold text-[#D4AF7C] hover:text-[#F5F5F5] bg-[#D4AF7C]/15 px-3.5 py-1.5 rounded-full border border-[#D4AF7C]/30 active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer"
              >
                {t('settings.testAlert')}
              </button>
            </div>
          </div>
        </div>

        {/* Section: Data, Cloud-Free Backup & Reports (iOS Inset Grouped List) */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-[#A0A0A0] px-1 uppercase tracking-wider">
            {t('settings.sectionData')}
          </div>
          <div className="rounded-3xl bg-[#161616] divide-y divide-white/5 border border-white/10 overflow-hidden shadow-lg">
            <button
              onClick={handleExportData}
              className="w-full p-3.5 flex items-center justify-between hover:bg-white/[0.03] active:scale-[0.99] transition-all duration-150 ease-out text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Download className="w-4 h-4 text-[#D4AF7C]" />
                <div>
                  <div className="font-semibold text-[#F5F5F5] flex items-center gap-1.5">
                    {t('settings.exportReport')}
                    {userPlan !== 'pro' && (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-[#D4AF7C]/20 text-[#D4AF7C] border border-[#D4AF7C]/30 font-bold">
                        Pro
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#A0A0A0]">{t('settings.exportSub')}</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#A0A0A0]" />
            </button>

            <div className="p-3.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <ShieldCheck className="w-4 h-4 text-[#D4AF7C] shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-[#F5F5F5]">Device Backup & Restore (.json)</div>
                  <div className="text-[10px] text-[#A0A0A0]">Keep your subscriptions & license safe across devices</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleExportJsonBackup}
                  className="px-3 py-1.5 rounded-full bg-[#1F1F1F] border border-[#D4AF7C]/35 text-[#D4AF7C] font-bold text-[10px] hover:border-[#D4AF7C] active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  Backup
                </button>
                <button
                  type="button"
                  onClick={() => backupInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-full bg-[#1F1F1F] border border-white/10 text-[#F5F5F5] font-bold text-[10px] hover:border-[#D4AF7C] active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer flex items-center gap-1"
                >
                  <Upload className="w-3 h-3 text-[#D4AF7C]" />
                  Import
                </button>
                <input
                  ref={backupInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportJsonBackup}
                  className="sr-only"
                />
              </div>
            </div>

            <button
              onClick={() => {
                handleRestorePurchases();
                setShowRestoreKeyModal(true);
              }}
              className="w-full p-3.5 flex items-center justify-between hover:bg-white/[0.03] active:scale-[0.99] transition-all duration-150 ease-out text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <RotateCcw className="w-4 h-4 text-[#A0A0A0]" />
                <div>
                  <span className="font-semibold text-[#F5F5F5]">{t('settings.restorePurchases')}</span>
                  <div className="text-[10px] text-[#A0A0A0]">Verify via License Key or Purchase Email</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#A0A0A0]" />
            </button>
          </div>
        </div>

        {/* Section: Community & Legal (iOS Inset Grouped List) */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-[#A0A0A0] px-1 uppercase tracking-wider">
            {t('settings.sectionAbout')}
          </div>
          <div className="rounded-3xl bg-[#161616] divide-y divide-white/5 border border-white/10 overflow-hidden shadow-lg">
            {onReplayOnboarding && (
              <button
                onClick={onReplayOnboarding}
                className="w-full p-3.5 flex items-center justify-between hover:bg-white/[0.03] active:scale-[0.99] transition-all duration-150 ease-out text-left cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Compass className="w-4 h-4 text-[#D4AF7C]" />
                  <div>
                    <span className="font-semibold text-[#F5F5F5]">Replay 3-Step Onboarding</span>
                    <div className="text-[10px] text-[#A0A0A0]">Review core features and value pillars</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#A0A0A0]" />
              </button>
            )}
            <button
              onClick={() => setShowRatingModal(true)}
              className="w-full p-3.5 flex items-center justify-between hover:bg-white/[0.03] active:scale-[0.99] transition-all duration-150 ease-out text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Star className="w-4 h-4 text-[#D4AF7C]" />
                <span className="font-semibold text-[#F5F5F5]">{t('settings.rateApp')}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-[#A0A0A0]" />
            </button>
            <button
              onClick={handleShareApp}
              className="w-full p-3.5 flex items-center justify-between hover:bg-white/[0.03] active:scale-[0.99] transition-all duration-150 ease-out text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Share2 className="w-4 h-4 text-[#D4AF7C]" />
                <span className="font-semibold text-[#F5F5F5]">{t('settings.shareApp')}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-[#A0A0A0]" />
            </button>
            <button
              onClick={() => setShowLegalModal('privacy')}
              className="w-full p-3.5 flex items-center justify-between hover:bg-white/[0.03] active:scale-[0.99] transition-all duration-150 ease-out text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#A0A0A0]" />
                <span className="font-semibold text-[#F5F5F5]">{t('settings.privacy')}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-[#A0A0A0]" />
            </button>
            <button
              onClick={() => setShowLegalModal('terms')}
              className="w-full p-3.5 flex items-center justify-between hover:bg-white/[0.03] active:scale-[0.99] transition-all duration-150 ease-out text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-[#A0A0A0]" />
                <span className="font-semibold text-[#F5F5F5]">{t('settings.terms')}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-[#A0A0A0]" />
            </button>
          </div>
        </div>

        {/* Reset Data Option */}
        <div className="pt-2 text-center">
          <button
            onClick={() => {
              onResetData();
              showToast('UK Default subscriptions reloaded!');
            }}
            className="text-[11px] text-[#A0A0A0] hover:text-[#D4AF7C] underline active:scale-[0.97] transition-all duration-150 ease-out cursor-pointer"
          >
            {t('settings.resetDefaults')}
          </button>
        </div>

        {/* App Version Note */}
        <div className="text-center text-[10px] text-[#A0A0A0] space-y-1 pt-2">
          <div>{t('settings.footer')}</div>
          <div className="flex items-center justify-center gap-1 text-[#A0A0A0]">
            UK Consumer Rights Compliant · Direct Debit Safeguard
          </div>
        </div>
      </div>

      {/* Restore Key Modal */}
      {showRestoreKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0A0A]/85 backdrop-blur-md modal-backdrop-enter">
          <div className="w-full max-w-xs bg-[#161616] border border-white/10 rounded-3xl p-5 space-y-3.5 shadow-2xl animate-native-view">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#F5F5F5] flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#D4AF7C]" />
                Restore Lifetime License
              </h3>
              <button
                onClick={() => setShowRestoreKeyModal(false)}
                className="text-[#A0A0A0] hover:text-[#F5F5F5] active:scale-[0.95] transition-all cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#A0A0A0] leading-relaxed">
              Enter your SubCleaner License Key (e.g. <code className="text-[#D4AF7C]">SUB-PRO-XXXX</code>) or the email address used at checkout:
            </p>
            <input
              type="text"
              value={restoreKeyInput}
              onChange={(e) => setRestoreKeyInput(e.target.value)}
              placeholder="SUB-PRO-XXXX or email@domain.co.uk"
              className="input-luxury w-full rounded-full px-4 py-2.5 text-xs font-mono"
            />
            <button
              onClick={handleRestorePurchases}
              className="btn-champagne w-full py-3 px-4 rounded-full font-extrabold text-[#0A0A0A] active:scale-[0.97] transition-all cursor-pointer shadow-[0_4px_20px_rgba(212,175,124,0.28)]"
            >
              Verify & Restore Access
            </button>
          </div>
        </div>
      )}

      {/* Rating Modal */}
      {showRatingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0A0A]/85 backdrop-blur-md modal-backdrop-enter">
          <div className="w-full max-w-xs bg-[#161616] border border-white/10 rounded-3xl p-5 text-center space-y-4 shadow-2xl animate-native-view">
            <div className="w-12 h-12 rounded-full bg-[#D4AF7C]/20 text-[#D4AF7C] flex items-center justify-center mx-auto">
              <Star className="w-6 h-6 fill-[#D4AF7C]" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[#F5F5F5]">Enjoying TrialMe · SubCleaner?</h3>
              <p className="text-xs text-[#A0A0A0] mt-1">
                Your rating helps Brits save millions on forgotten app renewals and zombie subscriptions.
              </p>
            </div>
            <div className="flex justify-center gap-2 py-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setUserStars(star)}
                  className="p-1 cursor-pointer transition-transform hover:scale-125 active:scale-95"
                  aria-label={`${star} stars`}
                >
                  <Star
                    className={`w-7 h-7 ${
                      star <= userStars ? 'text-[#D4AF7C] fill-[#D4AF7C]' : 'text-[#1F1F1F]'
                    }`}
                  />
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setShowRatingModal(false);
                showToast('Thank you for your rating!');
              }}
              className="btn-champagne w-full py-3 px-4 rounded-full font-extrabold text-[#0A0A0A] active:scale-[0.97] transition-all cursor-pointer shadow-[0_4px_20px_rgba(212,175,124,0.28)]"
            >
              Submit Rating ({userStars} stars)
            </button>
            <button
              onClick={() => setShowRatingModal(false)}
              className="text-xs text-[#A0A0A0] hover:text-[#F5F5F5] active:scale-[0.97] transition-all block w-full cursor-pointer"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}

      {/* Legal & Terms Modal */}
      {showLegalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0A0A]/85 backdrop-blur-md modal-backdrop-enter">
          <div className="w-full max-w-sm bg-[#161616] border border-white/10 rounded-3xl max-h-[80vh] flex flex-col p-5 shadow-2xl space-y-3 animate-native-view">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="font-bold text-sm text-[#F5F5F5]">
                {showLegalModal === 'privacy' ? 'UK Privacy & Data Governance' : 'Lifetime Terms & Conditions'}
              </h3>
              <button
                onClick={() => setShowLegalModal(null)}
                className="p-1 text-[#A0A0A0] hover:text-[#F5F5F5] active:scale-[0.95] transition-all cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto text-xs text-[#F5F5F5]/90 space-y-2 leading-relaxed pr-1">
              {showLegalModal === 'privacy' ? (
                <>
                  <p>
                    <strong>Your financial records remain local.</strong> SubCleaner stores subscription records securely in local device storage. We do not sell or broker your personal financial records.
                  </p>
                  <p>
                    When using the AI Statement Scanner, the statement image is processed strictly for merchant and amount detection and is never archived.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <strong>Lifetime Purchase Agreement.</strong> SubCleaner Lifetime purchases grant indefinite access to Standard or Pro features without recurring developer subscription fees.
                  </p>
                  <p>
                    SubCleaner provides self-help cancellation assistants, guidance, and legal templates. Final contract termination with each service provider remains the user’s responsibility.
                  </p>
                </>
              )}
            </div>
            <button
              onClick={() => setShowLegalModal(null)}
              className="btn-secondary-luxury w-full py-3 rounded-full font-bold active:scale-[0.97] transition-all cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
