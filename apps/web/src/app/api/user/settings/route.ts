import { NextRequest, NextResponse } from "next/server";
import { cloudDb } from "@/lib/cloud-db";
import { isAuthFailure, requireWalletAuth } from "@/lib/wallet-auth";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const walletAddress = searchParams.get("walletAddress");

    if (!walletAddress) {
      return NextResponse.json({ error: "walletAddress parameter is required" }, { status: 400 });
    }
    const auth = await requireWalletAuth(req, walletAddress);
    if (isAuthFailure(auth)) return auth;

    const user = await cloudDb.user.findUnique({
      where: { id: auth.userId },
      include: { settings: true },
    });

    if (!user || !user.settings) {
      return NextResponse.json({
        customRpcUrl: "",
        slippageBps: 100,
        priorityFeeLevel: "medium",
        selectedModel: "google/gemini-2.5-flash",
        credentials: {
          openRouterConfigured: false,
          jupiterConfigured: false,
          tavilyConfigured: false,
        },
      });
    }

    const s = user.settings;

    return NextResponse.json({
      customRpcUrl: s.customRpcUrl || "",
      slippageBps: s.slippageBps ?? 100,
      priorityFeeLevel: s.priorityFeeLevel || "medium",
      selectedModel: s.selectedModel || "google/gemini-2.5-flash",
      credentials: {
        openRouterConfigured: Boolean(s.encryptedOpenRouterKey && s.openRouterIv),
        jupiterConfigured: Boolean(s.encryptedJupiterKey && s.jupiterIv),
        tavilyConfigured: Boolean(s.encryptedTavilyKey && s.tavilyIv),
      },
    });
  } catch (error) {
    console.error("GET /api/user/settings error:", error);
    return NextResponse.json({ error: "Failed to fetch user settings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireWalletAuth(req);
  if (isAuthFailure(auth)) return auth;
  return NextResponse.json(
    {
      success: false,
      code: "CLOUD_SETTINGS_FROZEN",
      error: "Cloud credential storage remains disabled pending a dedicated encrypted credential-vault audit.",
    },
    { status: 409 },
  );
}
