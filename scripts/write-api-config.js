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

let browserUrl;
if (onVercel) {
  browserUrl = "/api/droplet";
} else {
  browserUrl = dropletHttp || "http://127.0.0.1:8000";
}

fs.writeFileSync(dest, `window.__API_BASE__ = ${JSON.stringify(browserUrl)};\n`);
console.log(
  "Wrote api-config.js:",
  browserUrl,
  onVercel ? "(relative proxy → " + (dropletHttp || "set API_BASE_URL") + ")" : ""
);
