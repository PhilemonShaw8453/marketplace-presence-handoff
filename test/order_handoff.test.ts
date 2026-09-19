import assert from "node:assert/strict";
import test from "node:test";
import { handoffOrder, type RealtimePort } from "../src/order_handoff.js";

test("publishes the asset handoff only when the buyer is online", async () => {
  const published: Array<{ event?: string; data?: unknown }> = [];
  const realtime: RealtimePort = {
    async presence() {
      return { members: [{ client_id: "buyer-42" }, { client_id: "seller-7" }] };
    },
    async publish(input) {
      published.push(input);
      return {};
    },
  };

  const result = await handoffOrder(realtime, {
    channel: "marketplace-demo",
    orderId: "order-901",
    sellerId: "seller-7",
    buyerId: "buyer-42",
    assetId: "asset-logo-kit",
  });

  assert.deepEqual(result, {
    state: "handed_off",
    orderId: "order-901",
    buyerId: "buyer-42",
  });
  assert.equal(published.length, 1);
  assert.equal(published[0]?.event, "order.handed_off");
});

test("keeps the order waiting when the buyer is offline", async () => {
  let publishCount = 0;
  const realtime: RealtimePort = {
    async presence() {
      return { members: [{ client_id: "seller-7" }] };
    },
    async publish() {
      publishCount += 1;
      return {};
    },
  };

  const result = await handoffOrder(realtime, {
    channel: "marketplace-demo",
    orderId: "order-902",
    sellerId: "seller-7",
    buyerId: "buyer-42",
    assetId: "asset-font-pack",
  });

  assert.equal(result.state, "waiting_for_buyer");
  assert.equal(publishCount, 0);
});
