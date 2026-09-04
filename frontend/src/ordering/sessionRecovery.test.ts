import { describe, expect, it } from "vitest";
import { appendQrToSessionPath, replaceSessionInPath } from "./sessionRecovery";

describe("session recovery helpers", () => {
  it("replaces the session id while keeping the destination suffix", () => {
    expect(
      replaceSessionInPath("/table-session/session-old/menu", "session-new"),
    ).toBe("/table-session/session-new/menu");
  });

  it("appends qr query for tab recovery", () => {
    expect(
      appendQrToSessionPath("/table-session/session-123/menu", "qr-token"),
    ).toBe("/table-session/session-123/menu?qr=qr-token");
  });
});
