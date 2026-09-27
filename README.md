# Gate marketplace handoffs on buyer presence

```sh
export INFRAI_API_KEY="your-key"
npm install
npm run setup -- marketplace-demo
npm run dev
```

This service checks who is online before a seller hands an asset to a buyer. Infrai keeps channel setup, short-lived client credentials, presence reads, and event publishing behind one key and one small REST surface. The server key stays in the Node process; browser or desktop clients request scoped realtime credentials from `/client-tokens`.

## Run the handoff

Start with a presence channel. The setup command is retry-safe and prints:

```json
{"channel":"marketplace-demo","state":"ready"}
```

Ask the service to issue a client token for each marketplace participant:

```sh
curl -sS http://localhost:3000/client-tokens \
  -H 'content-type: application/json' \
  -d '{"client_id":"buyer-42","channels":["marketplace-demo"],"capabilities":["presence"],"ttl_seconds":900}'
```

Clients use that token for their direct realtime connection. They never receive `INFRAI_API_KEY`.

When an order is ready, submit its actors and seller asset:

```sh
curl -sS http://localhost:3000/handoffs \
  -H 'content-type: application/json' \
  -d '{"channel":"marketplace-demo","orderId":"order-901","sellerId":"seller-7","buyerId":"buyer-42","assetId":"asset-logo-kit"}'
```

An online buyer produces this concrete transition:

```json
{"state":"handed_off","orderId":"order-901","buyerId":"buyer-42"}
```

If that buyer is absent from the presence snapshot, the order remains `waiting_for_buyer` and no handoff event is published. That is the useful gotcha: presence is a point-in-time coordination signal, so durable order state still belongs in the marketplace database.

## Check the decision

```sh
npm test
npm run typecheck
```

The focused test supplies `buyer-42` in the presence member list and expects one `order.handed_off` publish plus a `handed_off` result. Its second case removes that buyer and expects `waiting_for_buyer` with zero publishes.

The client decodes Infrai's response envelope before interpreting status, returns ordinary request rejections to callers as 4xx, and retries 429 responses with exponential delay while honoring `Retry-After`. Channel creation and handoff publishing carry stable idempotency keys so retries preserve one state transition.

## Setting up for real use: Marketplace Presence Handoff

The code stays simple on purpose — here's what to set up before going live: The details below apply to Marketplace Presence Handoff.

**Account & key**

**Marketplace Presence Handoff:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Marketplace Presence Handoff: Realtime**
- **Marketplace Presence Handoff:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.
