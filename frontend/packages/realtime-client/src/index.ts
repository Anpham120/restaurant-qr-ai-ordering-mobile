import { Client, type IMessage, type StompSubscription } from "@stomp/stompjs";
import type { OrderCreatedEvent, OrderItemStatusChangedEvent, OrderStatusChangedEvent, PaymentRequestedEvent, RealtimeConnectionStatus } from "@cmc/shared-types";

export type CartUpdatedEvent = {
  tableSessionId: string;
  tableCode: string | null;
  itemCount: number;
  subtotal: number;
  updatedAt: string;
};

export type AssistanceRequestedEvent = {
  tableCode: string;
  tableSessionId: string | null;
  note: string | null;
  requestedAt: string;
};

/** Backend event name: menu.availabilityChanged */
export type MenuAvailabilityChangedEvent = {
  menuItemId: string;
  isAvailable: boolean;
  updatedAt: string;
};

/** Backend event: tableInvoice.paymentConfirmed */
export type TableInvoicePaymentConfirmedEvent = {
  invoice: {
    tableSessionId: string;
    invoiceCode: string | null;
    tableCode: string | null;
    status: string;
    subtotalAmount: number;
    discountAmount: number;
    totalAmount: number;
    promotionCode: string | null;
    customerPhoneNumber: string | null;
    method: string;
    orderRounds: Array<{ orderCode: string; status: string; subtotalAmount: number; createdAt: string }>;
    items: Array<{ menuItemId: string; name: string; unitPrice: number; quantity: number; lineTotal: number }>;
    vietQr: unknown;
  };
  paidAt: string;
};

export type OrderRealtimeHandlers = {
  onOrderCreated?: (event: OrderCreatedEvent) => void;
  onOrderStatusChanged?: (event: OrderStatusChangedEvent) => void;
  onOrderItemStatusChanged?: (event: OrderItemStatusChangedEvent) => void;
  onPaymentRequested?: (event: PaymentRequestedEvent) => void;
  onTableInvoicePaymentConfirmed?: (event: TableInvoicePaymentConfirmedEvent) => void;
  onCartUpdated?: (event: CartUpdatedEvent) => void;
  onAssistanceRequested?: (event: AssistanceRequestedEvent) => void;
  onMenuAvailabilityChanged?: (event: MenuAvailabilityChangedEvent) => void;
  onStatusChanged?: (status: RealtimeConnectionStatus) => void;
};

/**
 * Client realtime — STOMP over WebSocket.
 *
 * VÌ SAO KHÔNG CÒN LÀ SignalR
 * ---------------------------
 * Backend .NET dùng SignalR; backend Java dùng STOMP over WebSocket (Spring `@EnableWebSocketMessageBroker`).
 * Hai giao thức KHÔNG nói chuyện được với nhau — SignalR có bước `negotiate` và khung tin riêng,
 * còn Spring chỉ hiểu khung STOMP. Nên sau khi backend chuyển sang Java, mọi tính năng realtime
 * (bếp cập nhật trực tiếp, theo dõi đơn, xác nhận thanh toán, gọi nhân viên) im lặng chết.
 *
 * Không cổng nào bắt được: test backend kiểm STOMP bằng client STOMP, test frontend là unit test
 * đọc mã, còn `golden-e2e` chỉ đi qua HTTP. Đúng lớp lỗi "hai bên tự nhất quán với chính mình".
 *
 * KHÁC BIỆT MÔ HÌNH, và hệ quả ở đây
 * ----------------------------------
 * SignalR: server đẩy sự kiện có TÊN, client `on("order.created")`; muốn nhận theo nhóm thì gọi
 * RPC `invoke("WatchOrder", ...)` và server tự thêm connection vào group.
 *
 * STOMP: client SUBSCRIBE một ĐÍCH (`/topic/order.ABC123`), tên sự kiện đi trong header `event`.
 * Không có RPC. Quyền được kiểm ngay lúc SUBSCRIBE bởi `StompSubscriptionGuard`, và token đi kèm
 * TỪNG khung SUBSCRIBE chứ không chỉ lúc CONNECT.
 *
 * Vì thế `watchTable` nay cần token phiên bàn: bản .NET dựa vào danh tính của cả kết nối, bản Java
 * kiểm từng lượt đăng ký.
 *
 * Nhóm `operations` cũng đổi: SignalR tự thêm nhân viên vào nhóm đó lúc `OnConnectedAsync`, nên
 * giao diện vận hành chỉ cần `connect()`. STOMP không có "tự vào nhóm", nên `connect()` ở đây tự
 * SUBSCRIBE `/topic/orders.operations` KHI có token nhân viên — giữ nguyên hành vi mà các trang
 * vận hành đang trông đợi, thay vì bắt mọi nơi gọi thêm một hàm mới.
 */
export function createOrderHubClient(options: { hubUrl?: string; accessTokenFactory?: () => string | null; handlers?: OrderRealtimeHandlers } = {}) {
  const handlers = options.handlers ?? {};
  const hubUrl = options.hubUrl ?? import.meta.env.VITE_ORDER_HUB_URL ?? "http://localhost:8081/hub/orders";

  let client: Client | null = null;
  let operation = Promise.resolve();

  /** Đích -> header của lượt đăng ký. Giữ lại để đăng ký lại sau khi kết nối rớt: `@stomp/stompjs`
   * tự nối lại nhưng KHÔNG tự đăng ký lại — mỗi lần nối lại là một phiên STOMP mới. */
  const wanted = new Map<string, Record<string, string>>();
  const live = new Map<string, StompSubscription>();

  function token(): string {
    return options.accessTokenFactory?.() ?? "";
  }

  /**
   * `ws://` cho `http://`, `wss://` cho `https://`.
   *
   * Nhận cả URL đã là ws để người cấu hình không phải đoán: `VITE_ORDER_HUB_URL` trong `.env` của
   * dự án lâu nay viết dạng http, và đổi hết mọi nơi chỉ vì thư viện đòi ws là việc không cần.
   */
  function brokerUrl(): string {
    if (hubUrl.startsWith("ws://") || hubUrl.startsWith("wss://")) return hubUrl;
    if (hubUrl.startsWith("https://")) return `wss://${hubUrl.slice("https://".length)}`;
    if (hubUrl.startsWith("http://")) return `ws://${hubUrl.slice("http://".length)}`;
    return hubUrl;
  }

  /** Tên sự kiện nằm ở header `event` — do `OrderRealtimeNotifier` phía Java đặt. */
  function dispatch(message: IMessage) {
    const name = message.headers["event"];
    if (!name) return;
    let payload: unknown;
    try {
      payload = JSON.parse(message.body);
    } catch {
      return;
    }
    switch (name) {
      case "order.created": handlers.onOrderCreated?.(payload as OrderCreatedEvent); break;
      case "order.statusChanged": handlers.onOrderStatusChanged?.(payload as OrderStatusChangedEvent); break;
      case "order.itemStatusChanged": handlers.onOrderItemStatusChanged?.(payload as OrderItemStatusChangedEvent); break;
      case "payment.requested": handlers.onPaymentRequested?.(payload as PaymentRequestedEvent); break;
      case "tableInvoice.paymentConfirmed": handlers.onTableInvoicePaymentConfirmed?.(payload as TableInvoicePaymentConfirmedEvent); break;
      case "cart.updated": handlers.onCartUpdated?.(payload as CartUpdatedEvent); break;
      case "assistance.requested": handlers.onAssistanceRequested?.(payload as AssistanceRequestedEvent); break;
      case "menu.availabilityChanged": handlers.onMenuAvailabilityChanged?.(payload as MenuAvailabilityChangedEvent); break;
      default: break;
    }
  }

  function applySubscriptions() {
    if (!client?.connected) return;
    for (const [destination, headers] of wanted) {
      if (live.has(destination)) continue;
      live.set(destination, client.subscribe(destination, dispatch, { ...headers }));
    }
  }

  function build(): Client {
    const created = new Client({
      brokerURL: brokerUrl(),
      // Nhịp tim hai chiều: một kết nối WebSocket chết vì proxy hay wifi rớt trông y hệt một kết
      // nối im lặng, và không có nhịp tim thì client tin là mình vẫn đang nghe.
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      reconnectDelay: 3000,
      connectHeaders: token() ? { Authorization: `Bearer ${token()}` } : {},
      // Mặc định của thư viện là đổ mọi khung ra console. Ồn và lộ token trong log trình duyệt.
      debug: () => {},
      onConnect: () => {
        live.clear();
        // Nhân viên: vào thẳng nhóm vận hành như bản SignalR từng tự làm.
        if (token()) wanted.set("/topic/orders.operations", { Authorization: `Bearer ${token()}` });
        // Sự kiện thực đơn là công khai (đúng như `Clients.All` của bản .NET), chỉ đăng ký khi có
        // ai đó thật sự quan tâm — đăng ký thừa vẫn tốn một lượt gửi mỗi lần món đổi trạng thái.
        if (handlers.onMenuAvailabilityChanged) wanted.set("/topic/menu", {});
        applySubscriptions();
        handlers.onStatusChanged?.("connected");
      },
      onWebSocketClose: () => {
        live.clear();
        handlers.onStatusChanged?.("reconnecting");
      },
      // Server trả khung ERROR khi `StompSubscriptionGuard` từ chối một lượt đăng ký (token sai,
      // đích lạ). Theo đặc tả STOMP, ERROR đóng luôn kết nối — nên đây là lỗi thật, không phải
      // cảnh báo bỏ qua được.
      onStompError: () => handlers.onStatusChanged?.("error"),
    });
    client = created;
    return created;
  }

  function enqueue(task: () => Promise<void>) {
    const nextOperation = operation.then(task, task);
    operation = nextOperation.catch(() => undefined);
    return nextOperation;
  }

  /** Đăng ký ngay nếu đang nối; nếu chưa thì ghi nhớ để `onConnect` áp dụng. */
  async function watch(destination: string, headers: Record<string, string>) {
    wanted.set(destination, headers);
    if (!client) build();
    applySubscriptions();
  }

  return {
    connect() {
      return enqueue(async () => {
        const current = client ?? build();
        if (current.active) return;
        handlers.onStatusChanged?.("connecting");
        current.activate();
      });
    },
    disconnect() {
      return enqueue(async () => {
        wanted.clear();
        live.clear();
        if (client?.active) await client.deactivate();
        handlers.onStatusChanged?.("disconnected");
      });
    },
    /** Một đơn cụ thể. Khách đưa token cấp lúc tạo đơn; nhân viên đã có JWT nên token có thể rỗng. */
    async watchOrder(orderCode: string, orderToken: string) {
      const headers: Record<string, string> = {};
      if (orderToken) headers["X-Order-Token"] = orderToken;
      if (token()) headers["Authorization"] = `Bearer ${token()}`;
      await watch(`/topic/order.${orderCode.trim().toUpperCase()}`, headers);
    },
    /**
     * Một bàn. `sessionToken` là token phiên bàn của khách.
     *
     * Bản .NET không cần tham số này vì hub xét danh tính của cả kết nối; bản Java kiểm từng lượt
     * SUBSCRIBE, nên khách phải chìa token ra ở đúng lượt đó.
     */
    async watchTable(tableCode: string, sessionToken = "") {
      const headers: Record<string, string> = {};
      if (sessionToken) headers["X-Table-Session-Token"] = sessionToken;
      if (token()) headers["Authorization"] = `Bearer ${token()}`;
      await watch(`/topic/table.${tableCode.trim().toUpperCase()}`, headers);
    },
  };
}
