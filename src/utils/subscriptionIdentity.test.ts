import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCurrentlyTrackedSubscription,
  isDuplicateScannedSubscription,
  isDuplicateSubscription,
  normalizeScannedSubscriptionName,
} from './subscriptionIdentity.ts';

test('isDuplicateSubscription matches normalized names and the same provider', () => {
  assert.equal(
    isDuplicateSubscription(
      { name: 'PureGym  Membership', cancelUrl: 'https://www.puregym.com/member/' },
      { id: 'existing', name: 'puregym membership', cancelUrl: 'https://puregym.com/other' }
    ),
    true
  );
});

test('isDuplicateSubscription does not match the same name across different providers', () => {
  assert.equal(
    isDuplicateSubscription(
      { name: 'Premium Plan', cancelUrl: 'https://provider-one.example' },
      { name: 'Premium Plan', cancelUrl: 'https://provider-two.example' }
    ),
    false
  );
});

test('isDuplicateSubscription matches IDs and names when provider data is missing', () => {
  assert.equal(isDuplicateSubscription({ id: 'sub-1', name: 'Other' }, { id: 'sub-1', name: 'Different' }), true);
  assert.equal(isDuplicateSubscription({ name: 'BBC Sounds' }, { name: 'BBC   Sounds' }), true);
});

test('cancelled subscriptions do not block re-adding the same service', () => {
  const cancelled = {
    id: 'old-sub',
    name: 'Netflix UK Standard',
    status: 'cancelled' as const,
    cancelUrl: 'https://www.netflix.com/youraccount',
  };
  const newSubscription = {
    name: 'Netflix UK Standard',
    cancelUrl: 'https://www.netflix.com/youraccount',
  };

  assert.equal(isCurrentlyTrackedSubscription(cancelled), false);
  assert.equal(isDuplicateSubscription(newSubscription, cancelled), false);
});

test('expired trials do not block re-adding, but unexpired trials do', () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const toDateOnly = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  const expiredTrial = {
    name: 'Spotify Premium UK',
    status: 'trial' as const,
    trialEndDate: toDateOnly(yesterday),
  };
  const currentTrial = { ...expiredTrial, trialEndDate: toDateOnly(tomorrow) };

  assert.equal(isCurrentlyTrackedSubscription(expiredTrial, today), false);
  assert.equal(isDuplicateSubscription(
    { name: 'Spotify Premium UK' },
    { ...expiredTrial, nextPaymentDate: '2026-10-20' }
  ), false);
  assert.equal(isCurrentlyTrackedSubscription(currentTrial, today), true);
  assert.equal(isDuplicateSubscription({ name: 'Spotify Premium UK' }, currentTrial), true);
});

test('active subscriptions continue to count as tracked', () => {
  const activeSubscription = { name: 'Netflix', status: 'active' as const };
  assert.equal(isCurrentlyTrackedSubscription(activeSubscription), true);
  assert.equal(isDuplicateSubscription(activeSubscription, activeSubscription), true);
});

test('scanner duplicate names strip configured trailing service suffixes', () => {
  assert.equal(normalizeScannedSubscriptionName(' PureGym Membership '), 'puregym');
  assert.equal(normalizeScannedSubscriptionName('Amazon Prime Video UK'), 'amazon prime');
  assert.equal(normalizeScannedSubscriptionName('Spotify Premium UK'), 'spotify');
  assert.equal(
    isDuplicateScannedSubscription(
      { name: 'PureGym' },
      { name: 'PureGym Membership', status: 'active' }
    ),
    true
  );
});

test('isDuplicateSubscription normalizes casing, whitespace, and UK suffixes across presets and manual entries', () => {
  assert.equal(
    isDuplicateSubscription(
      { name: '  Netflix  ' },
      { name: 'Netflix UK', status: 'active' }
    ),
    true
  );
  assert.equal(
    isDuplicateSubscription(
      { name: 'spotify' },
      { name: 'Spotify Premium UK', status: 'trial', trialEndDate: '2026-12-01' }
    ),
    true
  );
  assert.equal(
    isDuplicateSubscription(
      { name: '   Disney+   ' },
      { name: 'disney+', status: 'active' }
    ),
    true
  );
});
