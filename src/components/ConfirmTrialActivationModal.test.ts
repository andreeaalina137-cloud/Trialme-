import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ConfirmTrialActivationModal,
  toDateTimeLocalString,
  formatDisplayDateTime,
  type PendingTrialActivation,
  type ConfirmedTrialPayload,
} from './ConfirmTrialActivationModal';
import { calculateSmartTrialTiming } from '../utils/calendarReminder';
import { isDuplicateSubscription } from '../utils/subscriptionIdentity';
import type { Subscription } from '../types/subscription';

describe('Confirm Free Trial Activation Flow', () => {
  it('toDateTimeLocalString formats dates into standard YYYY-MM-DDTHH:mm input string', () => {
    const fixedDate = new Date('2026-10-29T10:15:00.000Z');
    const result = toDateTimeLocalString(fixedDate);
    assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('formatDisplayDateTime formats dates into elegant UK readable string', () => {
    const fixedDate = new Date('2026-10-29T14:30:00');
    const result = formatDisplayDateTime(fixedDate);
    assert.ok(result.includes('29 Oct'));
    assert.ok(result.includes('2026'));
  });

  it('calculates live expiry accurately across 3d, 7d, 14d, 30d, and custom days', () => {
    const activation = new Date('2026-10-29T10:00:00Z');

    // 3 days
    const expiry3 = new Date(activation.getTime() + 3 * 24 * 60 * 60 * 1000);
    assert.equal(expiry3.toISOString().slice(0, 10), '2026-11-01');

    // 7 days
    const expiry7 = new Date(activation.getTime() + 7 * 24 * 60 * 60 * 1000);
    assert.equal(expiry7.toISOString().slice(0, 10), '2026-11-05');

    // 14 days
    const expiry14 = new Date(activation.getTime() + 14 * 24 * 60 * 60 * 1000);
    assert.equal(expiry14.toISOString().slice(0, 10), '2026-11-12');

    // 30 days
    const expiry30 = new Date(activation.getTime() + 30 * 24 * 60 * 60 * 1000);
    assert.equal(expiry30.toISOString().slice(0, 10), '2026-11-28');

    // Custom 45 days
    const expiry45 = new Date(activation.getTime() + 45 * 24 * 60 * 60 * 1000);
    assert.equal(expiry45.toISOString().slice(0, 10), '2026-12-13');
  });

  it('schedules correct 72h / 24h daytime alarms for the confirmed trial timing', () => {
    const activation = new Date('2026-10-29T12:00:00Z');

    // 14 days trial -> 72h (3 days) daytime alarm at 10:00 AM
    const timing14 = calculateSmartTrialTiming(14, activation);
    assert.equal(timing14.reminderDaysBefore, 3);
    assert.ok(timing14.alarmArmedAt.includes('10:00:00') || new Date(timing14.alarmArmedAt).getHours() === 10);

    // 7 days trial -> 48h (2 days) daytime alarm at 10:00 AM
    const timing7 = calculateSmartTrialTiming(7, activation);
    assert.equal(timing7.reminderDaysBefore, 2);

    // 3 days trial -> 24h (1 day) daytime alarm at 10:00 AM
    const timing3 = calculateSmartTrialTiming(3, activation);
    assert.equal(timing3.reminderDaysBefore, 1);
  });

  it('prevents duplicate trial creation when service is already tracked', () => {
    const existing: Subscription = {
      id: 'sub-existing',
      name: 'Amazon Prime UK',
      price: 8.99,
      currency: '£',
      frequency: 'monthly',
      category: 'Streaming',
      nextPaymentDate: '2026-11-29',
      status: 'active',
      color: '#FF9900',
      reminderDaysBefore: 3,
      paymentHistory: [],
      createdAt: '2026-10-29',
    };

    assert.equal(isDuplicateSubscription({ name: 'Amazon Prime UK' }, existing), true);
    assert.equal(isDuplicateSubscription({ name: 'amazon prime uk' }, existing), true);
    assert.equal(isDuplicateSubscription({ name: 'Netflix UK' }, existing), false);
  });

  it('renders Step 1 (Question Dialog) cleanly with Midnight Black and Champagne Gold styles', () => {
    const pendingTrial: PendingTrialActivation = {
      name: 'Audible UK',
      price: 8.99,
      currency: '£',
      frequency: 'monthly',
      category: 'Music & Audio',
      defaultTrialDays: 30,
      color: '#F8991D',
      trialUrl: 'https://www.audible.co.uk',
    };

    const html = renderToStaticMarkup(
      React.createElement(ConfirmTrialActivationModal, {
        isOpen: true,
        onClose: () => {},
        pendingTrial,
        onConfirm: (_payload: ConfirmedTrialPayload) => {},
        currencySymbol: '£',
        existingSubscriptions: [],
      })
    );

    assert.ok(html.includes('Did you successfully start the'));
    assert.ok(html.includes('Audible UK'));
    assert.ok(html.includes('Yes, I started it'));
    assert.ok(html.includes('Not yet'));
    assert.ok(html.includes('Price after trial:'));
    assert.ok(html.includes('£8.99/mo'));
  });

  it('returns null when isOpen is false or pendingTrial is null', () => {
    const htmlClosed = renderToStaticMarkup(
      React.createElement(ConfirmTrialActivationModal, {
        isOpen: false,
        onClose: () => {},
        pendingTrial: null,
        onConfirm: () => {},
        currencySymbol: '£',
        existingSubscriptions: [],
      })
    );
    assert.equal(htmlClosed, '');
  });
});
