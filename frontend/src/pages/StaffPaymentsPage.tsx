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
import { useOpsConfirm } from "../components/operations/OpsConfirmProvider";
import { locThanhToanTuDong, themThongBao } from "../components/operations/opsCashierAlerts";
import type { ThongBaoDaThu } from "../components/operations/opsCashierAlerts";

const formatVnd = (value: number) => `${value.toLocaleString("vi-VN")}đ`;

/**
 * Những hoá đơn được phép xác nhận HÀNG LOẠT.
 *
 * Hai điều kiện, và điều kiện thứ hai là hàng rào an toàn:
 *
 *   status === "Pending"  — chỉ hoá đơn đang chờ thu
 *   method === "COD"      — CHỈ tiền mặt
 *
 * VietQR bị loại có chủ đích. Hai phương thức khác nhau về bản chất chứ không chỉ khác tên: tiền
 * mặt do thu ngân đếm nên chính họ xác nhận, còn VietQR được đối soát tự động qua webhook Casso
 * (#3). Bấm "đã thu" cho một hoá đơn VietQR là khẳng định tiền đã về trong khi chưa ai kiểm — đúng
 * loại thao tác mà việc gom hàng loạt khiến người ta làm mà không kịp nghĩ.
 *
 * Tách thành hàm thuần để kiểm được: nới điều kiện này ra là mở đường cho việc đánh dấu đã thu một
 * khoản tiền chưa về.
 */
export function locCoTheThuHangLoat(invoices: TableInvoice[]): TableInvoice[] {
  return invoices.filter((invoice) => invoice.status === "Pending" && invoice.method === "COD");
}

export function StaffPaymentsPage({ embedded = false }: { embedded?: boolean }) {
  const confirm = useOpsConfirm();
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

  /** Hoá đơn vừa TỰ chốt qua chuyển khoản — thứ thu ngân không tự tay bấm nên phải được báo. */
  const [daThu, setDaThu] = useState<ThongBaoDaThu[]>([]);

  /**
   * Phiên mà CHÍNH trang này vừa xác nhận bằng tay.
   *
   * Máy chủ phát cùng một sự kiện cho cả hai đường chốt hoá đơn, và sự kiện không mang thông tin
   * ai chốt. Chỉ trang này biết mình vừa bấm gì, nên việc phân biệt phải nằm ở đây.
   *
   * Dùng ref chứ không dùng state: nó chỉ để lọc, không được kéo theo một lần vẽ lại.
   */
  const tuBamRef = useRef<Set<string>>(new Set());

  useOpsRealtime({
    refresh: loadInvoices,
    pollIntervalMs: 5_000,
    onEvent: (event) => {
      const tb = locThanhToanTuDong(event, tuBamRef.current);
      if (tb) setDaThu((truoc) => themThongBao(truoc, tb));
    },
  });

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
    // Đánh dấu TRƯỚC khi gọi máy chủ: sự kiện thời gian thực có thể về trước cả câu trả lời HTTP.
    tuBamRef.current.add(sessionId);
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

  const codAwaiting = useMemo(() => locCoTheThuHangLoat(awaiting), [awaiting]);

  const bulkConfirmCod = useCallback(async () => {
    if (codAwaiting.length === 0) return;
    const tong = codAwaiting.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const banList = codAwaiting.map((invoice) => invoice.tableCode ?? "?").join(", ");

    if (!(await confirm({
      title: `Xác nhận đã thu ${codAwaiting.length} bàn tiền mặt?`,
      // Liệt kê MÃ BÀN chứ không chỉ số lượng: hàng rào thật ở đây là thu ngân đọc lại xem bàn nào
      // sắp bị đánh dấu đã thu, chứ không phải gõ lại một con số.
      message: `Bàn ${banList}. Tổng ${formatVnd(tong)}. Số này vào quỹ ca hiện tại.`,
      confirmLabel: "Đã thu đủ",
      danger: true,
    }))) return;

    const muc = codAwaiting;
    // Cùng lý do với thao tác đơn lẻ: đánh dấu TRƯỚC khi gọi máy chủ, để sự kiện thời gian thực
    // về sớm cũng không bật thông báo cho thứ chính người này vừa bấm.
    for (const m of muc) tuBamRef.current.add(m.tableSessionId);
    setNotice("");
    // Đánh dấu cả nhóm trước, rồi hoàn tác từng hoá đơn nào máy chủ từ chối — cùng lý do với thao
    // tác đơn lẻ: không đụng tới những hoá đơn khác đang có trên màn hình.
    setInvoices((prev) =>
      prev.map((invoice) =>
        muc.some((m) => m.tableSessionId === invoice.tableSessionId)
          ? { ...invoice, status: "Confirmed" }
          : invoice,
      ),
    );
    const ketQua = await Promise.allSettled(
      muc.map((invoice) => confirmTableInvoicePayment(invoice.tableSessionId, "Thu ngân xác nhận đã thu đủ.")),
    );
    setInvoices((prev) =>
      prev.map((invoice) => {
        const i = muc.findIndex((m) => m.tableSessionId === invoice.tableSessionId);
        if (i < 0) return invoice;
        const r = ketQua[i];
        return r.status === "fulfilled" ? r.value : muc[i];
      }),
    );
    const hong = ketQua.filter((r) => r.status === "rejected").length;
    setNotice(hong === 0
      ? `Đã thu ${muc.length} bàn, tổng ${formatVnd(tong)}.`
      : `${muc.length - hong}/${muc.length} bàn thu được, ${hong} bàn lỗi — kiểm lại danh sách chờ.`);
  }, [codAwaiting, confirm]);

  /**
   * Phím tắt cho thao tác lặp nhiều nhất trong giờ cao điểm.
   *
   * `c` chỉ MỞ hộp xác nhận, không tự xác nhận. Một phím đơn làm thay đổi tiền là thứ không nên
   * tồn tại: thu ngân gõ tìm bàn, chạm nhầm bàn phím, và cả loạt hoá đơn thành "đã thu".
   *
   * Bỏ qua khi con trỏ đang ở ô nhập, và khi có phím điều khiển — nếu không thì gõ chữ "c" trong ô
   * tìm kiếm sẽ bật hộp thoại.
   */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const el = event.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        void bulkConfirmCod();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [bulkConfirmCod]);

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

      {/*
        Khách chuyển khoản xong thì hoá đơn tự rời cột "Bàn chờ thu" — im lặng. Người đứng quầy
        đang nhìn chỗ khác sẽ không biết bàn nào vừa trả tiền, và vẫn đi đòi tiền bàn đã trả.

        `aria-live="assertive"` chứ không phải "polite": đây là tiền vừa vào, và nó phải cắt ngang
        việc đang làm. Giữ đến khi bấm bỏ, KHÔNG tự tắt theo giờ — một thông báo tiền bạc biến mất
        trong lúc người ta quay đi là đúng cái hỏng mà nó sinh ra để chặn.
      */}
      {daThu.length > 0 ? (
        <div aria-live="assertive" className="ops-notice ops-notice--success" role="status">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {daThu.map((tb) => (
              <li key={tb.invoiceCode} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <QrCode aria-hidden="true" size={16} />
                <strong>Bàn {tb.tableCode || "?"} đã thanh toán {formatVnd(tb.totalAmount)}</strong>
                <span style={{ opacity: 0.75 }}>chuyển khoản tự động · {tb.invoiceCode}</span>
                <button
                  className="ops-btn ops-btn--ghost ops-btn--sm"
                  onClick={() => setDaThu((truoc) => truoc.filter((x) => x.invoiceCode !== tb.invoiceCode))}
                  type="button"
                >
                  <X aria-hidden="true" size={12} /> Đã xem
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
          <div className="ops-toolbar" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Hóa đơn chờ thu ({awaiting.length})</h3>
            {codAwaiting.length > 0 ? (
              <button
                className="ops-btn ops-btn--success ops-btn--sm"
                onClick={() => void bulkConfirmCod()}
                type="button"
                // Nhắc phím tắt ngay trên nút: một phím tắt không ai biết thì không tồn tại.
                title="Phím tắt: C"
              >
                <Banknote aria-hidden="true" size={14} />
                Thu tất cả tiền mặt ({codAwaiting.length}) · phím C
              </button>
            ) : null}
          </div>
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
