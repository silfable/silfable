export type DesktopUpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  available: boolean;
  releaseUrl: string;
  publishedAt: string | null;
};

const RELEASES_API = "https://api.github.com/repos/silfable/silfable/releases/latest";
const RELEASES_URL = "https://github.com/silfable/silfable/releases";

export function compareVersions(left: string, right: string): number {
  const normalize = (value: string) => (value.replace(/^v/iu, "").split("-")[0] ?? "0").split(".").map((part) => Number(part));
  const a = normalize(left);
  const b = normalize(right);
  for (let index = 0; index < Math.max(a.length, b.length, 3); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export async function checkLatestRelease(currentVersion: string, request: typeof fetch = fetch): Promise<DesktopUpdateInfo> {
  const response = await request(RELEASES_API, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": `Silfable-Desktop/${currentVersion}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`GitHub Releases returned HTTP ${response.status}.`);
  const payload = await response.json() as { tag_name?: unknown; html_url?: unknown; published_at?: unknown; draft?: unknown; prerelease?: unknown };
  if (payload.draft === true || payload.prerelease === true || typeof payload.tag_name !== "string") throw new Error("No stable Silfable release is available.");
  const latestVersion = payload.tag_name.replace(/^v/iu, "");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(latestVersion)) throw new Error("The latest release version is invalid.");
  const releaseUrl = typeof payload.html_url === "string" && payload.html_url.startsWith("https://github.com/silfable/silfable/releases/") ? payload.html_url : RELEASES_URL;
  return {
    currentVersion,
    latestVersion,
    available: compareVersions(latestVersion, currentVersion) > 0,
    releaseUrl,
    publishedAt: typeof payload.published_at === "string" ? payload.published_at : null,
  };
}

export const SILFABLE_RELEASES_URL = RELEASES_URL;
