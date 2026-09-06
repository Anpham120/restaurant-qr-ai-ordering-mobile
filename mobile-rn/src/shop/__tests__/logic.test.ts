import {
  isPaid,
  addToCart,
  apiUrl,
  cartTotal,
  configurationKey,
  contactErrors,
  selectionError,
} from '../logic';
import type { Product } from '../types';

const product: Product = {
  id: 'tea',
  name: 'Trà sữa',
  description: '',
  categoryId: 'drinks',
  categoryName: 'Nước',
  price: 30000,
  isAvailable: true,
  tags: [],
  prepMinutes: 5,
  optionGroups: [
    {
      id: 'size',
      name: 'Kích cỡ',
      minSelections: 1,
      maxSelections: 1,
      options: [
        { id: 'm', name: 'M', price: 0, isAvailable: true },
        { id: 'l', name: 'L', price: 5000, isAvailable: true },
      ],
    },
    {
      id: 'topping',
      name: 'Topping',
      minSelections: 0,
      maxSelections: 2,
      options: [
        { id: 'pearl', name: 'Trân châu', price: 5000, isAvailable: true },
        { id: 'pudding', name: 'Pudding', price: 8000, isAvailable: false },
      ],
    },
  ],
};

test('keeps different configurations apart but merges the same options in any order', () => {
  let cart = addToCart([], product, ['m', 'pearl'], 1, ' riêng ');
  cart = addToCart(cart, product, ['pearl', 'm'], 2, 'riêng');
  cart = addToCart(cart, product, ['l'], 1, '');
  expect(cart).toHaveLength(2);
  expect(cart[0]?.quantity).toBe(3);
  expect(cartTotal(cart)).toBe(140000);
  expect(configurationKey('tea', ['m'], 'ít ngọt')).not.toBe(configurationKey('tea', ['m'], ''));
});
test('both backend settled payment states stop collection and QR requests', () => {
  expect(isPaid('Confirmed')).toBe(true);
  expect(isPaid('Paid')).toBe(true);
  expect(isPaid('Pending')).toBe(false);
});
test('blocks unavailable, unknown, duplicate and over-selected modifiers', () => {
  expect(selectionError(product, [])).toMatch(/Kích cỡ/i);
  expect(selectionError(product, ['m', 'l'])).toMatch(/tối đa/);
  expect(selectionError(product, ['m', 'pudding'])).toMatch(/đã hết/);
  expect(selectionError(product, ['m', 'unknown'])).toMatch(/đã hết/);
  expect(selectionError(product, ['m', 'm'])).toMatch(/đã hết/);
  expect(selectionError(product, ['m', 'pearl'])).toBeNull();
  expect(selectionError({ ...product, isAvailable: false }, ['m'])).toMatch(/đã hết/);
});
test('requires a delivery address only for Delivery and validates phone before checkout', () => {
  const contact = { recipientName: 'An', phoneNumber: '0901234567', address: '', note: '' };
  expect(contactErrors(contact, 'Pickup')).toEqual({});
  expect(contactErrors(contact, 'Delivery')).toHaveProperty('address');
  expect(contactErrors({ ...contact, phoneNumber: '123' }, 'Pickup')).toHaveProperty('phoneNumber');
});
test('accepts an origin but rejects URLs that could route credentials to an unintended path', () => {
  expect(apiUrl(' https://api.example.com/ ')).toBe('https://api.example.com');
  for (const url of [
    'https://api.example.com/api',
    'https://user:pass@api.example.com',
    'file:///tmp',
    'https://api.example.com?x=1',
  ])
    expect(() => apiUrl(url)).toThrow();
});
