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
    process.env.API_UPSTREAM || process.env.API_BASE_URL || ""
  ).replace(/\/+$/, "");

  if (!upstreamBase) {
    res
      .status(500)
      .json({ message: "Set API_BASE_URL or API_UPSTREAM to your http:// droplet URL on Vercel" });
    return;
  }

  if (process.env.VERCEL && /127\.0\.0\.1|localhost/i.test(upstreamBase)) {
    res.status(500).json({
      message:
        "API_BASE_URL points to localhost. On Vercel, set it to your DigitalOcean public URL (e.g. http://YOUR.IP:8000).",
    });
    return;
  }

  let u;
  try {
    u = new URL(req.url, "http://localhost");
  } catch {
    res.status(400).end();
    return;
  }

  let sub = (u.searchParams.get("forward") || "").replace(/^\/+/, "");
  const extraParams = new URLSearchParams();
  u.searchParams.forEach((value, key) => {
    if (key !== "forward") extraParams.append(key, value);
  });
  const qsExtra = extraParams.toString();
  const q = qsExtra ? "?" + qsExtra : "";

  const target = `${upstreamBase}/${sub}${q}`;

  let body;
  try {
    body = await readBody(req);
  } catch {
    res.status(400).end();
    return;
  }

  const headers = {
    Accept: "*/*",
    "User-Agent": "vercel-droplet-proxy/1",
  };
  const hct = req.headers["content-type"];
  if (hct) headers["Content-Type"] = hct;
  const auth = req.headers.authorization;
  if (auth) headers["Authorization"] = auth;

  const timeoutMs = 25000;
  let controller;
  let to;
  try {
    controller = new AbortController();
    to = setTimeout(function () {
      controller.abort();
    }, timeoutMs);
  } catch {
    controller = null;
  }

  let r;
  try {
    r = await fetch(target, {
      method: req.method,
      headers,
      body: body !== undefined && body.length ? body : undefined,
      signal: controller ? controller.signal : undefined,
    });
  } catch (err) {
    if (to) clearTimeout(to);
    const msg = err && err.message ? err.message : String(err);
    const cause = err && err.cause && err.cause.message ? err.cause.message : "";
    res.status(502).json({
      message: "Upstream request failed",
      detail: [msg, cause].filter(Boolean).join(" — "),
      tried: target,
      checks: [
        "Vercel → Project → Settings → Environment Variables: API_BASE_URL = http://<droplet-public-ip>:8000 (Production).",
        "DigitalOcean: cloud firewall + ufw allow 8000/tcp.",
        "On the VM: app must listen on 0.0.0.0:8000 (not only 127.0.0.1).",
      ],
    });
    return;
  }
  if (to) clearTimeout(to);

  const text = await r.text();
  const outCt = r.headers.get("content-type");
  if (outCt) res.setHeader("Content-Type", outCt);
  res.status(r.status).send(text);
};
