import {
  access,
  cp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectDirectory = path.resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);
const verificationDirectory = path.join(
  projectDirectory,
  ".package-verification",
);
const consumerDirectory = path.join(verificationDirectory, "consumer");
const fixtureDirectory = path.join(
  projectDirectory,
  "examples",
  "adoption-site",
);

if (
  path.dirname(verificationDirectory) !== projectDirectory ||
  path.basename(verificationDirectory) !== ".package-verification"
) {
  throw new Error("Refusing to replace an unexpected verification directory.");
}

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  throw new Error("Run package verification through `pnpm verify:package`.");
}

async function runPnpm(args, workingDirectory) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [pnpmCli, ...args], {
      cwd: workingDirectory,
      env: { ...process.env, CI: "true", NO_COLOR: "1" },
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`pnpm ${args.join(" ")} exited with code ${code}.`));
      }
    });
  });
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

await rm(verificationDirectory, { recursive: true, force: true });
await mkdir(verificationDirectory, { recursive: true });
await runPnpm(
  ["pack", "--pack-destination", verificationDirectory],
  projectDirectory,
);

const rootManifest = JSON.parse(
  await readFile(path.join(projectDirectory, "package.json"), "utf8"),
);
const archiveName = `${rootManifest.name.replace(/^@/, "").replace("/", "-")}-${rootManifest.version}.tgz`;
const archivePath = path.join(verificationDirectory, archiveName);
if (!(await pathExists(archivePath))) {
  throw new Error(`Expected package archive was not created: ${archivePath}`);
}

const excludedFixtureDirectories = new Set(["node_modules", "dist", ".astro"]);
await cp(fixtureDirectory, consumerDirectory, {
  recursive: true,
  filter(source) {
    const relativePath = path.relative(fixtureDirectory, source);
    const firstSegment = relativePath.split(path.sep)[0];
    return !excludedFixtureDirectories.has(firstSegment);
  },
});

const consumerManifestPath = path.join(consumerDirectory, "package.json");
const consumerManifest = JSON.parse(
  await readFile(consumerManifestPath, "utf8"),
);
consumerManifest.name = "astro-cms-tarball-consumer";
consumerManifest.dependencies["@astro-cms/core"] = `file:../${archiveName}`;
delete consumerManifest.dependencies.grapesjs;
delete consumerManifest.dependencies.zod;
await writeFile(
  consumerManifestPath,
  `${JSON.stringify(consumerManifest, null, 2)}\n`,
  "utf8",
);

const installArguments = [
  "install",
  "--ignore-workspace",
  "--no-frozen-lockfile",
];
if (process.env.ASTRO_CMS_PNPM_STORE_DIR) {
  installArguments.push("--store-dir", process.env.ASTRO_CMS_PNPM_STORE_DIR);
}
await runPnpm(installArguments, consumerDirectory);
await runPnpm(["check"], consumerDirectory);
await runPnpm(["build"], consumerDirectory);

const installedPackageDirectory = path.join(
  consumerDirectory,
  "node_modules",
  "@astro-cms",
  "core",
);
const installedPackageTarget = await realpath(installedPackageDirectory);
if (installedPackageTarget === projectDirectory) {
  throw new Error(
    "Consumer resolved the workspace root instead of the archive.",
  );
}

for (const requiredPath of [
  "DISTRIBUTION.md",
  "LICENSE",
  "src/integration.ts",
  "src/components/renderer/DocumentRenderer.astro",
  "src/pages/api/publish.ts",
]) {
  if (!(await pathExists(path.join(installedPackageDirectory, requiredPath)))) {
    throw new Error(`Required package file is missing: ${requiredPath}`);
  }
}

for (const excludedPath of [
  "src/cms/component-definitions.test.ts",
  "src/cms/component-manifest.ts",
  "src/cms/document-test-helpers.ts",
]) {
  if (await pathExists(path.join(installedPackageDirectory, excludedPath))) {
    throw new Error(`Internal source leaked into the package: ${excludedPath}`);
  }
}

const serverEntry = await readFile(
  path.join(consumerDirectory, "dist", "server", "entry.mjs"),
  "utf8",
);
if (/['"]route['"]\s*:\s*['"]\/admin['"]/.test(serverEntry)) {
  throw new Error("The production archive consumer contains the editor route.");
}

console.log(
  `Verified ${rootManifest.name}@${rootManifest.version} from archive install through production build.`,
);
console.log(`Consumer fixture: ${consumerDirectory}`);
