import { createHash, createHmac, randomUUID } from "node:crypto";

import { R2SettingsSchema, type PumpLaunchDraft, type PumpLaunchMetadataPackage, type R2Settings } from "@silfable/contracts";

const SETTINGS_KEY = "cloudflare-r2-settings-v1";
const REGION = "auto";
const SERVICE = "s3";

type SettingsStore = {
  getSetting(key: string): unknown;
  setSetting(key: string, value: unknown): void;
};

type SecretStore = {
  getSecret(name: "r2-access-key-id" | "r2-secret-access-key"): Promise<string | null>;
  setSecret(name: "r2-access-key-id" | "r2-secret-access-key", value: string): Promise<void>;
};

type FetchPort = typeof fetch;

export class CloudflareR2Service {
  readonly #settings: SettingsStore;
  readonly #secrets: SecretStore;
  readonly #fetch: FetchPort;

  constructor(input: { settings: SettingsStore; secrets: SecretStore; fetch?: FetchPort }) {
    this.#settings = input.settings;
    this.#secrets = input.secrets;
    this.#fetch = input.fetch ?? fetch;
  }

  getSettings(): R2Settings | null {
    const parsed = R2SettingsSchema.safeParse(this.#settings.getSetting(SETTINGS_KEY));
    return parsed.success ? parsed.data : null;
  }

  async status(): Promise<{ settings: R2Settings | null; credentialsConfigured: boolean; ready: boolean }> {
    const [accessKeyId, secretAccessKey] = await Promise.all([
      this.#secrets.getSecret("r2-access-key-id"),
      this.#secrets.getSecret("r2-secret-access-key"),
    ]);
    const settings = this.getSettings();
    const credentialsConfigured = accessKeyId !== null && secretAccessKey !== null;
    return { settings, credentialsConfigured, ready: settings !== null && credentialsConfigured };
  }

  async save(input: { settings: R2Settings; accessKeyId?: string | undefined; secretAccessKey?: string | undefined }): Promise<R2Settings> {
    const settings = R2SettingsSchema.parse(input.settings);
    if ((input.accessKeyId === undefined) !== (input.secretAccessKey === undefined)) throw new Error("Both R2 credentials are required when replacing them");
    if (input.accessKeyId !== undefined && input.secretAccessKey !== undefined) {
      await this.#secrets.setSecret("r2-access-key-id", input.accessKeyId);
      await this.#secrets.setSecret("r2-secret-access-key", input.secretAccessKey);
    }
    if ((await this.#secrets.getSecret("r2-access-key-id")) === null || (await this.#secrets.getSecret("r2-secret-access-key")) === null) {
      throw new Error("R2 credentials are required for initial configuration");
    }
    this.#settings.setSetting(SETTINGS_KEY, settings);
    return settings;
  }

  async test(): Promise<{ bucket: string }> {
    const { settings, credentials } = await this.#requireReady();
    const response = await this.#signedFetch({
      settings,
      credentials,
      method: "GET",
      path: `/${settings.bucket}`,
      query: "list-type=2&max-keys=1",
    });
    if (!response.ok) throw new Error(`Cloudflare R2 bucket check failed (${response.status})`);
    return { bucket: settings.bucket };
  }

  async publishLaunchMetadata(draft: PumpLaunchDraft): Promise<PumpLaunchMetadataPackage> {
    const { settings, credentials } = await this.#requireReady();
    if (draft.metadata.metadataUri) throw new Error("This launch draft already uses an externally hosted metadata URL");
    const document = buildMetadataDocument(draft);
    const body = Buffer.from(JSON.stringify(document), "utf8");
    const sha256 = createHash("sha256").update(body).digest("hex");
    const id = randomUUID();
    const key = `silfable/token-launch/${draft.id}/metadata-${id}.json`;
    const response = await this.#signedFetch({
      settings,
      credentials,
      method: "PUT",
      path: `/${settings.bucket}/${key}`,
      body,
      contentType: "application/json; charset=utf-8",
      extraHeaders: { "cache-control": "public, max-age=31536000, immutable" },
    });
    if (!response.ok) throw new Error(`Cloudflare R2 metadata upload failed (${response.status})`);
    return {
      id,
      draftId: draft.id,
      storage: "cloudflare-r2",
      uri: publicObjectUrl(settings.publicBaseUrl, key),
      sha256,
      publishedAt: new Date().toISOString(),
    };
  }

  async #requireReady(): Promise<{ settings: R2Settings; credentials: { accessKeyId: string; secretAccessKey: string } }> {
    const [status, accessKeyId, secretAccessKey] = await Promise.all([
      this.status(),
      this.#secrets.getSecret("r2-access-key-id"),
      this.#secrets.getSecret("r2-secret-access-key"),
    ]);
    if (status.settings === null || accessKeyId === null || secretAccessKey === null) {
      throw new Error("Cloudflare R2 is not configured");
    }
    return { settings: status.settings, credentials: { accessKeyId, secretAccessKey } };
  }

  async #signedFetch(input: { settings: R2Settings; credentials: { accessKeyId: string; secretAccessKey: string }; method: "GET" | "PUT"; path: string; query?: string; body?: Buffer; contentType?: string; extraHeaders?: Record<string, string> }): Promise<Response> {
    const host = `${input.settings.accountId}.r2.cloudflarestorage.com`;
    const timestamp = new Date();
    const amzDate = timestamp.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash("sha256").update(input.body ?? "").digest("hex");
    const canonicalUri = input.path.split("/").map(encodeURIComponent).join("/").replace(/%2F/gu, "/");
    const canonicalQuery = (input.query ?? "").split("&").filter(Boolean).sort().join("&");
    const headers: Record<string, string> = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...(input.contentType ? { "content-type": input.contentType } : {}),
      ...input.extraHeaders,
    };
    const sortedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = sortedHeaderNames.map((name) => `${name}:${headers[name]!.trim()}\n`).join("");
    const signedHeaders = sortedHeaderNames.join(";");
    const canonicalRequest = [input.method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
    const signature = hmac(signingKey(input.credentials.secretAccessKey, dateStamp), stringToSign, "hex");
    const authorization = `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const url = `https://${host}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
    return this.#fetch(url, { method: input.method, headers: { ...headers, authorization }, ...(input.body ? { body: new Uint8Array(input.body) } : {}) });
  }
}

function buildMetadataDocument(draft: PumpLaunchDraft): Record<string, unknown> {
  const metadata = draft.metadata;
  return {
    name: metadata.name,
    symbol: metadata.symbol,
    description: metadata.description,
    image: metadata.imageUri,
    ...(metadata.websiteUrl ? { external_url: metadata.websiteUrl } : {}),
    extensions: {
      ...(metadata.xUrl ? { twitter: metadata.xUrl } : {}),
      ...(metadata.telegramUrl ? { telegram: metadata.telegramUrl } : {}),
    },
  };
}

function publicObjectUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/$/u, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function hmac(key: string | Buffer, value: string, encoding?: "hex"): Buffer | string {
  const result = createHmac("sha256", key).update(value).digest();
  return encoding === "hex" ? result.toString("hex") : result;
}

function signingKey(secret: string, dateStamp: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, dateStamp) as Buffer;
  const regionKey = hmac(dateKey, REGION) as Buffer;
  const serviceKey = hmac(regionKey, SERVICE) as Buffer;
  return hmac(serviceKey, "aws4_request") as Buffer;
}
