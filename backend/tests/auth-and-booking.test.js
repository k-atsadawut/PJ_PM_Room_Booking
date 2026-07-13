const test = require('node:test');
const assert = require('node:assert/strict');

const { hashPassword, verifyPassword } = require('../utils/password');
const { hasExistingBookingForDate } = require('../utils/bookingRules');

test('hash and verify password work for bcrypt hashes', async () => {
  const password = 'Doe';
  const hash = await hashPassword(password);

  assert.notEqual(hash, password);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});

test('legacy plain-text passwords remain accepted for existing accounts', async () => {
  const password = 'password123';

  assert.equal(await verifyPassword(password, password), true);
});

test('duplicate same-day booking is detected for pending or approved bookings', () => {
  const existing = [
    { BookingDate: '2026-07-02', Status: 'approved' },
    { BookingDate: '2026-07-02', Status: 'cancelled' },
    { BookingDate: '2026-07-03', Status: 'pending' },
  ];

  assert.equal(hasExistingBookingForDate(existing, '2026-07-02'), true);
  assert.equal(hasExistingBookingForDate(existing, '2026-07-03'), true);
  assert.equal(hasExistingBookingForDate(existing, '2026-07-04'), false);
});
