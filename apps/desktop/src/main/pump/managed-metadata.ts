import {
  createSignableMessage,
  getBase58Decoder,
  type KeyPairSigner,
} from "@solana/kit";
import {
  PumpLaunchManagedMetadataPublishRequestSchema,
  PumpLaunchManagedMetadataPublishResponseSchema,
  type PumpLaunchManagedMetadataPublishRequest,
  type PumpLaunchManagedMetadataPublishResponse,
} from "@silfable/contracts";

const DEFAULT_API_BASE_URL = "https://silfable-web.vercel.app";
const LOCAL_API_BASE_URL = "http://localhost:3000";

type WalletMessageSigner = {
  withWalletSigner<T>(
    address: string,
    operation: (signer: KeyPairSigner) => Promise<T>,
  ): Promise<T>;
};

type ChallengeResponse = {
  challengeId: string;
  walletAddress: string;
  message: string;
  expiresAt: string;
};

type VerifyResponse = {
  authenticated: true;
  walletAddress: string;
};

export class ManagedLaunchMetadataClient {
  readonly #baseUrl: string;
  readonly #wallets: WalletMessageSigner;
  readonly #fetch: typeof fetch;

  constructor(input: {
    wallets: WalletMessageSigner;
    baseUrl?: string;
    fetch?: typeof fetch;
  }) {
    this.#baseUrl = normalizeBaseUrl(
      input.baseUrl
        ?? process.env.SILFABLE_MANAGED_API_BASE_URL
        ?? defaultManagedApiBaseUrl(process.env),
    );
    this.#wallets = input.wallets;
    this.#fetch = input.fetch ?? fetch;
  }

  async publish(
    raw: PumpLaunchManagedMetadataPublishRequest,
  ): Promise<PumpLaunchManagedMetadataPublishResponse> {
    const request = PumpLaunchManagedMetadataPublishRequestSchema.parse(raw);
    const challengeResponse = await this.#fetch(`${this.#baseUrl}/api/auth/wallet/challenge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ walletAddress: request.creatorWallet }),
      signal: AbortSignal.timeout(15_000),
    });
    const challenge = await readJson<ChallengeResponse>(challengeResponse, "Wallet authentication challenge failed");
    if (
      challenge.walletAddress !== request.creatorWallet
      || !challenge.challengeId
      || !challenge.message
      || Date.parse(challenge.expiresAt) <= Date.now()
    ) {
      throw new Error("Managed storage returned an invalid wallet challenge");
    }

    const signature = await this.#wallets.withWalletSigner(
      request.creatorWallet,
      async (signer) => {
        const [signatures] = await signer.signMessages([
          createSignableMessage(new TextEncoder().encode(challenge.message)),
        ]);
        const bytes = signatures?.[signer.address];
        if (bytes === undefined) throw new Error("The selected wallet did not sign the storage challenge");
        return getBase58Decoder().decode(bytes);
      },
    );

    const verifyResponse = await this.#fetch(`${this.#baseUrl}/api/auth/wallet/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        walletAddress: request.creatorWallet,
        signature,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const verified = await readJson<VerifyResponse>(verifyResponse, "Wallet authentication failed");
    if (!verified.authenticated || verified.walletAddress !== request.creatorWallet) {
      throw new Error("Managed storage wallet authentication was rejected");
    }
    const sessionCookie = extractSessionCookie(verifyResponse.headers.get("set-cookie"));

    const imageBytes = Buffer.from(request.imageBase64, "base64");
    if (imageBytes.byteLength < 8 || imageBytes.byteLength > 10 * 1024 * 1024) {
      imageBytes.fill(0);
      throw new Error("Token image must be between 8 bytes and 10 MB");
    }
    try {
      const form = new FormData();
      form.set("walletAddress", request.creatorWallet);
      form.set("name", request.name);
      form.set("symbol", request.symbol);
      form.set("description", request.description);
      if (request.websiteUrl) form.set("websiteUrl", request.websiteUrl);
      if (request.xUrl) form.set("xUrl", request.xUrl);
      if (request.telegramUrl) form.set("telegramUrl", request.telegramUrl);
      form.set(
        "image",
        new File([imageBytes], `token-image.${extensionFor(request.imageContentType)}`, {
          type: request.imageContentType,
        }),
      );
      const uploadResponse = await this.#fetch(`${this.#baseUrl}/api/token-launch/metadata`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: form,
        signal: AbortSignal.timeout(45_000),
      });
      const payload = await readJson<unknown>(uploadResponse, "Managed Pinata upload failed");
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Managed Pinata upload returned an invalid response");
      }
      return PumpLaunchManagedMetadataPublishResponseSchema.parse({
        schemaVersion: 1,
        requestId: request.requestId,
        ...payload,
      });
    } finally {
      imageBytes.fill(0);
    }
  }
}

function defaultManagedApiBaseUrl(env: NodeJS.ProcessEnv): string {
  return env.ELECTRON_RENDERER_URL || env.NODE_ENV === "development"
    ? LOCAL_API_BASE_URL
    : DEFAULT_API_BASE_URL;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value.trim());
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if ((!local && url.protocol !== "https:") || (local && !["http:", "https:"].includes(url.protocol))) {
    throw new Error("Managed API URL must use HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Managed API URL is invalid");
  }
  return url.toString().replace(/\/$/u, "");
}

function extractSessionCookie(header: string | null): string {
  const match = header?.match(/(?:^|,\s*)(silfable_wallet_session=[^;,\s]+)/u);
  if (!match?.[1]) throw new Error("Managed storage did not issue an authenticated session");
  return match[1];
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : `${fallback} (${response.status})`;
    throw new Error(error);
  }
  return body as T;
}

function extensionFor(contentType: PumpLaunchManagedMetadataPublishRequest["imageContentType"]): string {
  if (contentType === "image/jpeg") return "jpg";
  return contentType.slice("image/".length);
}
