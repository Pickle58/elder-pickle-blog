"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  collectPostPathsToIngest,
  POSTS_PREFIX,
  shouldIngestRef,
} from "./lib/githubPush";
import {
  assetsAliasToRepoPath,
  collectAssetAliases,
  parseMdoc,
  slugFromPostPath,
} from "./lib/mdoc";

const REPO = "Pickle58/elder-pickle-blog";

type GithubContentResponse = {
  type?: string;
  encoding?: string;
  content?: string;
  sha?: string;
  download_url?: string | null;
  message?: string;
};

type GithubTreeResponse = {
  truncated?: boolean;
  tree?: Array<{ path?: string; type?: string }>;
};

function githubHeaders(token: string, accept: string): HeadersInit {
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "elder-pickle-blog-convex-ingest",
  };
}

function contentsUrl(path: string, ref: string): string {
  const encoded = encodeURIComponent(path).replace(/%2F/g, "/");
  return `https://api.github.com/repos/${REPO}/contents/${encoded}?ref=${encodeURIComponent(ref)}`;
}

async function githubGetFile(
  token: string,
  path: string,
  ref: string,
): Promise<{ text: string; sha: string } | { binary: ArrayBuffer; sha: string }> {
  const url = contentsUrl(path, ref);
  const response = await fetch(url, {
    headers: githubHeaders(token, "application/vnd.github+json"),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub contents ${path} failed (${response.status}): ${text.slice(0, 300)}`,
    );
  }

  const json = (await response.json()) as GithubContentResponse;
  if (json.type !== "file" || !json.sha) {
    throw new Error(`GitHub contents ${path}: expected a file blob.`);
  }

  const isText =
    path.endsWith(".mdoc") ||
    path.endsWith(".md") ||
    path.endsWith(".txt") ||
    path.endsWith(".json");

  if (isText) {
    if (!json.content) {
      throw new Error(`GitHub contents ${path}: missing text content.`);
    }
    return {
      text: Buffer.from(json.content, "base64").toString("utf8"),
      sha: json.sha,
    };
  }

  if (json.download_url) {
    const raw = await fetch(json.download_url, {
      headers: githubHeaders(token, "application/octet-stream"),
    });
    if (!raw.ok) {
      throw new Error(
        `GitHub download ${path} failed (${raw.status}): ${(await raw.text()).slice(0, 300)}`,
      );
    }
    return { binary: await raw.arrayBuffer(), sha: json.sha };
  }

  if (!json.content) {
    throw new Error(`GitHub contents ${path}: missing binary content.`);
  }
  const binary = Buffer.from(json.content, "base64");
  return {
    binary: binary.buffer.slice(
      binary.byteOffset,
      binary.byteOffset + binary.byteLength,
    ),
    sha: json.sha,
  };
}

function contentTypeForPath(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function ingestPostPaths(
  ctx: ActionCtx,
  token: string,
  ref: string,
  upsertPaths: string[],
  forceSlugs: Set<string>,
): Promise<number> {
  let ingested = 0;

  for (const path of upsertPaths) {
    const slug = slugFromPostPath(path);
    if (!slug) continue;

    const existing = await ctx.runQuery(internal.posts.getRawBySlug, {
      slug,
    });

    const file = await githubGetFile(token, path, ref);
    if (!("text" in file)) {
      console.error(`Expected text for ${path}`);
      continue;
    }

    if (
      !forceSlugs.has(slug) &&
      existing?.githubSha &&
      existing.githubSha === file.sha
    ) {
      continue;
    }

    const parsed = parseMdoc(file.text);
    let bodyMarkdoc = parsed.bodyMarkdoc;
    let heroImageId: Id<"_storage"> | undefined = existing?.heroImageId;

    const aliasToUrl = new Map<string, string>();

    const aliases = [
      ...(parsed.heroImagePath ? [parsed.heroImagePath] : []),
      ...collectAssetAliases(bodyMarkdoc),
    ];

    for (const alias of aliases) {
      if (aliasToUrl.has(alias)) continue;
      let repoPath: string;
      try {
        repoPath = assetsAliasToRepoPath(alias);
      } catch {
        continue;
      }

      try {
        const asset = await githubGetFile(token, repoPath, ref);
        if (!("binary" in asset)) continue;
        const blob = new Blob([asset.binary], {
          type: contentTypeForPath(repoPath),
        });
        const storageId = await ctx.storage.store(blob);
        const url = await ctx.storage.getUrl(storageId);
        if (!url) continue;
        aliasToUrl.set(alias, url);

        if (parsed.heroImagePath && alias === parsed.heroImagePath) {
          heroImageId = storageId;
        }
      } catch (error) {
        console.error(`Failed to ingest asset ${alias}:`, error);
      }
    }

    for (const [alias, url] of aliasToUrl) {
      bodyMarkdoc = bodyMarkdoc.split(alias).join(url);
    }

    await ctx.runMutation(internal.posts.upsertBySlug, {
      slug,
      title: parsed.title,
      description: parsed.description,
      pubDate: parsed.pubDate,
      draft: parsed.draft,
      bodyMarkdoc,
      ...(heroImageId !== undefined ? { heroImageId } : {}),
      githubSha: file.sha,
    });
    ingested += 1;
  }

  return ingested;
}

export const ingestPush = internalAction({
  args: {
    ref: v.string(),
    afterSha: v.string(),
    added: v.array(v.string()),
    modified: v.array(v.string()),
    removed: v.array(v.string()),
    upsertPaths: v.optional(v.array(v.string())),
    forceSlugs: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      console.error("Skipping ingest: GITHUB_TOKEN missing.");
      return null;
    }

    if (!shouldIngestRef(args.ref)) {
      return null;
    }

    const ref = args.afterSha || "master";
    const paths =
      args.upsertPaths !== undefined
        ? {
            upsertPaths: args.upsertPaths,
            removedPostPaths: args.removed.filter((p) => slugFromPostPath(p)),
            forceSlugs: args.forceSlugs ?? [],
          }
        : collectPostPathsToIngest(args.added, args.modified, args.removed);

    for (const path of paths.removedPostPaths) {
      const slug = slugFromPostPath(path);
      if (!slug) continue;
      await ctx.runMutation(internal.posts.hardRemoveBySlug, { slug });
    }

    await ingestPostPaths(
      ctx,
      token,
      ref,
      paths.upsertPaths,
      new Set(paths.forceSlugs),
    );

    return null;
  },
});

const DEFAULT_BRANCH = "master";
/** Cap retries for transient GitHub / missing-token failures. */
const GITHUB_DELETE_RETRY_MS = 60_000;

function contentsPathUrl(path: string): string {
  const encoded = encodeURIComponent(path).replace(/%2F/g, "/");
  return `https://api.github.com/repos/${REPO}/contents/${encoded}`;
}

async function failGithubDelete(
  ctx: ActionCtx,
  slug: string,
  error: string,
  options?: { permanent?: boolean },
): Promise<void> {
  const result = await ctx.runMutation(internal.posts.recordGithubDeleteFailure, {
    slug,
    error,
    permanent: options?.permanent === true,
  });
  if (result.shouldRetry) {
    await ctx.scheduler.runAfter(
      GITHUB_DELETE_RETRY_MS,
      internal.postsIngest.deleteGithubMdoc,
      { slug },
    );
    console.error(
      `GitHub mdoc delete for ${slug} failed (attempt ${result.attempts}, retrying): ${error}`,
    );
    return;
  }
  console.error(
    `GitHub mdoc delete for ${slug} permanently failed after ${result.attempts} attempts: ${error}`,
  );
  throw new Error(
    `GitHub mdoc delete for ${slug} failed permanently after ${result.attempts} attempts: ${error}`,
  );
}

function isPermanentGithubStatus(status: number): boolean {
  return status === 401 || status === 403;
}

/** Delete `src/content/posts/{slug}.mdoc` so admin hard-delete stays in sync with git. */
export const deleteGithubMdoc = internalAction({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const slug = args.slug.trim();
    if (!slug) {
      throw new Error("Slug is required for GitHub mdoc delete.");
    }

    // Ensure a durable tombstone exists even if scheduled without enqueue.
    await ctx.runMutation(internal.posts.enqueueGithubDelete, {
      slug,
      resetAttempts: false,
    });

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      await failGithubDelete(ctx, slug, "GITHUB_TOKEN missing");
      return null;
    }

    const path = `${POSTS_PREFIX}${slug}.mdoc`;
    const getUrl = `${contentsPathUrl(path)}?ref=${encodeURIComponent(DEFAULT_BRANCH)}`;
    const getResponse = await fetch(getUrl, {
      headers: githubHeaders(token, "application/vnd.github+json"),
    });

    if (getResponse.status === 404) {
      await ctx.runMutation(internal.posts.clearGithubDelete, { slug });
      return null;
    }

    if (!getResponse.ok) {
      const text = await getResponse.text();
      await failGithubDelete(
        ctx,
        slug,
        `GitHub get ${path} failed (${getResponse.status}): ${text.slice(0, 300)}`,
        { permanent: isPermanentGithubStatus(getResponse.status) },
      );
      return null;
    }

    const json = (await getResponse.json()) as GithubContentResponse;
    if (!json.sha) {
      await failGithubDelete(ctx, slug, `GitHub get ${path}: missing sha`, {
        permanent: true,
      });
      return null;
    }

    const deleteResponse = await fetch(contentsPathUrl(path), {
      method: "DELETE",
      headers: {
        ...githubHeaders(token, "application/vnd.github+json"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Delete post ${slug} via admin`,
        sha: json.sha,
        branch: DEFAULT_BRANCH,
      }),
    });

    if (deleteResponse.status === 404) {
      await ctx.runMutation(internal.posts.clearGithubDelete, { slug });
      return null;
    }

    if (!deleteResponse.ok) {
      const text = await deleteResponse.text();
      await failGithubDelete(
        ctx,
        slug,
        `GitHub delete ${path} failed (${deleteResponse.status}): ${text.slice(0, 300)}`,
        { permanent: isPermanentGithubStatus(deleteResponse.status) },
      );
      return null;
    }

    await ctx.runMutation(internal.posts.clearGithubDelete, { slug });
    return null;
  },
});

/** Re-read every post on a git ref (recovery / first-time image ingest). */
export const ingestAllAtRef = internalAction({
  args: { ref: v.optional(v.string()) },
  returns: v.object({ ingested: v.number() }),
  handler: async (ctx, args) => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN missing.");
    }

    const ref = args.ref?.trim() || "master";
    const treeUrl = `https://api.github.com/repos/${REPO}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
    const response = await fetch(treeUrl, {
      headers: githubHeaders(token, "application/vnd.github+json"),
    });
    if (!response.ok) {
      throw new Error(
        `GitHub tree ${ref} failed (${response.status}): ${(await response.text()).slice(0, 300)}`,
      );
    }

    const json = (await response.json()) as GithubTreeResponse;
    if (json.truncated) {
      console.error("GitHub tree is truncated; some posts may be skipped.");
    }

    const upsertPaths = (json.tree ?? [])
      .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
      .map((entry) => entry.path!)
      .filter((path) => path.startsWith(POSTS_PREFIX) && slugFromPostPath(path));

    const forceSlugs = new Set(
      upsertPaths
        .map((path) => slugFromPostPath(path))
        .filter((slug): slug is string => Boolean(slug)),
    );

    const ingested = await ingestPostPaths(
      ctx,
      token,
      ref,
      upsertPaths,
      forceSlugs,
    );
    return { ingested };
  },
});
