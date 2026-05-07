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

  let u;
  try {
    u = new URL(req.url, "http://localhost");
  } catch {
    res.status(400).end();
    return;
  }

  let sub = u.searchParams.get("forward") || "";
  if (sub.length > 0 && !sub.endsWith("/") && u.pathname.endsWith("/")) {
    sub += "/";
  }

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
