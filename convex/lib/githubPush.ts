import { slugFromPostPath } from "./mdoc";

export const POSTS_PREFIX = "src/content/posts/";
export const ASSETS_POSTS_PREFIX = "src/assets/images/posts/";

const INGEST_REFS = new Set(["refs/heads/master", "refs/heads/main"]);

export function shouldIngestRef(ref: string | undefined): boolean {
  return typeof ref === "string" && INGEST_REFS.has(ref);
}

/** Map `src/assets/images/posts/{slug}/file.jpg` → `src/content/posts/{slug}.mdoc`. */
export function postPathFromAssetPath(path: string): string | null {
  if (!path.startsWith(ASSETS_POSTS_PREFIX)) {
    return null;
  }
  const rest = path.slice(ASSETS_POSTS_PREFIX.length);
  const slug = rest.split("/")[0];
  if (!slug || slug.startsWith(".")) {
    return null;
  }
  return `${POSTS_PREFIX}${slug}.mdoc`;
}

export function collectPostPathsToIngest(
  added: string[],
  modified: string[],
  removed: string[],
): {
  upsertPaths: string[];
  removedPostPaths: string[];
  forceSlugs: string[];
} {
  const removedPosts = new Set<string>();
  for (const path of removed) {
    if (slugFromPostPath(path)) {
      removedPosts.add(path);
    }
  }

  const upsert = new Set<string>();
  const forceSlugs = new Set<string>();

  const considerAsset = (path: string) => {
    const postPath = postPathFromAssetPath(path);
    if (!postPath || removedPosts.has(postPath)) {
      return;
    }
    upsert.add(postPath);
    const slug = slugFromPostPath(postPath);
    if (slug) {
      forceSlugs.add(slug);
    }
  };

  for (const path of [...added, ...modified]) {
    if (slugFromPostPath(path) && !removedPosts.has(path)) {
      upsert.add(path);
    }
    considerAsset(path);
  }

  for (const path of removed) {
    considerAsset(path);
  }

  return {
    upsertPaths: [...upsert],
    removedPostPaths: [...removedPosts],
    forceSlugs: [...forceSlugs],
  };
}

/**
 * GitHub webhooks may be `application/json` or form-encoded `payload=<json>`.
 */
export function parseGithubWebhookBody(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(body) as unknown;
  }
  const params = new URLSearchParams(body);
  const payload = params.get("payload");
  if (!payload) {
    throw new Error("Missing payload field");
  }
  return JSON.parse(payload) as unknown;
}
