import { useCallback, useState } from "react";
import { ApiError } from "@cmc/api-client";
import { Gift, Link2, Search } from "lucide-react";
import type { LoyaltyVoucher } from "@cmc/shared-types";
import { api } from "../../services/apiClient";
import "../../components/operations/operations.css";
import "./counter-hub.css";

type KetQua = {
  phoneNumber: string;
  points: number;
  tierName: string;
  vouchers: LoyaltyVoucher[];
};

/**
 * Bỏ phiếu vừa phát khỏi danh sách đang hiện.
 *
 * Tách thành hàm thuần để kiểm được — cùng lý do với `moTaLechQuy` ở CounterShiftPanel. Sai ở đây
 * không nổ ra thành lỗi: phiếu đã phát vẫn nằm trên màn hình với một nút "Đã phát" bấm được, và
 * nhân viên tiếp theo nhìn vào sẽ đưa món lần thứ hai. Backend chặn được lần bấm đó, nhưng chỉ
 * SAU khi món đã ra khỏi bếp.
 */
export function boPhieuDaPhat(
  danhSach: readonly LoyaltyVoucher[],
  redemptionId: string,
): LoyaltyVoucher[] {
  return danhSach.filter((v) => v.redemptionId !== redemptionId);
}

/**
 * Quầy tra phiếu tặng món của khách và đánh dấu đã phát.
 *
 * Vì sao cần: từ V10 tới V15, đổi điểm chỉ ghi một dòng vào `loyalty_redemptions` mà không ai đọc.
 * Khách đổi được phiếu nhưng nhân viên không có cách nào tra, và phiếu không có trạng thái "đã
 * dùng" — chìa lại màn hình cũ ở lần ghé sau vẫn trông hợp lệ.
 *
 * Tra theo SỐ ĐIỆN THOẠI vì đó là thứ khách đọc ra ở quầy, và cũng là khoá của cả chương trình
 * tích điểm. Không quét mã: một mã cần khách mở đúng màn hình, còn số điện thoại thì đọc được cả
 * khi điện thoại hết pin.
 */
export function CounterVoucherPanel() {
  const [phone, setPhone] = useState("");
  const [maNoi, setMaNoi] = useState("");
  const [dangNoi, setDangNoi] = useState(false);
  const [ketQua, setKetQua] = useState<KetQua | null>(null);
  const [dangTra, setDangTra] = useState(false);
  const [dangThu, setDangThu] = useState<string | null>(null);
  const [loi, setLoi] = useState("");
  const [tin, setTin] = useState("");

  const tra = useCallback(async () => {
    const so = phone.trim();
    if (so === "") {
      setLoi("Nhập số điện thoại của khách.");
      return;
    }
    setDangTra(true);
    setLoi("");
    setTin("");
    try {
      const r = await api.loyalty.lookup(so);
      setKetQua({
        phoneNumber: r.phoneNumber,
        points: r.points,
        tierName: r.tierName,
        vouchers: r.pendingVouchers ?? [],
      });
    } catch (e) {
      setKetQua(null);
      setLoi(e instanceof ApiError ? e.message : "Không tra được. Thử lại.");
    } finally {
      setDangTra(false);
    }
  }, [phone]);

  /**
   * Nối số đã có hồ sơ vào tài khoản app của khách.
   *
   * Dùng CHÍNH ô số điện thoại ở trên: nhân viên vừa tra số đó xong, gõ lại là gõ hai lần cùng
   * một thứ và mở thêm một cơ hội gõ nhầm — mà gõ nhầm ở đây là nối hồ sơ của người khác.
   */
  const noiSo = useCallback(async () => {
    const so = phone.trim();
    if (so === "" || maNoi.trim() === "") {
      setLoi("Cần cả số điện thoại và mã khách đọc.");
      return;
    }
    setDangNoi(true);
    setLoi("");
    setTin("");
    try {
      await api.loyalty.linkPhoneAtCounter({ code: maNoi.trim(), phone: so });
      setMaNoi("");
      setTin(`Đã nối ${so} vào tài khoản của khách.`);
    } catch (e) {
      setLoi(e instanceof ApiError ? e.message : "Không nối được. Thử lại.");
    } finally {
      setDangNoi(false);
    }
  }, [maNoi, phone]);

  const thu = useCallback(
    async (v: LoyaltyVoucher) => {
      if (dangThu !== null) return;
      setDangThu(v.redemptionId);
      setLoi("");
      try {
        await api.loyalty.honourVoucher(v.redemptionId);
        // Bỏ khỏi danh sách ngay thay vì tra lại: nhân viên vừa bấm xong là quay sang làm món, và
        // một lượt gọi mạng nữa để lại khoảng thời gian phiếu vẫn còn trên màn hình.
        setKetQua((truoc) =>
          truoc === null
            ? null
            : { ...truoc, vouchers: boPhieuDaPhat(truoc.vouchers, v.redemptionId) },
        );
        setTin(`Đã phát: ${v.rewardName}`);
      } catch (e) {
        // Phiếu đã dùng rồi (409) là câu trả lời QUAN TRỌNG NHẤT của màn này — nghĩa là đừng đưa
        // món. Hiện thành lỗi đỏ chứ không phải thông báo xanh.
        setLoi(e instanceof ApiError ? e.message : "Không đánh dấu được. Thử lại.");
      } finally {
        setDangThu(null);
      }
    },
    [dangThu],
  );

  return (
    <section className="counter-workspace">
      <div className="ops-page-header">
        <h2>
          <Gift aria-hidden="true" size={18} /> Phiếu tặng món
        </h2>
      </div>

      <form
        className="counter-voucher-search"
        onSubmit={(e) => {
          e.preventDefault();
          void tra();
        }}
      >
        <label className="ops-field">
          <span>Số điện thoại khách</span>
          <input
            autoComplete="off"
            inputMode="tel"
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09xxxxxxxx"
            value={phone}
          />
        </label>
        <button className="ops-btn ops-btn--primary" disabled={dangTra} type="submit">
          <Search aria-hidden="true" size={16} /> {dangTra ? "Đang tra…" : "Tra phiếu"}
        </button>
      </form>

      {loi !== "" ? (
        <div className="counter-alert counter-alert--error" role="alert">
          {loi}
        </div>
      ) : null}
      {tin !== "" ? (
        <div className="counter-alert" role="status">
          {tin}
        </div>
      ) : null}

      {/*
        Nối tài khoản: đặt NGAY DƯỚI ô tra số, vì nhân viên đến đây sau khi đã gõ số đó rồi. Đặt
        thành một mục riêng ở nơi khác sẽ bắt gõ lại số — và gõ nhầm ở đây là nối hồ sơ của người
        khác vào tài khoản khách.
      */}
      <form
        className="counter-voucher-search"
        onSubmit={(e) => {
          e.preventDefault();
          void noiSo();
        }}
      >
        <label className="ops-field">
          <span>Mã khách đọc (nối tài khoản)</span>
          <input
            autoComplete="off"
            inputMode="numeric"
            onChange={(e) => setMaNoi(e.target.value)}
            placeholder="6 chữ số"
            value={maNoi}
          />
        </label>
        <button className="ops-btn ops-btn--ghost" disabled={dangNoi} type="submit">
          <Link2 aria-hidden="true" size={16} /> {dangNoi ? "Đang nối…" : "Nối tài khoản"}
        </button>
      </form>

      {ketQua === null ? null : (
        <>
          <p className="ops-muted">
            {ketQua.phoneNumber} · hạng {ketQua.tierName} · {ketQua.points} điểm
          </p>

          {ketQua.vouchers.length === 0 ? (
            <p className="ops-muted">Số này không có phiếu nào chưa dùng.</p>
          ) : (
            <ul className="counter-voucher-list">
              {ketQua.vouchers.map((v) => (
                <li className="counter-voucher-item" key={v.redemptionId}>
                  <div>
                    <strong>{v.rewardName}</strong>
                    <span className="ops-muted">
                      {" "}
                      · đổi {new Date(v.redeemedAt).toLocaleDateString("vi-VN")} · {v.pointsSpent}{" "}
                      điểm
                    </span>
                  </div>
                  <button
                    className="ops-btn ops-btn--primary ops-btn--sm"
                    disabled={dangThu !== null}
                    onClick={() => void thu(v)}
                    type="button"
                  >
                    {dangThu === v.redemptionId ? "Đang ghi…" : "Đã phát"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
