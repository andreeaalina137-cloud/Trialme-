import test from 'node:test';
import assert from 'node:assert/strict';
import type { Subscription } from '../types/subscription.ts';
import { createSubscriptionReminderIcs, getSubscriptionReminderDate } from './calendarReminder.ts';

const mockSubscription: Subscription = {
  id: 'sub-calendar-test',
  name: 'Service, Plus; Plan',
  price: 9.99,
  currency: '£',
  frequency: 'monthly',
  category: 'Streaming',
  nextPaymentDate: '2026-10-24',
  status: 'active',
  color: '#14B8A6',
  reminderDaysBefore: 3,
  paymentHistory: [],
  createdAt: '2026-01-01',
};

test('getSubscriptionReminderDate uses trial expiry for trials', () => {
  const trial = { ...mockSubscription, status: 'trial' as const, trialEndDate: '2026-10-20' };
  assert.equal(getSubscriptionReminderDate(trial), '2026-10-20');
  assert.equal(getSubscriptionReminderDate(mockSubscription), '2026-10-24');
});

test('getSubscriptionReminderDate rejects missing or invalid dates', () => {
  assert.equal(getSubscriptionReminderDate({ ...mockSubscription, nextPaymentDate: '' }), null);
  assert.equal(getSubscriptionReminderDate({ ...mockSubscription, nextPaymentDate: '2026-02-30' }), null);
});

test('createSubscriptionReminderIcs emits an escaped all-day event with VALARM', () => {
  const ics = createSubscriptionReminderIcs(
    mockSubscription,
    '2026-10-24',
    7,
    'Reminder: Service, Plus; Plan',
    'Renewal for Service, Plus; Plan',
    'Service, Plus; Plan is due in 7 days.',
    new Date('2026-10-16T12:30:45.000Z')
  );

  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261024\r\n'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20261025\r\n'));
  assert.ok(ics.includes('SUMMARY:Reminder: Service\\, Plus\\; Plan\r\n'));
  assert.ok(ics.includes('DESCRIPTION:Renewal for Service\\, Plus\\; Plan\r\n'));
  assert.ok(ics.includes('TRIGGER:-P7D\r\n'));
  assert.ok(ics.includes('DESCRIPTION:Service\\, Plus\\; Plan is due in 7 days.\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});
