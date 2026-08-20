import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@cmc/api-client";
import { Clock3, RefreshCw, Vault, Wallet } from "lucide-react";
import {
  closeCounterShift,
  getCurrentCounterShift,
  openCounterShift,
  type CounterShiftSummary,
} from "../../services/counterShiftService";
import { formatVndDigitsInput, parseVndDigitsInput } from "../../utils/vndInputFormat";
import "../../components/operations/operations.css";
import "./counter-hub.css";
import { useOpsConfirm } from "../../components/operations/OpsConfirmProvider";

const formatVnd = (value: number) => `${value.toLocaleString("vi-VN")}đ`;

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

/**
 * Mô tả chênh lệch giữa tiền đếm được và tiền kỳ vọng.
 *
 * Tách thành hàm thuần để kiểm được. Đây là tính tiền CÓ DẤU: nhầm chiều một lần là hộp thoại báo
 * "thừa" trong khi két đang thiếu, và thu ngân bấm chốt vì thấy không có vấn đề gì.
 *
 * Nói "THIẾU 50.000đ" chứ không nói "-50.000đ": một dấu trừ giữa câu rất dễ trôi qua mắt người
 * vừa đếm xong két lúc cuối ca.
 */
export function moTaLechQuy(thucDem: number, kyVong: number): string {
  const lech = thucDem - kyVong;
  if (lech === 0) {
    return "Khớp đúng số kỳ vọng.";
  }
  const huong = lech > 0 ? "THỪA" : "THIẾU";
  return `${huong} ${formatVnd(Math.abs(lech))} so với kỳ vọng ${formatVnd(kyVong)}.`;
}

export function CounterShiftPanel({
  embedded = false,
  supervisorMode = false,
}: {
  embedded?: boolean;
  supervisorMode?: boolean;
}) {
  const confirm = useOpsConfirm();
  const [shift, setShift] = useState<CounterShiftSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const current = await getCurrentCounterShift();
      setShift(current);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      const apiMessage = error instanceof ApiError ? error.message : "";
      if (status === 403) {
        setLoadError("Tài khoản không có quyền quản lý ca quầy. Liên hệ admin để cấp quyền CounterStaff hoặc Staff.");
      } else if (status === 401) {
        setLoadError("Phiên đăng nhập hết hạn. Tải lại trang và đăng nhập lại.");
      } else if (status >= 500) {
        setLoadError("Máy chủ không đọc được ca quầy (có thể thiếu migration DB). Thử lại hoặc báo DevOps.");
      } else if (apiMessage) {
        setLoadError(`Không tải được thông tin ca quầy: ${apiMessage}`);
      } else {
        setLoadError("Không tải được thông tin ca quầy. Bạn vẫn có thể thử mở ca mới.");
      }
    } finally {
      setLoading(false);
    }
  }, [embedded]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleOpenShift() {
    const balance = parseVndDigitsInput(openingCash);
    try {
      setShift(await openCounterShift(balance));
      setNotice("Đã mở ca quầy.");
      setLoadError("");
    } catch {
      setNotice("Không mở được ca. Kiểm tra ca đang mở hoặc quyền truy cập.");
    }
  }

  async function handleCloseShift() {
    if (!shift) return;
    const actual = parseVndDigitsInput(closingCash);
    if (closingCash.trim() === "") {
      setNotice("Nhập số tiền thực tế trong két.");
      return;
    }
    // Hiện số LỆCH trước khi chốt, vì đây là con số duy nhất người ta thật sự cần cân nhắc —
    // và sau khi chốt thì ca đã đóng, không sửa lại được.
    //
    // Tự tính chênh lệch thay vì bắt thu ngân nhẩm: đếm két xong, người ta đang mệt, và một dấu
    // trừ bị bỏ sót nghĩa là ca đóng với khoản thiếu không ai ghi nhận.
    const lech = actual - shift.expectedCashTotal;
    const moTaLech = moTaLechQuy(actual, shift.expectedCashTotal);

    if (!(await confirm({
      title: "Chốt ca quầy?",
      message: `Thực đếm ${formatVnd(actual)}. ${moTaLech} Ca đã chốt thì không mở lại được.`,
      confirmLabel: "Chốt ca",
      danger: lech !== 0,
    }))) return;

    try {
      setShift(await closeCounterShift(shift.shiftId, actual));
      setClosingCash("");
      setNotice("Đã chốt ca quầy.");
    } catch {
      setNotice("Chốt ca thất bại.");
    }
  }

  if (loading) {
    return (
      <div className="counter-workspace counter-loading" aria-busy="true">
        <div className="counter-skeleton counter-skeleton--hero" />
        <div className="counter-metrics">
          <div className="counter-skeleton counter-skeleton--metric" />
          <div className="counter-skeleton counter-skeleton--metric" />
          <div className="counter-skeleton counter-skeleton--metric" />
        </div>
      </div>
    );
  }

  const isOpen = shift?.status === "Open";

  return (
    <section className="counter-workspace">
      {!embedded ? (
        <div className="ops-page-header">
          <h2 style={{ margin: 0 }}>Ca quầy</h2>
          <p style={{ margin: "4px 0 0" }}>Mở ca trước khi thu tiền, chốt ca cuối phiên</p>
        </div>
      ) : null}

      {loadError ? (
        <div className="counter-alert counter-alert--error" role="alert">
          <span>{loadError}</span>
          <button className="ops-btn ops-btn--ghost ops-btn--sm" type="button" onClick={() => void refresh()}>
            <RefreshCw aria-hidden="true" size={14} /> Thử lại
          </button>
        </div>
      ) : null}

      {notice ? (
        <div className="counter-alert counter-alert--info" role="status">
          {notice}
        </div>
      ) : null}

      {supervisorMode ? (
        <div className="counter-alert counter-alert--info" role="status">
          Chế độ giám sát: chỉ xem số liệu ca. Nhân viên quầy mở/chốt ca và thu tiền tại workspace quầy.
        </div>
      ) : null}

      {isOpen && shift ? (
        <>
          <div className="counter-shift-hero counter-shift-hero--open">
            <div className="counter-shift-hero-icon" aria-hidden="true">
              <Vault size={24} />
            </div>
            <span className="counter-shift-status">
              <span className="counter-shift-pulse" aria-hidden="true" />
              Ca đang mở
            </span>
            <h2>Quầy sẵn sàng thu tiền</h2>
            <p>
              Mở bởi <strong>{shift.openedByName}</strong> lúc <strong>{formatTime(shift.openedAt)}</strong>
            </p>
          </div>

          <div className="counter-metrics">
            <article className="counter-metric">
              <p className="counter-metric-label">Tiền đầu ca</p>
              <p className="counter-metric-value">{formatVnd(shift.openingCashBalance)}</p>
              <p className="counter-metric-detail">Số dư khi mở ca</p>
            </article>
            <article className="counter-metric">
              <p className="counter-metric-label">Dự kiến trong két</p>
              <p className="counter-metric-value">{formatVnd(shift.expectedCashTotal)}</p>
              <p className="counter-metric-detail">Tiền mặt + đầu ca</p>
            </article>
            <article className="counter-metric">
              <p className="counter-metric-label">Thời gian mở</p>
              <p className="counter-metric-value">{formatTime(shift.openedAt)}</p>
              <p className="counter-metric-detail">{new Date(shift.openedAt).toLocaleDateString("vi-VN")}</p>
            </article>
          </div>

          {!supervisorMode ? (
          <div className="counter-action-card">
            <h3>Chốt ca cuối phiên</h3>
            <p>Đếm tiền thực tế trong két và nhập số liệu trước khi kết thúc ca.</p>
            <div className="counter-money-field">
              <label htmlFor="counter-closing-cash">Tiền thực tế trong két</label>
              <div className="counter-money-input-wrap">
                <span className="counter-money-prefix">₫</span>
                <input
                  id="counter-closing-cash"
                  inputMode="numeric"
                  onChange={(event) => setClosingCash(formatVndDigitsInput(event.target.value))}
                  placeholder="2.500.000"
                  value={closingCash}
                />
              </div>
            </div>
            <div className="counter-action-row">
              <button className="ops-btn ops-btn--primary" type="button" onClick={() => void handleCloseShift()}>
                Chốt ca
              </button>
            </div>
          </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="counter-shift-hero">
            <div className="counter-shift-hero-icon" aria-hidden="true">
              <Clock3 size={24} />
            </div>
            <h2>{supervisorMode ? "Chưa có ca quầy mở" : "Chưa mở ca quầy"}</h2>
            <p>
              {supervisorMode
                ? "Khi nhân viên quầy mở ca, bạn sẽ thấy tiền đầu ca và dự kiến trong két tại đây."
                : "Nhập tiền mặt đầu ca để bắt đầu phiên thu ngân. Sau khi mở ca, chuyển sang tab Chờ thanh toán."}
            </p>
          </div>

          {!supervisorMode ? (
          <div className="counter-action-card">
            <h3>Mở ca mới</h3>
            <p>Tiền đầu ca là số tiền mặt có sẵn trong két trước khi bắt đầu thu.</p>
            <div className="counter-money-field">
              <label htmlFor="counter-opening-cash">Tiền đầu ca</label>
              <div className="counter-money-input-wrap">
                <span className="counter-money-prefix">₫</span>
                <input
                  id="counter-opening-cash"
                  inputMode="numeric"
                  onChange={(event) => setOpeningCash(formatVndDigitsInput(event.target.value))}
                  placeholder="100.000"
                  value={openingCash}
                />
              </div>
            </div>
            <div className="counter-action-row">
              <button className="ops-btn ops-btn--primary" type="button" onClick={() => void handleOpenShift()}>
                <Wallet aria-hidden="true" size={16} /> Mở ca
              </button>
            </div>
          </div>
          ) : null}
        </>
      )}
    </section>
  );
}
