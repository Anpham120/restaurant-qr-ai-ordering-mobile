import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const frontendRoot = new URL("../../", import.meta.url);
const migrationsDir = fileURLToPath(
  new URL("../backend-java/src/main/resources/db/migration/", frontendRoot),
);

/** Nội dung mọi migration, nối lại — thực đơn quán rải qua V30, V31 và V33. */
function nguonMigration(): string {
  return readdirSync(migrationsDir)
    .filter((ten) => ten.endsWith(".sql"))
    .map((ten) => readFileSync(migrationsDir + ten, "utf8"))
    .join("\n");
}

describe("thực đơn quán trong seed", () => {
  /**
   * Ảnh món phải có thật trong `frontend/public/shop-assets/`.
   *
   * <p>Đây không phải lo xa: `V31__correct_shop_product_art.sql` tồn tại CHỈ để sửa hai đường dẫn
   * ảnh sai của V30. Không có phép kiểm nào bắt được chúng — người ta thấy bằng mắt, sau khi đã
   * triển khai. Một đường dẫn hỏng không làm gì đổ vỡ; nó chỉ để lại một ô trống trên thực đơn.
   */
  it("mọi ảnh món trỏ tới tệp có thật", () => {
    const duongDan = [...nguonMigration().matchAll(/\/shop-assets\/[\w.-]+/g)].map((m) => m[0]);

    expect(duongDan.length).toBeGreaterThan(0);
    for (const p of new Set(duongDan)) {
      expect(existsSync(fileURLToPath(new URL(`public${p}`, frontendRoot))), p).toBe(true);
    }
  });

  /**
   * Mọi `option_groups_json` phải đọc được và tự nhất quán.
   *
   * <p>Cột này là `text`, nên PostgreSQL nhận bất kỳ chuỗi nào — JSON hỏng chỉ lộ ra khi Jackson
   * cố dựng `MenuOptionGroup` lúc khách mở thực đơn. `minSelections > maxSelections` thì tệ hơn:
   * JSON hợp lệ, ánh xạ thành công, và khách gặp một nhóm không bao giờ chọn xong được.
   */
  it("mọi nhóm tuỳ chọn đọc được và min không vượt max", () => {
    const khoi = [...nguonMigration().matchAll(/option_groups_json = '(\[[\s\S]*?\])'/g)]
      .map((m) => m[1]!);

    expect(khoi.length).toBeGreaterThan(0);
    for (const raw of khoi) {
      const nhom = JSON.parse(raw) as Array<{
        id: string; name: string; minSelections: number; maxSelections: number;
        options: Array<{ id: string; name: string; price: number; isAvailable: boolean }>;
      }>;
      for (const g of nhom) {
        expect(g.minSelections, `${g.id}: min`).toBeLessThanOrEqual(g.maxSelections);
        expect(g.options.length, `${g.id}: số lựa chọn`).toBeGreaterThanOrEqual(g.minSelections);
        for (const o of g.options) {
          expect(o.price, `${g.id}/${o.id}: giá`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
