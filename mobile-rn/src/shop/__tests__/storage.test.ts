import { shopStorage } from '../storage';

test('an order attempt survives reopening the checkout but a changed body receives a new key', async () => {
  const origin = 'https://retry.example.com';
  await shopStorage.clearAttempt(origin);
  const first = await shopStorage.orderAttempt(origin, '{"items":["tea"]}');
  expect(await shopStorage.orderAttempt(origin, '{"items":["tea"]}')).toBe(first);
  expect(await shopStorage.orderAttempt(origin, '{"items":["che"]}')).not.toBe(first);
  await shopStorage.clearAttempt(origin);
  expect(await shopStorage.orderAttempt(origin, '{"items":["tea"]}')).not.toBe(first);
});
test('tokens and cart never cross API server origins', async () => {
  const one = 'https://one.example.com';
  const two = 'https://two.example.com';
  await shopStorage.saveHistory(one, [
    { orderCode: 'MAY-1', token: 'private', createdAt: '2026-09-06' },
  ]);
  expect(await shopStorage.history(two)).toEqual([]);
  expect((await shopStorage.history(one))[0]?.token).toBe('private');
  await shopStorage.clearHistory(one);
  expect(await shopStorage.history(one)).toEqual([]);
});
test('an expired login is not restored into the courier app', async () => {
  const origin = 'https://expired.example.com';
  await shopStorage.saveSession(origin, {
    accessToken: 'expired',
    expiresAt: '2020-01-01T00:00:00Z',
    user: { userId: '1', fullName: 'An', email: 'an@example.com', role: 'Courier' },
  });
  expect(await shopStorage.session(origin)).toBeNull();
});

test('large secure histories round-trip without depending on large single Keychain values', async () => {
  const origin = 'https://large.example.com';
  const orders = Array.from({ length: 40 }, (_, index) => ({
    orderCode: `MAY-${index}`,
    token: 'a'.repeat(256),
    createdAt: '2026-09-06T00:00:00Z',
  }));
  await shopStorage.saveHistory(origin, orders);
  expect(await shopStorage.history(origin)).toEqual(orders);
  await shopStorage.saveHistory(origin, orders.slice(0, 1));
  expect(await shopStorage.history(origin)).toEqual(orders.slice(0, 1));
  await shopStorage.clearHistory(origin);
  expect(await shopStorage.history(origin)).toEqual([]);
});
