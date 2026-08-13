import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const LIST_PUBLISHED_LIMIT = 50;

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

async function resolveHeroUrl(
  ctx: { storage: { getUrl: (id: Id<"_storage">) => Promise<string | null> } },
  heroImageId: Id<"_storage"> | undefined,
): Promise<string | null> {
  if (!heroImageId) {
    return null;
  }
  return (await ctx.storage.getUrl(heroImageId)) ?? null;
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

export const markRemovedBySlug = internalMutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("posts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug.trim()))
      .unique();

    if (!existing) {
      return null;
    }

    await ctx.db.patch(existing._id, {
      draft: true,
      updatedAt: Date.now(),
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
