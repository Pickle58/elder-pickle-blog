"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  assetsAliasToRepoPath,
  collectAssetAliases,
  parseMdoc,
  slugFromPostPath,
} from "./lib/mdoc";

const REPO = "Pickle58/elder-pickle-blog";
const POSTS_PREFIX = "src/content/posts/";

type GithubContentResponse = {
  type?: string;
  encoding?: string;
  content?: string;
  sha?: string;
  message?: string;
};

async function githubGetFile(
  token: string,
  path: string,
  ref: string,
): Promise<{ text: string; sha: string } | { binary: ArrayBuffer; sha: string }> {
  const url = `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(ref)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "elder-pickle-blog-convex-ingest",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub contents ${path} failed (${response.status}): ${text.slice(0, 300)}`,
    );
  }

  const json = (await response.json()) as GithubContentResponse;
  if (json.type !== "file" || !json.content || !json.sha) {
    throw new Error(`GitHub contents ${path}: expected a file blob.`);
  }

  const binary = Buffer.from(json.content, "base64");
  const isText =
    path.endsWith(".mdoc") ||
    path.endsWith(".md") ||
    path.endsWith(".txt") ||
    path.endsWith(".json");

  if (isText) {
    return { text: binary.toString("utf8"), sha: json.sha };
  }
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

export const ingestPush = internalAction({
  args: {
    ref: v.string(),
    afterSha: v.string(),
    added: v.array(v.string()),
    modified: v.array(v.string()),
    removed: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      console.error("Skipping ingest: GITHUB_TOKEN missing.");
      return null;
    }

    if (args.ref !== "refs/heads/main") {
      return null;
    }

    const ref = args.afterSha || "main";

    for (const path of args.removed) {
      const slug = slugFromPostPath(path);
      if (!slug) continue;
      await ctx.runMutation(internal.posts.markRemovedBySlug, { slug });
    }

    const upsertPaths = new Set(
      [...args.added, ...args.modified].filter((p) => p.startsWith(POSTS_PREFIX)),
    );

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

      if (existing?.githubSha && existing.githubSha === file.sha) {
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
    }

    return null;
  },
});
