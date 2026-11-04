import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  login,
  signup,
  logout,
  getCurrentUser,
  isAuthenticated,
  saveReturnToUrl,
  getSavedReturnToUrl,
  clearSavedReturnToUrl,
  sanitizeReturnToUrl,
} from '../src/services/authService';
import {
  buildTrialUrl,
  parseTrialIdentifier,
  findPresetByTrialIdentifier,
  createPendingTrialFromPreset,
} from '../src/utils/trialRouting';
import { hasActiveUkFreeTrial } from '../src/data/popularPresets';
import { clearMemoryStorage, safeStorageSet, safeStorageGet } from '../src/utils/storage';
import { notificationService } from '../src/notifications/services/notificationService';

describe('Free Trial Navigation & Zero Login Gate Flow', () => {
  beforeEach(() => {
    clearMemoryStorage();
    logout();
    clearSavedReturnToUrl();
  });

  // TEST CASE 1: hasActiveUkFreeTrial strictly hides Free Trial button for non-trial services
  it('strictly identifies non-trial services and hides Free Trial button (Netflix, Disney+, PureGym)', () => {
    const netflix = findPresetByTrialIdentifier('netflix_standard_uk');
    assert.ok(netflix);
    assert.equal(netflix.name, 'Netflix UK Standard');
    assert.equal(netflix.hasFreeTrial, false);
    assert.equal(netflix.trialType, 'none');
    assert.equal(hasActiveUkFreeTrial(netflix), false, 'Netflix UK must NOT show Free Trial button');

    const disney = findPresetByTrialIdentifier('disney_plus_uk');
    assert.ok(disney);
    assert.equal(disney.hasFreeTrial, false);
    assert.equal(disney.trialType, 'none');
    assert.equal(hasActiveUkFreeTrial(disney), false, 'Disney+ UK must NOT show Free Trial button');

    const puregym = findPresetByTrialIdentifier('puregym_core_uk');
    assert.ok(puregym);
    assert.equal(puregym.hasFreeTrial, false);
    assert.equal(puregym.trialType, 'cooling_off');
    assert.equal(hasActiveUkFreeTrial(puregym), false, 'PureGym Cooling-Off must NOT show Free Trial button');

    const tvLicence = findPresetByTrialIdentifier('bbc_tv_licence');
    assert.ok(tvLicence);
    assert.equal(tvLicence.hasFreeTrial, false);
    assert.equal(hasActiveUkFreeTrial(tvLicence), false, 'BBC TV Licence must NOT show Free Trial button');
  });

  // TEST CASE 2: hasActiveUkFreeTrial strictly shows Free Trial button for active UK free trials
  it('strictly identifies eligible services with genuine UK free trials (Spotify, Amazon Prime, Audible)', () => {
    const spotify = findPresetByTrialIdentifier('spotify_premium_uk');
    assert.ok(spotify);
    assert.equal(spotify.hasFreeTrial, true);
    assert.equal(spotify.trialType, 'free_trial');
    assert.ok(spotify.trialUrl);
    assert.equal(hasActiveUkFreeTrial(spotify), true, 'Spotify Premium UK must show Free Trial button');

    const prime = findPresetByTrialIdentifier('amazon_prime_uk');
    assert.ok(prime);
    assert.equal(prime.hasFreeTrial, true);
    assert.equal(prime.trialType, 'free_trial');
    assert.equal(hasActiveUkFreeTrial(prime), true, 'Amazon Prime UK must show Free Trial button');

    const audible = findPresetByTrialIdentifier('audible_uk');
    assert.ok(audible);
    assert.equal(audible.hasFreeTrial, true);
    assert.equal(audible.trialType, 'free_trial');
    assert.equal(hasActiveUkFreeTrial(audible), true, 'Audible UK must show Free Trial button');

    const appleTv = findPresetByTrialIdentifier('apple_tv_plus_uk');
    assert.ok(appleTv);
    assert.equal(appleTv.hasFreeTrial, true);
    assert.equal(appleTv.trialType, 'free_trial');
    assert.equal(hasActiveUkFreeTrial(appleTv), true, 'Apple TV+ UK must show Free Trial button');
  });

  // TEST CASE 3: Zero Login Gate on Free Trial click + Direct External Browser Redirect + Return Prompt
  it('Case 3: Logged out -> click Free Trial does NOT require login, sets pending trial, and confirms on return', async () => {
    assert.equal(isAuthenticated(), false);
    assert.equal(getCurrentUser(), null);

    const spotifyPreset = findPresetByTrialIdentifier('spotify_premium_uk');
    assert.ok(spotifyPreset);
    assert.equal(hasActiveUkFreeTrial(spotifyPreset), true);

    // 1. User clicks Free Trial on Spotify while completely logged out
    const pendingData = createPendingTrialFromPreset(spotifyPreset, '£');
    assert.equal(pendingData.name, 'Spotify Premium UK');
    assert.equal(pendingData.price, 11.99);
    assert.ok(pendingData.trialUrl);

    // Store in local storage as pending trial before browser opens
    safeStorageSet('monetry_pending_trial', JSON.stringify({ ...pendingData, timestamp: Date.now() }));

    // User is still logged out, NO login gate or auth credentials required
    assert.equal(isAuthenticated(), false);
    assert.equal(getCurrentUser(), null);

    // 2. User returns to Monetry (simulated visibilitychange / focus)
    const storedPending = safeStorageGet('monetry_pending_trial');
    assert.ok(storedPending);
    const parsedPending = JSON.parse(storedPending);
    assert.equal(parsedPending.name, 'Spotify Premium UK');

    // 3. User confirms "Yes, I started it" -> Creates local subscription and syncs notifications
    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const mockSubscription = {
      id: `sub-trial-${Date.now()}`,
      name: parsedPending.name,
      price: parsedPending.price,
      currency: '£',
      frequency: 'monthly' as const,
      category: parsedPending.category,
      nextPaymentDate: expiryDate.toISOString().split('T')[0],
      status: 'trial' as const,
      trialEndDate: expiryDate.toISOString().split('T')[0],
      trialStartAt: new Date().toISOString(),
      trialExpiresAt: expiryDate.toISOString(),
      trialDurationDays: 30,
      reminderDaysBefore: 3,
      color: parsedPending.color,
      createdAt: new Date().toISOString().split('T')[0],
      paymentHistory: [],
    };

    // Sync via local notification engine
    const syncResult = await notificationService.syncOnAdd(mockSubscription);
    assert.ok(syncResult.scheduledCount >= 1, 'Local notification engine schedules alarms for trial');

    // Clean pending storage after confirmation
    safeStorageSet('monetry_pending_trial', '');
    assert.equal(safeStorageGet('monetry_pending_trial'), '');
  });

  // TEST CASE B: Logged out -> Free Trial -> Login -> lands on exact trial page
  it('Case B: Logged out -> Free Trial -> Login redirects to exact trial page', async () => {
    assert.equal(isAuthenticated(), false);

    // 1. User targets Spotify Free Trial while logged out
    const intendedRoute = buildTrialUrl('spotify_premium_uk');
    saveReturnToUrl(intendedRoute);

    // 2. Existing Login handler is executed with credentials
    const user = await login('subscriber@monetry.co.uk', 'securepass123');
    assert.ok(user);
    assert.equal(user.email, 'subscriber@monetry.co.uk');
    assert.equal(isAuthenticated(), true);

    // 3. System reads saved return destination
    const returnTarget = getSavedReturnToUrl();
    assert.ok(returnTarget);
    const sanitizedTarget = sanitizeReturnToUrl(returnTarget);
    assert.equal(sanitizedTarget, '?trial=spotify_premium_uk');

    // 4. Parses trial destination and loads exact trial payload
    const trialId = parseTrialIdentifier(sanitizedTarget);
    assert.equal(trialId, 'spotify_premium_uk');
    const preset = findPresetByTrialIdentifier(trialId!);
    assert.ok(preset);
    assert.equal(preset?.id, 'spotify_premium_uk');
    assert.equal(preset?.name, 'Spotify Premium UK');

    const pendingTrial = createPendingTrialFromPreset(preset!, '£');
    assert.equal(pendingTrial.name, 'Spotify Premium UK');
    assert.equal(pendingTrial.price, 11.99);
    assert.equal(pendingTrial.category, 'Music & Audio');

    // Consumed returnTo is cleaned
    clearSavedReturnToUrl();
    assert.equal(getSavedReturnToUrl(), null);
  });

  // TEST CASE C: Logged out -> Free Trial -> Signup -> lands on exact trial page
  it('Case C: Logged out -> Free Trial -> Signup redirects to exact trial page', async () => {
    assert.equal(isAuthenticated(), false);

    // 1. User targets PureGym Free Trial while logged out
    const intendedRoute = '/trial/puregym_core_uk';
    saveReturnToUrl(intendedRoute);

    // 2. Existing Signup handler executes
    const user = await signup('newmember@puregym.co.uk', 'password456', 'David Smith');
    assert.ok(user);
    assert.equal(user.email, 'newmember@puregym.co.uk');
    assert.equal(user.name, 'David Smith');
    assert.equal(isAuthenticated(), true);

    // 3. Return-to destination is sanitized and loaded
    const returnTarget = getSavedReturnToUrl();
    const sanitizedTarget = sanitizeReturnToUrl(returnTarget);
    assert.equal(sanitizedTarget, '/trial/puregym_core_uk');

    const trialId = parseTrialIdentifier(sanitizedTarget);
    assert.equal(trialId, 'puregym_core_uk');
    const preset = findPresetByTrialIdentifier(trialId!);
    assert.ok(preset);
    assert.equal(preset?.name, 'PureGym Membership');

    const pendingTrial = createPendingTrialFromPreset(preset!, '£');
    assert.equal(pendingTrial.name, 'PureGym Membership');
    assert.equal(pendingTrial.category, 'Fitness & Gym');
  });

  // TEST CASE D: Logged in -> Free Trial -> direct to trial page
  it('Case D: Logged in -> Free Trial navigates directly to trial page without auth prompt', async () => {
    await login('activeuser@monetry.co.uk', 'mypassword789');
    assert.equal(isAuthenticated(), true);

    const preset = findPresetByTrialIdentifier('amazon_prime_uk');
    assert.ok(preset);

    // Directly build trial destination payload and route
    const trialRoute = buildTrialUrl(preset!.id);
    assert.equal(trialRoute, '?trial=amazon_prime_uk');

    const trialPayload = createPendingTrialFromPreset(preset!, '£');
    assert.equal(trialPayload.name, 'Amazon Prime UK');
    assert.equal(trialPayload.defaultTrialDays, 30);
    assert.equal(trialPayload.price, 8.99);

    // Never touched returnTo queue because user is already logged in
    assert.equal(getSavedReturnToUrl(), null);
  });

  // TEST CASE E: Refresh on trial page -> stays there
  it('Case E: Browser refresh on trial page stays on the same trial page', () => {
    // Simulate user refreshing on URL with ?trial=apple_tv_plus_uk
    const simulatedSearch = '?trial=apple_tv_plus_uk';
    const trialId = parseTrialIdentifier(simulatedSearch);
    assert.equal(trialId, 'apple_tv_plus_uk');

    const preset = findPresetByTrialIdentifier(trialId!);
    assert.ok(preset);
    assert.equal(preset?.name, 'Apple TV+ UK');
    assert.equal(preset?.defaultTrialDays, 7);

    // Pathname-style refresh /trial/apple_tv_plus_uk also stays on the same page
    const simulatedPath = '/trial/apple_tv_plus_uk';
    const pathTrialId = parseTrialIdentifier('', simulatedPath);
    assert.equal(pathTrialId, 'apple_tv_plus_uk');
    const pathPreset = findPresetByTrialIdentifier(pathTrialId!);
    assert.equal(pathPreset?.name, 'Apple TV+ UK');
  });

  // TEST CASE F: Invalid/malicious return URL -> safely rejected
  it('Case F: Invalid/malicious return URLs are safely rejected and fall back to safe internal route', () => {
    const maliciousUrls = [
      'https://malicious-phishing.com/steal-creds',
      'http://evil.com/login',
      '//evil.com/open-redirect',
      '///evil.com',
      'javascript:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '/\\attacker.com/trial',
      '/?redirect=https://evil.com\r\nSet-Cookie: sessionId=hacked',
      'https://monetry.co.uk.attacker.com',
      '',
      null,
      undefined,
    ];

    for (const badUrl of maliciousUrls) {
      const sanitized = sanitizeReturnToUrl(badUrl as string);
      assert.equal(sanitized, '/', `Failed to reject malicious URL: ${badUrl}`);
    }

    // Valid internal application routes MUST be preserved
    assert.equal(sanitizeReturnToUrl('?trial=netflix_standard_uk'), '?trial=netflix_standard_uk');
    assert.equal(sanitizeReturnToUrl('/trial/spotify_premium_uk'), '/trial/spotify_premium_uk');
    assert.equal(sanitizeReturnToUrl('/add?trial=puregym_core_uk'), '/add?trial=puregym_core_uk');
  });

  // TEST CASE G: Test at least 3 different trial providers
  it('Case G: Resolves and builds trial destinations for at least 3 distinct providers', () => {
    const testProviders = [
      { id: 'netflix_standard_uk', expectedName: 'Netflix UK Standard', category: 'Streaming' },
      { id: 'spotify_premium_uk', expectedName: 'Spotify Premium UK', category: 'Music & Audio' },
      { id: 'puregym_core_uk', expectedName: 'PureGym Membership', category: 'Fitness & Gym' },
      { id: 'amazon_prime_uk', expectedName: 'Amazon Prime UK', category: 'Streaming' },
      { id: 'audible_uk', expectedName: 'Audible UK', category: 'Music & Audio' },
    ];

    for (const testCase of testProviders) {
      const preset = findPresetByTrialIdentifier(testCase.id);
      assert.ok(preset, `Provider ${testCase.id} must be in popular presets`);
      assert.equal(preset?.name, testCase.expectedName);
      assert.equal(preset?.category, testCase.category);

      const trialPayload = createPendingTrialFromPreset(preset!, '£');
      assert.equal(trialPayload.name, testCase.expectedName);
      assert.ok(trialPayload.price > 0);
      assert.ok(trialPayload.defaultTrialDays && trialPayload.defaultTrialDays > 0);
      assert.equal(trialPayload.currency, '£');

      // Test URL route generation & round-trip extraction
      const url = buildTrialUrl(testCase.id);
      const extractedId = parseTrialIdentifier(url);
      assert.equal(extractedId, testCase.id);
    }
  });

  it('Never redirects to homepage when valid trial destination exists', () => {
    const preset = findPresetByTrialIdentifier('youtube_premium_uk');
    assert.ok(preset);
    const target = buildTrialUrl(preset!.id);

    // Valid trial route is NEVER coerced to '/'
    const sanitized = sanitizeReturnToUrl(target);
    assert.equal(sanitized, '?trial=youtube_premium_uk');
    assert.notEqual(sanitized, '/');
  });
});
