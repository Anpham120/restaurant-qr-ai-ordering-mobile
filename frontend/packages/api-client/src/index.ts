import type {
  AdminCategory,
  AdminCategoryRequest,
  AdminTableListResponse,
  AdminTable,
  ApiErrorBody,
  AuthUser,
  ChangePasswordRequest,
  CreateOrderRequest,
  CreateOrderResponse,
  CreateUserRequest,
  LoginRequest,
  LoginResponse,
  LoyaltyLookupResponse,
  LoyaltyMember,
  LoyaltyMemberRequest,
  LoyaltyReward,
  LoyaltyRewardRequest,
  LoyaltyVoucher,
  MenuResponse,
  Order,
  OrderItemStatus,
  OrderListResponse,
  OrderStatus,
  OpenTableSessionResponse,
  Payment,
  PaymentRequest,
  PaymentRequestResponse,
  Promotion,
  PromotionRequest,
  RefundPaymentRequest,
  RegisterRequest,
  ReportSummaryResponse,
  ResetPasswordRequest,
  Table,
  AdminTableSessionListResponse,
  TableSession,
  TableInvoice,
  TableInvoicePaymentRequest,
  TableInvoicePaymentRequestResponse,
  UserListResponse,
  UserSummary,
  UpdateUserRequest,
  ValidatePromotionRequest,
  ValidatePromotionResponse,
} from "@cmc/shared-types";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: Record<string, unknown> = {}) { super(message); }
}

export type ApiClientOptions = {
  baseUrl?: string;
  getAccessToken?: () => string | null;
  onUnauthorized?: () => void;
};

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? "https://localhost:7296/api").replace(/\/$/, "");
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body) headers.set("Content-Type", "application/json");
    const token = options.getAccessToken?.();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      if (response.status === 401 && token) {
        options.onUnauthorized?.();
      }
      let body: ApiErrorBody | undefined;
      try { body = await response.json() as ApiErrorBody; } catch { body = undefined; }
      throw new ApiError(response.status, body?.error.code ?? `HTTP_${response.status}`, body?.error.message ?? response.statusText, body?.error.details);
    }
    if (response.status === 204) return undefined as T;
    const raw = await response.text();
    if (!raw) return null as T;
    return JSON.parse(raw) as T;
  }
  return {
    request,
    auth: {
      login: (payload: LoginRequest) => request<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
      me: () => request<AuthUser>("/auth/me"),
      register: (payload: RegisterRequest) => request<AuthUser>("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
      changePassword: (payload: ChangePasswordRequest) => request<void>("/auth/change-password", { method: "POST", body: JSON.stringify(payload) }),
    },
    users: {
      list: () => request<UserListResponse>("/users"),
      create: (payload: CreateUserRequest) => request<UserSummary>("/users", { method: "POST", body: JSON.stringify(payload) }),
      update: (userId: string, payload: UpdateUserRequest) => request<UserSummary>(`/users/${encodeURIComponent(userId)}`, { method: "PUT", body: JSON.stringify(payload) }),
      delete: (userId: string) => request<void>(`/users/${encodeURIComponent(userId)}`, { method: "DELETE" }),
      resetPassword: (userId: string, payload: ResetPasswordRequest) => request<void>(`/users/${encodeURIComponent(userId)}/reset-password`, { method: "POST", body: JSON.stringify(payload) }),
    },
    menu: { get: () => request<MenuResponse>("/menu") },
    tables: {
      get: (code: string) => request<Table>(`/tables/${encodeURIComponent(code)}`),
      listAdmin: () => request<AdminTableListResponse>("/admin/tables"),
      createAdmin: (payload: { tableCode?: string | null; displayName: string }) =>
        request<AdminTable>("/admin/tables", { method: "POST", body: JSON.stringify(payload) }),
      updateAdmin: (tableCode: string, payload: { displayName?: string; isActive?: boolean }) =>
        request<AdminTable>(`/admin/tables/${encodeURIComponent(tableCode)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        }),
      rotateQr: (tableCode: string) =>
        request<AdminTable>(`/admin/tables/${encodeURIComponent(tableCode)}/qr/rotate`, { method: "POST" }),
      listAdminSessions: (status?: string) => {
        const query = status ? `?status=${encodeURIComponent(status)}` : "";
        return request<AdminTableSessionListResponse>(`/admin/table-sessions${query}`);
      },
      openSession: (payload: { qrToken: string; tableCode?: string | null }) =>
        request<OpenTableSessionResponse>("/table-sessions", { method: "POST", body: JSON.stringify(payload) }),
      getSession: (sessionId: string, sessionToken: string) =>
        request<TableSession>(`/table-sessions/${encodeURIComponent(sessionId)}`, {
          headers: { "X-Table-Session-Token": sessionToken },
        }),
      listSessionOrders: (sessionId: string, sessionToken: string) =>
        request<OrderListResponse>(`/table-sessions/${encodeURIComponent(sessionId)}/orders`, {
          headers: { "X-Table-Session-Token": sessionToken },
        }),
      requestAssistance: (sessionId: string, sessionToken: string, payload: { note?: string | null } = {}) =>
        request<{ ok: boolean; tableCode: string }>(
          `/table-sessions/${encodeURIComponent(sessionId)}/assistance`,
          {
            method: "POST",
            headers: { "X-Table-Session-Token": sessionToken },
            body: JSON.stringify(payload),
          },
        ),
      closeSession: (sessionId: string) =>
        request<TableSession>(`/table-sessions/${encodeURIComponent(sessionId)}/close`, { method: "POST" }),
    },
    tableInvoices: {
      list: (status?: string) => {
        const query = status ? `?status=${encodeURIComponent(status)}` : "";
        return request<TableInvoice[]>(`/table-invoices${query}`);
      },
      get: (sessionId: string, sessionToken: string) =>
        request<TableInvoice>(`/table-sessions/${encodeURIComponent(sessionId)}/invoice`, {
          headers: { "X-Table-Session-Token": sessionToken },
        }),
      requestPayment: (
        sessionId: string,
        payload: TableInvoicePaymentRequest,
        sessionToken: string,
        idempotencyKey: string,
      ) => request<TableInvoicePaymentRequestResponse>(
        `/table-sessions/${encodeURIComponent(sessionId)}/invoice/payment-request`,
        {
          method: "POST",
          headers: {
            "X-Table-Session-Token": sessionToken,
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(payload),
        },
      ),
      confirmPayment: (sessionId: string, payload: { note?: string | null } = {}) =>
        request<TableInvoice>(`/table-sessions/${encodeURIComponent(sessionId)}/invoice/payment/confirm`, {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      cancelPayment: (sessionId: string, payload: { note?: string | null } = {}) =>
        request<TableInvoice>(`/table-sessions/${encodeURIComponent(sessionId)}/invoice/payment/cancel`, {
          method: "POST",
          body: JSON.stringify(payload),
        }),
    },
    orders: {
      create: (payload: CreateOrderRequest, idempotencyKey: string) =>
        request<CreateOrderResponse>("/orders", {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: JSON.stringify(payload),
        }),
      get: (code: string, accessToken?: string | null) =>
        request<Order>(`/orders/${encodeURIComponent(code)}`, accessToken ? { headers: { "X-Order-Token": accessToken } } : {}),
      list: (filters: { status?: string; tableCode?: string; updatedSince?: string } = {}) => {
        const params = new URLSearchParams();
        if (filters.status) params.set("status", filters.status);
        if (filters.tableCode) params.set("tableCode", filters.tableCode);
        if (filters.updatedSince) params.set("updatedSince", filters.updatedSince);
        const query = params.toString();
        return request<OrderListResponse>(`/orders${query ? `?${query}` : ""}`);
      },
      updateStatus: (code: string, status: OrderStatus) => request<Order>(`/orders/${encodeURIComponent(code)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
      updateItemStatus: (code: string, itemId: string, status: OrderItemStatus) => request<Order>(`/orders/${encodeURIComponent(code)}/items/${encodeURIComponent(itemId)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    },
    payments: {
      get: (orderCode: string, accessToken?: string | null) =>
        request<Payment>(`/orders/${encodeURIComponent(orderCode)}/payment`, accessToken ? { headers: { "X-Order-Token": accessToken } } : {}),
      request: (
        orderCode: string,
        payload: PaymentRequest,
        accessToken: string,
        idempotencyKey: string,
      ) =>
        request<PaymentRequestResponse>(`/orders/${encodeURIComponent(orderCode)}/payment/request`, {
          method: "POST",
          headers: {
            "X-Order-Token": accessToken,
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(payload),
        }),
      confirm: (orderCode: string, payload: { providerTransactionId?: string | null; note?: string | null } = {}) =>
        request<Payment>(`/orders/${encodeURIComponent(orderCode)}/payment/confirm`, { method: "POST", body: JSON.stringify(payload) }),
      fail: (orderCode: string, payload: { note?: string | null } = {}) =>
        request<Payment>(`/orders/${encodeURIComponent(orderCode)}/payment/fail`, { method: "POST", body: JSON.stringify(payload) }),
      refund: (orderCode: string, payload: RefundPaymentRequest = {}) =>
        request<Payment>(`/orders/${encodeURIComponent(orderCode)}/payment/refund`, { method: "POST", body: JSON.stringify(payload) }),
    },
    categories: {
      list: () => request<AdminCategory[]>("/admin/categories"),
      get: (id: string) => request<AdminCategory>(`/admin/categories/${encodeURIComponent(id)}`),
      create: (payload: AdminCategoryRequest) => request<AdminCategory>("/admin/categories", { method: "POST", body: JSON.stringify(payload) }),
      update: (id: string, payload: AdminCategoryRequest) => request<AdminCategory>(`/admin/categories/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) }),
      delete: (id: string) => request<void>(`/admin/categories/${encodeURIComponent(id)}`, { method: "DELETE" }),
    },
    promotions: {
      validate: (payload: ValidatePromotionRequest) => request<ValidatePromotionResponse>("/promotions/validate", { method: "POST", body: JSON.stringify(payload) }),
      list: () => request<Promotion[]>("/admin/promotions"),
      get: (id: string) => request<Promotion>(`/admin/promotions/${encodeURIComponent(id)}`),
      create: (payload: PromotionRequest) => request<Promotion>("/admin/promotions", { method: "POST", body: JSON.stringify(payload) }),
      update: (id: string, payload: PromotionRequest) => request<Promotion>(`/admin/promotions/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) }),
      delete: (id: string) => request<void>(`/admin/promotions/${encodeURIComponent(id)}`, { method: "DELETE" }),
    },
    loyalty: {
      lookup: (phone: string) => request<LoyaltyLookupResponse>(`/loyalty/lookup?phone=${encodeURIComponent(phone)}`),
      /** Quầy đánh dấu đã phát phiếu cho khách. Phiếu đã dùng rồi sẽ trả 409. */
      honourVoucher: (redemptionId: string) =>
        request<LoyaltyVoucher>(`/loyalty/redemptions/${encodeURIComponent(redemptionId)}/honour`, { method: "POST" }),
      listMembers: () => request<LoyaltyMember[]>("/admin/loyalty/members"),
      createMember: (payload: LoyaltyMemberRequest) => request<LoyaltyMember>("/admin/loyalty/members", { method: "POST", body: JSON.stringify(payload) }),
      updateMember: (id: string, payload: LoyaltyMemberRequest) => request<LoyaltyMember>(`/admin/loyalty/members/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) }),
      deleteMember: (id: string) => request<void>(`/admin/loyalty/members/${encodeURIComponent(id)}`, { method: "DELETE" }),
      listRewards: () => request<LoyaltyReward[]>("/admin/loyalty/rewards"),
      createReward: (payload: LoyaltyRewardRequest) => request<LoyaltyReward>("/admin/loyalty/rewards", { method: "POST", body: JSON.stringify(payload) }),
      updateReward: (id: string, payload: LoyaltyRewardRequest) => request<LoyaltyReward>(`/admin/loyalty/rewards/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) }),
      deleteReward: (id: string) => request<void>(`/admin/loyalty/rewards/${encodeURIComponent(id)}`, { method: "DELETE" }),
    },
    reports: {
      summary: (range: { from?: string; to?: string } = {}) => {
        const params = new URLSearchParams();
        if (range.from) params.set("from", range.from);
        if (range.to) params.set("to", range.to);
        const query = params.toString();
        return request<ReportSummaryResponse>(`/admin/reports/summary${query ? `?${query}` : ""}`);
      },
    },
  };
}
