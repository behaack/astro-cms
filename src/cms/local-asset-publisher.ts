import { spawn } from "node:child_process";
import { lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PageDocument } from "./document-types";
import {
  LocalAssetStoreError,
  resolveLocalUploadedImagePath,
} from "./local-asset-store";
import {
  findLocalImageUsages,
  type LocalAssetUsageOptions,
  type LocalImageUsage,
} from "./local-asset-usage";
import { buildAstroProject, type LocalBuildResult } from "./local-publisher";
import { assertPageDocument } from "./validation";

const MAX_GIT_OUTPUT = 128 * 1024;

interface GitCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface LocalAssetRemovalOptions extends LocalAssetUsageOptions {
  projectDirectory?: string;
  build?: () => Promise<LocalBuildResult>;
}

export interface LocalAssetRemovalResult {
  publicPath: string;
  filePath: string;
  tracked: boolean;
  commit?: string;
  shortCommit?: string;
  build?: LocalBuildResult;
}

export class LocalAssetRemovalError extends Error {}

export class LocalAssetInUseError extends LocalAssetRemovalError {
  constructor(
    message: string,
    public readonly usages: LocalImageUsage[],
  ) {
    super(message);
  }
}

async function runGit(
  args: string[],
  workingDirectory: string,
): Promise<GitCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: workingDirectory,
      env: { ...process.env, NO_COLOR: "1" },
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const capture = (current: string, chunk: Buffer): string =>
      `${current}${chunk.toString("utf8")}`.slice(-MAX_GIT_OUTPUT);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = capture(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = capture(stderr, chunk);
    });
    child.on("error", (error) => {
      reject(
        new LocalAssetRemovalError(
          error.message.includes("ENOENT")
            ? "Git is not installed or is not available to Astro-CMS."
            : `Git could not start: ${error.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

function gitFailure(
  result: GitCommandResult,
  fallback: string,
): LocalAssetRemovalError {
  const detail = result.stderr.trim() || result.stdout.trim();
  return new LocalAssetRemovalError(
    detail ? `${fallback} ${detail}` : fallback,
  );
}

function isWithinDirectory(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function usageDescription(usages: LocalImageUsage[]): string {
  return usages
    .map((usage) =>
      usage.kind === "template"
        ? `template “${usage.label}”`
        : `page “${usage.label}”`,
    )
    .join(", ");
}

export async function removeUnusedLocalImageAsset(
  publicPath: string,
  draftInput?: unknown,
  options: LocalAssetRemovalOptions = {},
): Promise<LocalAssetRemovalResult> {
  const draft: PageDocument | undefined =
    draftInput === undefined ? undefined : assertPageDocument(draftInput);
  const usages = await findLocalImageUsages(publicPath, options, draft);
  if (usages.length > 0) {
    throw new LocalAssetInUseError(
      `This image is still used by ${usageDescription(usages)}. Remove those references first.`,
      usages,
    );
  }

  let filePath: string | undefined;
  try {
    filePath = resolveLocalUploadedImagePath(publicPath, options);
  } catch (error) {
    if (error instanceof LocalAssetStoreError) {
      throw new LocalAssetRemovalError(error.message);
    }
    throw error;
  }
  if (!filePath) {
    throw new LocalAssetRemovalError(
      "Only images uploaded through Astro-CMS can be removed here.",
    );
  }

  let bytes: Buffer;
  try {
    const fileInfo = await lstat(filePath);
    if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) {
      throw new LocalAssetRemovalError(
        "The uploaded image must be a regular file, not a link.",
      );
    }
    bytes = await readFile(filePath);
  } catch (error) {
    if (error instanceof LocalAssetRemovalError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new LocalAssetRemovalError("The uploaded image no longer exists.");
    }
    throw error;
  }

  const projectDirectory = path.resolve(
    options.projectDirectory ?? process.cwd(),
  );
  const rootResult = await runGit(
    ["rev-parse", "--show-toplevel"],
    projectDirectory,
  );
  if (rootResult.code !== 0) {
    throw new LocalAssetRemovalError(
      "This project is not in a Git repository. Create an initial commit before managing published images.",
    );
  }
  const repositoryRoot = path.resolve(rootResult.stdout.trim());
  const realFilePath = await realpath(filePath);
  if (
    !isWithinDirectory(repositoryRoot, path.resolve(filePath)) ||
    !isWithinDirectory(repositoryRoot, realFilePath)
  ) {
    throw new LocalAssetRemovalError(
      "The uploaded image is outside this project's Git repository.",
    );
  }
  const relativeFilePath = path
    .relative(repositoryRoot, filePath)
    .replaceAll("\\", "/");

  const headResult = await runGit(
    ["rev-parse", "--verify", "HEAD"],
    repositoryRoot,
  );
  if (headResult.code !== 0) {
    throw new LocalAssetRemovalError(
      "This repository has no initial commit. Commit the website once before managing published images.",
    );
  }
  const stagedResult = await runGit(
    ["diff", "--cached", "--quiet", "--", relativeFilePath],
    repositoryRoot,
  );
  if (stagedResult.code === 1) {
    throw new LocalAssetRemovalError(
      "This image already has staged Git changes. Commit or unstage them before removing it from Astro-CMS.",
    );
  }
  if (stagedResult.code !== 0) {
    throw gitFailure(stagedResult, "Git could not inspect the uploaded image.");
  }

  const trackedResult = await runGit(
    ["ls-files", "--error-unmatch", "--", relativeFilePath],
    repositoryRoot,
  );
  if (trackedResult.code !== 0 && trackedResult.code !== 1) {
    throw gitFailure(
      trackedResult,
      "Git could not inspect the uploaded image.",
    );
  }
  const tracked = trackedResult.code === 0;
  if (!tracked) {
    await unlink(filePath);
    return { publicPath, filePath: relativeFilePath, tracked: false };
  }

  const modifiedResult = await runGit(
    ["diff", "--quiet", "--", relativeFilePath],
    repositoryRoot,
  );
  if (modifiedResult.code === 1) {
    throw new LocalAssetRemovalError(
      "This image has unpublished file changes. Commit or restore them before removing it from Astro-CMS.",
    );
  }
  if (modifiedResult.code !== 0) {
    throw gitFailure(
      modifiedResult,
      "Git could not inspect the uploaded image.",
    );
  }

  let removed = false;
  let committed = false;
  try {
    await unlink(filePath);
    removed = true;
    const build = await (
      options.build ?? (() => buildAstroProject(projectDirectory))
    )();
    const latestUsages = await findLocalImageUsages(publicPath, options, draft);
    if (latestUsages.length > 0) {
      throw new LocalAssetInUseError(
        `This image became used by ${usageDescription(latestUsages)} while its removal was being checked. The image was restored.`,
        latestUsages,
      );
    }
    const commitResult = await runGit(
      [
        "commit",
        "--only",
        "-m",
        `content: remove ${publicPath}`,
        "--",
        relativeFilePath,
      ],
      repositoryRoot,
    );
    if (commitResult.code !== 0) {
      throw gitFailure(commitResult, "Git could not commit the image removal.");
    }
    committed = true;
    const newHeadResult = await runGit(["rev-parse", "HEAD"], repositoryRoot);
    if (newHeadResult.code !== 0) {
      throw gitFailure(newHeadResult, "Git could not read the new commit.");
    }
    const commit = newHeadResult.stdout.trim();
    return {
      publicPath,
      filePath: relativeFilePath,
      tracked: true,
      commit,
      shortCommit: commit.slice(0, 7),
      build,
    };
  } catch (error) {
    if (removed && !committed) {
      try {
        await writeFile(filePath, bytes, { flag: "wx" });
      } catch (restoreError) {
        throw new LocalAssetRemovalError(
          `Image removal failed and the original file could not be restored: ${restoreError instanceof Error ? restoreError.message : "unknown restore error"}`,
        );
      }
    }
    throw error;
  }
}
