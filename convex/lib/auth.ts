import type { UserIdentity } from "convex/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const MAX_COMMENT_LENGTH = 5000;

export async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Sign in to continue.");
  }
  return identity;
}

export function assertAdmin(clerkUserId: string) {
  const adminId = process.env.ADMIN_CLERK_USER_ID;
  if (!adminId || clerkUserId !== adminId) {
    throw new Error("Admin access required.");
  }
}

export function normalizeCommentBody(bodyMarkdown: string) {
  const trimmed = bodyMarkdown.trim();
  if (!trimmed) {
    throw new Error("Comment cannot be empty.");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(
      `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer.`,
    );
  }
  return trimmed;
}

export function displayNameFromIdentity(identity: UserIdentity) {
  return (
    identity.name?.trim() ||
    identity.nickname?.trim() ||
    identity.email?.trim() ||
    "Reader"
  );
}

export { MAX_COMMENT_LENGTH };
