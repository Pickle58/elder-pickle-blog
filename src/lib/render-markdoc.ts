import Markdoc from "@markdoc/markdoc";

/** Render Markdoc source to a safe HTML string for post bodies. */
export function renderMarkdocToHtml(source: string): string {
  const ast = Markdoc.parse(source);
  const content = Markdoc.transform(ast);
  return Markdoc.renderers.html(content);
}
