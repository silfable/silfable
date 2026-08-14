import { NextRequest, NextResponse } from "next/server";

import { getManagedPinataConfig, ManagedPinataStorageService } from "@/lib/managed-pinata";
import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FORM_FIELDS = 8;

/**
 * Authenticated managed-storage boundary. This endpoint only publishes a user
 * supplied image and immutable metadata JSON. It has no signer, Pump SDK, or
 * transaction construction capability.
 */
export async function POST(request: NextRequest) {
  const config = getManagedPinataConfig();
  if (config === null) {
    return NextResponse.json({ error: "Managed Pinata storage is not configured.", code: "MANAGED_STORAGE_UNAVAILABLE" }, { status: 503 });
  }
  try {
    const form = await request.formData();
    if (Array.from(form.keys()).length > MAX_FORM_FIELDS) {
      return NextResponse.json({ error: "Too many upload fields.", code: "INVALID_UPLOAD" }, { status: 400 });
    }
    const walletAddress = form.get("walletAddress");
    const auth = await requireWalletAuth(request, walletAddress);
    if (isAuthFailure(auth)) return auth;
    const image = form.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "A token image file is required.", code: "IMAGE_REQUIRED" }, { status: 400 });
    }
    const storage = new ManagedPinataStorageService(config);
    const result = await storage.publishTokenMetadata({
      walletAddress: auth.walletAddress,
      name: readText(form, "name"),
      symbol: readText(form, "symbol"),
      description: readText(form, "description"),
      websiteUrl: readOptionalText(form, "websiteUrl"),
      xUrl: readOptionalText(form, "xUrl"),
      telegramUrl: readOptionalText(form, "telegramUrl"),
      imageBytes: new Uint8Array(await image.arrayBuffer()),
      imageContentType: image.type,
    });
    return NextResponse.json({
      published: true,
      ...result,
      executionAllowed: false,
      message: "Metadata is published for review. No Pump.fun transaction was created, signed, or broadcast.",
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Metadata publication failed.";
    return NextResponse.json({ error: message, code: "MANAGED_STORAGE_UPLOAD_FAILED" }, { status: 400 });
  }
}

function readText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function readOptionalText(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === "string" && value.trim() ? value : null;
}
