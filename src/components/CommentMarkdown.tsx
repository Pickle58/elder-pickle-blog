import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

const MAX_COMMENT_LENGTH = 5000;

export function CommentMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="comment-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

export { MAX_COMMENT_LENGTH };
