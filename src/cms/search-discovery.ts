import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export interface LocalSearchDiscoveryOptions {
  /** Directory containing the canonical Astro-CMS page JSON files. */
  contentDirectory?: string;
  /** Public URL prefix used when the stored page routes are mounted elsewhere. */
  publicRoutePrefix?: string;
}

export interface LocalSearchDiscoveryRoute {
  documentRoute: string;
  publicPath: string;
  indexable: boolean;
}

const PRIVATE_EDITOR_PATHS = [
  "/admin",
  "/preview",
  "/api/page-document",
  "/api/pages",
  "/api/assets",
  "/api/change-review",
  "/api/preview-drafts",
  "/api/templates",
  "/api/publish",
] as const;

interface SearchDiscoveryDocument {
  route: string;
  seo?: {
    searchVisibility?: "public" | "noindex";
  };
}

function normalizeDiscoveryRoute(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "/") return "/";
  const route = `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
  if (route.includes("?") || route.includes("#") || route.includes("%")) {
    throw new Error(
      "Page paths cannot contain a query, fragment, or encoded characters.",
    );
  }
  const segments = route.slice(1).split("/");
  if (
    segments.some(
      (segment) => !segment || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment),
    )
  ) {
    throw new Error(
      "Page paths must use lowercase letters, numbers, and single hyphens.",
    );
  }
  return route;
}

function assertSearchDiscoveryDocument(
  value: unknown,
): SearchDiscoveryDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A page document must be a JSON object.");
  }
  const document = value as Record<string, unknown>;
  if (typeof document.route !== "string") {
    throw new Error("A page document must contain a route.");
  }
  normalizeDiscoveryRoute(document.route);
  if (!Array.isArray(document.content)) {
    throw new Error("A page document must contain a component list.");
  }
  if (document.seo !== undefined) {
    if (!document.seo || typeof document.seo !== "object") {
      throw new Error("Page SEO metadata must be an object.");
    }
    const visibility = (document.seo as Record<string, unknown>)
      .searchVisibility;
    if (
      visibility !== undefined &&
      visibility !== "public" &&
      visibility !== "noindex"
    ) {
      throw new Error("Search visibility must be public or noindex.");
    }
  }
  return value as SearchDiscoveryDocument;
}

function normalizedPathname(input: string): string {
  const pathname =
    input.startsWith("http:") || input.startsWith("https:")
      ? new URL(input).pathname
      : input;
  if (!pathname.startsWith("/")) {
    throw new Error("Search-discovery paths must begin with a slash.");
  }
  return pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
}

function normalizedPublicRoutePrefix(input = ""): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed === "/") return "";
  return normalizeDiscoveryRoute(trimmed);
}

function publicPathForDocumentRoute(route: string, prefix: string): string {
  const result = `${prefix}${route === "/" ? "" : route}`;
  return result || "/";
}

function relativePageFiles(
  directory: string,
  relativeDirectory = "",
): string[] {
  let entries;
  try {
    entries = readdirSync(path.join(directory, relativeDirectory), {
      withFileTypes: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...relativePageFiles(directory, relativePath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(relativePath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function routeForRelativePageFile(relativeFile: string): string {
  const normalized = relativeFile.replaceAll("\\", "/");
  if (normalized === "home.json") return "/";
  return normalizeDiscoveryRoute(`/${normalized.replace(/\.json$/, "")}`);
}

function readSearchDiscoveryDocuments(
  directory: string,
): SearchDiscoveryDocument[] {
  return relativePageFiles(directory).map((relativeFile) => {
    const expectedRoute = routeForRelativePageFile(relativeFile);
    const source = readFileSync(path.join(directory, relativeFile), "utf8");
    const document = assertSearchDiscoveryDocument(JSON.parse(source));
    if (document.route !== expectedRoute) {
      throw new Error(
        `Page route ${document.route} does not match ${relativeFile.replaceAll("\\", "/")}.`,
      );
    }
    return document;
  });
}

function isPrivateEditorPath(pathname: string): boolean {
  return PRIVATE_EDITOR_PATHS.some(
    (privatePath) =>
      pathname === privatePath || pathname.startsWith(`${privatePath}/`),
  );
}

export function listLocalSearchDiscoveryRoutes(
  options: LocalSearchDiscoveryOptions = {},
): LocalSearchDiscoveryRoute[] {
  const directory = path.resolve(
    options.contentDirectory ?? path.join(process.cwd(), "content", "pages"),
  );
  const prefix = normalizedPublicRoutePrefix(options.publicRoutePrefix);
  return readSearchDiscoveryDocuments(directory)
    .map((document) => ({
      documentRoute: document.route,
      publicPath: publicPathForDocumentRoute(document.route, prefix),
      indexable: document.seo?.searchVisibility !== "noindex",
    }))
    .sort((left, right) => left.publicPath.localeCompare(right.publicPath));
}

export function createAstroCmsSitemapFilter(
  options: LocalSearchDiscoveryOptions = {},
): (page: string) => boolean {
  const routes = listLocalSearchDiscoveryRoutes(options);
  const managedPaths = new Set(routes.map((route) => route.publicPath));
  const indexablePaths = new Set(
    routes.filter((route) => route.indexable).map((route) => route.publicPath),
  );

  return (page: string): boolean => {
    const pathname = normalizedPathname(page);
    if (isPrivateEditorPath(pathname)) return false;
    return managedPaths.has(pathname) ? indexablePaths.has(pathname) : true;
  };
}

export function createRobotsTxt(site: URL): string {
  if (!["http:", "https:"].includes(site.protocol)) {
    throw new Error("The Astro site URL must use HTTP or HTTPS.");
  }
  const sitemapUrl = new URL("sitemap-index.xml", site);
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl.href}\n`;
}
