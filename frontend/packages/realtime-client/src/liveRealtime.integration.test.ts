import { describe, expect, it } from "vitest";
import { createOrderHubClient } from "./index";

// Khai tại chỗ thay vì thêm `@types/node` cho cả package: package này chạy trong TRÌNH DUYỆT, và
// `process` chỉ tồn tại ở đây — trong bộ chạy vitest của Node. Kéo `@types/node` vào sẽ làm mã sản
// phẩm gọi được `process`, `fs`... mà TypeScript vẫn xanh, tức mở một cánh cửa chỉ để phục vụ một
// tệp test.
declare const process: { env: Record<string, string | undefined> };

const HUB = process.env.LIVE_HUB_URL;
const API = process.env.LIVE_API_URL;
const TABLE = process.env.LIVE_TABLE_CODE ?? "";
const TOKEN = process.env.LIVE_SESSION_TOKEN ?? "";

describe.runIf(HUB && API)("client STOMP nói chuyện được với backend Java thật", () => {
  it("nhận assistance.requested trên /topic/table.<mã bàn>", async () => {
    const nhan: unknown[] = [];
    let trangThai = "";
    const client = createOrderHubClient({
      hubUrl: HUB,
      handlers: {
        onAssistanceRequested: (e) => nhan.push(e),
        onStatusChanged: (s) => { trangThai = s; },
      },
    });

    await client.connect();
    for (let i = 0; i < 100 && trangThai !== "connected"; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(trangThai, "phải nối được tới hub").toBe("connected");

    await client.watchTable(TABLE, TOKEN);
    await new Promise((r) => setTimeout(r, 500));

    const res = await fetch(`${API}/api/table-sessions/${process.env.LIVE_SESSION_ID}/assistance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Table-Session-Token": TOKEN },
      body: JSON.stringify({ note: "Kiem tra realtime" }),
    });
    expect(res.status, "gọi nhân viên phải thành công").toBe(200);

    for (let i = 0; i < 100 && nhan.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await client.disconnect();

    expect(nhan.length, "phải nhận được đúng một sự kiện").toBe(1);
    expect(nhan[0]).toMatchObject({ tableCode: TABLE, note: "Kiem tra realtime" });
  }, 30000);
});

describe.runIf(HUB)("cổng SUBSCRIBE của backend thật sự chặn", () => {
  it("không có token phiên bàn thì bị từ chối", async () => {
    const nhan: unknown[] = [];
    const trangThai: string[] = [];
    const client = createOrderHubClient({
      hubUrl: HUB,
      handlers: {
        onAssistanceRequested: (e) => nhan.push(e),
        onStatusChanged: (s) => trangThai.push(s),
      },
    });

    await client.connect();
    for (let i = 0; i < 100 && !trangThai.includes("connected"); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }

    // CỐ Ý không truyền token: `StompSubscriptionGuard` phải trả khung ERROR.
    await client.watchTable(TABLE);
    for (let i = 0; i < 100 && !trangThai.includes("error"); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await client.disconnect();

    expect(trangThai, "backend phải từ chối lượt đăng ký không có token").toContain("error");
    expect(nhan.length, "không được nhận sự kiện nào của bàn").toBe(0);
  }, 30000);
});
