import { spawn } from "node:child_process";
import { lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  normalizePageRoute,
  readLocalPageSnapshot,
  type LocalPageStoreOptions,
} from "./local-page-store";
import {
  findLocalPageRouteUsages,
  type LocalPageRouteUsage,
  type LocalPageUsageOptions,
} from "./local-page-usage";
import { buildAstroProject, type LocalBuildResult } from "./local-publisher";

const MAX_GIT_OUTPUT = 128 * 1024;

interface GitCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface LocalPageRemovalOptions
  extends LocalPageStoreOptions, LocalPageUsageOptions {
  projectDirectory?: string;
  build?: () => Promise<LocalBuildResult>;
}

export interface LocalPageRemovalResult {
  route: string;
  filePath: string;
  tracked: boolean;
  title: string;
  commit?: string;
  shortCommit?: string;
  build?: LocalBuildResult;
}

export class LocalPageRemovalError extends Error {}
export class HomePageRemovalError extends LocalPageRemovalError {}

export class LocalPageInUseError extends LocalPageRemovalError {
  constructor(
    message: string,
    public readonly usages: LocalPageRouteUsage[],
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
        new LocalPageRemovalError(
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
): LocalPageRemovalError {
  const detail = result.stderr.trim() || result.stdout.trim();
  return new LocalPageRemovalError(detail ? `${fallback} ${detail}` : fallback);
}

function isWithinDirectory(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function usageDescription(usages: LocalPageRouteUsage[]): string {
  return usages
    .map((usage) =>
      usage.kind === "template"
        ? `template “${usage.label}”`
        : `page “${usage.label}”`,
    )
    .join(", ");
}

async function fileStillMissing(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}

export async function removeLocalPage(
  routeInput: string,
  options: LocalPageRemovalOptions = {},
): Promise<LocalPageRemovalResult> {
  const route = normalizePageRoute(routeInput);
  if (route === "/") {
    throw new HomePageRemovalError(
      "The homepage cannot be deleted. Create or choose another homepage policy first.",
    );
  }
  const snapshot = await readLocalPageSnapshot(route, options);
  const usages = await findLocalPageRouteUsages(route, options);
  if (usages.length > 0) {
    throw new LocalPageInUseError(
      `This page is still linked from ${usageDescription(usages)}. Update those destinations first.`,
      usages,
    );
  }

  const fileInfo = await lstat(snapshot.filePath);
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) {
    throw new LocalPageRemovalError(
      "The page document must be a regular file, not a link.",
    );
  }
  const projectDirectory = path.resolve(
    options.projectDirectory ?? process.cwd(),
  );
  const rootResult = await runGit(
    ["rev-parse", "--show-toplevel"],
    projectDirectory,
  );
  if (rootResult.code !== 0) {
    throw new LocalPageRemovalError(
      "This project is not in a Git repository. Create an initial commit before managing pages.",
    );
  }
  const repositoryRoot = path.resolve(rootResult.stdout.trim());
  const realFilePath = await realpath(snapshot.filePath);
  if (
    !isWithinDirectory(repositoryRoot, path.resolve(snapshot.filePath)) ||
    !isWithinDirectory(repositoryRoot, realFilePath)
  ) {
    throw new LocalPageRemovalError(
      "The page document is outside this project's Git repository.",
    );
  }
  const relativeFilePath = path
    .relative(repositoryRoot, snapshot.filePath)
    .replaceAll("\\", "/");

  const headResult = await runGit(
    ["rev-parse", "--verify", "HEAD"],
    repositoryRoot,
  );
  if (headResult.code !== 0) {
    throw new LocalPageRemovalError(
      "This repository has no initial commit. Commit the website once before managing pages.",
    );
  }
  const stagedResult = await runGit(
    ["diff", "--cached", "--quiet", "--", relativeFilePath],
    repositoryRoot,
  );
  if (stagedResult.code === 1) {
    throw new LocalPageRemovalError(
      "This page already has staged Git changes. Commit or unstage them before deleting it from Astro-CMS.",
    );
  }
  if (stagedResult.code !== 0) {
    throw gitFailure(stagedResult, "Git could not inspect the page document.");
  }
  const trackedResult = await runGit(
    ["ls-files", "--error-unmatch", "--", relativeFilePath],
    repositoryRoot,
  );
  if (trackedResult.code !== 0 && trackedResult.code !== 1) {
    throw gitFailure(trackedResult, "Git could not inspect the page document.");
  }
  const tracked = trackedResult.code === 0;
  if ((await readFile(snapshot.filePath, "utf8")) !== snapshot.source) {
    throw new LocalPageRemovalError(
      "The page changed while its removal was being checked. Try again.",
    );
  }
  if (!tracked) {
    await unlink(snapshot.filePath);
    return {
      route,
      filePath: relativeFilePath,
      tracked: false,
      title: snapshot.document.title,
    };
  }

  let removed = false;
  let committed = false;
  try {
    await unlink(snapshot.filePath);
    removed = true;
    const build = await (
      options.build ?? (() => buildAstroProject(projectDirectory))
    )();
    const latestUsages = await findLocalPageRouteUsages(route, options);
    if (latestUsages.length > 0) {
      throw new LocalPageInUseError(
        `This page became linked from ${usageDescription(latestUsages)} while its removal was being checked. The page was restored.`,
        latestUsages,
      );
    }
    if (!(await fileStillMissing(snapshot.filePath))) {
      throw new LocalPageRemovalError(
        "The page was recreated while its removal was being checked, so it was not committed as deleted.",
      );
    }
    const commitResult = await runGit(
      [
        "commit",
        "--only",
        "-m",
        `content: remove ${route}`,
        "--",
        relativeFilePath,
      ],
      repositoryRoot,
    );
    if (commitResult.code !== 0) {
      throw gitFailure(commitResult, "Git could not commit the page removal.");
    }
    committed = true;
    const newHeadResult = await runGit(["rev-parse", "HEAD"], repositoryRoot);
    if (newHeadResult.code !== 0) {
      throw gitFailure(newHeadResult, "Git could not read the new commit.");
    }
    const commit = newHeadResult.stdout.trim();
    return {
      route,
      filePath: relativeFilePath,
      tracked: true,
      title: snapshot.document.title,
      commit,
      shortCommit: commit.slice(0, 7),
      build,
    };
  } catch (error) {
    if (removed && !committed) {
      try {
        await writeFile(snapshot.filePath, snapshot.source, {
          encoding: "utf8",
          flag: "wx",
        });
      } catch (restoreError) {
        if ((restoreError as NodeJS.ErrnoException).code === "EEXIST") {
          throw new LocalPageRemovalError(
            "Page removal was cancelled because the page was recreated. The newer file was left untouched.",
          );
        }
        throw new LocalPageRemovalError(
          `Page removal failed and the original file could not be restored: ${restoreError instanceof Error ? restoreError.message : "unknown restore error"}`,
        );
      }
    }
    throw error;
  }
}
