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
import { chiGiuChuSo, docTienDua, thieuTien, tinhThoiLai } from "../components/operations/opsCashTendered";
import type { ThongBaoDaThu } from "../components/operations/opsCashierAlerts";

const formatVnd = (value: number) => `${value.toLocaleString("vi-VN")}đ`;

/**
 * Số tiền phải thối, hiện NGAY trong lúc gõ.
 *
 * Đây là toàn bộ giá trị của tính năng: người đứng quầy đọc con số thay vì tự trừ nhẩm trong lúc
 * khách đứng chờ. Hiện sau khi bấm thì đã muộn — tiền đã đưa ra khỏi ngăn kéo.
 */
function ThoiLai({ khachDua, tong }: { khachDua: string | undefined; tong: number }) {
  const thoi = tinhThoiLai(khachDua, tong);
  if (thoi === null) {
    // Đang nhập thiếu thì nói THẲNG là thiếu, không hiện một con số âm — "-5.000đ" là thứ người
    // đang vội đọc lướt thành 5.000.
    return thieuTien(khachDua, tong)
      ? <strong className="ops-cash-short">Khách đưa thiếu {formatVnd(tong - Math.floor(Number(khachDua)))}</strong>
      : <span className="ops-cash-hint">Để trống nếu khách đưa đúng</span>;
  }
  return <strong className="ops-cash-change">Thối lại {formatVnd(thoi)}</strong>;
}

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

  /**
   * Tiền khách đưa, theo từng phiên bàn, dạng CHUỖI đúng như người ta gõ.
   *
   * Giữ chuỗi chứ không giữ số: người đang gõ "5" trên đường tới "50000" không được bị hiểu là
   * khách đưa 5 đồng, và một ô nhập tự nhảy số trong lúc gõ là ô nhập không ai tin.
   */
  const [tienDua, setTienDua] = useState<Record<string, string>>({});

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
  /**
   * Tổng tiền còn phải thu.
   *
   * Trước đây đây là một trong SÁU ô số chiếm hết chiều cao màn hình trước khi thấy hoá đơn nào.
   * Hai con số quầy thật sự dùng là "còn mấy bàn" và "còn bao nhiêu tiền"; số bàn đã nằm trên tab
   * rồi, nên chỉ còn con số này, và nó về nằm trên thanh tiêu đề.
   */
  const conPhaiThu = useMemo(
    () => awaiting.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
    [awaiting],
  );

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
    <div className="pos">
      {/*
        MỘT thanh, không phải một khối tiêu đề rồi ba ô số rồi bốn dải thông báo.

        Quầy thu tiền chỉ cần hai con số: còn mấy bàn, còn bao nhiêu tiền. Số bàn đã nằm trên tab
        bên dưới, nên ở đây chỉ còn số tiền — và nó đứng cạnh tiêu đề thay vì chiếm một hàng thẻ
        riêng.
      */}
      <header className="pos-bar">
        {!embedded ? <h1 className="pos-title">Thu ngân</h1> : null}
        <p className="pos-sum">
          <span>Còn phải thu</span>
          <strong data-money>{formatVnd(conPhaiThu)}</strong>
        </p>
        <button className="ops-btn ops-btn--ghost ops-btn--sm" onClick={() => void loadInvoices()} type="button">
          <RefreshCw aria-hidden="true" size={14} /> Làm mới
        </button>
      </header>

      {/*
        MỘT danh sách: những bàn còn phải thu. Không có tab "đã thu" ở đây.

        Hub quầy đã có tab anh em "Lịch sử hóa đơn", và bảng đó đã lọc sẵn Tất cả / Chờ thanh toán
        / Đã thanh toán / Đã hủy. Thêm một tab "đã thu" vào đây là tab LỒNG trong tab, và là bản
        sao của một thứ đã tồn tại cách đó một cú bấm — bản dựng lại đầu tiên của màn này đã mắc
        đúng lỗi đó.
      */}
      <div className="pos-tabs">
        <h2 className="pos-tab pos-tab--on">
          Chờ thu <span className="pos-tab-count">{awaiting.length}</span>
        </h2>

        {codAwaiting.length > 0 ? (
          <button
            className="ops-btn ops-btn--success ops-btn--sm pos-bulk"
            onClick={() => void bulkConfirmCod()}
            title="Phím tắt: C"
            type="button"
          >
            <Banknote aria-hidden="true" size={14} /> Thu tất cả tiền mặt ({codAwaiting.length})
            <kbd className="pos-kbd">C</kbd>
          </button>
        ) : null}
      </div>

      {/*
        MỘT chỗ cho thông báo, không phải bốn dải xếp chồng. Lỗi đè lên tin thường vì lỗi là thứ
        chặn việc; tin lọc bàn xuống cuối vì nó chỉ là ngữ cảnh.
      */}
      {error || notice || tableFilter ? (
        <p className={`pos-msg${error ? " pos-msg--err" : ""}`} role="status">
          {error || notice || <>Đang ưu tiên hóa đơn bàn <strong>{tableFilter}</strong></>}
        </p>
      ) : null}

      {awaiting.length === 0 ? (
        <div className="ops-empty" style={{ padding: 32 }}>Không có bàn nào chờ thu</div>
      ) : (
        <div className="pos-grid">
          {awaiting.map((invoice, index) => {
            const laTienMat = invoice.method === "COD";
            const dua = tienDua[invoice.tableSessionId];
            return (
              <article
                className={`pos-card${tableFilter && matchesTableFilter(invoice.tableCode, tableFilter) ? " pos-card--hl" : ""}`}
                key={invoice.tableSessionId}
                ref={index === 0 && tableFilter ? highlightRef : undefined}
              >
                {/*
                  Bàn và số tiền là hai thứ duy nhất đọc từ xa được, nên chúng đứng riêng một hàng
                  và to hơn hẳn phần còn lại. Mọi thứ khác gộp vào MỘT dòng phụ.
                */}
                <div className="pos-card-top">
                  <span className="pos-table">{invoice.tableCode}</span>
                  <span className="pos-amount" data-money>{formatVnd(invoice.totalAmount)}</span>
                </div>

                <p className="pos-meta">
                  {laTienMat ? <Banknote aria-hidden="true" size={13} /> : <QrCode aria-hidden="true" size={13} />}
                  {laTienMat ? "Tiền mặt" : "VietQR"}
                  <span aria-hidden="true">·</span>
                  {invoice.orderRounds.length} lượt gọi
                  {invoice.promotionCode ? <><span aria-hidden="true">·</span>{invoice.promotionCode} −{formatVnd(invoice.discountAmount)}</> : null}
                  {invoice.customerPhoneNumber ? <><span aria-hidden="true">·</span>{invoice.customerPhoneNumber}</> : null}
                </p>

                {/*
                  Danh sách món GẤP LẠI. Nó dài nhất thẻ và hầu như không được đọc — thu ngân nhìn
                  số tiền, không đối chiếu từng món. Nhưng khi khách thắc mắc thì phải có, nên gấp
                  chứ không bỏ.
                */}
                <details className="pos-items">
                  <summary>{invoice.items.length} món</summary>
                  <ul>
                    {invoice.items.map((item) => (
                      <li key={item.menuItemId}><span>{item.quantity}×</span> {item.name}</li>
                    ))}
                  </ul>
                </details>

                {laTienMat ? (
                  <div className="pos-cash">
                    <label htmlFor={`tien-dua-${invoice.tableSessionId}`}>Khách đưa</label>
                    <input
                      id={`tien-dua-${invoice.tableSessionId}`}
                      inputMode="numeric"
                      onChange={(e) => setTienDua((truoc) => ({
                        ...truoc,
                        [invoice.tableSessionId]: chiGiuChuSo(e.target.value),
                      }))}
                      placeholder={String(invoice.totalAmount)}
                      value={dua ?? ""}
                    />
                    <ThoiLai khachDua={dua} tong={invoice.totalAmount} />
                  </div>
                ) : null}

                {/*
                  MỘT nút chính. "Hủy yêu cầu" là việc hiếm và không thể lẫn với việc thu tiền, nên
                  nó là chữ chứ không phải nút — hai nút cạnh nhau cùng cỡ là cách mời người ta bấm
                  nhầm vào lúc đông khách.
                */}
                <div className="pos-act">
                  <button
                    className="ops-btn ops-btn--success pos-confirm"
                    disabled={pendingSessionId === invoice.tableSessionId || thieuTien(dua, invoice.totalAmount)}
                    onClick={() => void runAction(
                      invoice.tableSessionId,
                      (current) => ({ ...current, status: "Confirmed" }),
                      () => confirmTableInvoicePayment(
                        invoice.tableSessionId,
                        "Thu ngân xác nhận đã thu đủ.",
                        docTienDua(dua),
                      ),
                      `Đã thanh toán bàn ${invoice.tableCode}`,
                    )}
                    type="button"
                  >
                    <Check aria-hidden="true" size={16} /> Xác nhận thu
                  </button>
                  <button
                    className="pos-cancel"
                    disabled={pendingSessionId === invoice.tableSessionId}
                    onClick={() => void runAction(
                      invoice.tableSessionId,
                      (current) => ({ ...current, status: "NotRequested" }),
                      () => cancelTableInvoicePayment(invoice.tableSessionId, "Hủy yêu cầu để bàn tiếp tục gọi món."),
                      `Đã hủy yêu cầu bàn ${invoice.tableCode}`,
                    )}
                    type="button"
                  >
                    Hủy yêu cầu
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/*
        Thông báo tiền vào NỔI, không chen vào dòng chảy trang.

        Bản trước chèn nó lên đầu trang, nên mỗi lần có bàn trả tiền là toàn bộ danh sách bị đẩy
        xuống — đúng lúc người ta đang nhắm bấm một nút. Nổi ở góc thì nó thấy được mà không dịch
        chuyển thứ gì.

        `aria-live="assertive"`: đây là tiền vừa vào, nó phải cắt ngang. Giữ đến khi bấm bỏ, KHÔNG
        tự tắt — một thông báo tiền bạc biến mất trong lúc người ta quay đi là đúng cái hỏng nó
        sinh ra để chặn.
      */}
      {daThu.length > 0 ? (
        <div aria-live="assertive" className="ops-toast-stack" role="status">
          {daThu.map((tb) => (
            <div className="ops-toast pos-toast" key={tb.invoiceCode}>
              <QrCode aria-hidden="true" size={16} />
              <span>
                <strong>Bàn {tb.tableCode || "?"} đã thanh toán {formatVnd(tb.totalAmount)}</strong>
                <small>chuyển khoản tự động</small>
              </span>
              <button
                aria-label={`Bỏ thông báo bàn ${tb.tableCode}`}
                className="pos-toast-x"
                onClick={() => setDaThu((truoc) => truoc.filter((x) => x.invoiceCode !== tb.invoiceCode))}
                type="button"
              >
                <X aria-hidden="true" size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
