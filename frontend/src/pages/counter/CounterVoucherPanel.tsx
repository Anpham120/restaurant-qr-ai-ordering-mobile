import { useCallback, useState } from "react";
import { ApiError } from "@cmc/api-client";
import { Gift, Search } from "lucide-react";
import type { LoyaltyReward, LoyaltyVoucher } from "@cmc/shared-types";
import { api } from "../../services/apiClient";
import "../../components/operations/operations.css";
import {
  canHoiMaDon,
  canhBaoTruocKhiDoi,
  huongDanSauKhiDoi,
  khoaChongTrung,
  type HuongDan,
} from "./counterRedeemGuidance";
import "./counter-hub.css";

type KetQua = {
  phoneNumber: string;
  points: number;
  tierName: string;
  vouchers: LoyaltyVoucher[];
  /** Ưu đãi số này đổi được NGAY — máy chủ đã lọc theo cả điểm lẫn hạng. */
  uuDaiDoiDuoc: LoyaltyReward[];
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
  const [ketQua, setKetQua] = useState<KetQua | null>(null);
  const [dangTra, setDangTra] = useState(false);
  const [dangThu, setDangThu] = useState<string | null>(null);
  const [loi, setLoi] = useState("");
  const [tin, setTin] = useState("");
  const [maDon, setMaDon] = useState("");
  const [dangDoi, setDangDoi] = useState<string | null>(null);
  const [huongDan, setHuongDan] = useState<HuongDan | null>(null);

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
        uuDaiDoiDuoc: r.availableRewards ?? [],
      });
      setHuongDan(null);
    } catch (e) {
      setKetQua(null);
      setLoi(e instanceof ApiError ? e.message : "Không tra được. Thử lại.");
    } finally {
      setDangTra(false);
    }
  }, [phone]);

  /**
   * Đổi thưởng HỘ khách chỉ dùng web.
   *
   * Điểm bị trừ là điểm THẬT của khách, và người bấm không phải người mất điểm. Nên: hỏi lại
   * trước khi bấm, khoá chống trùng cho mỗi lần bấm, và sau khi xong phải nói RÕ nhân viên làm
   * gì tiếp — ba kết cục khác nhau, một câu "thành công" chung chung là vô dụng ở quầy.
   */
  const doiHo = useCallback(
    async (reward: LoyaltyReward) => {
      if (dangDoi !== null || ketQua === null) return;
      if (!window.confirm(canhBaoTruocKhiDoi(ketQua.points, reward))) return;

      setDangDoi(reward.rewardId);
      setLoi("");
      setTin("");
      try {
        const kq = await api.loyalty.counterRedeem(
          {
            phone: ketQua.phoneNumber,
            rewardId: reward.rewardId,
            orderCode: canHoiMaDon(reward) && maDon.trim() !== "" ? maDon.trim() : null,
          },
          khoaChongTrung(),
        );
        setHuongDan(huongDanSauKhiDoi(kq));
        setMaDon("");
        // Số dư và danh sách phiếu đều đổi sau một lần đổi. Tra lại để nhân viên đọc đúng con số
        // cho khách, thay vì tự trừ trong đầu.
        await tra();
      } catch (e) {
        setLoi(e instanceof ApiError ? e.message : "Không đổi được. Thử lại.");
      } finally {
        setDangDoi(null);
      }
    },
    [dangDoi, ketQua, maDon, tra],
  );

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
      {ketQua === null ? null : (
        <>
          <p className="ops-muted">
            {ketQua.phoneNumber} · hạng {ketQua.tierName} · {ketQua.points} điểm
          </p>

          {/*
            Hướng dẫn sau khi đổi. Ba kết cục khác nhau ở việc nhân viên phải LÀM GÌ tiếp, nên
            không có câu "đổi thành công" chung chung ở đây — câu đó không nói được gì ở quầy.

            Ca đáng lo nhất là tặng món CHƯA gắn đơn: không có mã để đọc, cũng không có món nào
            vào bếp. Im lặng ở đó thì nhân viên tưởng hỏng và bấm lại — lần bấm thứ hai sinh khoá
            chống trùng mới nên máy chủ không cứu được, và khách mất điểm thật lần nữa.
          */}
          {huongDan ? (
            <div className="counter-redeem-ketqua" role="status" aria-live="polite">
              <p>{huongDan.cauChinh}</p>
              {huongDan.maDocChoKhach ? (
                <strong className="counter-redeem-ma">{huongDan.maDocChoKhach}</strong>
              ) : null}
              {huongDan.vieccConLai ? <p className="ops-muted">{huongDan.vieccConLai}</p> : null}
            </div>
          ) : null}

          {ketQua.uuDaiDoiDuoc.length === 0 ? (
            <p className="ops-muted">Số này chưa đủ điểm cho ưu đãi nào.</p>
          ) : (
            <>
              <h3 className="counter-redeem-tieude">Đổi hộ khách</h3>
              {ketQua.uuDaiDoiDuoc.some(canHoiMaDon) ? (
                <label className="ops-field">
                  <span>Mã đơn đang mở (chỉ cần cho ưu đãi tặng món)</span>
                  <input
                    autoComplete="off"
                    onChange={(e) => setMaDon(e.target.value)}
                    placeholder="ORD-1042 — bỏ trống thì phiếu nằm chờ, phát bằng tay"
                    value={maDon}
                  />
                </label>
              ) : null}
              <ul className="counter-voucher-list">
                {ketQua.uuDaiDoiDuoc.map((r) => (
                  <li className="counter-voucher-item" key={r.rewardId}>
                    <div>
                      <strong>{r.name}</strong>
                      <span className="ops-muted"> · {r.pointsRequired} điểm</span>
                    </div>
                    <button
                      className="ops-btn ops-btn--primary ops-btn--sm"
                      disabled={dangDoi !== null}
                      onClick={() => void doiHo(r)}
                      type="button"
                    >
                      {dangDoi === r.rewardId ? "Đang đổi…" : "Đổi hộ"}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

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
