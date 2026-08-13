import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isConvexConfigured, withConvexProvider } from "../lib/convex";

export type PostListItem = {
  slug: string;
  title: string;
  description: string;
  pubDate: number;
  heroImageUrl: string | null;
};

type PostListProps = {
  initialPosts: PostListItem[];
};

function formatPubDate(pubDate: number) {
  return new Date(pubDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function PostListInner({ initialPosts }: PostListProps) {
  const live = useQuery(api.posts.listPublished);
  const posts = live ?? initialPosts;

  if (posts.length === 0) {
    return <p className="muted">No posts yet.</p>;
  }

  return (
    <ul className="post-list">
      {posts.map((post) => (
        <li key={post.slug}>
          <a href={`/posts/${post.slug}/`}>
            {post.heroImageUrl ? (
              <img
                className="post-list-thumb"
                src={post.heroImageUrl}
                alt=""
                width={640}
                height={360}
              />
            ) : null}
            <h2>{post.title}</h2>
            <p>{post.description}</p>
            <p className="meta">{formatPubDate(post.pubDate)}</p>
          </a>
        </li>
      ))}
    </ul>
  );
}

function PostListRoot(props: PostListProps) {
  if (!isConvexConfigured()) {
    return (
      <p className="muted">
        Posts are unavailable until <code>PUBLIC_CONVEX_URL</code> is
        configured.
      </p>
    );
  }
  return <PostListInner {...props} />;
}

export default withConvexProvider(PostListRoot);
