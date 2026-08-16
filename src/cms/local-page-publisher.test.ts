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
import type { PageDocument } from "./document-types";
import {
  createLocalPageDocument,
  localPageFilePath,
  writeLocalPageDocument,
} from "./local-page-store";
import {
  HomePageRemovalError,
  LocalPageInUseError,
  removeLocalPage,
} from "./local-page-publisher";
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
    path.join(tmpdir(), "astro-cms-page-remove-"),
  );
  temporaryDirectories.push(projectDirectory);
  const contentDirectory = path.join(projectDirectory, "content", "pages");
  const templateDirectory = path.join(projectDirectory, "content", "templates");
  await Promise.all([
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
  return { projectDirectory, contentDirectory, templateDirectory };
}

function removalOptions(project: Awaited<ReturnType<typeof createGitProject>>) {
  return {
    ...project,
    build: vi.fn(async () => ({ output: "build complete" })),
  };
}

function withButton(
  document: PageDocument,
  id: string,
  href: string,
): PageDocument {
  return {
    ...document,
    content: [
      {
        id: `${id}-section`,
        type: "Section",
        props: { tone: "plain", width: "wide" },
        children: [
          {
            id: `${id}-button`,
            type: "Button",
            props: { label: "Open", href, appearance: "primary" },
          },
        ],
      },
    ],
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("local page removal publishing", () => {
  it("removes an untracked page without building or committing", async () => {
    const project = await createGitProject();
    const options = removalOptions(project);
    await createLocalPageDocument({ route: "/draft", title: "Draft" }, project);

    const result = await removeLocalPage("/draft", options);

    expect(result).toMatchObject({ route: "/draft", tracked: false });
    expect(options.build).not.toHaveBeenCalled();
    await expect(
      access(localPageFilePath("/draft", project)),
    ).rejects.toThrow();
    await expect(
      runGit(["log", "-1", "--pretty=%s"], project.projectDirectory),
    ).resolves.toBe("initial website\n");
  });

  it("builds and commits removal of a tracked page only", async () => {
    const project = await createGitProject();
    const options = removalOptions(project);
    await createLocalPageDocument(
      { route: "/campaigns/summer", title: "Summer" },
      project,
    );
    await runGit(
      ["add", "content/pages/campaigns/summer.json"],
      project.projectDirectory,
    );
    await runGit(["commit", "-m", "publish summer"], project.projectDirectory);
    await writeFile(
      path.join(project.projectDirectory, "unrelated.txt"),
      "keep staged\n",
      "utf8",
    );
    await runGit(["add", "unrelated.txt"], project.projectDirectory);

    const result = await removeLocalPage("/campaigns/summer", options);

    expect(result.tracked).toBe(true);
    expect(result.shortCommit).toHaveLength(7);
    expect(options.build).toHaveBeenCalledOnce();
    await expect(
      runGit(
        ["show", "--pretty=format:", "--name-only", "HEAD"],
        project.projectDirectory,
      ),
    ).resolves.toContain("content/pages/campaigns/summer.json");
    await expect(
      runGit(["diff", "--cached", "--name-only"], project.projectDirectory),
    ).resolves.toContain("unrelated.txt");
  });

  it("never removes the homepage", async () => {
    const project = await createGitProject();

    await expect(removeLocalPage("/", project)).rejects.toBeInstanceOf(
      HomePageRemovalError,
    );
    await expect(
      readFile(localPageFilePath("/", project), "utf8"),
    ).resolves.toContain(initialDocument.title);
  });

  it("refuses a page with an incoming internal link", async () => {
    const project = await createGitProject();
    const options = removalOptions(project);
    await createLocalPageDocument(
      { route: "/target", title: "Target" },
      project,
    );
    const source = await createLocalPageDocument(
      { route: "/source", title: "Source" },
      project,
    );
    await writeLocalPageDocument(
      withButton(source, "source", "/target"),
      project,
    );

    await expect(removeLocalPage("/target", options)).rejects.toBeInstanceOf(
      LocalPageInUseError,
    );
    await expect(
      access(localPageFilePath("/target", project)),
    ).resolves.toBeUndefined();
    expect(options.build).not.toHaveBeenCalled();
  });

  it("restores a tracked page when the production build fails", async () => {
    const project = await createGitProject();
    const page = await createLocalPageDocument(
      { route: "/restore", title: "Restore" },
      project,
    );
    await runGit(
      ["add", "content/pages/restore.json"],
      project.projectDirectory,
    );
    await runGit(["commit", "-m", "publish restore"], project.projectDirectory);

    await expect(
      removeLocalPage("/restore", {
        ...project,
        build: async () => {
          throw new Error("test build failure");
        },
      }),
    ).rejects.toThrow("test build failure");
    await expect(
      readFile(localPageFilePath("/restore", project), "utf8"),
    ).resolves.toContain(page.title);
    await expect(
      runGit(["log", "-1", "--pretty=%s"], project.projectDirectory),
    ).resolves.toBe("publish restore\n");
  });

  it("refuses a page that already has staged changes", async () => {
    const project = await createGitProject();
    await createLocalPageDocument(
      { route: "/staged", title: "Staged" },
      project,
    );
    await runGit(
      ["add", "content/pages/staged.json"],
      project.projectDirectory,
    );

    await expect(removeLocalPage("/staged", project)).rejects.toThrow(
      "already has staged Git changes",
    );
    await expect(
      access(localPageFilePath("/staged", project)),
    ).resolves.toBeUndefined();
  });
});
