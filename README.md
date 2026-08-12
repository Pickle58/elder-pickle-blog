# Elder Pickle Blog

Astro blog on Cloudflare with Content Collections, Clerk auth, Convex comments, and Resend notify-you emails via the sibling `email-with-resend` Worker.

## Stack

- **Posts:** Astro Content Collections (`src/content/posts`) — slug = filename id
- **Auth:** Clerk (`@clerk/astro`)
- **Comments:** Convex (flat thread, soft-hide moderation)
- **Email:** `email-with-resend` Worker `POST /notify-comment`

## Setup

1. Copy `.env.example` to `.env` and fill Clerk + Convex values.
2. In Clerk, enable the **Convex** JWT template named `convex`.
3. Create/link a Convex project:

```bash
pnpm convex dev
```

4. In the Convex dashboard, set:
   - `CLERK_JWT_ISSUER_DOMAIN`
   - `ADMIN_CLERK_USER_ID` (same as `PUBLIC_ADMIN_CLERK_USER_ID`)
   - `COMMENT_NOTIFY_SECRET`
   - `NOTIFY_WORKER_URL` (full URL to `/notify-comment` on the Resend Worker)

5. On the Resend Worker (`../email-with-resend`), set secrets:
   - `RESEND_API_KEY`
   - `COMMENT_NOTIFY_SECRET` (same shared secret)
   - `NOTIFY_TO_EMAIL` (your inbox)

6. Create a real Cloudflare KV namespace for Clerk/Astro sessions and replace the placeholder `SESSION` id in `wrangler.jsonc`:

```bash
npx wrangler kv namespace create SESSION
```

## Scripts

```bash
pnpm dev          # Astro locally
pnpm convex dev   # Convex locally / sync
pnpm build        # production build
pnpm preview      # wrangler preview
pnpm deploy       # build + wrangler deploy
```

## Content

Add Markdown under `src/content/posts/`. The filename (without extension) is the immutable `postSlug` for comments — avoid renaming published posts.
