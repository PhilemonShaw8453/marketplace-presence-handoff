import { InfraiRealtimeClient } from "./infrai_realtime.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before creating the channel");

const channel = process.argv[2] ?? "marketplace-demo";
const realtime = new InfraiRealtimeClient(apiKey);

await realtime.createChannel(
  { channel, type: "presence" },
  `workspace-channel:${channel}`,
);

console.log(JSON.stringify({ channel, state: "ready" }));
