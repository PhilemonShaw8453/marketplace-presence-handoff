import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiError, InfraiRealtimeClient } from "./infrai_realtime.js";
import { handoffOrder } from "./order_handoff.js";

const handoffSchema = z.object({
  channel: z.string().min(1),
  orderId: z.string().min(1),
  sellerId: z.string().min(1),
  buyerId: z.string().min(1),
  assetId: z.string().min(1),
}).strict();

const tokenSchema = z.object({
  client_id: z.string().min(1),
  channels: z.array(z.string().min(1)),
  capabilities: z.array(z.string().min(1)).optional(),
  ttl_seconds: z.number().int().positive().optional(),
}).strict();

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Buffer | string>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const realtime = new InfraiRealtimeClient(apiKey);

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/handoffs") {
      const input = handoffSchema.parse(await readJson(request));
      const result = await handoffOrder(realtime, input);
      json(response, result.state === "handed_off" ? 200 : 202, result);
      return;
    }

    if (request.method === "POST" && request.url === "/client-tokens") {
      const input = tokenSchema.parse(await readJson(request));
      json(response, 200, await realtime.issueToken(input));
      return;
    }

    json(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      json(response, 400, { error: "invalid_request", issues: error.issues });
      return;
    }
    if (error instanceof SyntaxError) {
      json(response, 400, { error: "invalid_json" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      json(response, status, { error: error.code, message: error.message });
      return;
    }
    console.error(error);
    json(response, 500, { error: "service_error" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`marketplace presence service listening on :${port}`));
