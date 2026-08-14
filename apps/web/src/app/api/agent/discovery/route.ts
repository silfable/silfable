import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    settings: {
      allowAutonomousDiscovery: false,
      maxSpendPerDiscovery: "0",
      maxDailyDiscoverySpend: "0",
      dailyDiscoverySpent: "0",
    },
    executionEnabled: false,
    code: "CLOUD_EXECUTION_FROZEN",
  });
}

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      code: "CLOUD_EXECUTION_FROZEN",
      error:
        "Autonomous discovery-to-buy is disabled. Token discovery may only produce a read-only proposal.",
    },
    { status: 409 }
  );
}
