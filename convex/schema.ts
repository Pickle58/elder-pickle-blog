import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  posts: defineTable({
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    pubDate: v.number(),
    draft: v.boolean(),
    bodyMarkdoc: v.string(),
    heroImageId: v.optional(v.id("_storage")),
    githubSha: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_pubDate", ["pubDate"])
    .index("by_draft_and_pubDate", ["draft", "pubDate"]),
  comments: defineTable({
    postSlug: v.string(),
    clerkUserId: v.string(),
    authorName: v.string(),
    bodyMarkdown: v.string(),
    status: v.union(v.literal("visible"), v.literal("hidden")),
    createdAt: v.number(),
    parentId: v.optional(v.id("comments")),
  })
    .index("by_postSlug", ["postSlug"])
    .index("by_postSlug_and_status", ["postSlug", "status"])
    .index("by_createdAt", ["createdAt"]),
  /** Durable admin hard-delete jobs until the matching GitHub .mdoc is gone. */
  pendingGithubDeletes: defineTable({
    slug: v.string(),
    createdAt: v.number(),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    lastAttemptAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_attempts", ["attempts"]),
});