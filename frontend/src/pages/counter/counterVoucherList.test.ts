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
