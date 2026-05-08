"use strict";

const fs = require("fs");
const path = require("path");

const dest = path.join(__dirname, "..", "api-config.js");
const onVercel = process.env.VERCEL === "1";

const raw = String(
  process.env.API_BASE_URL || process.env.API_PUBLIC_URL || ""
).trim();

if (onVercel && !raw) {
  console.error(
    "\nBuild failed: API_BASE_URL is missing.\n" +
      "Vercel → Project → Settings → Environment Variables → add API_BASE_URL\n" +
      "  e.g. http://167.172.129.18:6969\n" +
      "Enable it for Production (and Preview if you use preview deploys), then redeploy.\n"
  );
  process.exit(1);
}

const url = (raw || "http://127.0.0.1:6969").replace(/\/+$/, "");

fs.writeFileSync(dest, `window.__API_BASE__ = ${JSON.stringify(url)};\n`);
console.log("Wrote api-config.js:", url);
