import { useState, useEffect, useRef } from 'react';
import type { AppCurrency, AppNotification, Subscription, UserPlan } from './types/subscription';
import {
  CURRENCIES,
  canAddSubscription,
  convertFrequencyToMonthly,
  formatLocalDateKey,
  getDaysUntilNextPayment,
  normalizeRenewalDates,
  rollForwardPaymentDate,
  roundCurrency,
} from './utils/subscriptionCalculations';
import {
  downloadSubscriptionReminderIcs,
  getSubscriptionReminderDate,
} from './utils/calendarReminder';
import {
  isCurrentlyTrackedSubscription,
  isDuplicateScannedSubscription,
  isDuplicateSubscription,
  normalizeScannedSubscriptionName,
} from './utils/subscriptionIdentity';
import {
  loadPersistedSubscriptions,
  safeStorageGet,
  safeStorageSet,
  sanitizeCurrency,
  sanitizeUserPlan,
} from './utils/storage';
import { INITIAL_DEMO_SUBSCRIPTIONS } from './data/popularPresets';
import { LanguageProvider, useTranslation } from './i18n/LanguageContext';
import { Onboarding } from './components/Onboarding';
import { BottomNav, TabType } from './components/BottomNav';
import { HomeScreen } from './components/HomeScreen';
import { AddSubscriptionModal } from './components/AddSubscriptionModal';
import { SubscriptionDetailModal } from './components/SubscriptionDetailModal';
import { CancelAssistantModal } from './components/CancelAssistantModal';
import { PaywallModal } from './components/PaywallModal';
import { AiStatementScannerModal } from './components/AiStatementScannerModal';
import { SettingsScreen } from './components/SettingsScreen';
import { GiftSlotModal } from './components/GiftSlotModal';
import { NotificationBanner } from './components/NotificationBanner';
import {
  ConfirmTrialActivationModal,
  type PendingTrialActivation,
  type ConfirmedTrialPayload,
} from './components/ConfirmTrialActivationModal';
import { MobileFrameWrapper, type SidebarSection } from './components/MobileFrameWrapper';
import { ConfettiExplosion } from './components/ConfettiExplosion';
import type { ConfettiBurst, ConfettiOrigin } from './components/ConfettiExplosion';
import { playCashRegister, playNotificationSound, playSubtlePop, playTaDing } from './utils/soundEffects';
import { getBonusSlots, claimInviteCode } from './utils/inviteSystem';

function AppContent() {
  const { t } = useTranslation();
  const urlParams = new URLSearchParams(window.location.search);
  const autostart = urlParams.get('autostart') === '1';

  const [onboardingDone, setOnboardingDone] = useState<boolean>(() => {
    if (autostart) return true;
    return safeStorageGet('subcleaner_onboarding_done') === 'true';
  });

  const [subscriptions, setSubscriptions] = useState<Subscription[]>(() => {
    return normalizeRenewalDates(loadPersistedSubscriptions(INITIAL_DEMO_SUBSCRIPTIONS));
  });
  const subscriptionsRef = useRef<Subscription[]>(subscriptions);
  subscriptionsRef.current = subscriptions;
  const idCounterRef = useRef(0);

  const [userPlan, setUserPlan] = useState<UserPlan>(() => {
    return sanitizeUserPlan(safeStorageGet('subcleaner_user_plan'));
  });

  const [currency, setCurrency] = useState<AppCurrency>(() => {
    return sanitizeCurrency(safeStorageGet('subcleaner_currency'));
  });

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = safeStorageGet('subcleaner_dark_mode');
    return saved !== null ? saved === 'true' : true;
  });

  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    const saved = safeStorageGet('subcleaner_notifications');
    return saved !== null ? saved === 'true' : true;
  });

  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState<boolean>(() => {
    return safeStorageGet('subcleaner_sound_effects') !== 'false';
  });
  const [celebrationBurst, setCelebrationBurst] = useState<ConfettiBurst | null>(null);

  const triggerCelebration = (origin: ConfettiOrigin) => {
    setCelebrationBurst((current) => ({
      id: (current?.id ?? 0) + 1,
      origin,
    }));
  };

  const completeCelebration = (burstId: number) => {
    setCelebrationBurst((current) => (current?.id === burstId ? null : current));
  };

  // Navigation & Modals
  const [currentTab, setCurrentTab] = useState<TabType>('home');
  const [activeSection, setActiveSection] = useState<SidebarSection>('dashboard');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedDetailSub, setSelectedDetailSub] = useState<Subscription | null>(null);
  const [selectedCancelSub, setSelectedCancelSub] = useState<Subscription | null>(null);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [isAiScannerOpen, setIsAiScannerOpen] = useState(false);
  const [bonusSlots, setBonusSlots] = useState<number>(() => getBonusSlots());
  const [isGiftSlotOpen, setIsGiftSlotOpen] = useState(false);
  const [activeNotification, setActiveNotification] = useState<AppNotification | null>(null);
  const alertedDueSubscriptions = useRef(new Set<string>());

  // Free Trial Confirmation Flow
  const [pendingTrialActivation, setPendingTrialActivation] = useState<PendingTrialActivation | null>(() => {
    const saved = safeStorageGet('monetry_pending_trial') ?? safeStorageGet('subcleaner_pending_trial');
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.name === 'string') {
        // Exclude stale clicks older than 24 hours
        if (parsed.timestamp && Date.now() - parsed.timestamp > 24 * 60 * 60 * 1000) {
          return null;
        }
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });
  const [isConfirmTrialModalOpen, setIsConfirmTrialModalOpen] = useState(false);
  const trialLinkOpenedRef = useRef(false);

  // Detect when user returns to the app after clicking a Free Trial link
  useEffect(() => {
    const handleReturnToApp = () => {
      if (trialLinkOpenedRef.current || pendingTrialActivation) {
        setIsConfirmTrialModalOpen(true);
        trialLinkOpenedRef.current = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleReturnToApp();
      }
    };

    const handleFocus = () => {
      handleReturnToApp();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [pendingTrialActivation]);

  useEffect(() => {
    // Process referral/invite URL parameters (?invite=TM-XXXX or ?ref=TM-XXXX)
    const inviteParam = urlParams.get('invite') || urlParams.get('ref');
    if (inviteParam) {
      const claimResult = claimInviteCode(inviteParam);
      if (claimResult.success) {
        setBonusSlots(claimResult.bonusSlots);
        playTaDing();
        triggerCelebration({ x: 0.5, y: 0.5 });
        setActiveNotification({
          id: `welcome-invite-${Date.now()}`,
          title: '🎁 Welcome Bonus Unlocked!',
          message: 'You unlocked +1 free subscription slot from a friend’s invite (3 slots total)!',
          date: new Date().toISOString(),
          read: false,
          type: 'savings',
        });
        try {
          const cleanUrl = `${window.location.origin}${window.location.pathname}`;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch {
          // ignore
        }
      }
    }
  }, []);

  useEffect(() => {
    safeStorageSet('subcleaner_onboarding_done', onboardingDone ? 'true' : 'false');
  }, [onboardingDone]);

  useEffect(() => {
    // Auto-roll any past-due active renewal dates forward to the next valid billing cycle
    // (covers restored backups, manual edits to past dates, reactivations and day changes).
    const normalized = normalizeRenewalDates(subscriptions);
    if (normalized !== subscriptions) {
      subscriptionsRef.current = normalized;
      setSubscriptions(normalized);
      return;
    }
    const serialized = JSON.stringify(subscriptions);
    safeStorageSet('subcleaner_subscriptions_v2', serialized);
    safeStorageSet('subcleaner_subscriptions', serialized);
  }, [subscriptions]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isPaywallOpen) {
        setIsPaywallOpen(false);
      } else if (isGiftSlotOpen) {
        setIsGiftSlotOpen(false);
      } else if (isAiScannerOpen) {
        setIsAiScannerOpen(false);
      } else if (selectedCancelSub) {
        setSelectedCancelSub(null);
      } else if (selectedDetailSub) {
        setSelectedDetailSub(null);
      } else if (isAddModalOpen) {
        setIsAddModalOpen(false);
      } else if (currentTab !== 'home') {
        setCurrentTab('home');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPaywallOpen, isGiftSlotOpen, isAiScannerOpen, selectedCancelSub, selectedDetailSub, isAddModalOpen, currentTab]);

  useEffect(() => {
    safeStorageSet('subcleaner_user_plan', userPlan);
  }, [userPlan]);

  useEffect(() => {
    safeStorageSet('subcleaner_currency', currency);
  }, [currency]);

  useEffect(() => {
    safeStorageSet('subcleaner_dark_mode', isDarkMode ? 'true' : 'false');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    safeStorageSet('subcleaner_notifications', notificationsEnabled ? 'true' : 'false');
  }, [notificationsEnabled]);

  useEffect(() => {
    safeStorageSet('subcleaner_sound_effects', soundEffectsEnabled ? 'true' : 'false');
  }, [soundEffectsEnabled]);

  useEffect(() => {
    if (!onboardingDone || !notificationsEnabled) return;

    const now = new Date();
    const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    const dueSubscriptions = subscriptions.filter((subscription) => {
      if (subscription.status !== 'active' && subscription.status !== 'trial') return false;
      const dueDate = getSubscriptionReminderDate(subscription);
      if (!dueDate) return false;

      const daysUntilDue = getDaysUntilNextPayment(dueDate, today);
      const reminderDays = Number.isFinite(subscription.reminderDaysBefore) && subscription.reminderDaysBefore > 0
        ? Math.floor(subscription.reminderDaysBefore)
        : 3;
      if (daysUntilDue < 0 || daysUntilDue > reminderDays) return false;

      const storageKey = `subcleaner_due_alert:${subscription.id}:${today}`;
      if (alertedDueSubscriptions.current.has(storageKey)) return false;

      if (safeStorageGet(storageKey) === 'true') {
        alertedDueSubscriptions.current.add(storageKey);
        return false;
      }
      safeStorageSet(storageKey, 'true');

      alertedDueSubscriptions.current.add(storageKey);
      return true;
    });

    if (dueSubscriptions.length === 0) return;

    const firstSubscription = dueSubscriptions[0];
    setActiveNotification({
      id: `due-soon-${today}-${Date.now()}`,
      title: t('notifications.dueSoonTitle'),
      message: t(dueSubscriptions.length === 1 ? 'notifications.dueSoonMessageSingle' : 'notifications.dueSoonMessage', {
        count: dueSubscriptions.length,
        days: Math.max(...dueSubscriptions.map((subscription) => subscription.reminderDaysBefore || 3)),
        names: dueSubscriptions.map((subscription) => subscription.name).join(', '),
      }),
      date: now.toISOString(),
      read: false,
      type: firstSubscription.status === 'trial' ? 'trial' : 'reminder',
      subscriptionId: firstSubscription.id,
    });
    playNotificationSound(soundEffectsEnabled);
  }, [onboardingDone, notificationsEnabled, subscriptions, soundEffectsEnabled, t]);

  const currencySymbol = CURRENCIES[currency].symbol;

  const activeSubscriptionsCount = subscriptions.filter(
    (s) => s.status === 'active' || s.status === 'trial'
  ).length;

  const handleCompleteOnboarding = () => {
    setOnboardingDone(true);
    if (notificationsEnabled) {
      setTimeout(() => {
        setActiveNotification({
          id: 'welcome',
          title: 'Welcome to TrialMe · SubCleaner!',
          message: 'Track your free trials and cancel unwanted subscriptions before you pay.',
          date: new Date().toISOString(),
          read: false,
          type: 'system',
        });
      }, 800);
    }
  };

  const handleStartTrialOnboarding = () => {
    setOnboardingDone(true);
    setIsAddModalOpen(true);
  };

  const handleOpenAddModal = () => {
    setIsAddModalOpen(true);
  };

  const handleAddSubscription = (
    subData: Omit<Subscription, 'id' | 'createdAt' | 'paymentHistory'>
  ): string | false => {
    const trimmedName = (subData.name || '').trim();
    if (!trimmedName || !Number.isFinite(subData.price) || subData.price <= 0 || subData.price > 99999.99) {
      return false;
    }

    if (!canAddSubscription(activeSubscriptionsCount, userPlan, bonusSlots).allowed) {
      setIsPaywallOpen(true);
      return false;
    }

    const nextPayment = subData.status === 'active' && subData.nextPaymentDate
      ? rollForwardPaymentDate(subData.nextPaymentDate, subData.frequency)
      : subData.nextPaymentDate;

    const sanitizedSubData = {
      ...subData,
      name: trimmedName,
      price: roundCurrency(subData.price),
      nextPaymentDate: nextPayment,
    };

    if (subscriptionsRef.current.some((existing) => isDuplicateSubscription(sanitizedSubData, existing))) {
      setActiveNotification({
        id: `duplicate-${Date.now()}`,
        title: t('add.duplicateTitle') || 'Already Tracked',
        message: t('add.duplicateNotice') || 'This service is already being tracked in your list.',
        date: new Date().toISOString(),
        read: false,
        type: 'system',
      });
      return false;
    }

    idCounterRef.current += 1;
    const uniqueSuffix = `${Date.now()}-${idCounterRef.current}`;
    const todayKey = formatLocalDateKey(new Date());

    const newSub: Subscription = {
      ...sanitizedSubData,
      id: `sub-${uniqueSuffix}`,
      createdAt: todayKey,
      paymentHistory: [
        {
          id: `pay-${uniqueSuffix}`,
          date: todayKey,
          amount: sanitizedSubData.price,
          currency: sanitizedSubData.currency || currencySymbol,
          status: 'paid',
        },
      ],
    };
    const nextList = [newSub, ...subscriptionsRef.current];
    subscriptionsRef.current = nextList;
    setSubscriptions(nextList);
    playSubtlePop();
    return newSub.id;
  };

  const handleTrialTracked = (name: string, days: number, subscriptionId: string) => {
    setActiveNotification({
      id: `trial-tracked-${Date.now()}`,
      title: t('affiliate.trialToastTitle'),
      message: t('affiliate.trialToastMessage', { name, days }),
      date: new Date().toISOString(),
      read: false,
      type: 'trial',
      subscriptionId,
    });
    playTaDing();
  };

  const handleTriggerTrialLink = (trialData: PendingTrialActivation, shouldOpenUrl = true) => {
    setPendingTrialActivation(trialData);
    safeStorageSet('monetry_pending_trial', JSON.stringify({ ...trialData, timestamp: Date.now() }));
    trialLinkOpenedRef.current = true;
    if (shouldOpenUrl && trialData.trialUrl) {
      window.open(trialData.trialUrl, '_blank', 'noopener,noreferrer');
    }
    // Opening the trial link NEVER marks the trial as active!
  };

  const handleConfirmTrialActivation = (payload: ConfirmedTrialPayload) => {
    const limitCheck = canAddSubscription(activeSubscriptionsCount, userPlan, bonusSlots);
    if (!limitCheck.allowed) {
      setIsConfirmTrialModalOpen(false);
      setIsPaywallOpen(true);
      return;
    }

    const nextPayment = formatLocalDateKey(payload.expiryDate);
    const subData: Omit<Subscription, 'id' | 'createdAt' | 'paymentHistory'> = {
      name: payload.name,
      price: payload.price,
      currency: payload.currency,
      frequency: payload.frequency,
      category: payload.category,
      nextPaymentDate: nextPayment,
      status: 'trial',
      trialEndDate: nextPayment,
      trialStartAt: payload.activationDate.toISOString(),
      trialExpiresAt: payload.expiryDate.toISOString(),
      trialDurationDays: payload.trialDurationDays,
      alarmArmedAt: payload.alarmArmedAt,
      reminderDaysBefore: payload.reminderDaysBefore,
      color: payload.color || '#D4AF7C',
      cancelUrl: payload.cancelUrl,
      cancelEmail: payload.cancelEmail,
      cancelGuideSteps: payload.cancelGuideSteps,
      notes: payload.notes,
    };

    const addedId = handleAddSubscription(subData);
    if (addedId) {
      downloadSubscriptionReminderIcs(
        { ...subData, id: addedId, createdAt: formatLocalDateKey(new Date()), paymentHistory: [] },
        nextPayment,
        payload.reminderDaysBefore,
        t('calendar.summary', { name: payload.name }),
        t('calendar.description', { name: payload.name }),
        t('calendar.alarm', { name: payload.name, days: payload.reminderDaysBefore }),
        t('calendar.fileName', { name: payload.name })
      );
      handleTrialTracked(payload.name, payload.trialDurationDays, addedId);
      triggerCelebration({ x: 0.5, y: 0.4 });
    }

    setPendingTrialActivation(null);
    safeStorageSet('monetry_pending_trial', '');
    setIsConfirmTrialModalOpen(false);
    trialLinkOpenedRef.current = false;
  };

  const handleDismissTrialActivation = () => {
    setPendingTrialActivation(null);
    safeStorageSet('monetry_pending_trial', '');
    setIsConfirmTrialModalOpen(false);
    trialLinkOpenedRef.current = false;
  };

  const handleUpdateSubscription = (updated: Subscription) => {
    const nextList = subscriptionsRef.current.map((s) => (s.id === updated.id ? updated : s));
    subscriptionsRef.current = nextList;
    setSubscriptions(nextList);
    if (selectedDetailSub?.id === updated.id) {
      setSelectedDetailSub(updated);
    }
  };

  const handleDeleteSubscription = (id: string) => {
    const nextList = subscriptionsRef.current.filter((s) => s.id !== id);
    subscriptionsRef.current = nextList;
    setSubscriptions(nextList);
  };

  const handleConfirmCancellation = (subscriptionId: string) => {
    const subscriptionToCancel = subscriptionsRef.current.find(
      (subscription) => subscription.id === subscriptionId
    );
    if (!subscriptionToCancel || subscriptionToCancel.status === 'cancelled') return;

    const savedAmount = roundCurrency(
      convertFrequencyToMonthly(subscriptionToCancel.price, subscriptionToCancel.frequency)
    );
    const savedName = subscriptionToCancel.name;
    const todayKey = formatLocalDateKey(new Date());

    const nextList = subscriptionsRef.current.map((s) => {
      if (s.id === subscriptionId) {
        return {
          ...s,
          status: 'cancelled' as const,
          cancelledAt: todayKey,
          monthlySavingsAmount: savedAmount,
        };
      }
      return s;
    });
    subscriptionsRef.current = nextList;
    setSubscriptions(nextList);

    playCashRegister();

    if (savedName) {
      setActiveNotification({
        id: `savings-${Date.now()}`,
        title: `Successfully Stopped ${savedName}!`,
        message: `You'll save ${currencySymbol}${savedAmount.toFixed(2)} every month. Added to your savings trophy!`,
        date: new Date().toISOString(),
        read: false,
        type: 'savings',
      });
    }
  };

  const handleImportAiSubscriptions = (
    newSubs: Omit<Subscription, 'id' | 'createdAt' | 'paymentHistory'>[]
  ) => {
    const seenActiveNames = new Set<string>();
    const deduplicatedSubscriptions = subscriptions.filter((subscription) => {
      if (!isCurrentlyTrackedSubscription(subscription)) return true;
      const normalizedName = normalizeScannedSubscriptionName(subscription.name);
      if (!normalizedName || !seenActiveNames.has(normalizedName)) {
        if (normalizedName) seenActiveNames.add(normalizedName);
        return true;
      }
      return false;
    });
    const existingAndImported = [...deduplicatedSubscriptions];
    const formatted: Subscription[] = [];
    let duplicateCount = 0;
    let hitLimit = false;

    newSubs.forEach((subData, index) => {
      if (existingAndImported.some((existing) => isDuplicateScannedSubscription(subData, existing))) {
        duplicateCount += 1;
        return;
      }

      if (userPlan === 'free') {
        const currentActive = existingAndImported.filter(
          (s) => s.status === 'active' || s.status === 'trial'
        ).length;
        if (!canAddSubscription(currentActive, userPlan, bonusSlots).allowed) {
          hitLimit = true;
          return;
        }
      }

      const rolledNextDate = rollForwardPaymentDate(subData.nextPaymentDate, subData.frequency);
      const imported: Subscription = {
        ...subData,
        nextPaymentDate: rolledNextDate,
        id: `sub-ai-${Date.now()}-${index}`,
        createdAt: new Date().toISOString().split('T')[0],
        paymentHistory: [],
      };
      formatted.push(imported);
      existingAndImported.push(imported);
    });

    setSubscriptions([...formatted, ...deduplicatedSubscriptions]);
    if (formatted.length > 0) playSubtlePop();
    if (hitLimit) {
      setIsPaywallOpen(true);
    }
    if (duplicateCount > 0) {
      setActiveNotification({
        id: `duplicate-import-${Date.now()}`,
        title: t('add.duplicateTitle'),
        message: t('add.duplicateImportNotice', { count: duplicateCount }),
        date: new Date().toISOString(),
        read: false,
        type: 'system',
      });
    }
  };

  const handleLoadShowcaseTrials = () => {
    const addDays = (d: number) =>
      new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const showcaseList: Omit<Subscription, 'id' | 'createdAt' | 'paymentHistory'>[] = [
      {
        name: 'Netflix UK',
        price: 10.99,
        currency: '£',
        frequency: 'monthly',
        category: 'Streaming',
        nextPaymentDate: addDays(3),
        status: 'trial',
        trialEndDate: addDays(3),
        color: '#E50914',
        cancelUrl: 'https://www.netflix.com/youraccount',
        reminderDaysBefore: 3,
      },
      {
        name: 'Spotify Premium',
        price: 10.99,
        currency: '£',
        frequency: 'monthly',
        category: 'Music & Audio',
        nextPaymentDate: addDays(7),
        status: 'trial',
        trialEndDate: addDays(7),
        color: '#1DB954',
        cancelUrl: 'https://www.spotify.com/uk/account/overview/',
        reminderDaysBefore: 3,
      },
      {
        name: 'Amazon Prime UK',
        price: 8.99,
        currency: '£',
        frequency: 'monthly',
        category: 'Streaming',
        nextPaymentDate: addDays(12),
        status: 'trial',
        trialEndDate: addDays(12),
        color: '#FF9900',
        cancelUrl: 'https://www.amazon.co.uk/mc/manage',
        reminderDaysBefore: 3,
      },
      {
        name: 'Disney+ UK',
        price: 7.99,
        currency: '£',
        frequency: 'monthly',
        category: 'Streaming',
        nextPaymentDate: addDays(15),
        status: 'trial',
        trialEndDate: addDays(15),
        color: '#113CCF',
        cancelUrl: 'https://www.disneyplus.com/en-gb/account',
        reminderDaysBefore: 3,
      },
      {
        name: 'YouTube Premium',
        price: 12.99,
        currency: '£',
        frequency: 'monthly',
        category: 'Streaming',
        nextPaymentDate: addDays(24),
        status: 'trial',
        trialEndDate: addDays(24),
        color: '#FF0000',
        cancelUrl: 'https://www.youtube.com/paid_memberships',
        reminderDaysBefore: 3,
      },
    ];

    handleImportAiSubscriptions(showcaseList);
  };

  const handleClearCancelledSubscriptions = () => {
    setSubscriptions((previous) => previous.filter((subscription) => subscription.status !== 'cancelled'));
  };

  const handleResetData = () => {
    setSubscriptions(INITIAL_DEMO_SUBSCRIPTIONS);
  };

  const handleTriggerTestNotification = async () => {
    const targetSubscription = subscriptions.find(
      (subscription) => subscription.status === 'active' || subscription.status === 'trial'
    );
    const title = t('notifications.testTitle');
    const message = t('notifications.testMessage');
    setActiveNotification({
      id: `test-${Date.now()}`,
      title,
      message,
      date: new Date().toISOString(),
      read: false,
      type: 'system',
      subscriptionId: targetSubscription?.id,
    });
    playNotificationSound(soundEffectsEnabled);

    if (typeof Notification === 'undefined') return;

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const nativeNotification = new Notification(title, { body: message });
      nativeNotification.onclick = () => {
        window.focus();
        if (targetSubscription) setSelectedDetailSub(targetSubscription);
        setActiveNotification(null);
        nativeNotification.close();
      };
    } catch {
      // Browser permission or native notification APIs may be unavailable.
    }
  };

  const handleSelectSidebarSection = (section: SidebarSection) => {
    setActiveSection(section);
    if (section === 'scanner') {
      setCurrentTab('scan');
    } else if (section === 'settings') {
      setCurrentTab('settings');
    } else if (section === 'calendar') {
      setCurrentTab('calendar');
    } else if (section === 'subscriptions') {
      setCurrentTab('subscriptions');
    } else {
      setCurrentTab('home');
    }
  };

  return (
    <MobileFrameWrapper
      isDarkMode={isDarkMode}
      currentTab={currentTab}
      activeSection={activeSection}
      onSelectSection={handleSelectSidebarSection}
      activeTrialsCount={activeSubscriptionsCount}
      onPreviewOnboarding={() => setOnboardingDone(false)}
      onOpenAddModal={handleOpenAddModal}
      onOpenPaywall={() => setIsPaywallOpen(true)}
      userPlan={userPlan}
    >
      <ConfettiExplosion
        key={celebrationBurst?.id ?? 'idle'}
        burst={celebrationBurst}
        onComplete={completeCelebration}
      />

      {/* Push Notification Banner */}
      <NotificationBanner
        notification={activeNotification}
        onDismiss={() => setActiveNotification(null)}
        onAction={(notif) => {
          const target =
            subscriptions.find((subscription) => subscription.id === notif.subscriptionId) ??
            (notif.type === 'reminder'
              ? subscriptions.find((subscription) => subscription.name.includes('Netflix'))
              : undefined) ??
            (notif.type === 'reminder' ? subscriptions[0] : undefined);
          if (target) setSelectedDetailSub(target);
          setActiveNotification(null);
        }}
        onCancelTrial={(notif) => {
          const target =
            subscriptions.find((subscription) => subscription.id === notif.subscriptionId) ??
            subscriptions[0];
          if (target) setSelectedCancelSub(target);
          setActiveNotification(null);
        }}
      />

      {!onboardingDone ? (
        <Onboarding
          onComplete={handleCompleteOnboarding}
          onStartTrial={handleStartTrialOnboarding}
        />
      ) : (
        <div className="min-h-full flex flex-col justify-between">
          {/* Main Tab Screen Content with Native Smooth View Transitions */}
          <main className="flex-1">
            <div
              key={`${currentTab}-${activeSection}`}
              className="min-h-full animate-native-view"
            >
              {(currentTab === 'home' ||
                currentTab === 'subscriptions' ||
                currentTab === 'calendar' ||
                currentTab === 'reports') && (
              <HomeScreen
                subscriptions={subscriptions}
                userPlan={userPlan}
                currencySymbol={currencySymbol}
                onOpenAddModal={handleOpenAddModal}
                onOpenSubscriptionDetail={(sub) => setSelectedDetailSub(sub)}
                onOpenCancelSub={(sub) => setSelectedCancelSub(sub)}
                onOpenAiScanner={() => setCurrentTab('scan')}
                onOpenCalendar={() => setCurrentTab('calendar')}
                onLoadShowcaseTrials={handleLoadShowcaseTrials}
                onOpenPaywall={() => setIsPaywallOpen(true)}
                bonusSlots={bonusSlots}
                onOpenGiftSlot={() => setIsGiftSlotOpen(true)}
                onCelebrate={triggerCelebration}
                onClearCancelled={handleClearCancelledSubscriptions}
                activeSection={
                  currentTab === 'calendar'
                    ? 'calendar'
                    : currentTab === 'subscriptions'
                    ? 'subscriptions'
                    : activeSection === 'scanner' || activeSection === 'settings'
                    ? 'dashboard'
                    : activeSection
                }
                onStartRadarTrial={(deal) => {
                  if (!canAddSubscription(activeSubscriptionsCount, userPlan, bonusSlots).allowed) {
                    setIsPaywallOpen(true);
                    return;
                  }
                  handleTriggerTrialLink(
                    {
                      name: deal.name,
                      price: deal.postTrialPrice,
                      currency: deal.currency || currencySymbol,
                      frequency: 'monthly',
                      category: deal.category,
                      defaultTrialDays: deal.trialDays,
                      trialUrl: deal.trialUrl,
                      cancelUrl: deal.cancelUrl,
                      color: deal.color,
                      notes: deal.highlight,
                    },
                    false // false because HomeScreen already called window.open
                  );
                }}
                onQuickAddPreset={(preset, asTrial) => {
                  if (!canAddSubscription(activeSubscriptionsCount, userPlan, bonusSlots).allowed) {
                    setIsPaywallOpen(true);
                    return;
                  }
                  if (asTrial) {
                    const trialDays = preset.defaultTrialDays || 30;
                    handleTriggerTrialLink(
                      {
                        name: preset.name,
                        price: preset.price,
                        currency: preset.currency || currencySymbol,
                        frequency: preset.frequency,
                        category: preset.category,
                        defaultTrialDays: trialDays,
                        trialUrl: preset.trialUrl,
                        cancelUrl: preset.cancelUrl,
                        cancelEmail: preset.cancelEmail,
                        cancelGuideSteps: preset.cancelSteps,
                        color: preset.color,
                        notes: preset.description,
                      },
                      Boolean(preset.trialUrl)
                    );
                    if (!preset.trialUrl) {
                      setIsConfirmTrialModalOpen(true);
                    }
                  } else {
                    handleAddSubscription({
                      name: preset.name,
                      price: preset.price,
                      currency: preset.currency || currencySymbol,
                      frequency: preset.frequency,
                      category: preset.category,
                      nextPaymentDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                      status: 'active',
                      color: preset.color,
                      cancelUrl: preset.cancelUrl,
                      cancelEmail: preset.cancelEmail,
                      cancelGuideSteps: preset.cancelSteps,
                      notes: preset.description,
                      reminderDaysBefore: 3,
                    });
                  }
                }}
              />
            )}

            {currentTab === 'scan' && (
              <AiStatementScannerModal
                isOpen={true}
                mode="screen"
                onClose={() => {
                  setCurrentTab('home');
                  setActiveSection('dashboard');
                }}
                onImportSubscriptions={handleImportAiSubscriptions}
                userPlan={userPlan}
                currencySymbol={currencySymbol}
                onOpenPaywall={() => setIsPaywallOpen(true)}
                existingSubscriptions={subscriptions}
              />
            )}

            {currentTab === 'add' && (
              <div className="pt-2">
                <AddSubscriptionModal
                  isOpen={true}
                  onClose={() => setCurrentTab('home')}
                  onAddSubscription={handleAddSubscription}
                  currentSubscriptionCount={activeSubscriptionsCount}
                  userPlan={userPlan}
                  currencySymbol={currencySymbol}
                  onOpenPaywall={() => setIsPaywallOpen(true)}
                  onOpenAiScanner={() => setCurrentTab('scan')}
                  onTrialTracked={handleTrialTracked}
                  onStartTrialFlow={(trialData) => {
                    handleTriggerTrialLink(trialData, Boolean(trialData.trialUrl));
                    setCurrentTab('home');
                    if (!trialData.trialUrl) {
                      setIsConfirmTrialModalOpen(true);
                    }
                  }}
                  subscriptions={subscriptions}
                  bonusSlots={bonusSlots}
                  onOpenGiftSlot={() => setIsGiftSlotOpen(true)}
                />
              </div>
            )}

            {currentTab === 'settings' && (
              <SettingsScreen
                userPlan={userPlan}
                currentCurrency={currency}
                onChangeCurrency={(c) => setCurrency(c)}
                isDarkMode={isDarkMode}
                onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
                notificationsEnabled={notificationsEnabled}
                onToggleNotifications={() => setNotificationsEnabled(!notificationsEnabled)}
                soundEffectsEnabled={soundEffectsEnabled}
                onToggleSoundEffects={() => setSoundEffectsEnabled((enabled) => !enabled)}
                onOpenPaywall={() => setIsPaywallOpen(true)}
                subscriptions={subscriptions}
                onResetData={handleResetData}
                onTriggerTestNotification={handleTriggerTestNotification}
                onRestoreBackup={(restoredSubs, restoredPlan) => {
                  setSubscriptions(restoredSubs);
                  if (restoredPlan) setUserPlan(restoredPlan);
                }}
                onSelectPlan={(plan) => setUserPlan(plan)}
                onReplayOnboarding={() => setOnboardingDone(false)}
                bonusSlots={bonusSlots}
                onOpenGiftSlot={() => setIsGiftSlotOpen(true)}
              />
            )}
            </div>
          </main>

          {/* 5-Tab Fixed Bottom Navigation */}
          {currentTab !== 'add' && (
            <BottomNav
              currentTab={currentTab}
              onChangeTab={(tab) => {
                if (tab === 'add') {
                  handleOpenAddModal();
                } else {
                  setCurrentTab(tab);
                  if (tab === 'home') setActiveSection('dashboard');
                  if (tab === 'scan') setActiveSection('scanner');
                  if (tab === 'subscriptions') setActiveSection('subscriptions');
                  if (tab === 'settings') setActiveSection('settings');
                }
              }}
              activeCount={activeSubscriptionsCount}
            />
          )}

          {/* Modals */}
          <AddSubscriptionModal
            isOpen={isAddModalOpen && currentTab !== 'add'}
            onClose={() => setIsAddModalOpen(false)}
            onAddSubscription={handleAddSubscription}
            currentSubscriptionCount={activeSubscriptionsCount}
            userPlan={userPlan}
            currencySymbol={currencySymbol}
            onOpenPaywall={() => setIsPaywallOpen(true)}
            onOpenAiScanner={() => setIsAiScannerOpen(true)}
            onTrialTracked={handleTrialTracked}
            onStartTrialFlow={(trialData) => {
              handleTriggerTrialLink(trialData, Boolean(trialData.trialUrl));
              setIsAddModalOpen(false);
              if (!trialData.trialUrl) {
                setIsConfirmTrialModalOpen(true);
              }
            }}
            subscriptions={subscriptions}
            bonusSlots={bonusSlots}
            onOpenGiftSlot={() => setIsGiftSlotOpen(true)}
          />

          <SubscriptionDetailModal
            isOpen={!!selectedDetailSub}
            onClose={() => setSelectedDetailSub(null)}
            subscription={selectedDetailSub}
            onUpdateSubscription={handleUpdateSubscription}
            onDeleteSubscription={handleDeleteSubscription}
            onOpenCancelAssistant={(sub) => {
              setSelectedDetailSub(null);
              setSelectedCancelSub(sub);
            }}
            currencySymbol={currencySymbol}
            userPlan={userPlan}
            activeSubscriptionsCount={activeSubscriptionsCount}
            bonusSlots={bonusSlots}
            onOpenPaywall={() => setIsPaywallOpen(true)}
          />

          {selectedCancelSub && (
            <CancelAssistantModal
              isOpen={!!selectedCancelSub}
              onClose={() => setSelectedCancelSub(null)}
              subscription={selectedCancelSub}
              subscriptions={subscriptions}
              onConfirmCancellation={handleConfirmCancellation}
              currencySymbol={currencySymbol}
              onCelebrate={triggerCelebration}
            />
          )}

          <PaywallModal
            isOpen={isPaywallOpen}
            onClose={() => setIsPaywallOpen(false)}
            onSelectPlan={(plan) => setUserPlan(plan)}
            currencySymbol={currencySymbol}
            onOpenGiftSlot={() => setIsGiftSlotOpen(true)}
          />

          <GiftSlotModal
            isOpen={isGiftSlotOpen}
            onClose={() => setIsGiftSlotOpen(false)}
            bonusSlots={bonusSlots}
            onBonusSlotsChange={(newCount) => setBonusSlots(newCount)}
            activeCount={activeSubscriptionsCount}
            userPlan={userPlan}
          />

          <AiStatementScannerModal
            isOpen={isAiScannerOpen}
            onClose={() => setIsAiScannerOpen(false)}
            onImportSubscriptions={handleImportAiSubscriptions}
            userPlan={userPlan}
            currencySymbol={currencySymbol}
            onOpenPaywall={() => setIsPaywallOpen(true)}
            existingSubscriptions={subscriptions}
          />

          <ConfirmTrialActivationModal
            isOpen={isConfirmTrialModalOpen}
            onClose={handleDismissTrialActivation}
            pendingTrial={pendingTrialActivation}
            onConfirm={handleConfirmTrialActivation}
            currencySymbol={currencySymbol}
            existingSubscriptions={subscriptions}
          />
        </div>
      )}
    </MobileFrameWrapper>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}
