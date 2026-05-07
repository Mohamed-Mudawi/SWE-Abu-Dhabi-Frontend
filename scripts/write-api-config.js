"use strict";

const fs = require("fs");
const path = require("path");

const dest = path.join(__dirname, "..", "api-config.js");

/** Single source used on Vercel builds and local. Trim trailing slashes. */
function publicApiBase() {
  const s = String(
    process.env.API_PUBLIC_URL ||
      process.env.API_UPSTREAM ||
      process.env.API_BASE_URL ||
      ""
  ).trim();
  return s.replace(/\/+$/, "");
}

const raw = publicApiBase();
const onVercel = process.env.VERCEL === "1";
const isHttps = /^https:\/\//i.test(raw);

let line;
let mode;

if (onVercel && isHttps) {
  // Browser calls your API over HTTPS (same-origin rules satisfied). Set CORS on Flask
  // to include this deployment’s origin, e.g. https://swe-abu-dhabi-frontend.vercel.app
  line =
    "window.__API_USE_PROXY__ = false;\n" +
    `window.__API_BASE__ = ${JSON.stringify(raw)};\n`;
  mode = "direct https (no proxy): " + raw;
} else if (onVercel) {
  // http:// upstream: requires Vercel serverless → droplet; often blocked or flaky.
  line =
    'window.__API_USE_PROXY__ = true;\n' +
    'window.__API_MODE__ = "vercel-proxy";\n' +
    "if (typeof console !== \"undefined\" && console.warn) {\n" +
    "  console.warn(\n" +
    '    \"[fitness-ui] Proxy mode: set Vercel env API_BASE_URL (or API_PUBLIC_URL) to https://your-api-host and redeploy — then API calls go direct to your server, not /api/droplet-proxy.\"\n' +
    "  );\n" +
    "}\n";
  mode =
    "proxy mode — API_BASE_URL must start with https:// to disable proxy; got: " +
    (raw || "(empty)");
} else {
  const browserUrl = raw || "http://127.0.0.1:8000";
  line =
    "window.__API_USE_PROXY__ = false;\n" +
    `window.__API_BASE__ = ${JSON.stringify(browserUrl)};\n`;
  mode = browserUrl;
}

fs.writeFileSync(dest, line);
console.log("Wrote api-config.js:", mode);
