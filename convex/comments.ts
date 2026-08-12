import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  mutation,
  query,
} from "./_generated/server";
import {
  assertAdmin,
  displayNameFromIdentity,
  normalizeCommentBody,
  requireIdentity,
} from "./lib/auth";

const commentDoc = v.object({
  _id: v.id("comments"),
  _creationTime: v.number(),
  postSlug: v.string(),
  clerkUserId: v.string(),
  authorName: v.string(),
  bodyMarkdown: v.string(),
  status: v.union(v.literal("visible"), v.literal("hidden")),
  createdAt: v.number(),
  parentId: v.optional(v.id("comments")),
});

export const listByPost = query({
  args: { postSlug: v.string() },
  returns: v.array(commentDoc),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("comments")
      .withIndex("by_postSlug_and_status", (q) =>
        q.eq("postSlug", args.postSlug).eq("status", "visible"),
      )
      .collect();

    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listAll = query({
  args: {},
  returns: v.array(commentDoc),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    assertAdmin(identity.subject);

    const rows = await ctx.db.query("comments").collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const create = mutation({
  args: {
    postSlug: v.string(),
    bodyMarkdown: v.string(),
    postTitle: v.string(),
    postUrl: v.string(),
  },
  returns: v.id("comments"),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const bodyMarkdown = normalizeCommentBody(args.bodyMarkdown);
    const authorName = displayNameFromIdentity(identity);
    const createdAt = Date.now();

    const commentId = await ctx.db.insert("comments", {
      postSlug: args.postSlug.trim(),
      clerkUserId: identity.subject,
      authorName,
      bodyMarkdown,
      status: "visible",
      createdAt,
    });

    await ctx.scheduler.runAfter(0, internal.comments.notifyOwner, {
      commentId,
      postSlug: args.postSlug.trim(),
      authorName,
      excerpt: bodyMarkdown.slice(0, 280),
      postTitle: args.postTitle.trim(),
      postUrl: args.postUrl.trim(),
    });

    return commentId;
  },
});

export const setStatus = mutation({
  args: {
    commentId: v.id("comments"),
    status: v.union(v.literal("visible"), v.literal("hidden")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    assertAdmin(identity.subject);

    const existing = await ctx.db.get(args.commentId);
    if (!existing) {
      throw new Error("Comment not found.");
    }

    await ctx.db.patch(args.commentId, { status: args.status });
    return null;
  },
});

export const notifyOwner = internalAction({
  args: {
    commentId: v.id("comments"),
    postSlug: v.string(),
    authorName: v.string(),
    excerpt: v.string(),
    postTitle: v.string(),
    postUrl: v.string(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const workerUrl = process.env.NOTIFY_WORKER_URL;
    const secret = process.env.COMMENT_NOTIFY_SECRET;

    if (!workerUrl || !secret) {
      console.error(
        "Skipping comment notify: NOTIFY_WORKER_URL or COMMENT_NOTIFY_SECRET missing.",
      );
      return null;
    }

    try {
      const response = await fetch(workerUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          postSlug: args.postSlug,
          authorName: args.authorName,
          commentId: args.commentId,
          excerpt: args.excerpt,
          postUrl: args.postUrl,
          postTitle: args.postTitle,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(
          `Comment notify failed (${response.status}): ${text.slice(0, 500)}`,
        );
      }
    } catch (error) {
      console.error("Comment notify request error:", error);
    }

    return null;
  },
});
