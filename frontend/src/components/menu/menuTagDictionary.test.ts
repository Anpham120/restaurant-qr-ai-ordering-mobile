import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { localizeMenuTag } from "@cmc/i18n/menu";

import { tagLabel } from "./MenuItemCard";

/**
 * Canh sự đồng bộ giữa từ điển nhãn thực đơn và hai bảng nhãn ở frontend.
 *
 * Vì sao cần: tri thức "nhãn nào nghĩa là gì" từng nằm ở ba nơi tách biệt — bảng
 * tiếng Việt trong MenuItemCard, bảng tiếng Anh trong i18n, và phần suy đoán trong
 * dịch vụ AI. Ba bản trôi khỏi nhau mà không có gì báo:
 *
 *   - AI đoán nhãn `toi` là "tỏi" trong khi giao diện hiển thị đúng "Tối", nên câu
 *     "Món nào có tỏi?" trả về 36 món ăn buổi tối.
 *   - Bảng tiếng Anh chỉ phủ 54/80 nhãn, nên khách xem bằng tiếng Anh thấy khóa thô
 *     ("toi", "trua", "khong cay") ở 30 nhãn, và 4 mục trỏ vào nhãn đã bị bỏ.
 *
 * Cả hai lỗi đều là trôi dữ liệu, không phải lỗi logic — nên chỗ chặn đúng là một
 * test đọc từ điển gốc và so, chứ không phải đọc kỹ hơn khi sửa tay.
 */

const frontendRoot = new URL("../../../", import.meta.url);
const dictionaryPath = fileURLToPath(
  new URL("../data/menu-tags.json", frontendRoot),
);
const menuPath = fileURLToPath(
  new URL("../data/menu-dataset.json", frontendRoot),
);

type TagEntry = {
  group: string;
  value: string;
  label_vi: string;
  label_en: string;
  legacy_key: string;
  exclusive: boolean;
};

const dictionary = JSON.parse(readFileSync(dictionaryPath, "utf8")) as {
  groups: string[];
  exclusive_groups: string[];
  tags: Record<string, TagEntry>;
};
const entries = Object.entries(dictionary.tags);

describe("từ điển nhãn thực đơn", () => {
  it("phủ mọi nhãn trong thực đơn, không sót nhãn nào", () => {
    const menu = JSON.parse(readFileSync(menuPath, "utf8")) as {
      items: { id: string; tags: string[] }[];
    };
    const used = new Set(menu.items.flatMap((item) => item.tags));
    expect(used.size).toBeGreaterThan(0);
    for (const tag of used) {
      expect(dictionary.tags[tag], `nhãn dùng trong thực đơn nhưng thiếu trong từ điển: ${tag}`)
        .toBeDefined();
    }
  });

  it("hiển thị nhãn tiếng Việt cho mọi khóa, không rơi về chữ thô", () => {
    for (const [key, entry] of entries) {
      expect(tagLabel(key), key).toBe(entry.label_vi);
    }
  });

  it("hiển thị nhãn tiếng Anh cho mọi khóa, không rơi về chữ thô", () => {
    for (const [key, entry] of entries) {
      expect(localizeMenuTag(key, "en", entry.label_vi), key).toBe(entry.label_en);
    }
  });

  it("vẫn hiển thị đúng tên nhãn cũ mà /api/menu còn trả về", () => {
    // Cơ sở dữ liệu chưa được gán nhãn lại, nên nhãn cũ vẫn đến từ API. Bỏ nhánh
    // này là khách thấy "binh dan" thay cho "Bình dân".
    for (const [key, entry] of entries) {
      expect(tagLabel(entry.legacy_key), `${entry.legacy_key} (cũ của ${key})`)
        .toBe(entry.label_vi);
      expect(localizeMenuTag(entry.legacy_key, "en", entry.label_vi), entry.legacy_key)
        .toBe(entry.label_en);
    }
  });

  it("nhãn không xác định thì trả về nguyên văn, không ném lỗi", () => {
    // Chiều ngược lại: test trên sẽ vẫn xanh nếu tagLabel trả về mọi thứ được
    // truyền vào. Ca này chứng minh nó thật sự tra bảng.
    expect(tagLabel("nhan-khong-ton-tai")).toBe("nhan-khong-ton-tai");
    expect(localizeMenuTag("nhan-khong-ton-tai", "en", "Dự phòng")).toBe(
      "nhan-khong-ton-tai",
    );
  });

  it("khóa có không gian tên, nên không thể trùng từ thường trong câu hỏi", () => {
    // Đây là lý do tồn tại của lần gán nhãn lại. Bản cũ có 14 nhãn trùng từ thường
    // tiếng Việt sau khi rút dấu (`toi`↔tôi/tỏi, `cua`↔của/cửa, `chay`↔chạy...),
    // và 3 nhãn có token nằm trong nhãn khác (`nam` trong `quanh nam`, `mien Nam`).
    for (const [key, entry] of entries) {
      expect(key, key).toBe(`${entry.group}:${entry.value}`);
      expect(dictionary.groups, `nhóm lạ: ${entry.group}`).toContain(entry.group);
      expect(key, `khóa phải không có dấu cách: ${key}`).not.toMatch(/\s/);
    }
    // Không khóa nào là tiền tố/hậu tố của khóa khác — điều mà nhãn cũ vi phạm.
    const keys = entries.map(([key]) => key);
    for (const key of keys) {
      const nested = keys.filter((other) => other !== key && other.includes(key));
      expect(nested, `khóa ${key} nằm trong khóa khác: ${nested.join(", ")}`).toEqual([]);
    }
  });

  it("cơ sở dữ liệu và thực đơn AI mang cùng bộ nhãn", () => {
    // Đây là chỗ trôi đã gây ra cả vấn đề: hai nguồn từng lệch nhau âm thầm — cơ sở dữ
    // liệu 1,7 nhãn/món (khách thấy qua /api/menu), tệp JSON 15 nhãn/món (AI dùng) —
    // suốt nhiều tháng, vì chưa từng có gì so chúng với nhau. AI vì thế suy luận trên
    // dữ liệu dày gấp gần chín lần thứ khách thật nhìn thấy.
    // Nguồn phía cơ sở dữ liệu chuyển từ `RestaurantMenuSeed.cs` sang migration Flyway (#59).
    // Vẫn là đúng dữ liệu đó — bản Java seed bằng SQL thay vì bằng mã C#, nên chỉ bộ phân tích
    // đổi, còn phép so thì không.
    const seedPath = fileURLToPath(
      new URL(
        "../backend-java/src/main/resources/db/migration/V2__seed_official_menu_and_tables.sql",
        frontendRoot,
      ),
    );
    const seed = readFileSync(seedPath, "utf8");
    const menu = JSON.parse(readFileSync(menuPath, "utf8")) as {
      items: { id: string; name: string; tags: string[] }[];
    };

    const seedTags = new Map<string, string[]>();
    const seedCategory = new Map<string, string>();
    const seedPrice = new Map<string, number>();
    // INSERT INTO public.menu_items (...) VALUES ('m_004', 'cat_appetizer', 'Tên món',
    //   'mô tả', 55000.00, '/menu-images/...', true, '{tag:a,tag:b}', ...);
    //
    // Nhãn là mảng Postgres `'{a:b,c:d}'` chứ không phải danh sách chuỗi có nháy như bản C#.
    const itemPattern =
      /INSERT INTO public\.menu_items[^;]*?VALUES \('[^']+', '([^']+)', '((?:[^']|'')+)', '(?:[^']|'')*', (\d+)\.\d+, '[^']*', \w+, '\{([^}]*)\}'/g;
    for (const match of seed.matchAll(itemPattern)) {
      // SQL thoát dấu nháy đơn bằng cách nhân đôi; trả lại dạng người đọc để so với JSON.
      const name = match[2]!.replace(/''/g, "'");
      const tags = match[4]!.length === 0 ? [] : match[4]!.split(",");
      seedTags.set(name, tags.sort());
      seedCategory.set(name, match[1]!);
      seedPrice.set(name, Number(match[3]));
    }

    expect(seedTags.size, "số món đọc được từ tệp seed").toBe(menu.items.length);
    for (const item of menu.items) {
      expect(seedTags.get(item.name), `${item.name} không có trong tệp seed`).toBeDefined();
      expect([...item.tags].sort(), `${item.name}: nhãn hai nguồn lệch nhau`).toEqual(
        seedTags.get(item.name),
      );
      // Mã danh mục cũng từng lệch — 12/13 khác nhau, và mã của tệp JSON còn mang dấu
      // (`cat_khai_vị`), đúng loại mong manh đã gây ra bảy lỗi ở phần nhãn.
      expect(item.categoryId, `${item.name}: mã danh mục hai nguồn lệch nhau`).toBe(
        seedCategory.get(item.name),
      );
      expect(item.price, `${item.name}: giá hai nguồn lệch nhau`).toBe(
        seedPrice.get(item.name),
      );
    }
  });

  it("mã danh mục là ASCII, không mang dấu", () => {
    // Khóa máy đọc mang dấu vỡ ngay khi có bước rút dấu ở giữa. Toàn hệ thống dùng mã
    // ASCII (`CATEGORY_EN` trong packages/i18n, `menu_items.category_id`); tệp JSON
    // từng là ngoại lệ duy nhất.
    const menu = JSON.parse(readFileSync(menuPath, "utf8")) as {
      items: { name: string; categoryId: string }[];
      categories: { categoryId: string }[];
    };
    const ids = [
      ...menu.categories.map((c) => c.categoryId),
      ...menu.items.map((i) => i.categoryId),
    ];
    for (const id of ids) {
      expect(id, `mã danh mục không phải ASCII: ${id}`).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("nhóm loại trừ nhau thì mỗi món chỉ mang một giá trị", () => {
    const menu = JSON.parse(readFileSync(menuPath, "utf8")) as {
      items: { id: string; name: string; tags: string[] }[];
    };
    for (const group of dictionary.exclusive_groups) {
      for (const item of menu.items) {
        const values = item.tags.filter((tag) => tag.startsWith(`${group}:`));
        expect(
          values.length,
          `${item.name} mang ${values.length} giá trị của nhóm ${group}: ${values.join(", ")}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });
});
