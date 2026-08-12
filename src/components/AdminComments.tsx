import { SignInButton, useAuth } from "@clerk/astro/react";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { isConvexConfigured, withConvexProvider } from "../lib/convex";
import { CommentMarkdown } from "./CommentMarkdown";

const adminClerkUserId = import.meta.env.PUBLIC_ADMIN_CLERK_USER_ID as
  | string
  | undefined;

function AdminCommentsInner() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const comments = useQuery(
    api.comments.listAll,
    isSignedIn && userId === adminClerkUserId ? {} : "skip",
  );
  const setStatus = useMutation(api.comments.setStatus);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!isLoaded) {
    return <p className="muted">Checking sign-in…</p>;
  }

  if (!isSignedIn) {
    return (
      <p className="muted">
        <SignInButton mode="modal">Sign in</SignInButton> as the site admin to
        moderate comments.
      </p>
    );
  }

  if (!adminClerkUserId || userId !== adminClerkUserId) {
    return <p className="error">You do not have admin access.</p>;
  }

  async function toggleStatus(
    commentId: Id<"comments">,
    next: "visible" | "hidden",
  ) {
    setError(null);
    setBusyId(commentId);
    try {
      await setStatus({ commentId, status: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-panel">
      <h2>Moderate comments</h2>
      <p className="muted">Soft-hide removes a comment from the public post.</p>
      {error ? <p className="error">{error}</p> : null}
      {comments === undefined ? (
        <p className="muted">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="muted">No comments yet.</p>
      ) : (
        comments.map((comment) => (
          <div className="admin-row" key={comment._id}>
            <div>
              <div className="comment-meta">
                <strong>{comment.authorName}</strong>
                <span>/{comment.postSlug}</span>
                <span
                  className={`status-pill${comment.status === "hidden" ? " hidden" : ""}`}
                >
                  {comment.status}
                </span>
                <time dateTime={new Date(comment.createdAt).toISOString()}>
                  {new Date(comment.createdAt).toLocaleString()}
                </time>
              </div>
              <CommentMarkdown markdown={comment.bodyMarkdown} />
            </div>
            <div className="admin-actions">
              {comment.status === "visible" ? (
                <button
                  type="button"
                  className="danger"
                  disabled={busyId === comment._id}
                  onClick={() => void toggleStatus(comment._id, "hidden")}
                >
                  Hide
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary"
                  disabled={busyId === comment._id}
                  onClick={() => void toggleStatus(comment._id, "visible")}
                >
                  Restore
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function AdminFallback() {
  return (
    <p className="muted">
      Admin tools need <code>PUBLIC_CONVEX_URL</code> and{" "}
      <code>PUBLIC_ADMIN_CLERK_USER_ID</code>.
    </p>
  );
}

function AdminCommentsRoot() {
  if (!isConvexConfigured()) {
    return <AdminFallback />;
  }
  return <AdminCommentsInner />;
}

export default withConvexProvider(AdminCommentsRoot);
