import { NextResponse } from "next/server";

const frozenResponse = () =>
  NextResponse.json(
    {
      success: false,
      code: "CLOUD_EXECUTION_FROZEN",
      error:
        "Cloud Auto DCA is disabled. No schedule was created or changed. Use a restricted browser-wallet proposal flow.",
    },
    { status: 409 }
  );

export async function GET() {
  return NextResponse.json({
    schedules: [],
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
