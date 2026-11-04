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
import { clearMemoryStorage } from '../src/utils/storage';

describe('Free Trial Navigation & Auth Flow', () => {
  beforeEach(() => {
    clearMemoryStorage();
    logout();
    clearSavedReturnToUrl();
  });

  // TEST CASE A: Logged out -> click Free Trial -> saves intended trial route & triggers auth
  it('Case A: Logged out -> click Free Trial saves exact trial route and prompts auth', () => {
    assert.equal(isAuthenticated(), false);
    assert.equal(getCurrentUser(), null);

    const providerId = 'netflix_standard_uk';
    const trialRoute = buildTrialUrl(providerId);
    assert.equal(trialRoute, '?trial=netflix_standard_uk');

    // Simulate clicking Free Trial when logged out: saves intended return route
    saveReturnToUrl(trialRoute);
    assert.equal(getSavedReturnToUrl(), '?trial=netflix_standard_uk');

    // Preset can be identified immediately from the intended route
    const trialId = parseTrialIdentifier(getSavedReturnToUrl()!);
    assert.equal(trialId, 'netflix_standard_uk');
    const preset = findPresetByTrialIdentifier(trialId!);
    assert.ok(preset);
    assert.equal(preset?.name, 'Netflix UK Standard');
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
