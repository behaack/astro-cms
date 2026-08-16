import { describe, expect, it } from "vitest";

import type { PageDocument } from "./document-types";
import { resolvePageSeoMetadata } from "./seo-metadata";

const legacyDocument: PageDocument = {
  schemaVersion: 1,
  route: "/campaigns/summer",
  title: "Summer campaign",
  description: "The legacy page description remains useful.",
  content: [],
};

describe("page SEO metadata", () => {
  it("uses legacy page details and preserves public visibility by default", () => {
    expect(resolvePageSeoMetadata(legacyDocument)).toMatchObject({
      title: "Summer campaign",
      description: "The legacy page description remains useful.",
      robots: "index, follow",
      openGraph: {
        type: "website",
        title: "Summer campaign",
        description: "The legacy page description remains useful.",
      },
      twitter: {
        card: "summary",
        title: "Summer campaign",
        description: "The legacy page description remains useful.",
      },
    });
  });

  it("resolves canonical and social URLs against the Astro site", () => {
    const document: PageDocument = {
      ...legacyDocument,
      seo: {
        schemaVersion: 1,
        title: "A focused search title",
        description: "A focused search description.",
        socialImage: "/uploads/summer-card.png",
        socialImageAlt: "People gathering at the summer event",
      },
    };

    expect(
      resolvePageSeoMetadata(document, {
        site: new URL("https://www.example.com/base/"),
        pathname: "/base/campaigns/summer/",
        titleTemplate: "%s | Example",
        siteName: "Example",
        locale: "en_US",
        twitterSite: "@example",
      }),
    ).toMatchObject({
      title: "A focused search title | Example",
      canonicalUrl: "https://www.example.com/base/campaigns/summer/",
      socialImage: "https://www.example.com/uploads/summer-card.png",
      socialImageAlt: "People gathering at the summer event",
      openGraph: {
        url: "https://www.example.com/base/campaigns/summer/",
        image: "https://www.example.com/uploads/summer-card.png",
        siteName: "Example",
        locale: "en_US",
      },
      twitter: {
        card: "summary_large_image",
        image: "https://www.example.com/uploads/summer-card.png",
        site: "@example",
      },
    });
  });

  it("allows previews to override the title and suppress canonical indexing", () => {
    expect(
      resolvePageSeoMetadata(legacyDocument, {
        site: new URL("https://www.example.com"),
        titleOverride: "Preview · Summer campaign",
        searchVisibility: "noindex",
        canonical: false,
      }),
    ).toMatchObject({
      title: "Preview · Summer campaign",
      robots: "noindex, follow",
    });
    expect(
      resolvePageSeoMetadata(legacyDocument, {
        site: new URL("https://www.example.com"),
        canonical: false,
      }).canonicalUrl,
    ).toBeUndefined();
  });

  it("rejects invalid developer-owned defaults", () => {
    expect(() =>
      resolvePageSeoMetadata(legacyDocument, {
        titleTemplate: "Example without a page token",
      }),
    ).toThrow('must contain the token "%s"');
    expect(() =>
      resolvePageSeoMetadata(legacyDocument, {
        defaultSocialImage: "/social-card.png",
      }),
    ).toThrow("must have alternative text");
  });
});
