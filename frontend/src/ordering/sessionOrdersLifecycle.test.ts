import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("session orders lifecycle", () => {
  it("does not restart the parent session boundary while loading orders", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./SessionOrdersPage.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).not.toContain("await refresh()");
    expect(source).not.toContain("context, refresh");
    expect(source).toContain("getTableSessionOrders(context.sessionId, context.sessionToken)");
    // Tham số đầu là MÃ BÀN, không phải mã phiên: backend Java phát sự kiện tới
    // `/topic/table.<mã bàn>` và `StompSubscriptionGuard` đối chiếu token phiên với các phiên đang
    // mở của đúng bàn đó. Bản .NET nhận mã phiên vì hub tự tra ra bàn; STOMP không có bước đó.
    expect(source).toContain("watchTableSessionRealtime(context.tableCode, context.sessionToken)");
    expect(source).toContain("subscribeOrderRealtime(handleRealtime)");
    expect(source).toContain("window.setInterval");
    expect(source).toContain('searchParams.get("focus") === "invoice"');
    expect(source).toContain('hubState === "ReadyForPayment"');
  });

  it("routes every successful scan through the semantic resume-state resolver", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./TableScanPage.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("getSessionResumeDestination(");
    expect(source).toContain("result.session.resumeState");
    expect(source).not.toMatch(/navigate\([^)]*\/menu/);
  });
});
