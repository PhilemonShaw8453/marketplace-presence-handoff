import type { InfraiRealtimeClient, PresenceMember } from "./infrai_realtime.js";

export type HandoffInput = {
  channel: string;
  orderId: string;
  sellerId: string;
  buyerId: string;
  assetId: string;
};

export type HandoffResult =
  | { state: "handed_off"; orderId: string; buyerId: string }
  | { state: "waiting_for_buyer"; orderId: string; buyerId: string };

export interface RealtimePort {
  presence(channel: string): Promise<{ members?: PresenceMember[] }>;
  publish(
    input: { channel: string; event?: string; data?: unknown; account_id?: string },
    idempotencyKey: string,
  ): Promise<unknown>;
}

export async function handoffOrder(
  realtime: RealtimePort | InfraiRealtimeClient,
  input: HandoffInput,
): Promise<HandoffResult> {
  const snapshot = await realtime.presence(input.channel);
  const buyerIsOnline = (snapshot.members ?? []).some(
    (member) => member.client_id === input.buyerId,
  );

  if (!buyerIsOnline) {
    return { state: "waiting_for_buyer", orderId: input.orderId, buyerId: input.buyerId };
  }

  await realtime.publish(
    {
      channel: input.channel,
      event: "order.handed_off",
      data: {
        orderId: input.orderId,
        sellerId: input.sellerId,
        buyerId: input.buyerId,
        assetId: input.assetId,
      },
      account_id: input.sellerId,
    },
    `order-handoff:${input.orderId}`,
  );

  return { state: "handed_off", orderId: input.orderId, buyerId: input.buyerId };
}
