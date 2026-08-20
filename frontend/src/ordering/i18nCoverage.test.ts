import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EN_COPY, translate } from "@cmc/i18n";
import { CATEGORY_EN, MENU_ITEM_EN, localizeMenuItem } from "@cmc/i18n/menu";
import { describe, expect, it } from "vitest";

const frontendRoot = new URL("../../", import.meta.url);
const repoRoot = new URL("../", frontendRoot);

function read(relativePath: string, root = frontendRoot) {
  return readFileSync(fileURLToPath(new URL(relativePath, root)), "utf8");
}

function sourceFiles(relativePath: string): string[] {
  const absolutePath = fileURLToPath(new URL(relativePath, frontendRoot));
  if (statSync(absolutePath).isFile()) return [absolutePath];
  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const child = `${relativePath.replace(/\/$/, "")}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(child);
    return /\.(ts|tsx)$/.test(entry.name) ? [fileURLToPath(new URL(child, frontendRoot))] : [];
  });
}

describe("V44 complete VI/EN localization", () => {
  it("covers the canonical seed and accepts the shared MenuItem shape", () => {
    // Nguồn seed chuyển sang migration Flyway của bản Java (#59). Mã món nằm thẳng trong SQL
    // (`'m_004'`) thay vì phải ghép từ số thứ tự như bản C#, nên phép đọc còn đơn giản hơn.
    const seed = read(
      "backend-java/src/main/resources/db/migration/V2__seed_official_menu_and_tables.sql",
      repoRoot,
    );
    const seedItemIds = [...seed.matchAll(/INSERT INTO public\.menu_items[^;]*?VALUES \('(m_\d+)'/g)]
      .map((match) => match[1]);
    const seedCategoryIds = [...seed.matchAll(/'(cat_[a-z_]+)'/g)].map((match) => match[1]);

    expect(Object.keys(MENU_ITEM_EN).sort()).toEqual([...new Set(seedItemIds)].sort());
    expect(Object.keys(CATEGORY_EN).sort()).toEqual([...new Set(seedCategoryIds)].sort());

    const sharedItem = {
      id: "m_001",
      name: "Gỏi cuốn tôm thịt",
      description: "Mô tả",
      price: 45_000,
      imageUrl: null,
      isAvailable: true,
      tags: [],
    };
    const localized = localizeMenuItem(sharedItem, "en");
    expect(localized.name).toBe("Fresh shrimp and pork rolls");
    expect(localized.price).toBe(45_000);
  });

  it("provides English copy for every literal translation call", () => {
    const files = [
      ...sourceFiles("apps/customer-web/src"),
      ...sourceFiles("apps/ordering-web/src"),
      ...sourceFiles("src/components/chatbot"),
      ...sourceFiles("src/components/customer"),
      ...sourceFiles("src/components/menu"),
      ...sourceFiles("src/ordering"),
      ...sourceFiles("src/pages/customer"),
      ...sourceFiles("src/pages/chatbot"),
      ...sourceFiles("src/pages/CustomerHomePage.tsx"),
      ...sourceFiles("src/pages/RestaurantAlbumPage.tsx"),
      ...sourceFiles("packages/brand-ui/src"),
      ...sourceFiles("packages/shared-ui/src"),
    ];
    const missing = new Set<string>();

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\bt\(\s*\"((?:[^\"\\]|\\.)*)\"/g)) {
        const key = JSON.parse(`\"${match[1]}\"`) as string;
        if (!EN_COPY[key]) missing.add(key);
      }
    }

    expect([...missing]).toEqual([]);
    expect(translate("en", "Bàn {table}", { table: "A01" })).toBe("Table A01");
  });

  it("persists locale across the customer and ordering hosts", () => {
    const i18nSource = read("packages/i18n/src/index.tsx");
    const customerEntry = read("apps/customer-web/src/main.tsx");
    const orderingEntry = read("apps/ordering-web/src/main.tsx");

    expect(i18nSource).toContain("Domain=.cmcrestaurant.app");
    expect(i18nSource).toContain("cmc_locale");
    expect(customerEntry).toContain("<I18nProvider>");
    expect(orderingEntry).toContain("<I18nProvider>");
    expect(customerEntry).toContain("<LanguageSwitcher");
    expect(orderingEntry).toContain("<LanguageSwitcher");
  });
});

describe("V46 workspace dependency resolution", () => {
  it("locks the i18n workspace package", () => {
    const lockfile = read("package-lock.json");
    expect(lockfile).toContain('"packages/i18n"');
    expect(lockfile).toContain('"node_modules/@cmc/i18n"');
  });
});
