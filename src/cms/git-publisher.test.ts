import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import homeDocumentJson from "../../content/pages/home.json";
import { requireNodeByType } from "./document-test-helpers";
import {
  GitPublishingError,
  NoPageChangesError,
  publishGitProject,
  reviewLocalPageDocument,
  StalePageRevisionError,
} from "./git-publisher";
import {
  createLocalPageDocument,
  readLocalPageSnapshot,
  writeLocalPageDocument,
} from "./local-page-store";
import { assertPageDocument } from "./validation";

const temporaryDirectories: string[] = [];
const initialDocument = assertPageDocument(homeDocumentJson);

async function runGit(args: string[], directory: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: directory,
      shell: false,
      windowsHide: true,
    });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      error += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(error || `git exited with ${code}`));
    });
  });
}

async function createGitProject() {
  const projectDirectory = await mkdtemp(
    path.join(tmpdir(), "astro-cms-git-publish-"),
  );
  temporaryDirectories.push(projectDirectory);
  const contentDirectory = path.join(projectDirectory, "content", "pages");
  await mkdir(contentDirectory, { recursive: true });
  await writeLocalPageDocument(initialDocument, { contentDirectory });
  await runGit(["init"], projectDirectory);
  await runGit(["config", "user.name", "Astro-CMS Test"], projectDirectory);
  await runGit(
    ["config", "user.email", "astro-cms@example.invalid"],
    projectDirectory,
  );
  await runGit(["add", "content/pages/home.json"], projectDirectory);
  await runGit(["commit", "-m", "initial website"], projectDirectory);
  return { projectDirectory, contentDirectory };
}

function changedHeading(text: string) {
  const document = structuredClone(initialDocument);
  requireNodeByType(document, "Heading").props.text = text;
  return document;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Git-oriented publishing", () => {
  it("reviews a semantic change and commits only the page file", async () => {
    const { projectDirectory, contentDirectory } = await createGitProject();
    const document = changedHeading("Reviewed and committed");
    await writeFile(
      path.join(projectDirectory, "unrelated.txt"),
      "keep this staged\n",
      "utf8",
    );
    await runGit(["add", "unrelated.txt"], projectDirectory);
    await writeLocalPageDocument(document, { contentDirectory });

    const review = await reviewLocalPageDocument(document, {
      projectDirectory,
      contentDirectory,
    });

    expect(review.hasChanges).toBe(true);
    expect(review.filePath).toBe("content/pages/home.json");
    expect(review.changes).toContainEqual({
      kind: "changed",
      summary:
        "Changed Heading text from “Build campaigns without breaking the site” to “Reviewed and committed”.",
    });
    expect(review.diff).toContain(
      '+                "text": "Reviewed and committed"',
    );

    const build = vi.fn(async () => ({ output: "build complete" }));
    const result = await publishGitProject(document, review.baseRevision, {
      projectDirectory,
      contentDirectory,
      build,
    });

    expect(build).toHaveBeenCalledOnce();
    expect(result.shortCommit).toHaveLength(7);
    expect(
      await runGit(
        ["show", "--pretty=format:", "--name-only", "HEAD"],
        projectDirectory,
      ),
    ).toContain("content/pages/home.json");
    expect(
      await runGit(["diff", "--cached", "--name-only"], projectDirectory),
    ).toContain("unrelated.txt");
    expect(
      await runGit(["show", "HEAD:content/pages/home.json"], projectDirectory),
    ).toContain("Reviewed and committed");
  });

  it("reviews and publishes a newly created nested page", async () => {
    const { projectDirectory, contentDirectory } = await createGitProject();
    const document = await createLocalPageDocument(
      { route: "/campaigns/summer-sale", title: "Summer sale" },
      { contentDirectory },
    );
    const review = await reviewLocalPageDocument(document, {
      projectDirectory,
      contentDirectory,
    });

    expect(review.hasChanges).toBe(true);
    expect(review.filePath).toBe("content/pages/campaigns/summer-sale.json");
    expect(review.changes).toEqual([
      {
        kind: "added",
        summary: "Added page “Summer sale” at /campaigns/summer-sale.",
      },
    ]);

    const result = await publishGitProject(document, review.baseRevision, {
      projectDirectory,
      contentDirectory,
      build: async () => ({ output: "build complete" }),
    });

    expect(result.filePath).toBe("content/pages/campaigns/summer-sale.json");
    await expect(
      runGit(
        ["show", "HEAD:content/pages/campaigns/summer-sale.json"],
        projectDirectory,
      ),
    ).resolves.toContain('"route": "/campaigns/summer-sale"');
    await expect(
      runGit(["log", "-1", "--pretty=%s"], projectDirectory),
    ).resolves.toBe("content: publish /campaigns/summer-sale\n");
  });

  it("rejects a stale review before building or writing", async () => {
    const { projectDirectory, contentDirectory } = await createGitProject();
    const reviewedDocument = changedHeading("Reviewed version");
    const review = await reviewLocalPageDocument(reviewedDocument, {
      projectDirectory,
      contentDirectory,
    });
    const newerDocument = changedHeading("Newer saved version");
    await writeLocalPageDocument(newerDocument, { contentDirectory });
    const build = vi.fn(async () => ({ output: "should not build" }));

    await expect(
      publishGitProject(reviewedDocument, review.baseRevision, {
        projectDirectory,
        contentDirectory,
        build,
      }),
    ).rejects.toThrow(StalePageRevisionError);
    expect(build).not.toHaveBeenCalled();
    expect(
      (await readLocalPageSnapshot("/", { contentDirectory })).document,
    ).toEqual(newerDocument);
  });

  it("restores the saved page when the production build fails", async () => {
    const { projectDirectory, contentDirectory } = await createGitProject();
    const document = changedHeading("Build should fail");
    const before = await readFile(
      path.join(contentDirectory, "home.json"),
      "utf8",
    );
    const review = await reviewLocalPageDocument(document, {
      projectDirectory,
      contentDirectory,
    });

    await expect(
      publishGitProject(document, review.baseRevision, {
        projectDirectory,
        contentDirectory,
        build: async () => {
          throw new Error("test build failure");
        },
      }),
    ).rejects.toThrow("test build failure");
    await expect(
      readFile(path.join(contentDirectory, "home.json"), "utf8"),
    ).resolves.toBe(before);
    await expect(
      runGit(["log", "-1", "--pretty=%s"], projectDirectory),
    ).resolves.toBe("initial website\n");
  });

  it("refuses to publish over staged changes to the page", async () => {
    const { projectDirectory, contentDirectory } = await createGitProject();
    await writeLocalPageDocument(changedHeading("Already staged"), {
      contentDirectory,
    });
    await runGit(["add", "content/pages/home.json"], projectDirectory);

    await expect(
      reviewLocalPageDocument(changedHeading("Editor version"), {
        projectDirectory,
        contentDirectory,
      }),
    ).rejects.toThrow(GitPublishingError);
  });

  it("does not create another commit when nothing changed", async () => {
    const { projectDirectory, contentDirectory } = await createGitProject();
    const review = await reviewLocalPageDocument(initialDocument, {
      projectDirectory,
      contentDirectory,
    });
    expect(review.hasChanges).toBe(false);

    await expect(
      publishGitProject(initialDocument, review.baseRevision, {
        projectDirectory,
        contentDirectory,
        build: async () => ({ output: "should not build" }),
      }),
    ).rejects.toThrow(NoPageChangesError);
  });
});
