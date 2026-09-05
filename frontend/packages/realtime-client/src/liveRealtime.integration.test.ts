import { describe, expect, it } from "vitest";
import { createOrderHubClient } from "./index";
import type { OrderItemStatusChangedEvent } from "@cmc/shared-types";

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

/**
 * Ba đường còn lại của cùng một bản port.
 *
 * Bản port SignalR -> STOMP đổi ngữ nghĩa khác nhau ở từng đích, nên chứng minh một đường chạy
 * KHÔNG chứng minh ba đường kia chạy:
 *
 *   /topic/orders.operations   SignalR tự thêm nhân viên vào nhóm ở phía SERVER; STOMP không có
 *                              khái niệm đó, nên `connect()` phải tự đăng ký. Đây là hành vi
 *                              client tự dựng lại — sai thì bếp và quầy không nhận được gì.
 *   /topic/order.<mã đơn>      khách theo dõi đơn bằng token cấp lúc tạo đơn.
 */
describe.runIf(HUB && API && process.env.LIVE_STAFF_TOKEN)("nhóm vận hành", () => {
  it("nhân viên nhận order.created mà KHÔNG phải gọi watch gì thêm", async () => {
    const nhan: unknown[] = [];
    const trangThai: string[] = [];
    const client = createOrderHubClient({
      hubUrl: HUB,
      accessTokenFactory: () => process.env.LIVE_STAFF_TOKEN ?? "",
      handlers: { onOrderCreated: (e) => nhan.push(e), onStatusChanged: (s) => trangThai.push(s) },
    });

    await client.connect();
    for (let i = 0; i < 150 && !trangThai.includes("connected"); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(trangThai, `trạng thái: ${trangThai.join(",")}`).toContain("connected");
    await new Promise((r) => setTimeout(r, 500));

    const dat = await taoDon();
    for (let i = 0; i < 150 && nhan.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await client.disconnect();
    expect(dat.orderCode, "phải tạo được đơn").toBeTruthy();
    expect(nhan.length, "bếp phải nhận được đơn mới").toBeGreaterThan(0);
  }, 45000);
});

describe.runIf(HUB && API && process.env.LIVE_QR_TOKEN)("khách theo dõi đơn của mình", () => {
  it("nhận order.statusChanged trên /topic/order.<mã đơn>", async () => {
    const dat = await taoDon();
    const nhan: unknown[] = [];
    const trangThai: string[] = [];
    const client = createOrderHubClient({
      hubUrl: HUB,
      handlers: { onOrderStatusChanged: (e) => nhan.push(e), onStatusChanged: (s) => trangThai.push(s) },
    });

    await client.connect();
    for (let i = 0; i < 150 && !trangThai.includes("connected"); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await client.watchOrder(dat.orderCode, dat.orderToken);
    await new Promise((r) => setTimeout(r, 500));

    // Nhân viên đổi trạng thái đơn — sự kiện phải tới đúng đích của đơn đó.
    const res = await fetch(`${API}/api/orders/${dat.orderCode}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LIVE_STAFF_TOKEN ?? ""}`,
      },
      body: JSON.stringify({ status: "Confirmed" }),
    });
    expect(res.status, await res.text().catch(() => "")).toBe(200);

    for (let i = 0; i < 150 && nhan.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await client.disconnect();
    expect(nhan.length, "khách phải thấy đơn đổi trạng thái").toBeGreaterThan(0);
  }, 45000);
});

/** Mở phiên bàn rồi tạo một đơn thật, trả về mã đơn và token khách. */
async function taoDon(): Promise<{ orderCode: string; orderToken: string }> {
  const qr = process.env.LIVE_QR_TOKEN!;
  const tc = process.env.LIVE_TABLE_CODE!;
  const s = await (await fetch(`${API}/api/table-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ qrToken: qr, tableCode: tc }),
  })).json();
  const o = await (await fetch(`${API}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Table-Session-Token": s.tableSessionToken,
      "Idempotency-Key": `rt-${Date.now()}-${Math.random()}`,
    },
    body: JSON.stringify({
      tableSessionId: s.sessionId, orderType: "DineIn", tableCode: tc, qrToken: qr,
      items: [{ menuItemId: "m_001", quantity: 1 }],
    }),
  })).json();
  return { orderCode: o.orderCode, orderToken: o.customerAccessToken };
}

/**
 * Món tặng đổi bằng điểm được thêm vào một đơn ĐANG CHẠY — đường duy nhất trong hệ thống mà một
 * thay đổi của đơn không đi qua OrderService. Chính vì thế nó là chỗ dễ quên báo bếp nhất, và
 * quên thì món nằm im tới lượt bảng bếp tự tải lại.
 *
 * Cần thêm LIVE_CUST_TOKEN (khách đã liên kết số và còn đủ điểm), LIVE_REWARD_ID (ưu đãi tặng
 * món), LIVE_ORDER_CODE (đơn còn mở).
 */
describe.runIf(
  HUB && API && process.env.LIVE_STAFF_TOKEN && process.env.LIVE_CUST_TOKEN
    && process.env.LIVE_REWARD_ID && process.env.LIVE_ORDER_CODE,
)("món tặng đổi bằng điểm", () => {
  it("thêm vào đơn đang chạy thì bảng bếp nhận được ngay", async () => {
    const nhan: OrderItemStatusChangedEvent[] = [];
    const trangThai: string[] = [];
    const client = createOrderHubClient({
      hubUrl: HUB!,
      accessTokenFactory: () => process.env.LIVE_STAFF_TOKEN ?? "",
      handlers: {
        onOrderItemStatusChanged: (e) => nhan.push(e),
        onStatusChanged: (s) => trangThai.push(s),
      },
    });

    await client.connect();
    for (let i = 0; i < 150 && !trangThai.includes("connected"); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(trangThai, `trạng thái: ${trangThai.join(",")}`).toContain("connected");
    await new Promise((r) => setTimeout(r, 500));

    const res = await fetch(`${API}/api/loyalty/me/redeem`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LIVE_CUST_TOKEN}`,
        "Idempotency-Key": "rt-" + Date.now(),
      },
      body: JSON.stringify({
        rewardId: process.env.LIVE_REWARD_ID,
        orderCode: process.env.LIVE_ORDER_CODE,
      }),
    });
    expect(res.status, "đổi điểm phải thành công").toBe(200);

    for (let i = 0; i < 100 && nhan.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await client.disconnect();

    expect(nhan.length, "bảng bếp phải nhận được món tặng vừa thêm").toBeGreaterThan(0);
    // Tên trong sự kiện phải KHỚP tên dòng in trên phiếu bếp. Tính riêng hai lần là cách hai chỗ
    // lệch nhau — đã xảy ra một lần và chính phép kiểm này bắt được.
    expect(nhan[0]!.menuItemName).toContain("đổi điểm");
  }, 45000);
});
