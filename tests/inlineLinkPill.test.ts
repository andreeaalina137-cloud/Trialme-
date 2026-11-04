import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidVerifiedHttpsUrl,
  resolveServiceLink,
  findMatchingPreset,
} from '../src/utils/serviceLinkResolver';
import { registerActivePill, dismissAllPills } from '../src/components/InlineLinkPill';

describe('Discreet Inline Link Pill & Service Link Resolver', () => {
  describe('1. HTTPS Security & URL Validation', () => {
    it('accepts valid, securely formatted HTTPS URLs', () => {
      assert.equal(isValidVerifiedHttpsUrl('https://www.netflix.com/gb/'), true);
      assert.equal(isValidVerifiedHttpsUrl('https://www.spotify.com/uk/premium/'), true);
      assert.equal(isValidVerifiedHttpsUrl('https://tv.apple.com/gb'), true);
      assert.equal(isValidVerifiedHttpsUrl('https://monzo.com/features/monzo-perks/'), true);
    });

    it('rejects plain HTTP URLs (insecure)', () => {
      assert.equal(isValidVerifiedHttpsUrl('http://www.netflix.com/gb/'), false);
      assert.equal(isValidVerifiedHttpsUrl('http://spotify.com'), false);
    });

    it('rejects dangerous and malicious URI schemes', () => {
      assert.equal(isValidVerifiedHttpsUrl('javascript:alert(1)'), false);
      assert.equal(isValidVerifiedHttpsUrl('data:text/html,<script>alert(1)</script>'), false);
      assert.equal(isValidVerifiedHttpsUrl('file:///C:/Windows/System32'), false);
      assert.equal(isValidVerifiedHttpsUrl('blob:https://example.com/uuid'), false);
    });

    it('rejects malformed, empty, or whitespace-padded inputs', () => {
      assert.equal(isValidVerifiedHttpsUrl(''), false);
      assert.equal(isValidVerifiedHttpsUrl(null), false);
      assert.equal(isValidVerifiedHttpsUrl(undefined), false);
      assert.equal(isValidVerifiedHttpsUrl('https://'), false);
      assert.equal(isValidVerifiedHttpsUrl('https://test .com'), false);
      assert.equal(isValidVerifiedHttpsUrl('https://test\n.com'), false);
    });
  });

  describe('2. Single-Link Priority: Free Trial Discovery Context', () => {
    it('returns Free Trial link for eligible trial services', () => {
      const spotify = resolveServiceLink('Spotify Premium UK', 'discovery');
      assert.ok(spotify);
      assert.equal(spotify.label, 'Free Trial ↗');
      assert.equal(spotify.url, 'https://www.spotify.com/uk/premium/');
      assert.equal(spotify.serviceName, 'Spotify Premium UK');

      const audible = resolveServiceLink('Audible UK', 'discovery');
      assert.ok(audible);
      assert.equal(audible.label, 'Free Trial ↗');
      assert.equal(audible.url, 'https://www.audible.co.uk/ep/memberbenefits');

      const prime = resolveServiceLink('Amazon Prime UK', 'discovery');
      assert.ok(prime);
      assert.equal(prime.label, 'Free Trial ↗');
      assert.equal(prime.url, 'https://www.amazon.co.uk/amazonprime');
    });

    it('falls back to verified Official Site link for presets without trials in discovery context', () => {
      const netflix = resolveServiceLink('Netflix UK Standard', 'discovery');
      assert.ok(netflix);
      assert.equal(netflix.label, 'Official Site ↗');
      assert.equal(netflix.url, 'https://www.netflix.com/gb/');

      const disney = resolveServiceLink('Disney+ UK Standard', 'discovery');
      assert.ok(disney);
      assert.equal(disney.label, 'Official Site ↗');
      assert.equal(disney.url, 'https://www.disneyplus.com/en-gb');
    });
  });

  describe('3. Single-Link Priority: Active / Details / Scanner Context', () => {
    it('always returns Official Site link (never cancel_url) in active context', () => {
      const netflix = resolveServiceLink('Netflix UK Standard', 'active');
      assert.ok(netflix);
      assert.equal(netflix.label, 'Official Site ↗');
      assert.equal(netflix.url, 'https://www.netflix.com/gb/');
      // Ensure it is NOT the cancel URL
      assert.notEqual(netflix.url, 'https://www.netflix.com/CancelPlan');

      const spotify = resolveServiceLink('Spotify Premium UK', 'active');
      assert.ok(spotify);
      assert.equal(spotify.label, 'Official Site ↗');
      assert.equal(spotify.url, 'https://www.spotify.com/uk/');
      assert.notEqual(spotify.url, 'https://www.spotify.com/uk/account/overview/');

      const gym = resolveServiceLink('PureGym Membership', 'active');
      assert.ok(gym);
      assert.equal(gym.label, 'Official Site ↗');
      assert.equal(gym.url, 'https://www.puregym.com/');
    });

    it('matches by brand alias / token variations', () => {
      const netflixFuzzy = resolveServiceLink('netflix', 'active');
      assert.ok(netflixFuzzy);
      assert.equal(netflixFuzzy.label, 'Official Site ↗');

      const claude = resolveServiceLink('Claude Pro', 'active');
      assert.ok(claude);
      assert.equal(claude.url, 'https://claude.ai/');
    });
  });

  describe('4. Guard for Unverified / Custom Merchants', () => {
    it('returns null for unknown, custom, or unverified merchant strings (long-press disabled)', () => {
      assert.equal(resolveServiceLink('Corner Coffee Shop', 'active'), null);
      assert.equal(resolveServiceLink('Acme Corp Payroll', 'discovery'), null);
      assert.equal(resolveServiceLink('BACS TRANSFER 49204', 'active'), null);
      assert.equal(resolveServiceLink('', 'active'), null);
      assert.equal(resolveServiceLink(null as any, 'active'), null);
    });

    it('findMatchingPreset returns undefined for random merchants', () => {
      assert.equal(findMatchingPreset('Unknown Merchant XYZ'), undefined);
      assert.equal(findMatchingPreset(''), undefined);
    });
  });

  describe('5. Singleton Pill Coordinator', () => {
    it('automatically dismisses previous active pill when a new one is registered', () => {
      let pill1Dismissed = false;
      let pill2Dismissed = false;

      const unregister1 = registerActivePill(() => {
        pill1Dismissed = true;
      });

      assert.equal(pill1Dismissed, false);

      // Register second pill -> first one MUST be dismissed immediately
      const unregister2 = registerActivePill(() => {
        pill2Dismissed = true;
      });

      assert.equal(pill1Dismissed, true);
      assert.equal(pill2Dismissed, false);

      // dismissAllPills dismisses the active second pill
      dismissAllPills();
      assert.equal(pill2Dismissed, true);

      unregister1();
      unregister2();
    });
  });
});
