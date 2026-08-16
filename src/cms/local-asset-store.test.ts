import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  listLocalImageAssets,
  LocalAssetStoreError,
  resolveLocalUploadedImagePath,
  saveLocalImageUpload,
} from "./local-asset-store";

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

  it("safely stores verified uploads without overwriting an existing image", async () => {
    const publicDirectory = await mkdtemp(
      path.join(tmpdir(), "astro-cms-assets-"),
    );
    temporaryDirectories.push(publicDirectory);
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);

    await expect(
      saveLocalImageUpload(
        { fileName: "Summer Hero.PNG", bytes: png },
        { publicDirectory },
      ),
    ).resolves.toEqual({
      publicPath: "/uploads/summer-hero.png",
      fileName: "summer-hero.png",
      extension: "png",
    });
    await expect(
      saveLocalImageUpload(
        { fileName: "Summer Hero.PNG", bytes: png },
        { publicDirectory },
      ),
    ).resolves.toEqual({
      publicPath: "/uploads/summer-hero-2.png",
      fileName: "summer-hero-2.png",
      extension: "png",
    });
    await expect(
      readFile(path.join(publicDirectory, "uploads", "summer-hero.png")),
    ).resolves.toEqual(Buffer.from(png));
  });

  it("rejects disguised images, SVG uploads, and unsafe paths", async () => {
    const publicDirectory = await mkdtemp(
      path.join(tmpdir(), "astro-cms-assets-"),
    );
    temporaryDirectories.push(publicDirectory);

    await expect(
      saveLocalImageUpload(
        { fileName: "fake.png", bytes: new TextEncoder().encode("not png") },
        { publicDirectory },
      ),
    ).rejects.toThrow(LocalAssetStoreError);
    await expect(
      saveLocalImageUpload(
        { fileName: "active.svg", bytes: new TextEncoder().encode("<svg />") },
        { publicDirectory },
      ),
    ).rejects.toThrow("Upload a PNG, JPEG, GIF, WebP, or AVIF image.");
    expect(() =>
      resolveLocalUploadedImagePath("/uploads/%2e%2e/secret.png", {
        publicDirectory,
      }),
    ).toThrow(LocalAssetStoreError);
  });
});
