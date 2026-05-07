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
  // http://: browser calls /up/… (Edge middleware → API_BASE_URL). Port must be open on DO.
  line =
    'window.__API_USE_PROXY__ = true;\n' +
    'window.__API_PROXY_PREFIX__ = "/up/";\n' +
    'window.__API_MODE__ = "vercel-edge";\n' +
    "if (typeof console !== \"undefined\" && console.warn) {\n" +
    "  console.warn(\n" +
    '    \"[fitness-ui] API via /up/ → set Vercel API_BASE_URL=http://PUBLIC_IP:PORT. Open that TCP port on DigitalOcean + ufw; bind app to 0.0.0.0. Use https://… API URL to skip proxy.\"\n' +
    "  );\n" +
    "}\n";
  mode =
    "edge proxy /up/ — API_BASE_URL=" + (raw || "(empty at build; set on Vercel)");
} else {
  const browserUrl = raw || "http://127.0.0.1:8000";
  line =
    "window.__API_USE_PROXY__ = false;\n" +
    `window.__API_BASE__ = ${JSON.stringify(browserUrl)};\n`;
  mode = browserUrl;
}

fs.writeFileSync(dest, line);
console.log("Wrote api-config.js:", mode);
