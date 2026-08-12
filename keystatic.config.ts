import { collection, config, fields } from "@keystatic/core";

const postImages = {
  directory: "src/assets/images/posts",
  // Must match tsconfig paths so Astro's image() helper and Markdoc can import the file.
  publicPath: "@assets/images/posts/",
} as const;

// Cloudflare's workerd runtime cannot use storage.kind "local" (needs Node fs).
// GitHub mode works in `astro dev` and production; set Keystatic GitHub App secrets.
export default config({
  storage: {
    kind: "github",
    repo: "Pickle58/elder-pickle-blog",
  },
  collections: {
    posts: collection({
      label: "Posts",
      slugField: "title",
      path: "src/content/posts/*",
      format: { contentField: "content" },
      schema: {
        title: fields.slug({ name: { label: "Title" } }),
        description: fields.text({
          label: "Description",
          multiline: true,
        }),
        pubDate: fields.date({
          label: "Publish date",
          defaultValue: { kind: "today" },
        }),
        draft: fields.checkbox({
          label: "Draft",
          defaultValue: false,
        }),
        heroImage: fields.image({
          label: "Hero image",
          description: "Optional cover image shown on the post page.",
          ...postImages,
          transformFilename: (filename) =>
            filename.replace(/\s+/g, "-").replace(/[()]/g, ""),
        }),
        content: fields.markdoc({
          label: "Content",
          options: {
            image: postImages,
          },
        }),
      },
    }),
  },
});
