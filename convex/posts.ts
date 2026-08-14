import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertAdmin, requireIdentity } from "./lib/auth";

const LIST_PUBLISHED_LIMIT = 50;
const LIST_ADMIN_LIMIT = 200;

const postPublic = v.object({
  _id: v.id("posts"),
  _creationTime: v.number(),
  slug: v.string(),
  title: v.string(),
  description: v.string(),
  pubDate: v.number(),
  draft: v.boolean(),
  bodyMarkdoc: v.string(),
  heroImageUrl: v.union(v.string(), v.null()),
  updatedAt: v.number(),
});

const postAdminListItem = v.object({
  _id: v.id("posts"),
  slug: v.string(),
  title: v.string(),
  draft: v.boolean(),
  pubDate: v.number(),
  updatedAt: v.number(),
  heroImageUrl: v.union(v.string(), v.null()),
});

async function resolveHeroUrl(
  ctx: { storage: { getUrl: (id: Id<"_storage">) => Promise<string | null> } },
  heroImageId: Id<"_storage"> | undefined,
): Promise<string | null> {
  if (!heroImageId) {
    return null;
  }
  return (await ctx.storage.getUrl(heroImageId)) ?? null;
}

/** Best-effort extract Convex file storage IDs embedded in Markdoc body URLs. */
function storageIdsFromBody(bodyMarkdoc: string): Id<"_storage">[] {
  const ids = new Set<string>();
  const re = /\/api\/storage\/([a-zA-Z0-9_-]+)/g;
  for (const match of bodyMarkdoc.matchAll(re)) {
    const id = match[1];
    if (id) {
      ids.add(id);
    }
  }
  return [...ids] as Id<"_storage">[];
}

async function hardRemovePostBySlug(
  ctx: MutationCtx,
  rawSlug: string,
): Promise<boolean> {
  const slug = rawSlug.trim();
  const existing = await ctx.db
    .query("posts")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();

  if (!existing) {
    return false;
  }

  const comments = await ctx.db
    .query("comments")
    .withIndex("by_postSlug", (q) => q.eq("postSlug", slug))
    .collect();
  for (const comment of comments) {
    await ctx.db.delete("comments", comment._id);
  }

  const storageIds = new Set<Id<"_storage">>();
  if (existing.heroImageId) {
    storageIds.add(existing.heroImageId);
  }
  for (const id of storageIdsFromBody(existing.bodyMarkdoc)) {
    storageIds.add(id);
  }
  for (const storageId of storageIds) {
    try {
      await ctx.storage.delete(storageId);
    } catch (error) {
      console.error(`Failed to delete storage ${storageId}:`, error);
    }
  }

  await ctx.db.delete("posts", existing._id);
  return true;
}

export const listPublished = query({
  args: {},
  returns: v.array(postPublic),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("posts")
      .withIndex("by_draft_and_pubDate", (q) => q.eq("draft", false))
      .order("desc")
      .take(LIST_PUBLISHED_LIMIT);

    return Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        _creationTime: row._creationTime,
        slug: row.slug,
        title: row.title,
        description: row.description,
        pubDate: row.pubDate,
        draft: row.draft,
        bodyMarkdoc: row.bodyMarkdoc,
        heroImageUrl: await resolveHeroUrl(ctx, row.heroImageId),
        updatedAt: row.updatedAt,
      })),
    );
  },
});

export const listAll = query({
  args: {},
  returns: v.array(postAdminListItem),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    assertAdmin(identity.subject);

    const rows = await ctx.db.query("posts").take(LIST_ADMIN_LIMIT);
    rows.sort((a, b) => b.pubDate - a.pubDate);

    return Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        slug: row.slug,
        title: row.title,
        draft: row.draft,
        pubDate: row.pubDate,
        updatedAt: row.updatedAt,
        heroImageUrl: await resolveHeroUrl(ctx, row.heroImageId),
      })),
    );
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(postPublic, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("posts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug.trim()))
      .unique();

    if (!row || row.draft) {
      return null;
    }

    return {
      _id: row._id,
      _creationTime: row._creationTime,
      slug: row.slug,
      title: row.title,
      description: row.description,
      pubDate: row.pubDate,
      draft: row.draft,
      bodyMarkdoc: row.bodyMarkdoc,
      heroImageUrl: await resolveHeroUrl(ctx, row.heroImageId),
      updatedAt: row.updatedAt,
    };
  },
});

export const getRawBySlug = internalQuery({
  args: { slug: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("posts"),
      slug: v.string(),
      githubSha: v.optional(v.string()),
      heroImageId: v.optional(v.id("_storage")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("posts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug.trim()))
      .unique();
    if (!row) {
      return null;
    }
    return {
      _id: row._id,
      slug: row.slug,
      githubSha: row.githubSha,
      heroImageId: row.heroImageId,
    };
  },
});

export const upsertBySlug = internalMutation({
  args: {
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    pubDate: v.number(),
    draft: v.boolean(),
    bodyMarkdoc: v.string(),
    heroImageId: v.optional(v.id("_storage")),
    githubSha: v.optional(v.string()),
  },
  returns: v.id("posts"),
  handler: async (ctx, args) => {
    const slug = args.slug.trim();
    const existing = await ctx.db
      .query("posts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    const updatedAt = Date.now();
    const fields = {
      slug,
      title: args.title,
      description: args.description,
      pubDate: args.pubDate,
      draft: args.draft,
      bodyMarkdoc: args.bodyMarkdoc,
      githubSha: args.githubSha,
      updatedAt,
      ...(args.heroImageId !== undefined
        ? { heroImageId: args.heroImageId }
        : {}),
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }

    return await ctx.db.insert("posts", fields);
  },
});

/** Permanently remove a post, its comments, and related Convex storage blobs. */
export const hardRemoveBySlug = internalMutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await hardRemovePostBySlug(ctx, args.slug);
    return null;
  },
});

/** Admin hard-delete: Convex cleanup, then schedule GitHub .mdoc removal. */
export const remove = mutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    assertAdmin(identity.subject);

    const slug = args.slug.trim();
    if (!slug) {
      throw new Error("Slug is required.");
    }

    const removed = await hardRemovePostBySlug(ctx, slug);
    if (!removed) {
      throw new Error("Post not found.");
    }

    await ctx.scheduler.runAfter(0, internal.postsIngest.deleteGithubMdoc, {
      slug,
    });
    return null;
  },
});

/** One-shot seed from local .mdoc content (no hero images). */
export const seedFromLocal = internalMutation({
  args: {
    posts: v.array(
      v.object({
        slug: v.string(),
        title: v.string(),
        description: v.string(),
        pubDate: v.number(),
        draft: v.boolean(),
        bodyMarkdoc: v.string(),
      }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    let count = 0;
    for (const post of args.posts) {
      const slug = post.slug.trim();
      const existing = await ctx.db
        .query("posts")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      const updatedAt = Date.now();
      const fields = {
        slug,
        title: post.title,
        description: post.description,
        pubDate: post.pubDate,
        draft: post.draft,
        bodyMarkdoc: post.bodyMarkdoc,
        updatedAt,
      };
      if (existing) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert("posts", fields);
      }
      count += 1;
    }
    return count;
  },
});
