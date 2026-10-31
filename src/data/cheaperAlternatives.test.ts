import test from 'node:test';
import assert from 'node:assert/strict';
import type { Subscription } from '../types/subscription.ts';
import { getAffiliateOffer, getCheaperAlternative } from './cheaperAlternatives.ts';

function makeSubscription(
  name: string,
  category: Subscription['category'],
  price: number,
  status: Subscription['status'] = 'cancelled'
): Subscription {
  return {
    id: name.toLowerCase().replace(/\W+/g, '-'),
    name,
    category,
    price,
    currency: '£',
    frequency: 'monthly',
    nextPaymentDate: '2026-11-01',
    status,
    color: '#14B8A6',
    reminderDaysBefore: 3,
    paymentHistory: [],
    createdAt: '2026-01-01',
  };
}

test('suggestions match gym and music categories', () => {
  const gym = getCheaperAlternative(makeSubscription('PureGym Membership', 'Fitness & Gym', 19.99), []);
  const music = getCheaperAlternative(makeSubscription('Spotify Premium UK', 'Music & Audio', 11.99), []);

  assert.equal(gym?.name, 'The Gym Group (Off-Peak)');
  assert.equal(music?.name, 'Apple Music Individual');
});

test('food delivery memberships can suggest a cheaper delivery alternative', () => {
  const alternative = getCheaperAlternative(
    makeSubscription('Deliveroo Plus Premium', 'Food & Delivery', 8.99),
    []
  );
  assert.equal(alternative?.name, 'Deliveroo Plus (Silver)');
});

test('streaming alternatives are ranked for the provider being cancelled', () => {
  const netflix = getCheaperAlternative(makeSubscription('Netflix UK Standard', 'Streaming', 10.99), []);
  const sky = getCheaperAlternative(makeSubscription('Sky TV & Streaming', 'Streaming', 34), []);

  assert.equal(netflix?.name, 'NOW TV Entertainment');
  assert.equal(sky?.name, 'NOW TV Entertainment');
});

test('active alternatives are skipped and cheaper same-category options are offered', () => {
  const netflix = makeSubscription('Netflix UK Standard', 'Streaming', 10.99);
  const trackedNow = makeSubscription('NOW TV Entertainment', 'Streaming', 9.99, 'active');
  assert.equal(getCheaperAlternative(netflix, [trackedNow])?.name, 'Disney+ UK (With Ads)');
  assert.equal(getCheaperAlternative(makeSubscription('Disney+ UK', 'Streaming', 7.99), [])?.name, 'Disney+ UK (With Ads)');
  assert.equal(getCheaperAlternative(makeSubscription('Netflix Annual', 'Streaming', 120), [] )?.name, 'NOW TV Entertainment');
});

test('affiliate offers match configured providers and expose trial and annual terms', () => {
  assert.equal(getAffiliateOffer('Amazon Prime UK')?.trialDays, 30);
  assert.equal(getAffiliateOffer('Apple TV+ UK')?.trialDays, 7);
  assert.equal(getAffiliateOffer('NordVPN')?.annualDiscountRate, 0.2);
  assert.equal(getAffiliateOffer('Unknown service'), undefined);
});

test('PureGym trial offer uses the UK join flow', () => {
  assert.equal(getAffiliateOffer('PureGym Membership')?.trialUrl, 'https://www.puregym.com/join/');
});

test('cancellation alternatives never cross subscription categories', () => {
  assert.equal(getCheaperAlternative(makeSubscription('Unlisted service', 'Other', 99), []), null);
  assert.equal(getCheaperAlternative(makeSubscription('NordVPN', 'AI & Tech', 10), [])?.name, 'Proton VPN (Free Tier)');
});
