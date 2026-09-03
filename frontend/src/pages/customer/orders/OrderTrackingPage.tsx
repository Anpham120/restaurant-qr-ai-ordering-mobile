import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Timeline, type TimelineItem } from "@cmc/shared-ui";
import { useI18n, type TranslationParams } from "@cmc/i18n";
import { localizeMenuItemName } from "@cmc/i18n/menu";
import { PaymentRequestModal } from "../../../components/customer/PaymentRequestModal";
import { VietQrPaymentModal } from "../../../components/customer/VietQrPaymentModal";
import "../../../components/customer/customer-order-tracking.css";
import {
  connectOrderRealtime,
  disconnectOrderRealtime,
  subscribeOrderRealtime,
  subscribeRealtimeConnection,
  watchOrderRealtime,
  type RealtimeConnectionStatus,
} from "../../../services/realtimeOrderService";
import {
  getCustomerOrderToken,
  getOrderTracking,
  getStoredVietQrPayment,
  hasCustomerOrderToken,
  requestOrderPayment,
} from "../../../services/orderService";
import type {
  OrderRealtimeEvent,
  OrderStatusEvent,
  OrderTrackingItem,
  OrderTrackingOrder,
  RequestedPaymentMethod,
  VietQrPaymentResponse,
} from "../../../types";
import { orderingPath } from "../../../ordering/orderingRoutes";
import { demTienDoMon } from "../../../ordering/tienDoMonKhach";
import { labelGuestItemStatus } from "../../../utils/opsStatusLabels";
import { ArrowLeft, Banknote, CreditCard, QrCode } from "lucide-react";

/* ========================================================================
   Labels & Helpers
   ======================================================================== */

/*
  Màn này TỪNG giữ hai bộ chữ riêng cho trạng thái món (`itemStatusLabels` và
  `itemStatusDescriptions`) thay vì dùng `labelGuestItemStatus`. Cùng một món `Ready`, khách đọc
  "Món xong, đang mang ra bàn" ở danh sách rồi bấm vào chi tiết thì thành "Sẵn sàng" — chữ đổi
  dưới tay khách, giữa hai màn của cùng một người, cách nhau một cú chạm.

  Đó là lần thứ NĂM một bộ chữ bị nhân bản trong dự án này. Bộ chữ dùng chung nằm ở
  `utils/opsStatusLabels.ts`, và bản sinh đôi bên app ở `mobile-rn/src/core/orders/order.ts`.
*/

const timelineLabels: Record<string, string> = {
  Placed: "Đã ghi nhận",
  Preparing: "Đang chế biến",
  Ready: "Sẵn sàng",
  Served: "Đã phục vụ",
};

const eventStatusLabels: Record<string, string> = {
  Draft: "Nháp",
  Placed: "Đã đặt",
  Confirmed: "Đã xác nhận",
  Preparing: "Đang chế biến",
  Ready: "Sẵn sàng",
  Served: "Đã phục vụ",
  Completed: "Hoàn tất",
  Cancelled: "Đã hủy",
  Unpaid: "Chưa thanh toán",
  NotRequested: "Chưa yêu cầu thanh toán",
  Pending: "Chờ thanh toán",
  Paid: "Đã thanh toán",
  Failed: "Thanh toán lỗi",
  Refunded: "Đã hoàn tiền",
};

function eventTone(event: OrderStatusEvent): TimelineItem["tone"] {
  switch (event.status) {
    case "Cancelled":
    case "Failed":
      return "danger";
    case "Refunded":
      return "warning";
    case "Completed":
    case "Served":
    case "Ready":
    case "Paid":
    case "Confirmed":
      return "success";
    default:
      return event.source === "Payment" ? "info" : "neutral";
  }
}

function toTimelineItems(
  events: OrderStatusEvent[],
  t: (source: string, params?: TranslationParams) => string,
  formatDateTime: (value: string | number | Date) => string,
): TimelineItem[] {
  return events.map((event) => ({
    label: t(eventStatusLabels[event.status] ?? event.status),
    sublabel: event.source === "Payment" ? t("Thanh toán") : t("Trạng thái đơn"),
    timestamp: formatDateTime(event.createdAt),
    tone: eventTone(event),
    note: event.note ?? undefined,
  }));
}

function getTimelineCopy(status: string) {
  switch (status) {
    case "Placed":
      return "Đơn đã được ghi nhận.";
    case "Preparing":
      return "Bếp đang xử lý các món.";
    case "Ready":
      return "Món sẵn sàng để mang ra.";
    default:
      return "Nhân viên xác nhận phục vụ.";
  }
}

function getTimelineClass(currentStatus: string, timelineStatus: string) {
  const order = ["Placed", "Preparing", "Ready", "Served"];
  const currentIndex = order.indexOf(currentStatus);
  const timelineIndex = order.indexOf(timelineStatus);

  return timelineIndex <= currentIndex
    ? "cmc-ot-step cmc-ot-step-active"
    : "cmc-ot-step";
}

function applyRealtimeEvent(
  order: OrderTrackingOrder,
  event: OrderRealtimeEvent,
): OrderTrackingOrder {
  if (event.event === "order.statusChanged") {
    return {
      ...order,
      status: event.payload.status,
      updatedAt: event.payload.updatedAt,
    };
  }

  if (event.event === "payment.requested") {
    return {
      ...order,
      paymentMethod: event.payload.method,
      paymentStatus: event.payload.status,
      updatedAt: event.payload.updatedAt,
    };
  }

  if (event.event !== "order.itemStatusChanged") {
    return order;
  }

  const items = order.items.map((item) =>
    item.orderItemId === event.payload.orderItemId
      ? {
          ...item,
          status: event.payload.status,
          updatedAt: event.payload.updatedAt,
        }
      : item,
  );

  return {
    ...order,
    status: calculateOrderStatus(items),
    updatedAt: event.payload.updatedAt,
    items,
  };
}

function calculateOrderStatus(items: OrderTrackingItem[]) {
  if (items.every((item) => item.status === "Ready" || item.status === "Served")) {
    return "Ready" as const;
  }

  if (items.some((item) => item.status === "Preparing" || item.status === "Ready")) {
    return "Preparing" as const;
  }

  return "Placed" as const;
}

/* ========================================================================
   Main Page
   ======================================================================== */

export function OrderTrackingPage() {
  const { formatDateTime, locale, t } = useI18n();
  const { orderCode = "ORD-1001", sessionId = "" } = useParams();
  const [order, setOrder] = useState<OrderTrackingOrder | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<RealtimeConnectionStatus>("connected");
  const [errorMessage, setErrorMessage] = useState("");
  const [showPaymentRequest, setShowPaymentRequest] = useState(false);
  const [showVietQr, setShowVietQr] = useState(false);
  const [vietQrPayment, setVietQrPayment] = useState<VietQrPaymentResponse | null>(
    () => getStoredVietQrPayment(orderCode),
  );
  const [paymentNotice, setPaymentNotice] = useState("");
  const hasOrderAccess = hasCustomerOrderToken(orderCode);

  const refreshOrder = useCallback(async () => {
    if (!hasOrderAccess) {
      setOrder(null);
      setErrorMessage(t("Không còn quyền truy cập đơn này."));
      return;
    }

    try {
      const nextOrder = await getOrderTracking(orderCode);
      setOrder(nextOrder);
      setErrorMessage("");
    } catch {
      setErrorMessage(t("Không tải được trạng thái đơn hàng."));
    }
  }, [hasOrderAccess, orderCode, t]);

  const handlePaymentConfirmed = useCallback(() => {
    void refreshOrder();
  }, [refreshOrder]);

  const handlePaymentRequest = useCallback(async (method: RequestedPaymentMethod) => {
    const result = await requestOrderPayment(orderCode, method);
    setOrder((current) => current ? {
      ...current,
      paymentMethod: result.payment.method,
      paymentStatus: result.payment.status,
      updatedAt: result.payment.updatedAt,
    } : current);
    setShowPaymentRequest(false);
    setPaymentNotice(
      method === "COD"
        ? ""
        : t("Đã tạo yêu cầu thanh toán VietQR."),
    );
    if (result.vietQr) {
      setVietQrPayment(result.vietQr);
      setShowVietQr(true);
    }
  }, [orderCode, t]);

  useEffect(() => {
    void refreshOrder();
  }, [refreshOrder]);

  useEffect(() => {
    if (!hasOrderAccess) return;
    const interval = window.setInterval(() => void refreshOrder(), 5_000);
    return () => window.clearInterval(interval);
  }, [hasOrderAccess, refreshOrder]);

  useEffect(() => {
    if (!hasOrderAccess) return;

    const unsubscribeConnection = subscribeRealtimeConnection(setConnectionStatus);
    const unsubscribeRealtime = subscribeOrderRealtime((event) => {
      if (!("orderCode" in event.payload) || event.payload.orderCode !== orderCode) {
        return;
      }

      setOrder((current) => (current ? applyRealtimeEvent(current, event) : current));
    });

    const orderToken = getCustomerOrderToken(orderCode);
    if (!orderToken) {
      unsubscribeConnection();
      unsubscribeRealtime();
      return;
    }
    void connectOrderRealtime()
      .then(() => watchOrderRealtime(orderCode, orderToken))
      .catch(() => setConnectionStatus("error"));

    return () => {
      unsubscribeConnection();
      unsubscribeRealtime();
      void disconnectOrderRealtime();
    };
  }, [hasOrderAccess, orderCode]);

  const stats = useMemo(() => {
    const items = order?.items ?? [];

    return {
      statusLabel: t(eventStatusLabels[order?.status ?? ""] ?? "Đang tải"),
      preparing: items.filter((item) => item.status === "Preparing").length,
      ready: items.filter((item) => item.status === "Ready").length,
      allServed: items.length > 0 && items.every((item) => item.status === "Served" || item.status === "Cancelled"),
    };
  }, [order, t]);

  const connectionLabel =
    connectionStatus === "connected"
      ? t("Đã kết nối")
      : connectionStatus === "reconnecting"
        ? t("Đang kết nối lại...")
        : t("Lỗi kết nối");

  return (
    <section className="cmc-order-tracking">
      {/* Hero */}
      <header className="cmc-ot-hero">
        <p className="cmc-ot-kicker">CMC Restaurant</p>
        <h2>
          {t("Theo dõi đơn")} <span>{orderCode}</span>
        </h2>
        <p>
          {t("Trạng thái từng món được cập nhật theo thời gian thực, không cần tải lại trang.")}
        </p>

        <div className="cmc-ot-hero-stats">
          <article className="cmc-ot-stat">
            <strong>{stats.statusLabel}</strong>
            <span>{t("Trạng thái đơn")}</span>
          </article>
          <article className="cmc-ot-stat">
            <strong>{stats.preparing}</strong>
            <span>{t("Đang chế biến")}</span>
          </article>
          <article className="cmc-ot-stat">
            <strong>{stats.ready}</strong>
            <span>{t("Sẵn sàng")}</span>
          </article>
        </div>
      </header>

      {/* Connection bar */}
      <div className="cmc-ot-connection-bar">
        <div>
          <strong>{t("Theo dõi món theo thời gian thực")}</strong>
          <p>{t("Đang cập nhật trạng thái cho {code}.", { code: orderCode })}</p>
        </div>
        <span className={`cmc-ot-pill cmc-ot-pill-${connectionStatus}`}>
          {connectionLabel}
        </span>
      </div>

      {errorMessage ? (
        <div className="cmc-ot-error" role="alert">
          <p>{errorMessage}</p>
          {hasOrderAccess ? (
            <button className="cmc-secondary-link" onClick={() => void refreshOrder()} type="button">
              {t("Thử tải lại")}
            </button>
          ) : (
            <Link className="cmc-secondary-link" to="/">
              {t("Quét lại QR tại bàn")}
            </Link>
          )}
        </div>
      ) : null}

      {order ? (
        <div className="cmc-ot-content">
          <OrderTrackingPanel
            invoicePath={orderingPath(sessionId, "orders")}
            order={order}
            onRequestPayment={() => setShowPaymentRequest(true)}
            onShowVietQr={() => setShowVietQr(true)}
            paymentNotice={paymentNotice}
            vietQrAvailable={Boolean(vietQrPayment)}
          />

          {showPaymentRequest ? (
            <PaymentRequestModal
              onClose={() => setShowPaymentRequest(false)}
              onRequest={handlePaymentRequest}
            />
          ) : null}

          {showVietQr && vietQrPayment ? (
            <VietQrPaymentModal
              orderCode={order.orderCode}
              qrData={vietQrPayment}
              onClose={() => setShowVietQr(false)}
              onPaymentConfirmed={handlePaymentConfirmed}
            />
          ) : null}

          {stats.allServed && sessionId ? (
            <div className="cmc-ot-payment-nudge" role="status">
              <p>{t("Món trong đơn này đã phục vụ xong. Thanh toán theo toàn bộ phiên bàn.")}</p>
              <Link to={`${orderingPath(sessionId, "orders")}?focus=invoice`}>
                {t("Thanh toán hóa đơn phiên")}
              </Link>
            </div>
          ) : null}

          {/* Back link */}
          <Link className="cmc-ot-back" to={sessionId ? orderingPath(sessionId, "orders") : "/"}>
            <ArrowLeft aria-hidden="true" size={16} />
            {sessionId ? t("Về phiên bàn") : t("Về trang chủ")}
          </Link>
        </div>
      ) : !errorMessage ? (
        <p className="cmc-ot-loading">{t("Đang tải đơn hàng...")}</p>
      ) : null}
    </section>
  );
}

/* ========================================================================
   Tracking Panel (within content area)
   ======================================================================== */

function OrderTrackingPanel({
  invoicePath,
  order,
  onRequestPayment,
  onShowVietQr,
  paymentNotice,
  vietQrAvailable,
}: {
  invoicePath: string;
  order: OrderTrackingOrder;
  onRequestPayment: () => void;
  onShowVietQr: () => void;
  paymentNotice: string;
  vietQrAvailable: boolean;
}) {
  const { formatDateTime, locale, t } = useI18n();
  // Con số này TỪNG là `readyCount/tổng số món` với nhãn "món sẵn sàng" — gộp hai việc khác hẳn
  // nhau với người đang ngồi ăn, và đếm cả món đã huỷ vào mẫu số.
  const tienDo = demTienDoMon(order.items);
  const canRequestPayment =
    order.status !== "Cancelled" &&
    (order.paymentStatus === "NotRequested" ||
      order.paymentStatus === "Unpaid" ||
      order.paymentStatus === "Failed");
  const isPendingCash = order.paymentMethod === "COD" && order.paymentStatus === "Pending";
  const isPendingVietQr = order.paymentMethod === "VietQR" && order.paymentStatus === "Pending";
  const isPaid = order.paymentStatus === "Confirmed" || order.paymentStatus === "Paid";

  return (
    <>
      {/* Summary card */}
      <div className="cmc-ot-summary">
        <div>
          <p className="cmc-ot-kicker">{t("Theo dõi đơn")}</p>
          <h3>{order.orderCode}</h3>
          <span>
            {order.tableCode ? t("Bàn {table}", { table: order.tableCode }) : t("Chưa có bàn")} -{" "}
            {t(eventStatusLabels[order.status] ?? order.status)}
          </span>
        </div>
        <strong>
          {tienDo.daLen}/{tienDo.tong}
          <small>{t("món đã lên bàn")}</small>
          {tienDo.dangMangRa > 0 ? (
            <small className="cmc-ot-dang-ra">
              {t("{n} món đang mang ra", { n: tienDo.dangMangRa })}
            </small>
          ) : null}
        </strong>
      </div>

      {/* Refund notice */}
      {order.paymentStatus === "Refunded" ? (
        <p className="cmc-ot-refunded" role="status">
          {t("Đơn này đã được hoàn tiền. Vui lòng liên hệ nhân viên nếu cần hỗ trợ thêm.")}
        </p>
      ) : null}

      {/* Progress timeline */}
      <div className="cmc-ot-timeline">
        {(["Placed", "Preparing", "Ready", "Served"] as const).map(
          (status, index) => (
            <div className={getTimelineClass(order.status, status)} key={status}>
              <span>{index + 1}</span>
              <div>
                <h3>{t(timelineLabels[status])}</h3>
                <p>{t(getTimelineCopy(status))}</p>
              </div>
            </div>
          ),
        )}
      </div>

      {/* Event history */}
      {order.events && order.events.length > 0 ? (
        <div className="cmc-ot-history">
          <p className="cmc-ot-kicker">{t("Lịch sử xử lý")}</p>
          <Timeline items={toTimelineItems(order.events, t, formatDateTime)} />
        </div>
      ) : null}

      {/* Item list */}
      <div className="cmc-ot-item-list">
        <p className="cmc-ot-kicker">{t("Chi tiết món")}</p>
        {order.items.map((item) => (
          <article className="cmc-ot-item" key={item.orderItemId}>
            <div>
              <strong>{localizeMenuItemName(item.menuItemId, item.name, locale)}</strong>
              <p>x{item.quantity}</p>
            </div>
            <span
              className={`cmc-ot-item-pill cmc-ot-item-${item.status.toLowerCase()}`}
            >
              {t(labelGuestItemStatus(item.status, order.status))}
            </span>
          </article>
        ))}
      </div>

      {order.tableSessionId ? (
        <section className="cmc-ot-payment-card" aria-labelledby="cmc-payment-title">
          <div className="cmc-ot-payment-heading">
            <CreditCard aria-hidden="true" size={22} />
            <div>
              <h3 id="cmc-payment-title">{t("Thanh toán theo phiên bàn")}</h3>
              <p>{t("Ưu đãi, tích điểm và thanh toán được tính trên toàn bộ các lần gọi món.")}</p>
            </div>
          </div>
          <Link className="cmc-ot-payment-primary" to={invoicePath}>
            {t("Xem hóa đơn phiên bàn")}
          </Link>
        </section>
      ) : (
      <section className="cmc-ot-payment-card" aria-labelledby="cmc-payment-title">
        <div className="cmc-ot-payment-heading">
          <CreditCard aria-hidden="true" size={22} />
          <div>
            <h3 id="cmc-payment-title">{t("Thanh toán")}</h3>
            <p>{t("Gửi yêu cầu riêng sau khi đã gửi món cho bếp.")}</p>
          </div>
        </div>

        {paymentNotice ? <p className="cmc-ot-payment-notice" role="status">{paymentNotice}</p> : null}

        {canRequestPayment ? (
          <button className="cmc-ot-payment-primary" onClick={onRequestPayment} type="button">
            {t("Yêu cầu thanh toán")}
          </button>
        ) : null}

        {isPendingCash ? (
          <div className="cmc-ot-payment-state" role="status">
            <Banknote aria-hidden="true" size={20} />
            <div>
              <strong>{t("Đã gửi yêu cầu thanh toán tiền mặt.")}</strong>
              <span>{t("Nhân viên sẽ đến bàn để xác nhận thanh toán.")}</span>
            </div>
          </div>
        ) : null}

        {isPendingVietQr ? (
          <div className="cmc-ot-payment-state" role="status">
            <QrCode aria-hidden="true" size={20} />
            <div>
              <strong>{t("Đang chờ thanh toán VietQR.")}</strong>
              <span>{t("Chuyển đúng số tiền và nội dung hiển thị trên mã QR.")}</span>
            </div>
            {vietQrAvailable ? (
              <button className="cmc-secondary-link" onClick={onShowVietQr} type="button">
                {t("Xem mã VietQR")}
              </button>
            ) : null}
          </div>
        ) : null}

        {isPaid ? (
          <p className="cmc-ot-payment-notice" role="status">{t("Thanh toán đã được xác nhận.")}</p>
        ) : null}
      </section>
      )}
    </>
  );
}
