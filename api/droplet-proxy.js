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

module.exports = async (req, res) => {
  const upstreamBase = String(
    process.env.API_BASE_URL || process.env.API_UPSTREAM || ""
  )
    .trim()
    .replace(/\/+$/, "");

  if (!upstreamBase) {
    res.status(500).json({ message: "Set API_BASE_URL on Vercel" });
    return;
  }

  let u;
  try {
    u = new URL(req.url, "http://localhost");
  } catch {
    res.status(400).end();
    return;
  }

  const qForward = req.query && req.query.forward;
  const fromQuery = Array.isArray(qForward) ? qForward[0] : qForward;
  const sub = String(fromQuery || u.searchParams.get("forward") || "").replace(
    /^\/+/,
    ""
  );

  const extra = new URLSearchParams();
  u.searchParams.forEach((value, key) => {
    if (key !== "forward") extra.append(key, value);
  });
  const qs = extra.toString() ? "?" + extra.toString() : "";
  const target = `${upstreamBase}/${sub}${qs}`;

  let bodyBuf;
  try {
    bodyBuf = await readBody(req);
  } catch {
    res.status(400).end();
    return;
  }

  const headers = {
    Accept: "*/*",
    "User-Agent": "vercel-droplet-proxy/1",
  };
  if (req.headers["content-type"])
    headers["Content-Type"] = req.headers["content-type"];
  if (req.headers.authorization)
    headers["Authorization"] = req.headers.authorization;

  try {
    const r = await fetch(target, {
      method: req.method,
      headers,
      body: bodyBuf && bodyBuf.length ? bodyBuf : undefined,
    });
    const text = await r.text();
    const ct = r.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);
    res.status(r.status).send(text);
  } catch (e) {
    res.status(502).json({
      message: "Upstream request failed",
      detail: String(e && e.message ? e.message : e),
      tried: target,
    });
  }
};
