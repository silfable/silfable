const certificate = process.env.WIN_CSC_LINK?.trim() || process.env.CSC_LINK?.trim();
const password = process.env.WIN_CSC_KEY_PASSWORD ?? process.env.CSC_KEY_PASSWORD;

if (!certificate || !password) {
  throw new Error([
    "Production Windows packaging requires a code-signing certificate.",
    "Set WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD through local or CI secrets.",
    "Use dist:win:qa only for an explicitly unsigned internal QA installer.",
  ].join("\n"));
}

console.log("Windows signing credentials are present; certificate content was not read or printed.");
