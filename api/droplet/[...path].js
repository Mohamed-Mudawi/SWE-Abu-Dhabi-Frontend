"use strict";

async function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function getSubpath(req) {
  const parts = req.query.path;
  if (parts !== undefined) {
    return Array.isArray(parts) ? parts.join("/") : String(parts);
  }
  const raw = (req.url || "").split("?")[0];
  const m = raw.match(/^\/api\/droplet\/(.*)$/);
  return m ? m[1] : "";
}

module.exports = async (req, res) => {
  const upstream = String(process.env.API_UPSTREAM || "").replace(/\/+$/, "");
  if (!upstream) {
    res.status(500).json({ message: "API_UPSTREAM is not set on Vercel" });
    return;
  }

  let sub = getSubpath(req);
  const rawPath = (req.url || "").split("?")[0];
  if (rawPath.endsWith("/") && sub.length > 0 && !sub.endsWith("/")) {
    sub += "/";
  }

  const q = req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const target = `${upstream}/${sub}${q}`;

  let body;
  try {
    body = await readBody(req);
  } catch {
    res.status(400).end();
    return;
  }

  const headers = {};
  const hct = req.headers["content-type"];
  if (hct) headers["Content-Type"] = hct;
  const auth = req.headers.authorization;
  if (auth) headers["Authorization"] = auth;

  let r;
  try {
    r = await fetch(target, {
      method: req.method,
      headers,
      body: body !== undefined && body.length ? body : undefined,
    });
  } catch {
    res.status(502).json({ message: "Upstream request failed" });
    return;
  }

  const text = await r.text();
  const outCt = r.headers.get("content-type");
  if (outCt) res.setHeader("Content-Type", outCt);
  res.status(r.status).send(text);
};
