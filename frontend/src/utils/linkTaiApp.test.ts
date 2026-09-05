import { afterEach, describe, expect, it, vi } from "vitest";

import { layLinkTaiApp } from "./linkTaiApp";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("link tải app sau thanh toán", () => {
  it("chưa cấu hình thì KHÔNG có link — không mời khách đi tới trang trống", () => {
    // Đây là ca quan trọng nhất. Hiện lời mời khi chưa có link nghĩa là khách vừa trả tiền xong
    // được dẫn tới một trang không tồn tại, và đó là ấn tượng cuối cùng của cả bữa ăn.
    vi.stubEnv("VITE_APP_DOWNLOAD_URL", "");

    expect(layLinkTaiApp()).toBeNull();
  });

  it("chỉ có khoảng trắng cũng coi như chưa cấu hình", () => {
    // Một dòng `VITE_APP_DOWNLOAD_URL= ` trong .env là chuyện thường, và nó KHÔNG phải một link.
    vi.stubEnv("VITE_APP_DOWNLOAD_URL", "   ");

    expect(layLinkTaiApp()).toBeNull();
  });

  it("có cấu hình thì trả đúng link", () => {
    vi.stubEnv("VITE_APP_DOWNLOAD_URL", "https://cmcrestaurant.app/tai-app");

    expect(layLinkTaiApp()).toBe("https://cmcrestaurant.app/tai-app");
  });

  it("bỏ dấu gạch chéo thừa ở cuối", () => {
    vi.stubEnv("VITE_APP_DOWNLOAD_URL", "https://cmcrestaurant.app/tai-app/");

    expect(layLinkTaiApp()).toBe("https://cmcrestaurant.app/tai-app");
  });
});
