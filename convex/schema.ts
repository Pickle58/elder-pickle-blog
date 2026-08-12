import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
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
});
