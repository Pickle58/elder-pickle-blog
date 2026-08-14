import { SignInButton, useAuth } from "@clerk/astro/react";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { isConvexConfigured, withConvexProvider } from "../lib/convex";

const adminClerkUserId = import.meta.env.PUBLIC_ADMIN_CLERK_USER_ID as
  | string
  | undefined;

function AdminPostsInner() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const posts = useQuery(
    api.posts.listAll,
    isSignedIn && userId === adminClerkUserId ? {} : "skip",
  );
  const removePost = useMutation(api.posts.remove);
  const [error, setError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  if (!isLoaded) {
    return <p className="muted">Checking sign-in…</p>;
  }

  if (!isSignedIn) {
    return (
      <p className="muted">
        <SignInButton mode="modal">Sign in</SignInButton> as the site admin to
        manage posts.
      </p>
    );
  }

  if (!adminClerkUserId || userId !== adminClerkUserId) {
    return <p className="error">You do not have admin access.</p>;
  }

  async function onRemove(slug: string, title: string) {
    const confirmed = window.confirm(
      `Delete “${title}” permanently?\n\nThis removes the post, its comments, images in Convex, and the GitHub source file.`,
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setBusySlug(slug);
    try {
      await removePost({ slug });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete post.");
    } finally {
      setBusySlug(null);
    }
  }

  return (
    <section className="admin-panel">
      <h2>Manage posts</h2>
      <p className="muted">
        Hard-delete removes the post from Convex and schedules deletion of the
        Keystatic source file on GitHub.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {posts === undefined ? (
        <p className="muted">Loading…</p>
      ) : posts.length === 0 ? (
        <p className="muted">No posts in Convex yet.</p>
      ) : (
        posts.map((post) => (
          <div className="admin-row" key={post._id}>
            <div>
              <div className="comment-meta">
                <strong>{post.title}</strong>
                <span>/{post.slug}</span>
                <span
                  className={`status-pill${post.draft ? " hidden" : ""}`}
                >
                  {post.draft ? "draft" : "published"}
                </span>
                <time dateTime={new Date(post.pubDate).toISOString()}>
                  {new Date(post.pubDate).toLocaleDateString()}
                </time>
              </div>
              {post.heroImageUrl ? (
                <img
                  className="admin-thumb"
                  src={post.heroImageUrl}
                  alt=""
                  width={120}
                  height={72}
                />
              ) : null}
            </div>
            <div className="admin-actions">
              {!post.draft ? (
                <a className="secondary-link" href={`/posts/${post.slug}/`}>
                  View
                </a>
              ) : null}
              <button
                type="button"
                className="danger"
                disabled={busySlug === post.slug}
                onClick={() => void onRemove(post.slug, post.title)}
              >
                {busySlug === post.slug ? "Deleting…" : "Delete"}
              </button>
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

function AdminPostsRoot() {
  if (!isConvexConfigured()) {
    return <AdminFallback />;
  }
  return <AdminPostsInner />;
}

export default withConvexProvider(AdminPostsRoot);
