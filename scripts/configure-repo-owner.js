const fs = require("node:fs");
const path = require("node:path");

const repoArg = process.argv[2];
if (!repoArg || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoArg)) {
  console.error("Usage: npm run configure:repo -- <github-owner>/<repo-name>");
  process.exit(1);
}

const root = path.join(__dirname, "..");
const files = [
  "site/index.html",
  "site/_redirects",
  "scripts/check-site-links.js",
  "docs/DEPLOYMENT.md",
  "docs/RELEASE_CHECKLIST.md",
  "README.md"
];

for (const relative of files) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) {
    continue;
  }
  const next = fs
    .readFileSync(target, "utf8")
    .replaceAll("YOUR_GITHUB_OWNER/clipsave", repoArg)
    .replaceAll("YOUR_GITHUB_REPO", repoArg)
    .replaceAll("dygksdl931-source/Clipsave_youtube_download", repoArg)
    .replaceAll("mippm153/Clipsave_youtube_download", repoArg);
  fs.writeFileSync(target, next);
}

console.log(`Configured GitHub repository: ${repoArg}`);
