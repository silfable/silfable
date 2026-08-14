import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      code: "CLOUD_EXECUTION_FROZEN",
      error:
        "Cloud sessions are disabled. Legacy session revocation requires an authenticated administrative migration.",
    },
    { status: 409 }
  );
}
