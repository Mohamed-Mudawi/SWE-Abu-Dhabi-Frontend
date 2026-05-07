/**
 * Same-origin proxy: browser → https://…vercel.app/up/... → your API (API_BASE_URL).
 * Requires your API port to be reachable from the public internet.
 */

export const config = {
  matcher: "/up/:path*",
};

export default async function middleware(request) {
  const upstreamRaw = String(
    process.env.API_BASE_URL || process.env.API_UPSTREAM || ""
  )
    .trim()
    .replace(/\/+$/, "");

  if (!upstreamRaw || !/^https?:\/\//i.test(upstreamRaw)) {
    return new Response(
      JSON.stringify({
        message:
          "Set Vercel env API_BASE_URL (e.g. http://YOUR_PUBLIC_IP:8000) and redeploy.",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  if (/127\.0\.0\.1|localhost/i.test(upstreamRaw)) {
    return new Response(
      JSON.stringify({
        message: "API_BASE_URL cannot be localhost on Vercel.",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const incoming = new URL(request.url);
  const rest = incoming.pathname.slice("/up".length) || "/";
  const rel = rest === "/" ? "" : rest.replace(/^\/+/, "");
  const targetStr = upstreamRaw + "/" + rel + incoming.search;

  const hdrs = new Headers(request.headers);
  hdrs.delete("host");
  hdrs.delete("connection");
  hdrs.delete("content-length");

  /** @type {RequestInit} */
  const init = {
    method: request.method,
    headers: hdrs,
    redirect: "follow",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  try {
    const res = await fetch(targetStr, init);
    const outHdrs = new Headers(res.headers);
    outHdrs.delete("transfer-encoding");
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: outHdrs,
    });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return new Response(
      JSON.stringify({
        message: "Upstream request failed",
        detail: msg,
        tried: targetStr,
        checks: [
          "On the droplet: sudo ufw allow 8000/tcp (or your port) and ensure DigitalOcean firewall allows inbound TCP.",
          "Bind the app to 0.0.0.0, not 127.0.0.1.",
          "From a laptop (not SSH): curl -v http://YOUR_IP:8000/classes/",
        ],
      }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
