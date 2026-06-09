const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const site = path.join(root, "site");
const required = ["index.html", "styles.css", "_headers", "_redirects"];

for (const file of required) {
  const target = path.join(site, file);
  if (!fs.existsSync(target)) {
    throw new Error(`Missing site file: ${file}`);
  }
}

const html = fs.readFileSync(path.join(site, "index.html"), "utf8");
const checks = [
  "ClipSave",
  "ClipSave-1.4.0-mac-arm64.zip",
  "ClipSave-1.4.0-win-x64.zip",
  "github.com/mippm153/Clipsave_youtube_download"
];

for (const check of checks) {
  if (!html.includes(check)) {
    throw new Error(`Missing expected site text: ${check}`);
  }
}

console.log("Site checks passed.");
