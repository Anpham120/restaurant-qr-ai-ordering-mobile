import { describe, expect, it } from "vitest";
import type { CreateOrderRequest } from "../types";
import { createOrderFingerprint } from "./orderService";

function deliveryRequest(overrides: Partial<CreateOrderRequest> = {}): CreateOrderRequest {
  return {
    orderType: "Delivery",
    items: [{ menuItemId: "tea-1", quantity: 2 }],
    deliveryDetails: {
      recipientName: "An",
      phoneNumber: "0900000000",
      address: "1 Nguyen Trai",
      note: "Goi truoc khi giao",
    },
    ...overrides,
  };
}

describe("order idempotency fingerprint", () => {
  it("reuses the fingerprint for the same delivery request", () => {
    expect(createOrderFingerprint(deliveryRequest())).toBe(createOrderFingerprint(deliveryRequest()));
  });

  it("changes when delivery details change", () => {
    const original = deliveryRequest();
    const changed = deliveryRequest({
      deliveryDetails: { ...original.deliveryDetails!, address: "2 Nguyen Trai" },
    });

    expect(createOrderFingerprint(changed)).not.toBe(createOrderFingerprint(original));
  });

  it("does not expose delivery contact data in the fingerprint", () => {
    const fingerprint = createOrderFingerprint(deliveryRequest());

    expect(fingerprint).not.toContain("0900000000");
    expect(fingerprint).not.toContain("Nguyen Trai");
  });
});
