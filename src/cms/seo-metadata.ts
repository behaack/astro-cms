import { isSafeImageSource } from "./document-schema";
import type { PageDocument, PageSearchVisibility } from "./document-types";

export interface PageSeoDefaults {
  siteName?: string;
  titleTemplate?: string;
  locale?: string;
  defaultSocialImage?: string;
  defaultSocialImageAlt?: string;
  twitterSite?: string;
}

export interface ResolvePageSeoMetadataOptions extends PageSeoDefaults {
  site?: URL;
  pathname?: string;
  titleOverride?: string;
  descriptionOverride?: string;
  searchVisibility?: PageSearchVisibility;
  canonical?: boolean;
}

export interface ResolvedPageSeoMetadata {
  title: string;
  description?: string;
  canonicalUrl?: string;
  robots: "index, follow" | "noindex, follow";
  socialImage?: string;
  socialImageAlt?: string;
  openGraph: {
    type: "website";
    title: string;
    description?: string;
    url?: string;
    image?: string;
    imageAlt?: string;
    siteName?: string;
    locale?: string;
  };
  twitter: {
    card: "summary" | "summary_large_image";
    title: string;
    description?: string;
    image?: string;
    imageAlt?: string;
    site?: string;
  };
}

function requiredTrimmed(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} cannot be empty.`);
  return trimmed;
}

function resolvedTitle(pageTitle: string, template?: string): string {
  if (!template) return pageTitle;
  if (!template.includes("%s")) {
    throw new Error('The SEO title template must contain the token "%s".');
  }
  return template.replaceAll("%s", pageTitle);
}

function resolvedCanonicalUrl(
  site: URL | undefined,
  pathname: string,
): string | undefined {
  if (!site) return undefined;
  if (!pathname.startsWith("/")) {
    throw new Error("The canonical page path must begin with a slash.");
  }
  if (!["http:", "https:"].includes(site.protocol)) {
    throw new Error("The Astro site URL must use HTTP or HTTPS.");
  }
  const canonical = new URL(pathname, site);
  canonical.search = "";
  canonical.hash = "";
  return canonical.href;
}

function resolvedSocialImage(
  source: string | undefined,
  site: URL | undefined,
): string | undefined {
  if (!source) return undefined;
  if (!isSafeImageSource(source)) {
    throw new Error(
      "The social image must use a safe relative, HTTP, or HTTPS path.",
    );
  }
  if (source.startsWith("/") && site) return new URL(source, site).href;
  return source;
}

export function resolvePageSeoMetadata(
  document: PageDocument,
  options: ResolvePageSeoMetadataOptions = {},
): ResolvedPageSeoMetadata {
  const pageTitle = requiredTrimmed(
    options.titleOverride ?? document.seo?.title ?? document.title,
    "The page title",
  );
  const title = resolvedTitle(pageTitle, options.titleTemplate);
  const descriptionSource =
    options.descriptionOverride ??
    document.seo?.description ??
    document.description;
  const description = descriptionSource?.trim() || undefined;
  const searchVisibility =
    options.searchVisibility ?? document.seo?.searchVisibility ?? "public";
  const canonicalUrl =
    options.canonical === false
      ? undefined
      : resolvedCanonicalUrl(options.site, options.pathname ?? document.route);
  const socialImageSource =
    document.seo?.socialImage ?? options.defaultSocialImage;
  const socialImageAlt =
    document.seo?.socialImageAlt ?? options.defaultSocialImageAlt;
  const socialImage = resolvedSocialImage(socialImageSource, options.site);

  if (socialImage && !socialImageAlt?.trim()) {
    throw new Error("A social image must have alternative text.");
  }

  const common = {
    title,
    ...(description ? { description } : {}),
    ...(socialImage ? { image: socialImage } : {}),
    ...(socialImageAlt?.trim() ? { imageAlt: socialImageAlt.trim() } : {}),
  };

  return {
    title,
    ...(description ? { description } : {}),
    ...(canonicalUrl ? { canonicalUrl } : {}),
    robots:
      searchVisibility === "noindex" ? "noindex, follow" : "index, follow",
    ...(socialImage ? { socialImage } : {}),
    ...(socialImageAlt?.trim()
      ? { socialImageAlt: socialImageAlt.trim() }
      : {}),
    openGraph: {
      type: "website",
      ...common,
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
      ...(options.siteName?.trim()
        ? { siteName: options.siteName.trim() }
        : {}),
      ...(options.locale?.trim() ? { locale: options.locale.trim() } : {}),
    },
    twitter: {
      card: socialImage ? "summary_large_image" : "summary",
      ...common,
      ...(options.twitterSite?.trim()
        ? { site: options.twitterSite.trim() }
        : {}),
    },
  };
}
