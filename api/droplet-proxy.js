"use strict";

const dns = require("dns");
const http = require("http");
const https = require("https");
const { URL } = require("url");

/** Prefer IPv4 — Node fetch often fails to DO droplets when IPv6 is broken or unroutable. */
function lookupIPv4(hostname, _opts, cb) {
  dns.lookup(hostname, { family: 4, all: false }, cb);
}

function normalizeUpstream(raw) {
  let s = String(raw || "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/\/+$/, "");
}

async function readBodyStream(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function queryForward(req) {
  const q = req.query && req.query.forward;
  if (Array.isArray(q)) return String(q[0] || "");
  if (q != null && String(q) !== "") return String(q);
  return "";
}

async function inboundBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const expectLen = Number(req.headers["content-length"] || 0);
  let buf = await readBodyStream(req);
  if ((!buf || !buf.length) && expectLen > 0 && req.body != null) {
    if (Buffer.isBuffer(req.body)) buf = req.body;
    else if (typeof req.body === "string") buf = Buffer.from(req.body);
    else if (typeof req.body === "object")
      buf = Buffer.from(JSON.stringify(req.body));
  }
  return buf;
}

function passthroughOnce(targetUrl, method, headers, bodyBuf) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(targetUrl);
    } catch (e) {
      reject(e);
      return;
    }
    const isHttps = u.protocol === "https:";
    const lib = isHttps ? https : http;
    const defaultPort = isHttps ? 443 : 80;
    const port = u.port ? Number(u.port) : defaultPort;
    const outHeaders = { ...headers };
    if (bodyBuf && bodyBuf.length)
      outHeaders["Content-Length"] = String(bodyBuf.length);
    else delete outHeaders["content-length"];

    const req2 = lib.request(
      {
        hostname: u.hostname,
        port,
        path: u.pathname + u.search,
        method,
        headers: outHeaders,
        lookup: lookupIPv4,
      },
      (upRes) => {
        const chunks = [];
        upRes.on("data", (c) => chunks.push(c));
        upRes.on("end", () => {
          resolve({
            statusCode: upRes.statusCode,
            headers: upRes.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    req2.on("error", reject);
    req2.setTimeout(25000, () => {
      req2.destroy(new Error("Upstream socket timeout (25s)"));
    });
    if (bodyBuf && bodyBuf.length) req2.write(bodyBuf);
    req2.end();
  });
}

async function passthroughWithRedirects(
  targetUrl,
  method,
  headers,
  bodyBuf,
  depth
) {
  if (depth > 5) throw new Error("Too many upstream redirects");
  const r = await passthroughOnce(targetUrl, method, headers, bodyBuf);
  const code = r.statusCode;
  if ([301, 302, 303, 307, 308].includes(code)) {
    const loc = r.headers.location;
    if (!loc) return r;
    const nextUrl = String(new URL(loc, targetUrl));
    const nextMethod = code === 303 ? "GET" : method;
    const nextBody = code === 303 ? undefined : bodyBuf;
    return passthroughWithRedirects(
      nextUrl,
      nextMethod,
      headers,
      nextBody,
      depth + 1
    );
  }
  return r;
}

module.exports = async (req, res) => {
  const upstreamBase = normalizeUpstream(
    process.env.API_UPSTREAM || process.env.API_BASE_URL || ""
  );

  if (!upstreamBase) {
    res.status(500).json({
      message: "Set API_BASE_URL or API_UPSTREAM to your http:// droplet URL on Vercel",
    });
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

  const fromQuery = queryForward(req);
  let sub = (fromQuery || u.searchParams.get("forward") || "").replace(
    /^\/+/,
    ""
  );
  const extraParams = new URLSearchParams();
  u.searchParams.forEach((value, key) => {
    if (key !== "forward") extraParams.append(key, value);
  });
  const qsExtra = extraParams.toString();
  const q = qsExtra ? "?" + qsExtra : "";
  const target = `${upstreamBase}/${sub}${q}`;

  let bodyBuf;
  try {
    bodyBuf = await inboundBody(req);
  } catch {
    res.status(400).end();
    return;
  }

  const headers = {
    Accept: "*/*",
    "User-Agent": "vercel-droplet-proxy/2",
  };
  const hct = req.headers["content-type"];
  if (hct) headers["Content-Type"] = hct;
  const auth = req.headers.authorization;
  if (auth) headers["Authorization"] = auth;

  const fwdBody =
    bodyBuf !== undefined && bodyBuf.length ? bodyBuf : undefined;

  let upstreamRes;
  try {
    upstreamRes = await passthroughWithRedirects(
      target,
      req.method,
      headers,
      fwdBody,
      0
    );
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    const cause = err && err.cause && err.cause.message ? err.cause.message : "";
    res.status(502).json({
      message: "Upstream request failed",
      detail: [msg, cause].filter(Boolean).join(" — "),
      tried: target,
      checks: [
        "Vercel → Settings → Environment Variables: set API_BASE_URL for Preview AND Production (branch deploys use Preview).",
        "Value must be http://<droplet-public-ip>:<port> (same port the API listens on).",
        "DigitalOcean: allow inbound TCP on that port (cloud firewall + ufw).",
        "On the VM: bind the app to 0.0.0.0, not only 127.0.0.1.",
      ],
    });
    return;
  }

  const skip = new Set([
    "connection",
    "transfer-encoding",
    "keep-alive",
    "content-length",
  ]);
  for (const [k, v] of Object.entries(upstreamRes.headers)) {
    if (!k || skip.has(k.toLowerCase())) continue;
    if (k.toLowerCase() === "set-cookie" && Array.isArray(v)) {
      for (const c of v) res.appendHeader(k, c);
    } else if (v != null) {
      res.setHeader(k, v);
    }
  }
  res.status(upstreamRes.statusCode).send(upstreamRes.body);
};
