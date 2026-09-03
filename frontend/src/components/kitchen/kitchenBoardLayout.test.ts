import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { labelKitchenColumn } from "./kitchenOrderPipeline";

const frontendRoot = new URL("../../../", import.meta.url);

function read(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, frontendRoot)), "utf8");
}

describe("V59 Kitchen board layout", () => {
  it("renders the four operational stages", () => {
    const board = read("src/components/kitchen/KitchenBoard.tsx");

    // Bốn cột phải lấy chữ từ MỘT nguồn (`labelKitchenColumn`) chứ không viết tay tại chỗ. Ca này
    // trước đây ghim thẳng bốn chuỗi vào đây — thành ra nó ghim luôn bộ từ CŨ của quầy ("Sẵn sàng",
    // "Đã phục vụ") vào một màn hình của bếp, và đỏ lên đúng lúc màn hình được sửa cho đúng.
    for (const column of ["confirmed", "preparing", "ready", "served"] as const) {
      expect(board).toContain(`title={labelKitchenColumn("${column}")}`);
    }
    expect(labelKitchenColumn("ready")).toBe("Chờ ra món");

    expect(board).toMatch(
      /SmartKitchenActionButton[\s\S]*?getKitchenPrimaryAction/,
    );
    expect(board).toContain("getItemTapAdvanceStatus");
    expect(board).toContain("sortKitchenOrdersByPriority");
  });

  it("keeps four desktop lanes and responsive tablet/mobile fallbacks", () => {
    const css = read("src/components/operations/operations.css");

    expect(css).toMatch(
      /\.ops-board--kitchen\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s,
    );
    expect(css).toMatch(
      /@media \(max-width:\s*1100px\)[\s\S]*?\.ops-board--kitchen\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(css).toMatch(
      /@media \(max-width:\s*768px\)[\s\S]*?\.ops-board--kitchen\s*\{[^}]*grid-template-columns:\s*1fr/,
    );
  });

  it("keeps drag/drop guarded and visibly discoverable", () => {
    const board = read("src/components/kitchen/KitchenBoard.tsx");
    const css = read("src/components/operations/operations.css");

    expect(board).toContain("draggable={isDraggable}");
    expect(board).toContain("onDragStart=");
    expect(board).toContain("onDrop=");
    expect(board).toContain("ops-column--drop-target");
    expect(css).toMatch(/\.ops-card\[draggable="true"\]/);
    expect(css).toMatch(/\.ops-column--drop-target/);
  });
});
