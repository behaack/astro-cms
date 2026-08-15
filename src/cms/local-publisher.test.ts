import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import homeDocumentJson from "../../content/pages/home.json";
import { publishLocalProject } from "./local-publisher";
import { assertPageDocument } from "./validation";

const temporaryDirectories: string[] = [];

async function createTemporaryContentDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "astro-cms-publish-"));
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

describe("local publishing", () => {
  it("writes the validated page before producing an Astro build", async () => {
    const contentDirectory = await createTemporaryContentDirectory();
    const document = assertPageDocument(homeDocumentJson);
    const build = vi.fn(async () => {
      const writtenDocument = JSON.parse(
        await readFile(path.join(contentDirectory, "home.json"), "utf8"),
      );
      expect(writtenDocument.route).toBe("/");
      expect(writtenDocument.schemaVersion).toBe(1);
      return { output: "build complete" };
    });

    const result = await publishLocalProject(document, {
      contentDirectory,
      build,
    });

    expect(build).toHaveBeenCalledOnce();
    expect(result.document).toEqual(document);
    expect(result.build.output).toBe("build complete");
  });

  it("does not run the build for an invalid document", async () => {
    const contentDirectory = await createTemporaryContentDirectory();
    const build = vi.fn(async () => ({ output: "should not run" }));

    await expect(
      publishLocalProject(
        {
          ...structuredClone(homeDocumentJson),
          content: [
            { id: "invalid-root", type: "Text", props: { text: "No" } },
          ],
        },
        { contentDirectory, build },
      ),
    ).rejects.toThrow("Text is not allowed at the page root.");
    expect(build).not.toHaveBeenCalled();
  });
});
