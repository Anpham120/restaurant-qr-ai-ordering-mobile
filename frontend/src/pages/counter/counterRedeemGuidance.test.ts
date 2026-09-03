import { describe, expect, it } from "vitest";
import type { LoyaltyCounterRedeem, LoyaltyReward } from "@cmc/shared-types";
import {
  canHoiMaDon,
  canhBaoTruocKhiDoi,
  huongDanSauKhiDoi,
  khoaChongTrung,
} from "./counterRedeemGuidance";

const uuDai = (kieu: LoyaltyReward["rewardType"], diem = 300): LoyaltyReward => ({
  rewardId: "rw_1",
  name: "Giảm 50.000đ",
  description: null,
  pointsRequired: diem,
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  rewardType: kieu,
  menuItemId: kieu === "FREE_ITEM" ? "m_001" : null,
  discountAmount: kieu === "DISCOUNT" ? 50000 : null,
  minTier: "BAC",
});

const ketQua = (p: Partial<LoyaltyCounterRedeem>): LoyaltyCounterRedeem => ({
  redemptionId: "red_1",
  rewardName: "Giảm 50.000đ",
  pointsSpent: 300,
  code: null,
  orderCode: null,
  soDuMoi: 120,
  ...p,
});

describe("quầy đổi thưởng hộ khách — nhân viên phải làm gì tiếp", () => {
  it("GIẢM TIỀN: đọc mã cho khách", () => {
    // Nghiệp vụ do chủ quán chốt: quầy đổi mã trước, khách tự áp mã rồi mới gửi thanh toán. Áp
    // thẳng vào đơn sẽ đụng luồng QR tự động đang chạy.
    const h = huongDanSauKhiDoi(ketQua({ code: "AB3K9Z" }));
    expect(h.maDocChoKhach).toBe("AB3K9Z");
    expect(h.cauChinh).toContain("Đọc mã");
    expect(h.vieccConLai).toBeNull();
  });

  it("TẶNG MÓN đã vào đơn: không có gì để đọc, bếp đang làm", () => {
    const h = huongDanSauKhiDoi(ketQua({ orderCode: "ORD-1042", rewardName: "Chè khúc bạch" }));
    expect(h.maDocChoKhach).toBeNull();
    expect(h.cauChinh).toContain("ORD-1042");
    expect(h.cauChinh).toContain("bếp");
  });

  it("TẶNG MÓN chưa gắn đơn: PHẢI nói rõ đã trừ điểm rồi", () => {
    // CA NGUY HIỂM. Ở đây không có mã để đọc, cũng không có món nào vào bếp — màn hình im lặng
    // sẽ khiến nhân viên tưởng hỏng và bấm lại.
    //
    // Lần bấm thứ hai sinh khoá chống trùng MỚI, nên hàng rào idempotency của máy chủ không cứu
    // được, và khách mất điểm THẬT lần nữa. Người bấm lại không phải người mất điểm.
    const h = huongDanSauKhiDoi(ketQua({ rewardName: "Chè khúc bạch" }));
    expect(h.cauChinh).toContain("Đã trừ điểm");
    expect(h.cauChinh).toContain("CHƯA");
    expect(h.vieccConLai).toContain("Chè khúc bạch");
    expect(h.vieccConLai).toContain("Đã phát");
  });

  it("không kết cục nào để nhân viên tay trắng", () => {
    // Đối chứng cho cả ba: mỗi ca đều phải có ÍT NHẤT một việc rõ ràng — một mã để đọc, hoặc một
    // câu nói rõ chuyện gì vừa xảy ra.
    for (const kq of [
      ketQua({ code: "AB3K9Z" }),
      ketQua({ orderCode: "ORD-1042" }),
      ketQua({}),
    ]) {
      const h = huongDanSauKhiDoi(kq);
      // Câu chính không bao giờ rỗng, và không bao giờ là một câu chung chung kiểu "thành công":
      // ở quầy, "thành công" không nói được nhân viên phải làm gì tiếp.
      expect(h.cauChinh.length).toBeGreaterThan(0);
      expect(h.cauChinh).not.toBe("Đổi thành công");
      // Và luôn có ÍT NHẤT một việc cụ thể: một mã để đọc, hoặc một việc còn phải làm tay, hoặc
      // một câu nói rõ món đã vào đơn nào.
      expect(h.maDocChoKhach !== null || h.vieccConLai !== null || /ORD-/.test(h.cauChinh)).toBe(true);
    }
  });
});

describe("hỏi mã đơn đúng lúc", () => {
  it("CHỈ hỏi với ưu đãi tặng món", () => {
    // Ưu đãi giảm tiền không gắn vào đơn — máy chủ bỏ qua `orderCode`. Hỏi ở đó là bắt nhân viên
    // gõ một thứ vô nghĩa giữa lúc khách đang đứng chờ.
    expect(canHoiMaDon(uuDai("FREE_ITEM"))).toBe(true);
    expect(canHoiMaDon(uuDai("DISCOUNT"))).toBe(false);
  });
});

describe("cảnh báo trước khi bấm", () => {
  it("nói rõ trừ bao nhiêu và còn lại bao nhiêu", () => {
    // Đổi hộ tiêu điểm THẬT của khách, và người bấm không phải người mất điểm. Nói trước rẻ hơn
    // hoàn điểm sau.
    const canhBao = canhBaoTruocKhiDoi(420, uuDai("DISCOUNT", 300));
    expect(canhBao).toContain("300 điểm");
    expect(canhBao).toContain("120 điểm");
  });
});

describe("khoá chống bấm trùng", () => {
  it("mỗi lần bấm một khoá KHÁC nhau", () => {
    // Dùng lại một khoá cũ sẽ khiến lần đổi thứ hai — một lần đổi khách THẬT SỰ muốn — bị máy chủ
    // trả về kết quả của lần trước, và nhân viên tưởng đã đổi xong trong khi chưa.
    const khoa = new Set(Array.from({ length: 50 }, () => khoaChongTrung()));
    expect(khoa.size).toBe(50);
  });

  it("có tiền tố nói rõ nó tới từ đâu", () => {
    // Khoá trôi nổi trong nhật ký máy chủ mà không biết của màn nào là thứ không tra ngược được.
    expect(khoaChongTrung().startsWith("counter-redeem-")).toBe(true);
  });
});
