"use strict";

const fs = require("fs");
const path = require("path");

const dest = path.join(__dirname, "..", "api-config.js");
const upstream = (process.env.API_UPSTREAM || "").replace(/\/+$/, "");
const manualBase = (process.env.API_BASE_URL || "").replace(/\/+$/, "");
const onVercel = process.env.VERCEL === "1";

let browserUrl;
if (onVercel && upstream) {
  const host = (process.env.VERCEL_URL || "").replace(/\/+$/, "");
  browserUrl = host ? `https://${host}/api/droplet` : manualBase || "http://127.0.0.1:8000";
} else {
  browserUrl = manualBase || upstream || "http://127.0.0.1:8000";
}

fs.writeFileSync(dest, `window.__API_BASE__ = ${JSON.stringify(browserUrl)};\n`);
console.log("Wrote api-config.js:", browserUrl, onVercel && upstream ? "(via /api/droplet proxy)" : "");
