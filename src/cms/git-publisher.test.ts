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
import { saveLocalImageUpload } from "./local-asset-store";
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
  const publicDirectory = path.join(projectDirectory, "public");
  await mkdir(contentDirectory, { recursive: true });
  await mkdir(publicDirectory, { recursive: true });
  await writeLocalPageDocument(initialDocument, { contentDirectory });
  await runGit(["init"], projectDirectory);
  await runGit(["config", "user.name", "Astro-CMS Test"], projectDirectory);
  await runGit(
    ["config", "user.email", "astro-cms@example.invalid"],
    projectDirectory,
  );
  await runGit(["add", "content/pages/home.json"], projectDirectory);
  await runGit(["commit", "-m", "initial website"], projectDirectory);
  return { projectDirectory, contentDirectory, publicDirectory };
}

function changedHeading(text: string) {
  const document = structuredClone(initialDocument);
  requireNodeByType(document, "Heading").props.text = text;
  return document;
}

const validPng = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

function documentWithImage(publicPath: string) {
  const document = changedHeading("Campaign with uploaded image");
  const stack = requireNodeByType(document, "Stack");
  stack.children ??= [];
  stack.children.push({
    id: "uploaded-image",
    type: "Image",
    props: {
      src: publicPath,
      alt: "Campaign hero",
      aspect: "landscape",
    },
  });
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

  it("reviews and commits a referenced uploaded image with the page", async () => {
    const { projectDirectory, contentDirectory, publicDirectory } =
      await createGitProject();
    const asset = await saveLocalImageUpload(
      { fileName: "Campaign Hero.png", bytes: validPng },
      { publicDirectory },
    );
    const document = documentWithImage(asset.publicPath);
    await writeFile(
      path.join(projectDirectory, "unrelated.txt"),
      "keep this staged\n",
      "utf8",
    );
    await runGit(["add", "unrelated.txt"], projectDirectory);

    const review = await reviewLocalPageDocument(document, {
      projectDirectory,
      contentDirectory,
      publicDirectory,
    });

    expect(review.assetFiles).toEqual(["public/uploads/campaign-hero.png"]);
    expect(review.changes).toContainEqual({
      kind: "asset",
      summary: "Added uploaded image /uploads/campaign-hero.png.",
    });

    const result = await publishGitProject(document, review.baseRevision, {
      projectDirectory,
      contentDirectory,
      publicDirectory,
      build: async () => ({ output: "build complete" }),
    });

    expect(result.assetFiles).toEqual(["public/uploads/campaign-hero.png"]);
    const committedFiles = await runGit(
      ["show", "--pretty=format:", "--name-only", "HEAD"],
      projectDirectory,
    );
    expect(committedFiles).toContain("content/pages/home.json");
    expect(committedFiles).toContain("public/uploads/campaign-hero.png");
    expect(
      await runGit(["diff", "--cached", "--name-only"], projectDirectory),
    ).toContain("unrelated.txt");
  });

  it("rejects a missing image referenced from the upload directory", async () => {
    const { projectDirectory, contentDirectory, publicDirectory } =
      await createGitProject();

    await expect(
      reviewLocalPageDocument(documentWithImage("/uploads/missing.png"), {
        projectDirectory,
        contentDirectory,
        publicDirectory,
      }),
    ).rejects.toThrow("Uploaded image /uploads/missing.png is missing.");
  });

  it("rejects publication when an uploaded image changes after review", async () => {
    const { projectDirectory, contentDirectory, publicDirectory } =
      await createGitProject();
    const asset = await saveLocalImageUpload(
      { fileName: "Campaign Hero.png", bytes: validPng },
      { publicDirectory },
    );
    const document = documentWithImage(asset.publicPath);
    const review = await reviewLocalPageDocument(document, {
      projectDirectory,
      contentDirectory,
      publicDirectory,
    });
    await writeFile(
      path.join(publicDirectory, "uploads", "campaign-hero.png"),
      new Uint8Array([...validPng, 0x01]),
    );

    await expect(
      publishGitProject(document, review.baseRevision, {
        projectDirectory,
        contentDirectory,
        publicDirectory,
        build: async () => ({ output: "should not build" }),
      }),
    ).rejects.toThrow(StalePageRevisionError);
  });

  it("refuses to publish an uploaded image that was already staged", async () => {
    const { projectDirectory, contentDirectory, publicDirectory } =
      await createGitProject();
    const asset = await saveLocalImageUpload(
      { fileName: "Campaign Hero.png", bytes: validPng },
      { publicDirectory },
    );
    await runGit(["add", "public/uploads/campaign-hero.png"], projectDirectory);

    await expect(
      reviewLocalPageDocument(documentWithImage(asset.publicPath), {
        projectDirectory,
        contentDirectory,
        publicDirectory,
      }),
    ).rejects.toThrow("already has staged Git changes");
  });
});
