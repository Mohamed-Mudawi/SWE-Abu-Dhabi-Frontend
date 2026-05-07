"use strict";

const fs = require("fs");
const path = require("path");

const dest = path.join(__dirname, "..", "api-config.js");
const dropletHttp = (
  process.env.API_UPSTREAM ||
  process.env.API_BASE_URL ||
  ""
).replace(/\/+$/, "");
const onVercel = process.env.VERCEL === "1";

let browserUrl = dropletHttp || "http://127.0.0.1:8000";
let line;
if (onVercel) {
  line = "window.__API_USE_PROXY__ = true;\n";
} else {
  line =
    "window.__API_USE_PROXY__ = false;\n" +
    `window.__API_BASE__ = ${JSON.stringify(browserUrl)};\n`;
}

fs.writeFileSync(dest, line);
console.log(
  "Wrote api-config.js:",
  onVercel ? "proxy mode (needs API_BASE_URL on Vercel for serverless)" : browserUrl
);
