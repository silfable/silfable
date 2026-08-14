import assert from "node:assert/strict";
import test from "node:test";
import { checkLatestRelease, compareVersions } from "./release-check";

test("compares stable semantic versions numerically", () => {
  assert.equal(compareVersions("0.2.0", "0.1.9"), 1);
  assert.equal(compareVersions("v0.1.0", "0.1.0"), 0);
  assert.equal(compareVersions("0.1.0", "1.0.0"), -1);
});

test("reports a newer official release without downloading it", async () => {
  const request = async () => new Response(JSON.stringify({ tag_name: "v0.2.0", html_url: "https://github.com/silfable/silfable/releases/tag/v0.2.0", published_at: "2026-08-14T00:00:00Z", draft: false, prerelease: false }), { status: 200 });
  const result = await checkLatestRelease("0.1.0", request as typeof fetch);
  assert.equal(result.available, true);
  assert.equal(result.latestVersion, "0.2.0");
});
