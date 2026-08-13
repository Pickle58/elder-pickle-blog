/** Parse Keystatic/Astro-style YAML frontmatter + Markdoc body. */

export type ParsedMdoc = {
  title: string;
  description: string;
  pubDate: number;
  draft: boolean;
  heroImagePath: string | null;
  bodyMarkdoc: string;
};

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parsePubDate(raw: string): number {
  const value = unquote(raw);
  // YYYY-MM-DD → UTC midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const ms = Date.parse(`${value}T00:00:00.000Z`);
    if (!Number.isNaN(ms)) {
      return ms;
    }
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid pubDate: ${raw}`);
  }
  return ms;
}

function parseBool(raw: string): boolean {
  const value = unquote(raw).toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Invalid boolean: ${raw}`);
}

/** Map `@assets/...` Keystatic path to repo-relative `src/assets/...`. */
export function assetsAliasToRepoPath(aliasPath: string): string {
  const trimmed = aliasPath.trim();
  if (trimmed.startsWith("@assets/")) {
    return `src/assets/${trimmed.slice("@assets/".length)}`;
  }
  if (trimmed.startsWith("src/assets/")) {
    return trimmed;
  }
  throw new Error(`Unsupported asset path: ${aliasPath}`);
}

export function parseMdoc(source: string): ParsedMdoc {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error("Missing YAML frontmatter.");
  }

  const frontmatter = match[1]!;
  const bodyMarkdoc = match[2] ?? "";

  let title = "";
  let description = "";
  let pubDate: number | null = null;
  let draft = false;
  let heroImagePath: string | null = null;

  for (const line of frontmatter.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1);
    switch (key) {
      case "title":
        title = unquote(value);
        break;
      case "description":
        description = unquote(value);
        break;
      case "pubDate":
        pubDate = parsePubDate(value);
        break;
      case "draft":
        draft = parseBool(value);
        break;
      case "heroImage":
        heroImagePath = unquote(value);
        break;
      default:
        break;
    }
  }

  if (!title) {
    throw new Error("Post frontmatter requires title.");
  }
  if (pubDate === null) {
    throw new Error("Post frontmatter requires pubDate.");
  }

  return {
    title,
    description,
    pubDate,
    draft,
    heroImagePath,
    bodyMarkdoc,
  };
}

export function slugFromPostPath(path: string): string | null {
  const match = path.match(/^src\/content\/posts\/([^/]+)\.(mdoc|md)$/);
  return match?.[1] ?? null;
}

export function collectAssetAliases(bodyMarkdoc: string): string[] {
  const aliases = new Set<string>();
  const re = /@assets\/[^\s)'"]+/g;
  for (const hit of bodyMarkdoc.matchAll(re)) {
    aliases.add(hit[0]!);
  }
  return [...aliases];
}
