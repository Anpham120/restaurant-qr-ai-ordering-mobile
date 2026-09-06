import type { CreateOrder, Menu, Order, Payment, Quote, Session, ShopConfig } from './types';

export class ShopApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ShopApiError';
  }
}

export class ShopApi {
  constructor(
    readonly origin: string,
    readonly accessToken?: string,
  ) {}
  async request<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    extra: Record<string, string> = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${this.origin}/api${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      let result: unknown;
      try {
        result = text ? JSON.parse(text) : null;
      } catch {
        throw new Error('Máy chủ trả dữ liệu không hợp lệ. Vui lòng thử lại.');
      }
      if (!response.ok) {
        const detail = result as {
          error?: { code?: string; message?: string };
          message?: string;
        } | null;
        if (response.status === 401)
          throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        if (response.status === 403)
          throw new Error('Tài khoản này không có quyền thực hiện thao tác.');
        throw new ShopApiError(
          detail?.error?.message ??
            detail?.message ??
            `Yêu cầu chưa thành công (${response.status}). Thử lại sau.`,
          detail?.error?.code ?? 'REQUEST_FAILED',
          response.status,
        );
      }
      return result as T;
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error('Kết nối quá lâu. Kiểm tra mạng và thử lại; đơn sẽ không bị tạo trùng.');
      if (error instanceof TypeError)
        throw new Error('Không kết nối được quán. Kiểm tra mạng hoặc địa chỉ máy chủ.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  menu = () => this.request<Menu>('/shop/menu');
  config = () => this.request<ShopConfig>('/shop/config');
  quote = (latitude: number, longitude: number) =>
    this.request<Quote>('/shop/quote', 'POST', { latitude, longitude });
  login = (identifier: string, password: string) =>
    this.request<Session>('/auth/login', 'POST', { identifier, password });
  createOrder = (body: CreateOrder, key: string) =>
    this.request<Order>('/orders', 'POST', body, { 'Idempotency-Key': key });
  order = (code: string, token: string) =>
    this.request<Order>(`/orders/${encodeURIComponent(code)}`, 'GET', undefined, {
      'X-Order-Token': token,
    });
  payment = (code: string, token: string) =>
    this.request<Payment>(`/orders/${encodeURIComponent(code)}/payment`, 'GET', undefined, {
      'X-Order-Token': token,
    });
  requestPayment = (code: string, token: string, method: 'VietQR' | 'COD', key: string) =>
    this.request<Payment>(
      `/orders/${encodeURIComponent(code)}/payment/request`,
      'POST',
      { method },
      { 'X-Order-Token': token, 'Idempotency-Key': key },
    );
  deliveries = () => this.request<{ orders: Order[]; total: number }>('/delivery/orders');
  deliveryStatus = (
    code: string,
    status: 'OutForDelivery' | 'Delivered' | 'Failed',
    note?: string,
    amountCollected?: number,
  ) =>
    this.request<Order>(`/delivery/orders/${encodeURIComponent(code)}/status`, 'PATCH', {
      status,
      ...(note ? { note } : {}),
      ...(amountCollected === undefined ? {} : { amountCollected }),
    });
}
