import { SignInButton, useAuth } from "@clerk/astro/react";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { isConvexConfigured, withConvexProvider } from "../lib/convex";
import { CommentMarkdown, MAX_COMMENT_LENGTH } from "./CommentMarkdown";

type CommentsProps = {
  postSlug: string;
  postTitle: string;
  postUrl: string;
};

function formatRelativeTime(timestamp: number) {
  const delta = Date.now() - timestamp;
  const seconds = Math.round(delta / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(-seconds, "second");
  if (Math.abs(minutes) < 60) return formatter.format(-minutes, "minute");
  if (Math.abs(hours) < 24) return formatter.format(-hours, "hour");
  return formatter.format(-days, "day");
}

function AuthAwareForm({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <p className="muted">Checking sign-in…</p>;
  }

  if (!isSignedIn) {
    return (
      <p className="muted">
        <SignInButton mode="modal">Sign in</SignInButton> to leave a comment.
      </p>
    );
  }

  return <>{children}</>;
}

function CommentsInner({ postSlug, postTitle, postUrl }: CommentsProps) {
  const comments = useQuery(api.comments.listByPost, { postSlug });
  const createComment = useMutation(api.comments.create);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const remaining = useMemo(
    () => MAX_COMMENT_LENGTH - body.length,
    [body.length],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Comment cannot be empty.");
      return;
    }
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      setError(`Comment must be ${MAX_COMMENT_LENGTH} characters or fewer.`);
      return;
    }

    setSubmitting(true);
    try {
      await createComment({
        postSlug,
        bodyMarkdown: trimmed,
        postTitle,
        postUrl,
      });
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="comments" aria-labelledby="comments-heading">
      <h2 id="comments-heading">Comments</h2>

      <AuthAwareForm>
        <form className="comment-form" onSubmit={onSubmit}>
          <label htmlFor="comment-body">Write in Markdown</label>
          <textarea
            id="comment-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={MAX_COMMENT_LENGTH}
            placeholder="Share a thought…"
            required
          />
          <p className="muted">{remaining} characters left</p>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={submitting}>
            {submitting ? "Posting…" : "Post comment"}
          </button>
        </form>
      </AuthAwareForm>

      {comments === undefined ? (
        <p className="muted">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="muted">No comments yet. Be the first.</p>
      ) : (
        <div>
          {comments.map((comment) => (
            <article
              key={comment._id}
              id={`comment-${comment._id}`}
              className="comment"
            >
              <div className="comment-meta">
                <strong>{comment.authorName}</strong>
                <a href={`#comment-${comment._id}`}>
                  <time dateTime={new Date(comment.createdAt).toISOString()}>
                    {formatRelativeTime(comment.createdAt)}
                  </time>
                </a>
              </div>
              <CommentMarkdown markdown={comment.bodyMarkdown} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CommentsFallback() {
  return (
    <section className="comments">
      <h2>Comments</h2>
      <p className="muted">
        Comments are unavailable until <code>PUBLIC_CONVEX_URL</code> is
        configured.
      </p>
    </section>
  );
}

function CommentsRoot(props: CommentsProps) {
  if (!isConvexConfigured()) {
    return <CommentsFallback />;
  }
  return <CommentsInner {...props} />;
}

export default withConvexProvider(CommentsRoot);
