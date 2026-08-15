import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import homeDocumentJson from "../../content/pages/home.json";
import { requireNodeByType } from "./document-test-helpers";
import {
  readLocalPageDocument,
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

  it("rejects routes that are not explicitly mapped to project files", async () => {
    const contentDirectory = await createTemporaryContentDirectory();
    const unsupportedDocument = {
      ...structuredClone(originalDocument),
      route: "/unregistered",
    };

    await expect(
      writeLocalPageDocument(unsupportedDocument, { contentDirectory }),
    ).rejects.toThrow(
      "No local page file is registered for route /unregistered.",
    );
  });
});
