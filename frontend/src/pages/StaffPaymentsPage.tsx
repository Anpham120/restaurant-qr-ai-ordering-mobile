import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { TableInvoice } from "@cmc/shared-types";
import {
  cancelTableInvoicePayment,
  confirmTableInvoicePayment,
  listTableInvoices,
} from "../services/orderService";
import { useOpsRealtime } from "../hooks/useOpsRealtime";
import { matchesTableFilter, normalizeTableCode } from "../components/operations/opsDeepLinkUtils";
import { Banknote, Check, CreditCard, QrCode, RefreshCw, X } from "lucide-react";
import "../components/operations/operations.css";

const formatVnd = (value: number) => `${value.toLocaleString("vi-VN")}đ`;

export function StaffPaymentsPage({ embedded = false }: { embedded?: boolean }) {
  const [searchParams] = useSearchParams();
  const tableFilter = normalizeTableCode(searchParams.get("table"));
  const highlightRef = useRef<HTMLElement | null>(null);
  const [invoices, setInvoices] = useState<TableInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

  const loadInvoices = useCallback(async () => {
    try {
      setInvoices(await listTableInvoices());
      setError("");
    } catch {
      setError("Không tải được danh sách hóa đơn phiên bàn.");
    }
  }, []);

  useEffect(() => {
    loadInvoices().finally(() => setIsLoading(false));
  }, [loadInvoices]);

  useOpsRealtime({ refresh: loadInvoices, pollIntervalMs: 5_000 });

  const awaiting = useMemo(
    () => {
      const pending = invoices.filter((invoice) => invoice.status === "Pending");
      if (!tableFilter) return pending;
      return pending.filter((invoice) => matchesTableFilter(invoice.tableCode, tableFilter));
    },
    [invoices, tableFilter],
  );
  const collected = useMemo(
    () => invoices.filter((invoice) => invoice.status === "Confirmed" || invoice.status === "Paid"),
    [invoices],
  );
  const stats = useMemo(() => [
    { label: "Bàn chờ thu", value: String(awaiting.length), detail: tableFilter ? `Lọc bàn ${tableFilter}` : "Hóa đơn toàn phiên" },
    { label: "Tổng cần thu", value: formatVnd(awaiting.reduce((sum, invoice) => sum + invoice.totalAmount, 0)), detail: "Sau ưu đãi" },
    { label: "Đã xác nhận", value: String(collected.length), detail: "Phiên đã đóng" },
  ], [awaiting, collected, tableFilter]);

  useEffect(() => {
    if (!tableFilter || awaiting.length === 0) return;
    highlightRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [awaiting.length, tableFilter]);

  /**
   * Đổi giao diện NGAY, hoàn tác nếu máy chủ từ chối.
   *
   * Quầy thu tiền mặt xong là bấm, rồi quay sang khách tiếp theo — chờ một vòng gọi mạng rồi chờ
   * thêm một lần tải lại cả danh sách là chờ hai lần cho một thao tác đã xong ngoài đời.
   *
   * HOÀN TÁC chỉ đúng hoá đơn đó, không khôi phục cả mảng. Trang này có realtime chạy song song
   * (`useOpsRealtime`), nên chụp cả mảng rồi đặt lại sẽ NUỐT MẤT những sự kiện đến trong lúc chờ —
   * một bàn khác vừa yêu cầu thanh toán sẽ biến khỏi màn hình.
   *
   * Khi thành công thì thay bằng hoá đơn máy chủ TRẢ VỀ chứ không giữ bản dự đoán: `paidAt`, số
   * tiền sau làm tròn và mã giao dịch chỉ máy chủ mới biết.
   */
  async function runAction(
    sessionId: string,
    duDoan: (invoice: TableInvoice) => TableInvoice,
    action: () => Promise<TableInvoice>,
    successMessage: string,
  ) {
    const truoc = invoices.find((invoice) => invoice.tableSessionId === sessionId);
    setPendingSessionId(sessionId);
    setNotice("");
    setInvoices((prev) =>
      prev.map((invoice) => (invoice.tableSessionId === sessionId ? duDoan(invoice) : invoice)),
    );
    try {
      const daCapNhat = await action();
      setInvoices((prev) =>
        prev.map((invoice) => (invoice.tableSessionId === sessionId ? daCapNhat : invoice)),
      );
      setNotice(successMessage);
    } catch (caughtError) {
      if (truoc) {
        setInvoices((prev) =>
          prev.map((invoice) => (invoice.tableSessionId === sessionId ? truoc : invoice)),
        );
      }
      setNotice(caughtError instanceof Error ? caughtError.message : "Thao tác thất bại. Thử lại.");
    } finally {
      setPendingSessionId(null);
    }
  }

  if (isLoading) {
    return <div className="ops-empty"><div className="ops-empty-icon"><CreditCard aria-hidden="true" /></div>Đang tải...</div>;
  }

  return (
    <div>
      {!embedded ? (
        <div className="ops-page-header">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div><h1>Thu ngân</h1><p>Xác nhận thanh toán cho toàn bộ hóa đơn của phiên bàn</p></div>
            <button className="ops-btn ops-btn--ghost ops-btn--sm" onClick={() => void loadInvoices()} type="button"><RefreshCw aria-hidden="true" size={14} /> Làm mới</button>
          </div>
        </div>
      ) : (
        <div className="ops-toolbar">
          <button className="ops-btn ops-btn--ghost ops-btn--sm" onClick={() => void loadInvoices()} type="button"><RefreshCw aria-hidden="true" size={14} /> Làm mới</button>
        </div>
      )}

      {error ? <div className="ops-notice ops-notice--danger">{error}</div> : null}
      {notice ? <div className="ops-notice ops-notice--info">{notice}</div> : null}

      <div className="ops-stats">
        {stats.map((stat) => (
          <div className="ops-stat-card" key={stat.label}>
            <div className="ops-stat-label">{stat.label}</div>
            <div className="ops-stat-value">{stat.value}</div>
            <div className="ops-stat-detail">{stat.detail}</div>
          </div>
        ))}
      </div>

      {tableFilter ? (
        <div className="ops-notice ops-notice--info">
          Đang ưu tiên hóa đơn bàn <strong>{tableFilter}</strong>
        </div>
      ) : null}

      {awaiting.length > 0 ? (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Hóa đơn chờ thu ({awaiting.length})</h3>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
            {awaiting.map((invoice, index) => (
              <article
                className={`ops-card${tableFilter && matchesTableFilter(invoice.tableCode, tableFilter) ? " ops-card--highlight" : ""}`}
                key={invoice.tableSessionId}
                ref={index === 0 && tableFilter ? highlightRef : undefined}
              >
                <div className="ops-card-header">
                  <span className="ops-card-code">Phiên {invoice.orderRounds.length} lượt gọi</span>
                  <span className="ops-card-table">Bàn {invoice.tableCode}</span>
                </div>
                <div className="ops-card-meta">
                  <span className="ops-badge ops-badge--pending">
                    {invoice.method === "COD" ? <Banknote aria-hidden="true" size={14} /> : <QrCode aria-hidden="true" size={14} />}
                    {invoice.method === "COD" ? "Tiền mặt" : "VietQR"} · Chờ thu
                  </span>
                  <strong>{formatVnd(invoice.totalAmount)}</strong>
                </div>
                <div className="ops-card-items">
                  {invoice.items.map((item) => <span className="ops-card-item-chip" key={item.menuItemId}>{item.quantity}× {item.name}</span>)}
                </div>
                {invoice.promotionCode ? <p>Ưu đãi: <strong>{invoice.promotionCode}</strong> (-{formatVnd(invoice.discountAmount)})</p> : null}
                {invoice.customerPhoneNumber ? <p>Tích điểm: <strong>{invoice.customerPhoneNumber}</strong></p> : null}
                <div className="ops-card-actions">
                  <button
                    className="ops-btn ops-btn--success ops-btn--sm"
                    disabled={pendingSessionId === invoice.tableSessionId}
                    onClick={() => void runAction(
                      invoice.tableSessionId,
                      // Dự đoán: hoá đơn chuyển sang "đã thu", tức rời khỏi danh sách chờ ngay.
                      (current) => ({ ...current, status: "Confirmed" }),
                      () => confirmTableInvoicePayment(invoice.tableSessionId, "Thu ngân xác nhận đã thu đủ."),
                      `Đã thanh toán bàn ${invoice.tableCode}`,
                    )}
                    type="button"
                  ><Check aria-hidden="true" size={14} /> Xác nhận thu</button>
                  <button
                    className="ops-btn ops-btn--ghost ops-btn--sm"
                    disabled={pendingSessionId === invoice.tableSessionId}
                    onClick={() => void runAction(
                      invoice.tableSessionId,
                      // Huỷ yêu cầu thì bàn quay lại trạng thái chưa yêu cầu thu, nên nó rời danh
                      // sách chờ mà KHÔNG sang danh sách đã thu.
                      (current) => ({ ...current, status: "NotRequested" }),
                      () => cancelTableInvoicePayment(invoice.tableSessionId, "Hủy yêu cầu để bàn tiếp tục gọi món."),
                      `Đã hủy yêu cầu bàn ${invoice.tableCode}`,
                    )}
                    type="button"
                  ><X aria-hidden="true" size={14} /> Hủy yêu cầu</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : <div className="ops-empty" style={{ padding: 24 }}>Không có hóa đơn chờ thu</div>}

      {collected.length > 0 ? (
        <section>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Đã thu ({collected.length})</h3>
          <table className="ops-table">
            <thead><tr><th>Bàn</th><th>Số lượt gọi</th><th>Phương thức</th><th>Tổng tiền</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {collected.map((invoice) => (
                <tr key={invoice.tableSessionId}>
                  <td><strong>{invoice.tableCode}</strong></td>
                  <td>{invoice.orderRounds.length}</td>
                  <td>{invoice.method === "COD" ? "Tiền mặt" : "VietQR"}</td>
                  <td>{formatVnd(invoice.totalAmount)}</td>
                  <td><span className="ops-badge ops-badge--confirmed">Đã xác nhận</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
