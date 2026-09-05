import { afterEach, describe, expect, it, vi } from "vitest";

// Đọc thẳng tệp Java bằng `?raw` của Vite, KHÔNG dùng `fs`.
//
// Cùng lý do như `realtime-client/src/liveRealtime.integration.test.ts` khai `process` tại chỗ:
// package này chạy trong TRÌNH DUYỆT. Kéo `@types/node` vào để một tệp test đọc được đĩa sẽ làm
// mã sản phẩm gọi được `fs`, `process`… mà TypeScript vẫn xanh. `?raw` không mở cửa đó — và
// `vite/client`, vốn đã nằm trong `types` của tsconfig.base, khai sẵn kiểu cho nó.
import nguonDtos from "../../../../backend-java/src/main/java/com/cmc/restaurant/auth/AuthDtos.java?raw";

import { createApiClient } from "./index";

/**
 * Tên trường web gửi phải khớp tên trường backend đọc.
 *
 * Mọi phép kiểm khác đều khẳng định đúng cái web ĐANG gửi, nên chúng xanh kể cả khi web và backend
 * nói hai thứ tiếng khác nhau — web tự đồng ý với chính nó. Phép kiểm này đọc thẳng
 * `AuthDtos.java` nên nó chỉ xanh khi hai bên thật sự khớp.
 *
 * LỖI CÓ THẬT đã sống nhờ chỗ trống này, đo trên máy chủ đang chạy:
 *
 *     web gửi {email, password}       → 400 IDENTIFIER_REQUIRED
 *     backend đọc {identifier, ...}   → 401 INVALID_CREDENTIALS  (tới được bước kiểm mật khẩu)
 *
 * Không ai đăng nhập được vào bất kỳ cổng web nào — quản trị, nhân viên, bếp. Cả năm tên miền vẫn
 * trả HTTP 200 và trang đăng nhập vẫn hiện ra bình thường, nên nhìn từ ngoài không có gì sai. Bộ
 * kiểm 153 ca vẫn xanh suốt thời gian đó.
 */
function truongCua(tenRecord: string): string[] {
  const khop = new RegExp(`record\\s+${tenRecord}\\s*\\(([^)]*)\\)`).exec(nguonDtos);
  const thamSo = khop?.[1];
  if (thamSo === undefined) throw new Error(`không thấy record ${tenRecord} trong AuthDtos.java`);

  // "String identifier, String password" → tên là từ thứ hai của mỗi cụm.
  return thamSo.split(",").flatMap((cum) => {
    const ten = cum.trim().split(/\s+/)[1];
    return ten === undefined ? [] : [ten];
  });
}

/** Chạy thật một lời gọi rồi trả về các khoá của thân JSON. */
async function khoaWebGui(goi: (api: ReturnType<typeof createApiClient>) => Promise<unknown>) {
  let than = "";
  // `createApiClient` gọi `fetch` toàn cục, không nhận bản tiêm vào — nên chặn ở đó.
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    than = String(init?.body ?? "");
    return new Response(
      JSON.stringify({ accessToken: "t", expiresAt: "2030-01-01T00:00:00.000Z", user: {} }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });

  await goi(createApiClient({ baseUrl: "http://test/api" }));
  return Object.keys(JSON.parse(than)).sort();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web gửi đúng tên trường mà AuthDtos.java khai", () => {
  it("đọc được AuthDtos.java — không đọc được thì ca dưới so tập rỗng và luôn xanh", () => {
    expect(truongCua("LoginRequest")).not.toHaveLength(0);
  });

  it("LoginRequest", async () => {
    const khoa = await khoaWebGui((api) =>
      api.auth.login({ identifier: "nhanvien@example.com", password: "matkhau12345" }),
    );

    expect(khoa).toEqual(truongCua("LoginRequest").sort());
  });
});
