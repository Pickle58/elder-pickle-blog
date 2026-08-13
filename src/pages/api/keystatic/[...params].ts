import type { APIContext, APIRoute } from "astro";
import { makeGenericAPIRouteHandler } from "@keystatic/core/api/generic";
import { parseString } from "set-cookie-parser";
import config from "../../../../keystatic.config";

export const prerender = false;

type EnvRecord = Record<string, string | undefined>;

async function cloudflareEnv(): Promise<EnvRecord | undefined> {
  try {
    const { env } = await import("cloudflare:workers");
    return env as EnvRecord;
  } catch {
    return undefined;
  }
}

function readEnv(cf: EnvRecord | undefined, key: string): string | undefined {
  const fromCf = cf?.[key];
  if (typeof fromCf === "string" && fromCf.length > 0) {
    return fromCf;
  }
  try {
    const fromMeta = (import.meta.env as Record<string, string | undefined>)[
      key
    ];
    return typeof fromMeta === "string" && fromMeta.length > 0
      ? fromMeta
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeHeaders(
  headers: Headers | Array<[string, string]> | Record<string, string> | undefined,
) {
  const map = new Map<string, string[]>();
  if (!headers) {
    return map;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      const k = key.toLowerCase();
      if (!map.has(k)) {
        map.set(k, []);
      }
      map.get(k)!.push(value);
    }
    return map;
  }
  if (typeof (headers as Headers).entries === "function") {
    for (const [key, value] of (headers as Headers).entries()) {
      map.set(key.toLowerCase(), [value]);
    }
    const maybeGetSetCookie = (
      headers as Headers & { getSetCookie?: () => string[] }
    ).getSetCookie;
    if (typeof maybeGetSetCookie === "function") {
      const setCookieHeaders = maybeGetSetCookie.call(headers);
      if (setCookieHeaders?.length) {
        map.set("set-cookie", setCookieHeaders);
      }
    }
    return map;
  }
  for (const [key, value] of Object.entries(headers)) {
    map.set(key.toLowerCase(), [value]);
  }
  return map;
}

function applySetCookies(
  context: APIContext,
  setCookieHeaders: string[] | undefined,
) {
  if (!setCookieHeaders) {
    return;
  }
  for (const setCookieValue of setCookieHeaders) {
    const { name, value, ...options } = parseString(setCookieValue);
    const sameSite = options.sameSite?.toLowerCase();
    context.cookies.set(name, value, {
      domain: options.domain,
      expires: options.expires,
      httpOnly: options.httpOnly,
      maxAge: options.maxAge,
      path: options.path,
      secure: options.secure,
      sameSite:
        sameSite === "lax" || sameSite === "strict" || sameSite === "none"
          ? sameSite
          : undefined,
    });
  }
}

export const ALL: APIRoute = async (context) => {
  // Avoid @keystatic/astro makeHandler — it reads Astro.locals.runtime.env,
  // which Astro 6 + Cloudflare removed. Read secrets via cloudflare:workers /
  // import.meta.env instead.
  const cf = await cloudflareEnv();
  const handler = makeGenericAPIRouteHandler(
    {
      config,
      clientId: readEnv(cf, "KEYSTATIC_GITHUB_CLIENT_ID"),
      clientSecret: readEnv(cf, "KEYSTATIC_GITHUB_CLIENT_SECRET"),
      secret: readEnv(cf, "KEYSTATIC_SECRET"),
    },
    { slugEnvName: "PUBLIC_KEYSTATIC_GITHUB_APP_SLUG" },
  );

  const { body, headers, status } = await handler(context.request);
  const headerMap = normalizeHeaders(headers);
  const setCookieHeaders = headerMap.get("set-cookie");
  headerMap.delete("set-cookie");
  applySetCookies(context, setCookieHeaders);

  return new Response(body, {
    status,
    headers: [...headerMap.entries()].flatMap(([key, values]) =>
      values.map((value) => [key, value] as [string, string]),
    ),
  });
};
