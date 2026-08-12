/// <reference types="astro/client" />
/// <reference types="@clerk/astro/env" />

interface ImportMetaEnv {
  readonly PUBLIC_CONVEX_URL?: string;
  readonly PUBLIC_ADMIN_CLERK_USER_ID?: string;
  readonly PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  readonly CLERK_SECRET_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
