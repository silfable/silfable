import { NextResponse } from "next/server";

const frozenResponse = () =>
  NextResponse.json(
    {
      success: false,
      code: "CLOUD_EXECUTION_FROZEN",
      error:
        "Cloud take-profit and stop-loss execution is disabled. No strategy was created or changed.",
    },
    { status: 409 }
  );

export async function GET() {
  return NextResponse.json({
    strategies: [],
    executionEnabled: false,
    code: "CLOUD_EXECUTION_FROZEN",
  });
}

export async function POST() {
  return frozenResponse();
}

export async function DELETE() {
  return frozenResponse();
}
