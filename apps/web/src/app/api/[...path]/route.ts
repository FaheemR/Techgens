import type { NextRequest } from "next/server";

/**
 * Same-origin proxy to the orchestrator. The browser only talks to this web app, so Techgens works behind a single
 * forwarded port (Docker, GitHub Codespaces, reverse proxies) and needs no CORS. Responses are streamed, including the
 * live event stream (SSE) and redirects from the GitHub connection flow.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Hop-by-hop and length/encoding headers that must not be forwarded as-is. */
const STRIP = ["connection", "keep-alive", "proxy-connection", "transfer-encoding", "upgrade", "te", "trailer", "host", "content-length"];

function orchestratorUrl(): string {
  return (process.env.ORCHESTRATOR_URL || "http://localhost:4000").replace(/\/+$/, "");
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const base = orchestratorUrl();
  const target = `${base}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  for (const name of [...STRIP, "accept-encoding"]) headers.delete(name);
  const init: RequestInit = { method: req.method, headers, redirect: "manual", cache: "no-store", signal: req.signal };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    return Response.json({ error: `Orchestrator unreachable at ${base}`, code: "unreachable" }, { status: 502 });
  }

  // fetch() already decoded the body, so the original encoding/length headers no longer apply.
  const out = new Headers(upstream.headers);
  for (const name of [...STRIP, "content-encoding"]) out.delete(name);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
