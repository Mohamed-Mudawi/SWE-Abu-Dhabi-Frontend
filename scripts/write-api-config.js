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
const vercelHost = (process.env.VERCEL_URL || "").replace(/\/+$/, "");

let browserUrl;
if (onVercel && vercelHost) {
  browserUrl = `https://${vercelHost}/api/droplet`;
} else {
  browserUrl = dropletHttp || "http://127.0.0.1:8000";
}

fs.writeFileSync(dest, `window.__API_BASE__ = ${JSON.stringify(browserUrl)};\n`);
console.log(
  "Wrote api-config.js:",
  browserUrl,
  onVercel && vercelHost ? "(proxy → " + (dropletHttp || "set API_BASE_URL for serverless") + ")" : ""
);
