import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { PageDocument } from "./document-types";
import {
  createAstroCmsSitemapFilter,
  createRobotsTxt,
  listLocalSearchDiscoveryRoutes,
} from "./search-discovery";

const temporaryDirectories: string[] = [];

async function createContentDirectory(): Promise<string> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "astro-cms-search-discovery-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

async function writeDocument(
  directory: string,
  relativeFile: string,
  document: PageDocument,
): Promise<void> {
  const filePath = path.join(directory, relativeFile);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

function pageDocument(
  route: string,
  searchVisibility: "public" | "noindex" = "public",
): PageDocument {
  return {
    schemaVersion: 1,
    route,
    title: route === "/" ? "Home" : route.slice(1),
    seo: {
      schemaVersion: 1,
      searchVisibility,
    },
    content: [],
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("local search discovery", () => {
  it("maps saved page routes to their public paths and visibility", async () => {
    const directory = await createContentDirectory();
    await writeDocument(directory, "home.json", pageDocument("/"));
    await writeDocument(
      directory,
      "campaigns/summer.json",
      pageDocument("/campaigns/summer"),
    );
    await writeDocument(
      directory,
      "private.json",
      pageDocument("/private", "noindex"),
    );

    expect(
      listLocalSearchDiscoveryRoutes({
        contentDirectory: directory,
        publicRoutePrefix: "/astro-cms-demo",
      }),
    ).toEqual([
      {
        documentRoute: "/",
        publicPath: "/astro-cms-demo",
        indexable: true,
      },
      {
        documentRoute: "/campaigns/summer",
        publicPath: "/astro-cms-demo/campaigns/summer",
        indexable: true,
      },
      {
        documentRoute: "/private",
        publicPath: "/astro-cms-demo/private",
        indexable: false,
      },
    ]);
  });

  it("filters noindex CMS pages and private editor routes without hiding adopter pages", async () => {
    const directory = await createContentDirectory();
    await writeDocument(directory, "home.json", pageDocument("/"));
    await writeDocument(
      directory,
      "private.json",
      pageDocument("/private", "noindex"),
    );
    const filter = createAstroCmsSitemapFilter({
      contentDirectory: directory,
      publicRoutePrefix: "/astro-cms-demo",
    });

    expect(filter("https://example.com/")).toBe(true);
    expect(filter("https://example.com/about/")).toBe(true);
    expect(filter("https://example.com/astro-cms-demo/")).toBe(true);
    expect(filter("https://example.com/astro-cms-demo/private/")).toBe(false);
    expect(filter("https://example.com/admin/")).toBe(false);
    expect(filter("https://example.com/preview/live/draft-id/")).toBe(false);
    expect(filter("https://example.com/api/page-document/")).toBe(false);
  });

  it("rejects a document whose route disagrees with its canonical file path", async () => {
    const directory = await createContentDirectory();
    await writeDocument(
      directory,
      "campaigns/summer.json",
      pageDocument("/campaigns/winter"),
    );

    expect(() =>
      listLocalSearchDiscoveryRoutes({ contentDirectory: directory }),
    ).toThrow("does not match campaigns/summer.json");
  });
});

describe("robots text", () => {
  it("creates deterministic production crawl policy from Astro site metadata", () => {
    expect(createRobotsTxt(new URL("https://example.com"))).toBe(
      "User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap-index.xml\n",
    );
  });

  it("rejects a non-web site URL", () => {
    expect(() => createRobotsTxt(new URL("ftp://example.com"))).toThrow(
      "must use HTTP or HTTPS",
    );
  });
});
