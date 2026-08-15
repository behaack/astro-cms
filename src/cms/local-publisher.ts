import { spawn } from "node:child_process";
import path from "node:path";

import {
  writeLocalPageDocument,
  type LocalPageStoreOptions,
} from "./local-page-store";
import type { PageDocument } from "./document-types";

const BUILD_TIMEOUT_MS = 120_000;
const MAX_BUILD_OUTPUT = 64 * 1024;

export interface LocalBuildResult {
  output: string;
}

export interface LocalPublishResult {
  document: PageDocument;
  build: LocalBuildResult;
}

export interface LocalPublishOptions extends LocalPageStoreOptions {
  projectDirectory?: string;
  build?: () => Promise<LocalBuildResult>;
}

export class AstroBuildError extends Error {}

export function productionBuildEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return { ...environment, NODE_ENV: "production", NO_COLOR: "1" };
}

export async function buildAstroProject(
  projectDirectory = process.cwd(),
): Promise<LocalBuildResult> {
  const astroCli = path.join(
    projectDirectory,
    "node_modules",
    "astro",
    "bin",
    "astro.mjs",
  );

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [astroCli, "build"], {
      cwd: projectDirectory,
      env: productionBuildEnvironment(),
      shell: false,
      windowsHide: true,
    });
    let output = "";
    let finished = false;

    const capture = (chunk: Buffer): void => {
      output = `${output}${chunk.toString("utf8")}`.slice(-MAX_BUILD_OUTPUT);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);

    const timeout = setTimeout(() => {
      if (finished) return;
      child.kill();
      reject(new AstroBuildError("Astro production build timed out."));
    }, BUILD_TIMEOUT_MS);

    child.on("error", (error) => {
      finished = true;
      clearTimeout(timeout);
      reject(
        new AstroBuildError(`Astro production build failed: ${error.message}`),
      );
    });
    child.on("close", (code) => {
      finished = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ output });
      } else {
        reject(
          new AstroBuildError(
            `Astro production build exited with code ${code ?? "unknown"}.`,
          ),
        );
      }
    });
  });
}

export async function publishLocalProject(
  input: unknown,
  options: LocalPublishOptions = {},
): Promise<LocalPublishResult> {
  const document = await writeLocalPageDocument(input, options);
  const build = await (
    options.build ?? (() => buildAstroProject(options.projectDirectory))
  )();
  return { document, build };
}
