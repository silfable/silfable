import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    active: false,
    session: null,
    executionEnabled: false,
    code: "CLOUD_EXECUTION_FROZEN",
    message:
      "Cloud signing and autonomous execution are disabled. Restricted browser-wallet sessions remain available.",
  });
}
