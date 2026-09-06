import { ShopApi } from '../client';

const fetchMock = jest.fn();
beforeEach(() => {
  global.fetch = fetchMock;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ orderCode: 'MAY-1' }),
  });
});
test('keeps order access and retry keys on payment requests, using COD for delivery', async () => {
  const api = new ShopApi('https://example.com');
  await api.requestPayment('MAY-1', 'private-order-token', 'COD', 'stable-key');
  expect(fetchMock).toHaveBeenCalledWith(
    'https://example.com/api/orders/MAY-1/payment/request',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'X-Order-Token': 'private-order-token',
        'Idempotency-Key': 'stable-key',
      }),
      body: JSON.stringify({ method: 'COD' }),
    }),
  );
});
test('courier confirms exact cash as a number and passes staff authorization', async () => {
  const api = new ShopApi('https://example.com', 'staff-token');
  await api.deliveryStatus('MAY-1', 'Delivered', undefined, 78000);
  expect(fetchMock).toHaveBeenCalledWith(
    'https://example.com/api/delivery/orders/MAY-1/status',
    expect.objectContaining({
      method: 'PATCH',
      headers: expect.objectContaining({ Authorization: 'Bearer staff-token' }),
      body: JSON.stringify({ status: 'Delivered', amountCollected: 78000 }),
    }),
  );
});
test('shipping quotes send only coordinates, never a client fee', async () => {
  await new ShopApi('https://example.com').quote(10.75, 106.65);
  expect(fetchMock).toHaveBeenCalledWith(
    'https://example.com/api/shop/quote',
    expect.objectContaining({ body: JSON.stringify({ latitude: 10.75, longitude: 106.65 }) }),
  );
});
test('an HTTP failure never turns into an empty successful result', async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 409,
    text: async () => JSON.stringify({ error: { message: 'Món đã hết' } }),
  });
  await expect(new ShopApi('https://example.com').menu()).rejects.toThrow('Món đã hết');
});
