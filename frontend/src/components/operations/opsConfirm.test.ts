import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chophepXacNhan } from "./OpsConfirmProvider";

describe("gõ-để-xác-nhận", () => {
  it("không yêu cầu gõ thì luôn cho phép", () => {
    expect(chophepXacNhan(undefined, "")).toBe(true);
  });

  it("chặn khi chưa gõ hoặc gõ sai", () => {
    expect(chophepXacNhan("T01", "")).toBe(false);
    expect(chophepXacNhan("T01", "T0")).toBe(false);
    expect(chophepXacNhan("T01", "T011")).toBe(false);
  });

  it("PHÂN BIỆT hoa thường — chép sai vẫn là chép sai", () => {
    // Đây là điểm dễ bị 'nới cho tiện' nhất. Mã bàn và email là chuỗi người dùng phải ĐỌC rồi chép
    // lại; chấp nhận `t01` nghĩa là họ gõ theo trí nhớ chứ không đọc, tức mất phần lớn giá trị.
    expect(chophepXacNhan("T01", "t01")).toBe(false);
  });

  it("cho phép khi gõ đúng, bỏ qua khoảng trắng thừa hai đầu", () => {
    expect(chophepXacNhan("T01", "T01")).toBe(true);
    expect(chophepXacNhan("T01", "  T01  ")).toBe(true);
    expect(chophepXacNhan("bep@local.test", "bep@local.test")).toBe(true);
  });
});

describe("không còn confirm() thô trong màn hình vận hành", () => {
  it("mọi chỗ xác nhận đều đi qua hộp thoại dùng chung", () => {
    // Cổng chặn hồi quy: `confirm()` của trình duyệt CHẶN cả luồng JavaScript, nên trong lúc hộp
    // thoại mở thì sự kiện realtime không được xử lý và bảng vận hành đứng im.
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const files = [
      "components/admin/AdminCategoryManager.tsx",
      "components/admin/AdminMenuManager.tsx",
      "components/admin/AdminTableCrudPanel.tsx",
      "components/admin/AdminTableSessionMonitor.tsx",
      "components/admin/AdminUserManager.tsx",
      "pages/admin/AdminLoyaltyPage.tsx",
      "pages/admin/AdminPromotionsPage.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(`${root}${file}`, "utf8");
      expect(source, `${file} còn dùng confirm() thô`).not.toMatch(/(?<!await )\bwindow\.confirm\(/);
      expect(source, `${file} chưa dùng hộp thoại dùng chung`).toContain("useOpsConfirm");
    }
  });
});
