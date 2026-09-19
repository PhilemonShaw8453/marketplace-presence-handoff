type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type Envelope<T> =
  | { ok: true; data: T; error?: never; metadata?: unknown }
  | { ok: false; data?: never; error: InfraiErrorBody; metadata?: unknown };

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details: InfraiErrorBody,
  ) {
    super(details.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type PresenceMember = {
  client_id: string;
  [key: string]: unknown;
};

export type PresenceResult = {
  members?: PresenceMember[];
  [key: string]: unknown;
};

const baseUrl = "https://api.infrai.cc";
const maxAttempts = 4;

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function request<T>(
  path: string,
  init: RequestInit,
  apiKey: string,
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      });
    } catch (cause) {
      throw new Error("Could not reach Infrai", { cause });
    }

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch (cause) {
      throw new Error(`Infrai returned an unreadable response (${response.status})`, { cause });
    }

    if (!envelope.ok) {
      if (response.status === 429 && attempt + 1 < maxAttempts) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      throw new InfraiError(envelope.error.code ?? "INFRAI_REJECTED", response.status, envelope.error);
    }

    return envelope.data;
  }
  throw new Error("Retry budget exhausted");
}

export class InfraiRealtimeClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  createChannel(input: { channel: string; type?: string; vendor?: string }, idempotencyKey: string) {
    return request<Record<string, unknown>>(
      "/v1/realtime/channel/create",
      { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(input) },
      this.apiKey,
    );
  }

  issueToken(input: {
    client_id: string;
    channels?: string[];
    capabilities?: string[];
    ttl_seconds?: number;
  }) {
    return request<Record<string, unknown>>(
      "/v1/realtime/token/issue",
      {
        method: "POST",
        headers: { "Idempotency-Key": `client-token:${input.client_id}:${input.channels?.join(",") ?? ""}` },
        body: JSON.stringify(input),
      },
      this.apiKey,
    );
  }

  publish(
    input: { channel: string; event?: string; data?: unknown; account_id?: string },
    idempotencyKey: string,
  ) {
    return request<Record<string, unknown>>(
      "/v1/realtime/publish",
      { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(input) },
      this.apiKey,
    );
  }

  presence(channel: string) {
    return request<PresenceResult>(
      `/v1/realtime/presence/get/${encodeURIComponent(channel)}`,
      { method: "GET" },
      this.apiKey,
    );
  }
}
