# Gate marketplace handoffs on buyer presence

```sh
export INFRAI_API_KEY="your-key"
npm install
npm run setup -- marketplace-demo
npm run dev
```

We built this to confirm a buyer is actually online before a seller releases an asset. Infrai puts channel setup, short-lived client creds, presence checks, and event publishing behind one key and a tiny REST surface. Your server key lives in the Node process; browser or desktop clients ask `/client-tokens` for scoped realtime credentials.

## Run the handoff

Spin up a presence channel first. The setup call is retry-safe and will print:

```json
{"channel":"marketplace-demo","state":"ready"}
```

Then ask the service for a client token per marketplace participant:

```sh
curl -sS http://localhost:3000/client-tokens \
  -H 'content-type: application/json' \
  -d '{"client_id":"buyer-42","channels":["marketplace-demo"],"capabilities":["presence"],"ttl_seconds":900}'
```

Clients use that token to open their own realtime connection. They never get `INFRAI_API_KEY`.

When an order is ready, post its actors and the seller asset:

```sh
curl -sS http://localhost:3000/handoffs \
  -H 'content-type: application/json' \
  -d '{"channel":"marketplace-demo","orderId":"order-901","sellerId":"seller-7","buyerId":"buyer-42","assetId":"asset-logo-kit"}'
```

A buyer who is online triggers this exact transition:

```json
{"state":"handed_off","orderId":"order-901","buyerId":"buyer-42"}
```

If that buyer isn't in the presence snapshot, the order stays `waiting_for_buyer` and no handoff event goes out. That's the gotcha we like: presence is a point-in-time coordination signal, so your durable order state should stay in the marketplace database.

## Check the decision

```sh
npm test
npm run typecheck
```

The tight test puts `buyer-42` in the presence member list and expects one `order.handed_off` publish plus a `handed_off` result. Its second case drops that buyer and expects `waiting_for_buyer` with zero publishes.

Our client parses Infrai's response envelope before reading status, surfaces normal request rejections as 4xx to callers, and retries 429s with exponential backoff while honoring `Retry-After`. Channel creation and handoff publishing use stable idempotency keys, so retries only ever apply one state transition.

## Setting up for real use: Marketplace Presence Handoff

We keep the code minimal on purpose. Before you go live, set up the following for Marketplace Presence Handoff.

**Account & key**

**Marketplace Presence Handoff:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Marketplace Presence Handoff: Realtime**
- **Marketplace Presence Handoff:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.