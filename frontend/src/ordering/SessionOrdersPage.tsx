import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { moTaBepDong, moTaUocLuong } from "./uocLuongLenMon";
import { Link, useSearchParams } from "react-router-dom";
import { Banknote, CheckCircle2, QrCode, ReceiptText } from "lucide-react";
import { useI18n } from "@cmc/i18n";
import { localizeMenuItemName } from "@cmc/i18n/menu";
import type {
  OrderTrackingOrder,
  TableInvoice,
  TableInvoicePaymentRequest,
  TableInvoicePaymentRequestResponse,
} from "../types";
import {
  getTableInvoice,
  getTableSessionOrders,
  requestTableInvoicePayment,
} from "../services/orderService";
import {
  connectOrderRealtime,
  disconnectOrderRealtime,
  subscribeOrderRealtime,
  subscribeRealtimeConnection,
  watchTableSessionRealtime,
  type RealtimeConnectionStatus,
} from "../services/realtimeOrderService";
import { useOrderingSession } from "./OrderingSessionProvider";
import { deriveSessionHubState } from "./sessionResumeState";
import { mergeSessionOrdersLoadResults } from "./sessionOrdersLoad";
import { TableInvoicePaymentModal } from "./TableInvoicePaymentModal";
import { TableElectronicReceiptModal } from "./TableElectronicReceiptModal";
import { layLinkTaiApp } from "../utils/linkTaiApp";
import { labelGuestItemStatus, labelOrderStatus } from "../utils/opsStatusLabels";

const journeySteps = ["Gọi món", "Chế biến", "Phục vụ", "Thanh toán"] as const;

export function SessionOrdersPage() {
  const { formatDateTime, formatMoney, locale, t } = useI18n();
  const { context } = useOrderingSession();
  const [searchParams] = useSearchParams();
  const invoiceRef = useRef<HTMLElement>(null);
  const [orders, setOrders] = useState<OrderTrackingOrder[]>([]);
  const [invoice, setInvoice] = useState<TableInvoice | null>(null);
  const [paymentResult, setPaymentResult] = useState<TableInvoicePaymentRequestResponse | null>(null);
  const [showPaymentRequest, setShowPaymentRequest] = useState(false);
  const [showElectronicReceipt, setShowElectronicReceipt] = useState(false);
  const [receiptPaidAt, setReceiptPaidAt] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>("disconnected");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [ordersResult, invoiceResult] = await Promise.allSettled([
        getTableSessionOrders(context.sessionId, context.sessionToken),
        getTableInvoice(context.sessionId, context.sessionToken),
      ]);
      const merged = mergeSessionOrdersLoadResults(ordersResult, invoiceResult);
      setOrders(merged.orders);
      if (merged.invoice) setInvoice(merged.invoice);
      setError(merged.error ?? "");
      if (merged.invoice && (merged.invoice.status === "Confirmed" || merged.invoice.status === "Paid")) {
        setReceiptPaidAt((current) => current ?? new Date().toISOString());
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải các món đã gọi.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [context.sessionId, context.sessionToken]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    let active = true;
    const handleRealtime = (event: import("../types").OrderRealtimeEvent) => {
      if (!active) return;
      if (
        event.event === "tableInvoice.paymentConfirmed" &&
        event.payload.invoice.tableSessionId === context.sessionId
      ) {
        setInvoice(event.payload.invoice);
        setReceiptPaidAt(event.payload.paidAt);
        setShowElectronicReceipt(true);
        setError("");
        void loadOrders(false);
        return;
      }
      void loadOrders(false);
    };
    const unsubscribeEvents = subscribeOrderRealtime(handleRealtime);
    const unsubscribeConnection = subscribeRealtimeConnection(status => {
      if (active) setConnectionStatus(status);
    });

    void connectOrderRealtime()
      .then(() => watchTableSessionRealtime(context.tableCode, context.sessionToken))
      .catch(() => { if (active) setConnectionStatus("error"); });

    return () => {
      active = false;
      unsubscribeEvents();
      unsubscribeConnection();
      void disconnectOrderRealtime();
    };
  }, [context.sessionId, context.sessionToken, loadOrders]);

  useEffect(() => {
    if (connectionStatus === "connected") return;
    const timer = window.setInterval(() => { void loadOrders(false); }, 5_000);
    return () => window.clearInterval(timer);
  }, [connectionStatus, loadOrders]);

  useEffect(() => {
    const timer = window.setInterval(() => { void loadOrders(false); }, 12_000);
    return () => window.clearInterval(timer);
  }, [loadOrders]);

  useEffect(() => {
    if (!loading && (searchParams.get("focus") === "invoice" || searchParams.get("highlight"))) {
      invoiceRef.current?.scrollIntoView({ block: "start" });
    }
  }, [loading, searchParams]);

  const highlightCode = searchParams.get("highlight");
  const hubState = deriveSessionHubState(
    orders.map((order) => order.status),
    invoice?.status ?? null,
  );
  const itemProgress = useMemo(() => {
    const items = orders.flatMap(order => order.items).filter(item => item.status !== "Cancelled");
    return items.reduce((progress, item) => {
      progress.total += item.quantity;
      if (item.status === "Ready" || item.status === "Served") progress.ready += item.quantity;
      return progress;
    }, { total: 0, ready: 0 });
  }, [orders]);

  const currentJourneyStep = hubState === "New"
    ? 0
    : hubState === "OrderInProgress"
      ? (itemProgress.total > 0 && itemProgress.ready === itemProgress.total ? 2 : 1)
      : hubState === "Paid"
        ? journeySteps.length
        : 3;
  const stateTitle = {
    New: "Bắt đầu gọi món",
    OrderInProgress: "Bếp đang chuẩn bị món",
    ReadyForPayment: "Bàn đã sẵn sàng thanh toán",
    PaymentPending: "Đang chờ xác nhận thanh toán",
    Paid: "Hóa đơn đã thanh toán",
  }[hubState];
  const stateDescription = hubState === "OrderInProgress" && itemProgress.total > 0
    ? t("{ready}/{total} món đã sẵn sàng", { ready: itemProgress.ready, total: itemProgress.total })
    : t({
      New: "Quét QR thành công. Bạn có thể bắt đầu gọi món.",
      OrderInProgress: "Bếp đã nhận món và đang cập nhật tiến độ.",
      ReadyForPayment: "Các món đã được phục vụ. Bạn có thể yêu cầu thanh toán.",
      PaymentPending: "Yêu cầu đã được gửi. Vui lòng chờ nhà hàng xác nhận.",
      Paid: "Cảm ơn bạn đã dùng bữa tại CMC Restaurant.",
    }[hubState]);

  async function handlePaymentRequest(payload: TableInvoicePaymentRequest) {
    const result = await requestTableInvoicePayment(
      context.sessionId,
      context.sessionToken,
      payload,
    );
    setInvoice(result.invoice);
    setPaymentResult(result);
    setShowPaymentRequest(false);
  }

  if (loading) return <section className="ordering-page"><p>{t("Đang tải hóa đơn phiên bàn…")}</p></section>;

  const canRequestPayment = Boolean(
    invoice && invoice.orderRounds.length > 0 && hubState === "ReadyForPayment",
  );
  const isPending = hubState === "PaymentPending";
  const isPaid = hubState === "Paid";
  const vietQr = paymentResult?.vietQr ?? invoice?.vietQr ?? null;

  const linkTaiApp = layLinkTaiApp();

  return (
    <section className="ordering-page" aria-labelledby="session-orders-title">
      <header className="ordering-session-hero">
        <div className="ordering-session-hero-copy">
          <p className="ordering-state-kicker">{t("Bàn của bạn")} · {context.tableCode}</p>
          <h1 id="session-orders-title">{t(stateTitle)}</h1>
          <p>{stateDescription}</p>
        </div>
        <div className="ordering-state-actions">
          {hubState === "New" || hubState === "OrderInProgress" ? (
            <Link to="../menu">{t(hubState === "New" ? "Gọi món" : "Gọi thêm món")}</Link>
          ) : null}
          {hubState === "ReadyForPayment" || hubState === "PaymentPending" ? (
            <>
              <Link to="../menu">{t("Gọi thêm trước khi thanh toán")}</Link>
              <button type="button" onClick={() => invoiceRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })}>
                {t("Thanh toán hóa đơn")}
              </button>
            </>
          ) : null}
          <button type="button" onClick={() => void loadOrders(false)}>{t("Làm mới")}</button>
        </div>
        <ol className="ordering-journey" aria-label={t("Tiến trình phiên bàn")}>
          {journeySteps.map((step, index) => (
            <li className={index < currentJourneyStep ? "is-complete" : index === currentJourneyStep ? "is-current" : ""} key={step}>
              <span aria-hidden="true">{index + 1}</span>
              <strong>{t(step)}</strong>
            </li>
          ))}
        </ol>
        <small className={`ordering-connection is-${connectionStatus}`} aria-live="polite">
          {t(connectionStatus === "connected" ? "Đang cập nhật trực tiếp" : "Đang đồng bộ lại")}
        </small>
      </header>

      {error ? <div className="ordering-inline-error" role="alert"><p>{t(error)}</p><button type="button" onClick={() => void loadOrders()}>{t("Thử lại")}</button></div> : null}

      {!error && invoice ? (
        <section ref={invoiceRef} className={`table-invoice-summary ${isPending ? "is-pending" : ""} ${isPaid ? "is-paid" : ""}`} aria-labelledby="table-invoice-title">
          <div className="table-invoice-summary-heading">
            <div><ReceiptText aria-hidden="true" size={22} /><span><small>{t("Hóa đơn toàn phiên")}</small><strong id="table-invoice-title">{t("{count} lần gọi món", { count: invoice.orderRounds.length })}</strong></span></div>
            <strong data-money>{formatMoney(invoice.totalAmount)}</strong>
          </div>
          <p>{t("Mã ưu đãi, tích điểm và thanh toán được áp dụng một lần cho toàn bộ món trong phiên bàn.")}</p>

          {canRequestPayment ? <button className="table-invoice-pay-button" onClick={() => setShowPaymentRequest(true)} type="button">{t("Yêu cầu thanh toán")}</button> : null}
          {isPending && invoice.method === "COD" ? <div className="table-invoice-status"><Banknote aria-hidden="true" size={20} /><span><strong>{t("Đang chờ thanh toán tiền mặt")}</strong><small>{t("Nhân viên sẽ đến bàn để thu tiền và xác nhận hóa đơn.")}</small></span></div> : null}
          {isPending && invoice.method === "VietQR" ? <div className="table-invoice-status"><QrCode aria-hidden="true" size={20} /><span><strong>{t("Đang chờ thanh toán VietQR")}</strong><small>{t("Chuyển đúng số tiền và nội dung trên mã QR.")}</small></span></div> : null}
          {isPaid ? (
            <div className="table-invoice-status">
              <CheckCircle2 aria-hidden="true" size={20} />
              <span>
                <strong>{t("Hóa đơn đã thanh toán")}</strong>
                <small>{t("Cảm ơn bạn đã dùng bữa tại CMC Restaurant.")}</small>
              </span>
              <button className="table-e-receipt-open" onClick={() => setShowElectronicReceipt(true)} type="button">
                {t("Xem hóa đơn điện tử")}
              </button>
              {/*
                Mời tải app SAU khi đã trả tiền, và chỉ là một liên kết — không kéo khách vào
                luồng đăng ký ngay tại đây. Họ vừa ăn xong và đang đứng dậy; việc tạo tài khoản
                để lúc khác, trong app, nơi có đủ chỗ để làm cho tử tế.
              */}
              {linkTaiApp === null ? null : (
                <a className="table-app-invite" href={linkTaiApp} rel="noreferrer" target="_blank">
                  {t("Tải ứng dụng để tích điểm cho những lần sau")}
                </a>
              )}
            </div>
          ) : null}

          {vietQr ? (
            <div className="table-invoice-vietqr" role="status">
              <img alt={t("Mã VietQR cho hóa đơn {code}", { code: vietQr.invoiceCode })} src={vietQr.qrImageDataUri} />
              <div><small>{t("Nội dung chuyển khoản")}</small><strong>{vietQr.transferContent}</strong><span data-money>{formatMoney(vietQr.amount)}</span></div>
            </div>
          ) : null}
        </section>
      ) : null}

      {!error && orders.length === 0 ? (
        <div className="ordering-empty"><p>{t("Bàn chưa có lần gọi món nào trong phiên này.")}</p><Link to="../menu">{t("Quay lại thực đơn")}</Link></div>
      ) : null}

      {orders.length > 0 ? <h2 className="ordering-orders-title">{t("Món đã gọi")}</h2> : null}
      <div className="ordering-orders-list">
        {orders.map((order) => (
          <article className={`ordering-order-card${order.orderCode === highlightCode ? " is-highlight" : ""}`} key={order.orderId}>
            <header>
              <div><strong>{order.orderCode}</strong><span>{formatDateTime(order.createdAt)}</span></div>
              <Link to={order.orderCode}>{t("Chi tiết")}</Link>
            </header>
            <ul>
              {order.items.map((item) => (
                <li key={item.orderItemId}>
                  <span>{item.quantity}× {localizeMenuItemName(item.menuItemId, item.name, locale)}</span>
                  {/*
                    Máy chủ ĐÃ gửi ước lượng kèm từng món từ lâu, web thì vứt đi vì kiểu OrderItem
                    không khai ba trường đó. App di động hiển thị nó, web không — nên khách quét QR
                    bằng trình duyệt không biết bao giờ có món.
                  */}
                  {moTaUocLuong(item.estimatedReadyMinutesLow, item.estimatedReadyMinutesHigh) ? (
                    <small className="uoc-luong">
                      {moTaUocLuong(item.estimatedReadyMinutesLow, item.estimatedReadyMinutesHigh)}
                      {moTaBepDong(
                        item.kitchenBusy,
                        moTaUocLuong(item.estimatedReadyMinutesLow, item.estimatedReadyMinutesHigh),
                      ) ? <> · {moTaBepDong(item.kitchenBusy, "x")}</> : null}
                    </small>
                  ) : null}
                  <em>{t(labelGuestItemStatus(item.status, order.status))}</em>
                </li>
              ))}
            </ul>
            <footer><span>{t("Trạng thái: {status}", { status: t(labelOrderStatus(order.status)) })}</span><strong data-money>{formatMoney(order.subtotalAmount)}</strong></footer>
          </article>
        ))}
      </div>

      {showPaymentRequest && invoice ? (
        <TableInvoicePaymentModal invoice={invoice} onClose={() => setShowPaymentRequest(false)} onRequest={handlePaymentRequest} />
      ) : null}

      {showElectronicReceipt && invoice && receiptPaidAt ? (
        <TableElectronicReceiptModal
          invoice={invoice}
          onClose={() => setShowElectronicReceipt(false)}
          paidAt={receiptPaidAt}
        />
      ) : null}
    </section>
  );
}
