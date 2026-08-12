# Elder Pickle Blog

Astro blog on Cloudflare with Content Collections (Keystatic), Clerk auth, Convex comments, and Resend notify-you emails via the sibling `email-with-resend` Worker.

## Stack

- **Posts:** Astro Content Collections (`src/content/posts/*.mdoc`) — slug = filename id
- **Authoring:** [Keystatic](https://keystatic.com/) at `/keystatic` (GitHub mode — Cloudflare workerd cannot use Keystatic local/fs storage)
- **Images:** stored under `src/assets/images/posts/` (R2 later)
- **Auth (readers / comments):** Clerk (`@clerk/astro`)
- **Auth (writing posts):** GitHub write access to this repo (Keystatic GitHub App)
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

### Keystatic (create / edit posts)

Posts are authored in Keystatic at `/keystatic` using **GitHub mode** (required because this site uses the Cloudflare adapter — Keystatic `local` storage needs Node.js and does not work in workerd).

You can still edit `src/content/posts/*.mdoc` files directly in your editor if you prefer.

**Setup (local + production)**

1. Follow [Keystatic GitHub mode](https://keystatic.com/docs/github-mode) and create a GitHub App for this repo (`Pickle58/elder-pickle-blog`).
2. Set the OAuth callback to `https://<your-host>/api/keystatic/github/oauth/callback` (for local: `http://127.0.0.1:4321/api/keystatic/github/oauth/callback`).
3. Add to `.env` (and Cloudflare Worker secrets for production):

   - `KEYSTATIC_GITHUB_CLIENT_ID`
   - `KEYSTATIC_GITHUB_CLIENT_SECRET`
   - `KEYSTATIC_SECRET` (long random string)
   - `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`

4. Run `pnpm dev` and open `http://127.0.0.1:4321/keystatic` — sign in with GitHub (repo write access).
5. Saving in Keystatic commits to GitHub; ensure deploy-on-push rebuilds the site for production.

Comment moderation at `/admin/comments` still uses Clerk (`ADMIN_CLERK_USER_ID`), separate from Keystatic’s GitHub login.

## Scripts

```bash
pnpm dev          # Astro locally (includes /keystatic)
pnpm convex dev   # Convex locally / sync
pnpm build        # production build
pnpm preview      # wrangler preview
pnpm deploy       # build + wrangler deploy
```

## Content

Prefer creating posts in Keystatic (`/keystatic` → Posts). Files live under `src/content/posts/` as `.mdoc`. The filename (without extension) is the immutable `postSlug` for comments — avoid renaming published posts.
