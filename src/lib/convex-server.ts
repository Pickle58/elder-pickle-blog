import { ConvexHttpClient } from "convex/browser";

const convexUrl = import.meta.env.PUBLIC_CONVEX_URL as string | undefined;

export function getConvexHttpClient(): ConvexHttpClient | null {
  if (!convexUrl) {
    return null;
  }
  return new ConvexHttpClient(convexUrl);
}

export function isConvexConfiguredServer(): boolean {
  return Boolean(convexUrl);
}
