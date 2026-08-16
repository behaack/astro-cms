import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import homeDocumentJson from "../../content/pages/home.json";
import { requireNodeByType } from "./document-test-helpers";
import {
  createLocalPageDocument,
  InvalidPageDetailsError,
  listLocalPageDocuments,
  localPageFilePath,
  PageAlreadyExistsError,
  readLocalPageDocument,
  serializePageDocument,
  writeLocalPageDocument,
} from "./local-page-store";
import { assertPageDocument } from "./validation";

const temporaryDirectories: string[] = [];
const originalDocument = assertPageDocument(homeDocumentJson);

async function createTemporaryContentDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "astro-cms-pages-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("local page store", () => {
  it("round-trips a validated document through the project-file format", async () => {
    const contentDirectory = await createTemporaryContentDirectory();
    const changedDocument = structuredClone(originalDocument);
    requireNodeByType(changedDocument, "Heading").props.text =
      "Saved through the local page store";

    await writeLocalPageDocument(changedDocument, { contentDirectory });

    expect(await readLocalPageDocument("/", { contentDirectory })).toEqual(
      changedDocument,
    );
    expect(
      await readFile(path.join(contentDirectory, "home.json"), "utf8"),
    ).toContain('"Saved through the local page store"');
  });

  it("does not leave temporary files after an atomic save", async () => {
    const contentDirectory = await createTemporaryContentDirectory();

    await writeLocalPageDocument(originalDocument, { contentDirectory });

    expect(await readdir(contentDirectory)).toEqual(["home.json"]);
  });

  it("serializes page and property keys deterministically", () => {
    const document = structuredClone(originalDocument);
    document.seo = {
      schemaVersion: 1,
      description: "A deterministic search description.",
      title: "A deterministic search title",
      searchVisibility: "public",
    };
    const heading = requireNodeByType(document, "Heading");
    heading.props = { level: 1, text: "Stable order" };

    const source = serializePageDocument(document);
    const headingStart = source.indexOf(heading.id);

    expect(source.indexOf('"level"', headingStart)).toBeLessThan(
      source.indexOf('"text"', headingStart),
    );
    expect(source.indexOf('"title"', source.indexOf('"seo"'))).toBeLessThan(
      source.indexOf('"description"', source.indexOf('"seo"')),
    );
    expect(source.endsWith("\n")).toBe(true);
    expect(serializePageDocument(JSON.parse(source))).toBe(source);
  });

  it("creates, lists, and reads nested page routes", async () => {
    const contentDirectory = await createTemporaryContentDirectory();
    await writeLocalPageDocument(originalDocument, { contentDirectory });
    const created = await createLocalPageDocument(
      { route: "campaigns/summer-sale", title: "Summer sale" },
      { contentDirectory },
    );

    expect(created.route).toBe("/campaigns/summer-sale");
    expect(
      localPageFilePath("/campaigns/summer-sale", { contentDirectory }),
    ).toBe(path.join(contentDirectory, "campaigns", "summer-sale.json"));
    expect(await listLocalPageDocuments({ contentDirectory })).toEqual([
      {
        route: "/",
        title: originalDocument.title,
        description: originalDocument.description,
      },
      { route: "/campaigns/summer-sale", title: "Summer sale" },
    ]);
    expect(
      await readLocalPageDocument("/campaigns/summer-sale", {
        contentDirectory,
      }),
    ).toEqual(created);
  });

  it("refuses unsafe routes and existing page destinations", async () => {
    const contentDirectory = await createTemporaryContentDirectory();
    await createLocalPageDocument(
      { route: "/campaign", title: "Campaign" },
      { contentDirectory },
    );

    await expect(
      createLocalPageDocument(
        { route: "/campaign", title: "Duplicate" },
        { contentDirectory },
      ),
    ).rejects.toThrow(PageAlreadyExistsError);
    await expect(
      createLocalPageDocument(
        { route: "../outside", title: "Unsafe" },
        { contentDirectory },
      ),
    ).rejects.toThrow(
      "Page paths must use lowercase letters, numbers, and single hyphens.",
    );
    await expect(
      createLocalPageDocument(
        { route: "/untitled", title: "   " },
        { contentDirectory },
      ),
    ).rejects.toThrow(InvalidPageDetailsError);
  });

  it("refuses a document whose stored route does not match its file", async () => {
    const contentDirectory = await createTemporaryContentDirectory();
    const created = await createLocalPageDocument(
      { route: "/campaigns/summer", title: "Summer" },
      { contentDirectory },
    );
    await writeFile(
      localPageFilePath(created.route, { contentDirectory }),
      serializePageDocument({ ...created, route: "/campaigns/winter" }),
      "utf8",
    );

    await expect(
      readLocalPageDocument(created.route, { contentDirectory }),
    ).rejects.toThrow(
      "Page route /campaigns/winter does not match requested route /campaigns/summer.",
    );
  });
});
