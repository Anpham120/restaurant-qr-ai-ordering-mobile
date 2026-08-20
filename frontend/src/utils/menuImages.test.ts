import { describe, expect, it, vi } from "vitest";
import { menuItems } from "../mocks/menuItems";
import { resolveMenuImage, toPublicMenuImageUrl } from "./menuImages";

describe("resolveMenuImage", () => {
  const firstItem = menuItems[0]!;

  it("keeps an explicitly usable image URL", () => {
    const explicitUrl = "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe";

    expect(resolveMenuImage("Món không có trong mock", explicitUrl)).toBe(explicitUrl);
  });

  it("replaces legacy example.com URLs with the normalized catalog image", () => {
    expect(resolveMenuImage(firstItem.name, "https://example.com/old-image.jpg")).toBe(firstItem.imageUrl);
  });

  it("uses a deterministic catalog fallback when no mapping exists", () => {
    expect(resolveMenuImage("__unmapped_menu_item__", null, 1)).toBe(menuItems[1]!.imageUrl);
  });
});

describe("toPublicMenuImageUrl", () => {
  it("maps relative menu image paths to the ordering portal base URL", () => {
    vi.stubEnv("VITE_ORDERING_BASE_URL", "https://order.cmcrestaurant.app");
    expect(toPublicMenuImageUrl("/menu-images/86-bia-ha-noi.webp")).toBe(
      "https://order.cmcrestaurant.app/menu-images/86-bia-ha-noi.webp",
    );
  });
});
