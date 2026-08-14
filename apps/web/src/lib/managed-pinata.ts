import { createHash } from "node:crypto";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PINATA_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";
const DEFAULT_GATEWAY_URL = "https://gateway.pinata.cloud/ipfs";

export type ManagedPinataConfig = {
  jwt: string;
  gatewayBaseUrl: string;
};

export type ManagedLaunchMetadataInput = {
  walletAddress: string;
  name: string;
  symbol: string;
  description: string;
  websiteUrl: string | null;
  xUrl: string | null;
  telegramUrl: string | null;
  imageBytes: Uint8Array;
  imageContentType: string;
};

export type ManagedLaunchMetadataResult = {
  imageCid: string;
  metadataCid: string;
  imageUri: string;
  metadataUri: string;
  imageGatewayUrl: string;
  metadataGatewayUrl: string;
  metadataSha256: string;
};

type ManagedPinataEnvironment = Record<string, string | undefined>;

export function getManagedPinataConfig(env: ManagedPinataEnvironment = process.env as ManagedPinataEnvironment): ManagedPinataConfig | null {
  const jwt = env.SILFABLE_PINATA_JWT?.trim();
  const gatewayBaseUrl = env.SILFABLE_PINATA_GATEWAY?.trim() || DEFAULT_GATEWAY_URL;
  if (!jwt) return null;
  if (/\s/u.test(jwt) || jwt.length < 16) throw new Error("Managed Pinata token is invalid");
  const gateway = new URL(gatewayBaseUrl);
  if (gateway.protocol !== "https:" || gateway.username || gateway.password) {
    throw new Error("Managed Pinata gateway must be an HTTPS URL");
  }
  return { jwt, gatewayBaseUrl: gateway.toString().replace(/\/$/u, "") };
}

/**
 * Server-side IPFS metadata publisher. It has no signer, Pump SDK, transaction,
 * or RPC capability. Pinata's JWT is held only by the application server.
 */
export class ManagedPinataStorageService {
  readonly #config: ManagedPinataConfig;
  readonly #fetch: typeof fetch;

  constructor(config: ManagedPinataConfig, fetchPort: typeof fetch = fetch) {
    this.#config = config;
    this.#fetch = fetchPort;
  }

  async publishTokenMetadata(input: ManagedLaunchMetadataInput): Promise<ManagedLaunchMetadataResult> {
    const metadata = normalizeMetadata(input);
    const image = inspectImage(input.imageBytes, input.imageContentType);
    const imageCid = await this.#uploadPublicFile(
      new File([Buffer.from(input.imageBytes)], `token-image.${image.extension}`, { type: image.contentType }),
      `silfable-${metadata.symbol}-image`,
      { artifact: "token-launch-image", wallet: fingerprint(input.walletAddress) },
    );
    const document = {
      name: metadata.name,
      symbol: metadata.symbol,
      description: metadata.description,
      image: toIpfsUri(imageCid),
      ...(metadata.websiteUrl ? { external_url: metadata.websiteUrl } : {}),
      extensions: {
        ...(metadata.xUrl ? { twitter: metadata.xUrl } : {}),
        ...(metadata.telegramUrl ? { telegram: metadata.telegramUrl } : {}),
      },
    };
    const metadataBody = new TextEncoder().encode(JSON.stringify(document));
    const metadataSha256 = createHash("sha256").update(metadataBody).digest("hex");
    const metadataCid = await this.#uploadPublicFile(
      new File([Buffer.from(metadataBody)], "metadata.json", { type: "application/json" }),
      `silfable-${metadata.symbol}-metadata`,
      { artifact: "token-launch-metadata", wallet: fingerprint(input.walletAddress), sha256: metadataSha256 },
    );
    return {
      imageCid,
      metadataCid,
      imageUri: toIpfsUri(imageCid),
      metadataUri: toIpfsUri(metadataCid),
      imageGatewayUrl: toGatewayUrl(this.#config.gatewayBaseUrl, imageCid),
      metadataGatewayUrl: toGatewayUrl(this.#config.gatewayBaseUrl, metadataCid),
      metadataSha256,
    };
  }

  async #uploadPublicFile(file: File, name: string, keyvalues: Record<string, string>): Promise<string> {
    const form = new FormData();
    form.set("network", "public");
    form.set("file", file);
    form.set("name", name);
    form.set("keyvalues", JSON.stringify(keyvalues));
    const response = await this.#fetch(PINATA_UPLOAD_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${this.#config.jwt}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Managed IPFS upload failed (${response.status})`);
    const payload: unknown = await response.json();
    const cid = readCid(payload);
    if (!cid) throw new Error("Managed IPFS upload returned no CID");
    return cid;
  }
}

export function assertManagedUploadBytes(bytes: Uint8Array): void {
  if (bytes.byteLength < 8 || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Image must be between 8 bytes and 10 MB");
}

function normalizeMetadata(input: ManagedLaunchMetadataInput): Omit<ManagedLaunchMetadataInput, "walletAddress" | "imageBytes" | "imageContentType"> {
  const name = input.name.trim();
  const symbol = input.symbol.trim().toUpperCase();
  const description = input.description.trim();
  if (!name || name.length > 32) throw new Error("Token name must be 1 to 32 characters");
  if (!/^[A-Z0-9]{1,10}$/u.test(symbol)) throw new Error("Token symbol must contain 1 to 10 letters or numbers");
  if (description.length > 500) throw new Error("Token description must not exceed 500 characters");
  return {
    name,
    symbol,
    description,
    websiteUrl: normalizeHttpsUrl(input.websiteUrl, "Website"),
    xUrl: normalizeHttpsUrl(input.xUrl, "X profile"),
    telegramUrl: normalizeHttpsUrl(input.telegramUrl, "Telegram"),
  };
}

function normalizeHttpsUrl(value: string | null, label: string): string | null {
  if (!value?.trim()) return null;
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.username || url.password) throw new Error(`${label} must be an HTTPS URL`);
  return url.toString();
}

function inspectImage(bytes: Uint8Array, claimedContentType: string): { contentType: string; extension: string } {
  assertManagedUploadBytes(bytes);
  const type = claimedContentType.toLowerCase();
  if (isPng(bytes) && type === "image/png") return { contentType: type, extension: "png" };
  if (isJpeg(bytes) && type === "image/jpeg") return { contentType: type, extension: "jpg" };
  if (isGif(bytes) && type === "image/gif") return { contentType: type, extension: "gif" };
  if (isWebp(bytes) && type === "image/webp") return { contentType: type, extension: "webp" };
  throw new Error("Image content must be a valid PNG, JPEG, GIF, or WebP file");
}

function readCid(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = "data" in payload ? payload.data : null;
  if (!data || typeof data !== "object" || !("cid" in data) || typeof data.cid !== "string") return null;
  return /^[a-z2-7]{20,}$/iu.test(data.cid) ? data.cid : null;
}

function fingerprint(value: string): string { return createHash("sha256").update(value).digest("hex").slice(0, 16); }
function toIpfsUri(cid: string): string { return `ipfs://${cid}`; }
function toGatewayUrl(base: string, cid: string): string { return `${base}/${cid}`; }
function isPng(bytes: Uint8Array): boolean { return bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]); }
function isJpeg(bytes: Uint8Array): boolean { return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff; }
function isGif(bytes: Uint8Array): boolean { return bytes.length >= 6 && new TextDecoder().decode(bytes.slice(0, 6)) === "GIF89a"; }
function isWebp(bytes: Uint8Array): boolean { return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"; }
