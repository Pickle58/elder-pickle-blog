# Elder Pickle Blog

Astro blog on Cloudflare with Keystatic authoring, Clerk auth, Convex posts + comments, and Resend notify-you emails via the sibling `email-with-resend` Worker.

## Stack

- **Posts (serving):** Convex `posts` table — public site reads Convex at request time (on-demand routes)
- **Posts (authoring):** [Keystatic](https://keystatic.com/) at `/keystatic` (GitHub mode — Cloudflare workerd cannot use Keystatic local/fs storage). Saves commit `.mdoc` files to `main`.
- **Posts (sync):** GitHub `push` webhook → Convex HTTP action copies posts into Convex within seconds. Git is the authoring log; **Convex is the serving source of truth.** A site redeploy is not required for a new post to go live.
- **Images:** Keystatic writes under `src/assets/images/posts/`; ingest stores them in Convex file storage for the live site (R2 later)
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
   - `GITHUB_WEBHOOK_SECRET` (shared with the GitHub repo webhook)
   - `GITHUB_TOKEN` (PAT with `contents:read` on this repo)

5. On the Resend Worker (`../email-with-resend`), set secrets:
   - `RESEND_API_KEY`
   - `COMMENT_NOTIFY_SECRET` (same shared secret)
   - `NOTIFY_TO_EMAIL` (your inbox)

6. Create a real Cloudflare KV namespace for Clerk/Astro sessions and replace the placeholder `SESSION` id in `wrangler.jsonc`:

```bash
npx wrangler kv namespace create SESSION
```

7. Register a GitHub webhook on `Pickle58/elder-pickle-blog`:
   - Payload URL: `https://<your-deployment>.convex.site/github/keystatic`
   - Content type: `application/json`
   - Secret: same as `GITHUB_WEBHOOK_SECRET`
   - Events: **push** (Keystatic should commit to `main`)

### Keystatic (create / edit posts)

Posts are authored in Keystatic at `/keystatic` using **GitHub mode** (required because this site uses the Cloudflare adapter — Keystatic `local` storage needs Node.js and does not work in workerd).

You can still edit `src/content/posts/*.mdoc` files directly in your editor if you prefer; push to `main` so the webhook ingests them.

**Setup (local + production)**

1. Follow [Keystatic GitHub mode](https://keystatic.com/docs/github-mode) and create a GitHub App for this repo (`Pickle58/elder-pickle-blog`).
2. Set the OAuth callback to `https://<your-host>/api/keystatic/github/oauth/callback` (for local: `http://127.0.0.1:4321/api/keystatic/github/oauth/callback`).
3. Add to `.env` (and Cloudflare Worker secrets for production):

   - `KEYSTATIC_GITHUB_CLIENT_ID`
   - `KEYSTATIC_GITHUB_CLIENT_SECRET`
   - `KEYSTATIC_SECRET` (long random string)
   - `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`

4. Run `pnpm dev` and open `http://127.0.0.1:4321/keystatic` — sign in with GitHub (repo write access).
5. Saving in Keystatic commits to `main`; the Convex webhook ingests the post so `/` and `/posts/<slug>/` show it within seconds (no rebuild required).

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

Prefer creating posts in Keystatic (`/keystatic` → Posts). Files live under `src/content/posts/` as `.mdoc` for git history and Keystatic. The filename (without extension) is the immutable `slug` / `postSlug` for comments — avoid renaming published posts.

Do not treat the Convex dashboard as an editor for posts: the next GitHub push will overwrite those rows.
