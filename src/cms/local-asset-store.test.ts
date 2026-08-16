import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listLocalImageAssets } from "./local-asset-store";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("local image asset store", () => {
  it("lists nested public images while excluding unrelated and hidden files", async () => {
    const publicDirectory = await mkdtemp(
      path.join(tmpdir(), "astro-cms-assets-"),
    );
    temporaryDirectories.push(publicDirectory);
    await mkdir(path.join(publicDirectory, "campaigns"), { recursive: true });
    await mkdir(path.join(publicDirectory, ".private"), { recursive: true });
    await Promise.all([
      writeFile(path.join(publicDirectory, "logo.svg"), "<svg />", "utf8"),
      writeFile(
        path.join(publicDirectory, "campaigns", "Hero Shot.WEBP"),
        "image",
        "utf8",
      ),
      writeFile(path.join(publicDirectory, "notes.txt"), "ignore", "utf8"),
      writeFile(
        path.join(publicDirectory, ".private", "hidden.png"),
        "ignore",
        "utf8",
      ),
    ]);

    await expect(listLocalImageAssets({ publicDirectory })).resolves.toEqual([
      {
        publicPath: "/campaigns/Hero%20Shot.WEBP",
        fileName: "Hero Shot.WEBP",
        extension: "webp",
      },
      {
        publicPath: "/logo.svg",
        fileName: "logo.svg",
        extension: "svg",
      },
    ]);
  });

  it("returns an empty library when the public directory does not exist", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "astro-cms-assets-"));
    temporaryDirectories.push(parent);

    await expect(
      listLocalImageAssets({ publicDirectory: path.join(parent, "missing") }),
    ).resolves.toEqual([]);
  });
});
