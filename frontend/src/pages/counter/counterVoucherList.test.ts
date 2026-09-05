import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LoyaltyVoucher } from "@cmc/shared-types";
import { boPhieuDaPhat } from "./CounterVoucherPanel";

function phieu(redemptionId: string, rewardName: string): LoyaltyVoucher {
  return {
    redemptionId,
    rewardName,
    pointsSpent: 350,
    redeemedAt: "2026-08-25T10:00:00Z",
    honouredAt: null,
  };
}

describe("danh sách phiếu ở quầy", () => {
  it("bỏ đúng phiếu vừa phát, giữ nguyên các phiếu còn lại", () => {
    const truoc = [phieu("red_1", "Chè bưởi"), phieu("red_2", "Gỏi cuốn chay")];

    const sau = boPhieuDaPhat(truoc, "red_1");

    expect(sau.map((v) => v.redemptionId)).toEqual(["red_2"]);
  });

  it("hai phiếu CÙNG TÊN vẫn chỉ bỏ một", () => {
    // Khách đổi hai lần cùng một ưu đãi là chuyện thường. Lọc theo tên món sẽ xoá cả hai khỏi màn
    // hình, và phiếu thứ hai biến mất trong khi khách vẫn còn quyền nhận.
    const truoc = [phieu("red_1", "Chè bưởi"), phieu("red_2", "Chè bưởi")];

    const sau = boPhieuDaPhat(truoc, "red_1");

    expect(sau.map((v) => v.redemptionId)).toEqual(["red_2"]);
  });

  it("mã không có trong danh sách thì không xoá nhầm gì cả", () => {
    const truoc = [phieu("red_1", "Chè bưởi")];

    expect(boPhieuDaPhat(truoc, "red_khong_co")).toHaveLength(1);
  });

  it("danh sách rỗng", () => {
    expect(boPhieuDaPhat([], "red_1")).toEqual([]);
  });
});

/*
  Màn quầy phải NỐI được vào đường đổi hộ.

  Backend làm xong đường này ở 04f7c39 — nghiệp vụ, migration, phép kiểm tích hợp — nhưng KHÔNG
  màn nào gọi tới. Một tính năng có API mà không có nút bấm thì với người dùng là không tồn tại,
  và không có gì trong bộ kiểm nói cho ai biết điều đó.
*/
describe("màn quầy có nút đổi hộ khách", () => {
  const panel = readFileSync(
    fileURLToPath(new URL("./CounterVoucherPanel.tsx", import.meta.url)),
    "utf8",
  );

  it("gọi đúng đường đổi hộ, không phải đường của app", () => {
    // `me/redeem` đòi tài khoản Customer đăng nhập — chính thứ nhóm khách này không có.
    expect(panel).toContain("api.loyalty.counterRedeem(");
  });

  it("gửi khoá chống trùng cho MỖI lần bấm", () => {
    // Máy chủ bắt buộc có khoá. Thiếu thì mọi lần bấm trả 400 và nút trông như hỏng.
    expect(panel).toContain("khoaChongTrung()");
  });

  it("HỎI LẠI trước khi trừ điểm", () => {
    // Điểm bị trừ là điểm thật của khách, và người bấm không phải người mất điểm.
    expect(panel).toContain("canhBaoTruocKhiDoi(");
  });

  it("nói rõ phải làm gì tiếp, thay vì một câu thành công chung chung", () => {
    expect(panel).toContain("huongDanSauKhiDoi(");
    expect(panel).not.toContain("Đổi thành công");
  });

  it("chỉ hỏi mã đơn cho ưu đãi TẶNG MÓN", () => {
    expect(panel).toContain("canHoiMaDon");
  });

  it("tra lại sau khi đổi để đọc đúng số dư cho khách", () => {
    // Số dư và danh sách phiếu đều đổi sau một lần đổi. Để nhân viên tự trừ trong đầu là chỗ sai số.
    const doiHo = panel.slice(panel.indexOf("const doiHo"), panel.indexOf("const thu"));
    expect(doiHo).toContain("huongDanSauKhiDoi(kq)");
    expect(doiHo).toContain("await tra()");
  });
});
