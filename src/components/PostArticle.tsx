import Markdoc from "@markdoc/markdoc";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import { isConvexConfigured, withConvexProvider } from "../lib/convex";

type PostArticleProps = {
  slug: string;
  initialTitle: string;
  initialPubDate: number;
  initialHeroImageUrl: string | null;
  initialBodyHtml: string;
};

function formatPubDate(pubDate: number) {
  return new Date(pubDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function renderMarkdocToHtml(source: string): string {
  const ast = Markdoc.parse(source);
  const content = Markdoc.transform(ast);
  return Markdoc.renderers.html(content);
}

function PostArticleInner({
  slug,
  initialTitle,
  initialPubDate,
  initialHeroImageUrl,
  initialBodyHtml,
}: PostArticleProps) {
  const live = useQuery(api.posts.getBySlug, { slug });

  const title = live?.title ?? initialTitle;
  const pubDate = live?.pubDate ?? initialPubDate;
  const heroImageUrl = live ? live.heroImageUrl : initialHeroImageUrl;
  const bodyHtml = useMemo(() => {
    if (!live) {
      return initialBodyHtml;
    }
    return renderMarkdocToHtml(live.bodyMarkdoc);
  }, [live, initialBodyHtml]);

  return (
    <article>
      <h1 className="hero-title">{title}</h1>
      <p className="meta">{formatPubDate(pubDate)}</p>
      {heroImageUrl ? (
        <img className="post-hero" src={heroImageUrl} alt="" />
      ) : null}
      <div className="prose" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </article>
  );
}

function PostArticleRoot(props: PostArticleProps) {
  if (!isConvexConfigured()) {
    return (
      <article>
        <h1 className="hero-title">{props.initialTitle}</h1>
        <p className="meta">{formatPubDate(props.initialPubDate)}</p>
        {props.initialHeroImageUrl ? (
          <img className="post-hero" src={props.initialHeroImageUrl} alt="" />
        ) : null}
        <div
          className="prose"
          dangerouslySetInnerHTML={{ __html: props.initialBodyHtml }}
        />
      </article>
    );
  }
  return <PostArticleInner {...props} />;
}

export default withConvexProvider(PostArticleRoot);
