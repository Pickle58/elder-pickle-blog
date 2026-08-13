import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

async function verifyGithubSignature(
  secret: string,
  body: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }
  const expectedHex = signatureHeader.slice("sha256=".length);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  const actualHex = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (actualHex.length !== expectedHex.length) {
    return false;
  }
  // Constant-time compare
  let mismatch = 0;
  for (let i = 0; i < actualHex.length; i++) {
    mismatch |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return mismatch === 0;
}

type PushPayload = {
  ref?: string;
  after?: string;
  commits?: Array<{
    added?: string[];
    modified?: string[];
    removed?: string[];
  }>;
};

http.route({
  path: "/github/keystatic",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      return new Response("Webhook secret not configured.", { status: 500 });
    }

    const body = await req.text();
    const signature = req.headers.get("x-hub-signature-256");
    const ok = await verifyGithubSignature(secret, body, signature);
    if (!ok) {
      return new Response("Invalid signature.", { status: 401 });
    }

    let payload: PushPayload;
    try {
      payload = JSON.parse(body) as PushPayload;
    } catch {
      return new Response("Invalid JSON.", { status: 400 });
    }

    if (payload.ref !== "refs/heads/main") {
      return new Response(JSON.stringify({ ignored: true, reason: "not main" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const added = new Set<string>();
    const modified = new Set<string>();
    const removed = new Set<string>();
    for (const commit of payload.commits ?? []) {
      for (const p of commit.added ?? []) added.add(p);
      for (const p of commit.modified ?? []) modified.add(p);
      for (const p of commit.removed ?? []) removed.add(p);
    }

    // If a path is both added/modified and removed in the same push, prefer removal.
    for (const p of removed) {
      added.delete(p);
      modified.delete(p);
    }

    await ctx.runAction(internal.postsIngest.ingestPush, {
      ref: payload.ref ?? "refs/heads/main",
      afterSha: typeof payload.after === "string" ? payload.after : "main",
      added: [...added],
      modified: [...modified],
      removed: [...removed],
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
