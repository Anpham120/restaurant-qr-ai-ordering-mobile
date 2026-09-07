import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — bộ sinh là .mjs thuần, cố ý không có khai báo kiểu: nó chạy được bằng
// `node scripts/menu/build_thuc_don.mjs` mà không cần bước biên dịch nào.
import { dungMarkdown } from "../../../scripts/menu/thuc_don.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("bảng thực đơn quán", () => {
  /**
   * `docs/THUC_DON_QUAN.md` phải khớp kết quả sinh lại từ migration.
   *
   * <p>Không có cổng này thì bảng Markdown là nguồn sự thật THỨ HAI cho cùng một thực đơn, và
   * nguồn thứ hai luôn thua: migration đổi giá thì cơ sở dữ liệu đổi ngay, còn bảng thì đổi khi
   * có ai nhớ. Đây đúng là hình dạng lỗi mà docs/THIET_KE_NGHIEP_VU.md §22 đã liệt kê bốn lần.
   *
   * <p>Cổng này ở phía frontend vì `frontend-build` đã có sẵn Node — thêm nó vào job `menu-data`
   * sẽ phải dựng thêm một toolchain chỉ để chạy một phép so chuỗi.
   */
  it("khớp kết quả sinh lại từ migration", () => {
    const daCommit = readFileSync(repoRoot + "docs/THUC_DON_QUAN.md", "utf8");

    expect(daCommit, "chạy: node scripts/menu/build_thuc_don.mjs").toBe(dungMarkdown(repoRoot));
  });
});
