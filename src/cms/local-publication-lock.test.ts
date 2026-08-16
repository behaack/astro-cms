import { describe, expect, it } from "vitest";

import {
  LocalPublicationInProgressError,
  withLocalPublicationLock,
} from "./local-publication-lock";

describe("local publication lock", () => {
  it("rejects an overlapping publication and releases after completion", async () => {
    let release!: () => void;
    const first = withLocalPublicationLock(
      "Page publishing",
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve("done");
        }),
    );

    await expect(
      withLocalPublicationLock("Image removal", async () => "overlap"),
    ).rejects.toBeInstanceOf(LocalPublicationInProgressError);
    release();
    await expect(first).resolves.toBe("done");
    await expect(
      withLocalPublicationLock("Image removal", async () => "next"),
    ).resolves.toBe("next");
  });

  it("releases the lock after a failed operation", async () => {
    await expect(
      withLocalPublicationLock("Page publishing", async () => {
        throw new Error("build failed");
      }),
    ).rejects.toThrow("build failed");
    await expect(
      withLocalPublicationLock("Image removal", async () => "recovered"),
    ).resolves.toBe("recovered");
  });
});
