import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      code: "CLOUD_EXECUTION_FROZEN",
      error: "Cloud signing is disabled. Create a Restricted session and approve every transaction in your connected wallet.",
    },
    { status: 409 },
  );
}
