import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import homeDocumentJson from "../../content/pages/home.json";
import { requireNodeByType } from "./document-test-helpers";
import {
  LocalAssetInUseError,
  removeUnusedLocalImageAsset,
} from "./local-asset-publisher";
import { saveLocalImageUpload } from "./local-asset-store";
import { writeLocalPageDocument } from "./local-page-store";
import { assertPageDocument } from "./validation";

const temporaryDirectories: string[] = [];
const initialDocument = assertPageDocument(homeDocumentJson);
const validPng = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

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
    path.join(tmpdir(), "astro-cms-asset-remove-"),
  );
  temporaryDirectories.push(projectDirectory);
  const publicDirectory = path.join(projectDirectory, "public");
  const contentDirectory = path.join(projectDirectory, "content", "pages");
  const templateDirectory = path.join(projectDirectory, "content", "templates");
  await Promise.all([
    mkdir(publicDirectory, { recursive: true }),
    mkdir(contentDirectory, { recursive: true }),
    mkdir(templateDirectory, { recursive: true }),
  ]);
  await writeLocalPageDocument(initialDocument, { contentDirectory });
  await runGit(["init"], projectDirectory);
  await runGit(["config", "user.name", "Astro-CMS Test"], projectDirectory);
  await runGit(
    ["config", "user.email", "astro-cms@example.invalid"],
    projectDirectory,
  );
  await runGit(["add", "content/pages/home.json"], projectDirectory);
  await runGit(["commit", "-m", "initial website"], projectDirectory);
  return {
    projectDirectory,
    publicDirectory,
    contentDirectory,
    templateDirectory,
  };
}

function removalOptions(project: Awaited<ReturnType<typeof createGitProject>>) {
  return {
    ...project,
    build: vi.fn(async () => ({ output: "build complete" })),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("local image removal publishing", () => {
  it("removes an untracked orphan without building or committing", async () => {
    const project = await createGitProject();
    const options = removalOptions(project);
    const asset = await saveLocalImageUpload(
      { fileName: "Orphan.png", bytes: validPng },
      project,
    );

    const result = await removeUnusedLocalImageAsset(
      asset.publicPath,
      initialDocument,
      options,
    );

    expect(result).toMatchObject({
      tracked: false,
      publicPath: asset.publicPath,
    });
    expect(options.build).not.toHaveBeenCalled();
    await expect(
      access(path.join(project.publicDirectory, "uploads", "orphan.png")),
    ).rejects.toThrow();
    await expect(
      runGit(["log", "-1", "--pretty=%s"], project.projectDirectory),
    ).resolves.toBe("initial website\n");
  });

  it("builds and commits removal of an unused tracked upload only", async () => {
    const project = await createGitProject();
    const options = removalOptions(project);
    const asset = await saveLocalImageUpload(
      { fileName: "Published.png", bytes: validPng },
      project,
    );
    await runGit(
      ["add", "public/uploads/published.png"],
      project.projectDirectory,
    );
    await runGit(["commit", "-m", "publish image"], project.projectDirectory);
    await writeFile(
      path.join(project.projectDirectory, "unrelated.txt"),
      "keep staged\n",
      "utf8",
    );
    await runGit(["add", "unrelated.txt"], project.projectDirectory);

    const result = await removeUnusedLocalImageAsset(
      asset.publicPath,
      initialDocument,
      options,
    );

    expect(result.tracked).toBe(true);
    expect(result.shortCommit).toHaveLength(7);
    expect(options.build).toHaveBeenCalledOnce();
    await expect(
      runGit(
        ["show", "--pretty=format:", "--name-only", "HEAD"],
        project.projectDirectory,
      ),
    ).resolves.toContain("public/uploads/published.png");
    await expect(
      runGit(["diff", "--cached", "--name-only"], project.projectDirectory),
    ).resolves.toContain("unrelated.txt");
  });

  it("refuses an image referenced by the active unsaved page", async () => {
    const project = await createGitProject();
    const options = removalOptions(project);
    const asset = await saveLocalImageUpload(
      { fileName: "Active.png", bytes: validPng },
      project,
    );
    const draft = structuredClone(initialDocument);
    const stack = requireNodeByType(draft, "Stack");
    stack.children ??= [];
    stack.children.push({
      id: "active-image",
      type: "Image",
      props: { src: asset.publicPath, alt: "Active", aspect: "landscape" },
    });

    await expect(
      removeUnusedLocalImageAsset(asset.publicPath, draft, options),
    ).rejects.toBeInstanceOf(LocalAssetInUseError);
    await expect(
      readFile(path.join(project.publicDirectory, "uploads", "active.png")),
    ).resolves.toEqual(Buffer.from(validPng));
    expect(options.build).not.toHaveBeenCalled();
  });

  it("still refuses an image referenced by the saved page when the draft removes it", async () => {
    const project = await createGitProject();
    const options = removalOptions(project);
    const asset = await saveLocalImageUpload(
      { fileName: "Saved.png", bytes: validPng },
      project,
    );
    const savedPage = structuredClone(initialDocument);
    const stack = requireNodeByType(savedPage, "Stack");
    stack.children ??= [];
    stack.children.push({
      id: "saved-image",
      type: "Image",
      props: { src: asset.publicPath, alt: "Saved", aspect: "landscape" },
    });
    await writeLocalPageDocument(savedPage, project);

    await expect(
      removeUnusedLocalImageAsset(asset.publicPath, initialDocument, options),
    ).rejects.toBeInstanceOf(LocalAssetInUseError);
    await expect(
      readFile(path.join(project.publicDirectory, "uploads", "saved.png")),
    ).resolves.toEqual(Buffer.from(validPng));
    expect(options.build).not.toHaveBeenCalled();
  });

  it("restores a tracked image when the production build fails", async () => {
    const project = await createGitProject();
    const asset = await saveLocalImageUpload(
      { fileName: "Restore.png", bytes: validPng },
      project,
    );
    await runGit(
      ["add", "public/uploads/restore.png"],
      project.projectDirectory,
    );
    await runGit(["commit", "-m", "publish image"], project.projectDirectory);

    await expect(
      removeUnusedLocalImageAsset(asset.publicPath, initialDocument, {
        ...project,
        build: async () => {
          throw new Error("test build failure");
        },
      }),
    ).rejects.toThrow("test build failure");
    await expect(
      readFile(path.join(project.publicDirectory, "uploads", "restore.png")),
    ).resolves.toEqual(Buffer.from(validPng));
    await expect(
      runGit(["log", "-1", "--pretty=%s"], project.projectDirectory),
    ).resolves.toBe("publish image\n");
  });

  it("restores a tracked image when it becomes referenced during the build", async () => {
    const project = await createGitProject();
    const asset = await saveLocalImageUpload(
      { fileName: "Race.png", bytes: validPng },
      project,
    );
    await runGit(["add", "public/uploads/race.png"], project.projectDirectory);
    await runGit(["commit", "-m", "publish image"], project.projectDirectory);

    await expect(
      removeUnusedLocalImageAsset(asset.publicPath, initialDocument, {
        ...project,
        build: async () => {
          const newlySavedPage = structuredClone(initialDocument);
          const stack = requireNodeByType(newlySavedPage, "Stack");
          stack.children ??= [];
          stack.children.push({
            id: "race-image",
            type: "Image",
            props: {
              src: asset.publicPath,
              alt: "Race",
              aspect: "landscape",
            },
          });
          await writeLocalPageDocument(newlySavedPage, project);
          return { output: "build complete" };
        },
      }),
    ).rejects.toBeInstanceOf(LocalAssetInUseError);
    await expect(
      readFile(path.join(project.publicDirectory, "uploads", "race.png")),
    ).resolves.toEqual(Buffer.from(validPng));
    await expect(
      runGit(["log", "-1", "--pretty=%s"], project.projectDirectory),
    ).resolves.toBe("publish image\n");
  });
});
