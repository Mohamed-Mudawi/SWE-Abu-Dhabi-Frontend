"use strict";

const fs = require("fs");
const path = require("path");

const dest = path.join(__dirname, "..", "api-config.js");
const raw = process.env.API_BASE_URL || "http://127.0.0.1:8000";
const url = raw.replace(/\/+$/, "");

fs.writeFileSync(dest, `window.__API_BASE__ = ${JSON.stringify(url)};\n`);
console.log("Wrote api-config.js:", url);
