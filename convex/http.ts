import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import {
  collectPostPathsToIngest,
  parseGithubWebhookBody,
  shouldIngestRef,
} from "./lib/githubPush";

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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function asPushPayload(value: unknown): PushPayload | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const commitsRaw = record.commits;
  const commits = Array.isArray(commitsRaw)
    ? commitsRaw.map((commit) => {
        if (typeof commit !== "object" || commit === null) {
          return { added: [], modified: [], removed: [] };
        }
        const c = commit as Record<string, unknown>;
        return {
          added: asStringArray(c.added),
          modified: asStringArray(c.modified),
          removed: asStringArray(c.removed),
        };
      })
    : [];

  return {
    ref: typeof record.ref === "string" ? record.ref : undefined,
    after: typeof record.after === "string" ? record.after : undefined,
    commits,
  };
}

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

    const event = req.headers.get("x-github-event");
    if (event === "ping") {
      return new Response(JSON.stringify({ ok: true, ping: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (event !== "push") {
      return new Response(JSON.stringify({ ignored: true, reason: "not push" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let parsed: unknown;
    try {
      parsed = parseGithubWebhookBody(body);
    } catch {
      return new Response("Invalid JSON.", { status: 400 });
    }

    const payload = asPushPayload(parsed);
    if (!payload) {
      return new Response("Invalid payload.", { status: 400 });
    }

    if (!shouldIngestRef(payload.ref)) {
      return new Response(
        JSON.stringify({ ignored: true, reason: "not ingest branch" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
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

    const paths = collectPostPathsToIngest(
      [...added],
      [...modified],
      [...removed],
    );

    await ctx.runAction(internal.postsIngest.ingestPush, {
      ref: payload.ref ?? "refs/heads/master",
      afterSha: typeof payload.after === "string" ? payload.after : "master",
      added: [...added],
      modified: [...modified],
      removed: [...removed],
      upsertPaths: paths.upsertPaths,
      forceSlugs: paths.forceSlugs,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
