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
const initializerDirectory = path.join(
  verificationDirectory,
  "initializer-consumer",
);
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

async function runGit(args, workingDirectory) {
  await new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: workingDirectory,
      env: { ...process.env, NO_COLOR: "1" },
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`git ${args.join(" ")} exited with code ${code}.`));
      }
    });
  });
}

async function installDependencies(workingDirectory) {
  const installArguments = [
    "install",
    "--ignore-workspace",
    "--no-frozen-lockfile",
  ];
  if (process.env.ASTRO_CMS_PNPM_STORE_DIR) {
    installArguments.push("--store-dir", process.env.ASTRO_CMS_PNPM_STORE_DIR);
  }
  await runPnpm(installArguments, workingDirectory);
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

await installDependencies(consumerDirectory);
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
  "src/cli/astro-cms.mjs",
  "src/cli/init.mjs",
  "src/cli/templates/manifest.ts",
  "src/cli/templates/pages/astro-cms-demo/[...path].astro",
  "src/cms/git-publisher.ts",
  "src/components/renderer/DocumentRenderer.astro",
  "src/pages/api/change-review.ts",
  "src/pages/api/assets.ts",
  "src/pages/api/pages.ts",
  "src/pages/api/publish.ts",
  "src/cms/local-asset-store.ts",
]) {
  if (!(await pathExists(path.join(installedPackageDirectory, requiredPath)))) {
    throw new Error(`Required package file is missing: ${requiredPath}`);
  }
}

for (const excludedPath of [
  "src/cms/component-definitions.test.ts",
  "src/cms/component-manifest.ts",
  "src/cms/document-test-helpers.ts",
  "src/cli/init.test.mjs",
]) {
  if (await pathExists(path.join(installedPackageDirectory, excludedPath))) {
    throw new Error(`Internal source leaked into the package: ${excludedPath}`);
  }
}

const installedManifest = JSON.parse(
  await readFile(path.join(installedPackageDirectory, "package.json"), "utf8"),
);
if (installedManifest.bin?.["astro-cms"] !== "./src/cli/astro-cms.mjs") {
  throw new Error("The package does not expose the astro-cms command.");
}
if (installedManifest.exports?.["./git"] !== "./src/cms/git-publisher.ts") {
  throw new Error("The package does not expose the Git publishing service.");
}

const serverEntry = await readFile(
  path.join(consumerDirectory, "dist", "server", "entry.mjs"),
  "utf8",
);
if (/['"]route['"]\s*:\s*['"]\/admin['"]/.test(serverEntry)) {
  throw new Error("The production archive consumer contains the editor route.");
}

await mkdir(path.join(initializerDirectory, "src", "pages"), {
  recursive: true,
});
const initializerManifest = {
  name: "astro-cms-initializer-consumer",
  private: true,
  type: "module",
  scripts: {
    check: "astro-check",
    build: "astro build",
  },
  dependencies: {
    "@astro-cms/core": `file:../${archiveName}`,
    "@astrojs/react": rootManifest.peerDependencies["@astrojs/react"],
    astro: rootManifest.peerDependencies.astro,
    react: rootManifest.peerDependencies.react,
    "react-dom": rootManifest.peerDependencies["react-dom"],
  },
  devDependencies: {
    "@astrojs/check": rootManifest.devDependencies["@astrojs/check"],
    "@types/node": rootManifest.devDependencies["@types/node"],
    "@types/react": rootManifest.devDependencies["@types/react"],
    "@types/react-dom": rootManifest.devDependencies["@types/react-dom"],
    typescript: rootManifest.devDependencies.typescript,
  },
};
await writeFile(
  path.join(initializerDirectory, "package.json"),
  `${JSON.stringify(initializerManifest, null, 2)}\n`,
  "utf8",
);
await writeFile(
  path.join(initializerDirectory, "astro.config.mjs"),
  'import { defineConfig } from "astro/config";\n\nexport default defineConfig({\n  devToolbar: { enabled: false },\n});\n',
  "utf8",
);
await writeFile(
  path.join(initializerDirectory, "tsconfig.json"),
  '{\n  "extends": "astro/tsconfigs/strict",\n  "include": [".astro/types.d.ts", "**/*"],\n  "exclude": ["dist"]\n}\n',
  "utf8",
);
await writeFile(
  path.join(initializerDirectory, ".gitignore"),
  "node_modules/\ndist/\n.astro/\n",
  "utf8",
);
const originalIndex = "<h1>This existing page belongs to the adopter.</h1>\n";
await writeFile(
  path.join(initializerDirectory, "src", "pages", "index.astro"),
  originalIndex,
  "utf8",
);

await installDependencies(initializerDirectory);
const installedInitializerPackage = path.join(
  initializerDirectory,
  "node_modules",
  "@astro-cms",
  "core",
);
const initializedPackageTarget = await realpath(installedInitializerPackage);
if (initializedPackageTarget === projectDirectory) {
  throw new Error(
    "Initializer consumer resolved the workspace root instead of the archive.",
  );
}

await runPnpm(
  ["exec", "astro-cms", "init", initializerDirectory],
  initializerDirectory,
);
const initializedConfigPath = path.join(
  initializerDirectory,
  "astro.config.mjs",
);
const initializedConfig = await readFile(initializedConfigPath, "utf8");
await runPnpm(
  ["exec", "astro-cms", "init", initializerDirectory],
  initializerDirectory,
);
if ((await readFile(initializedConfigPath, "utf8")) !== initializedConfig) {
  throw new Error("Running the initializer twice changed the Astro config.");
}
if (
  (await readFile(
    path.join(initializerDirectory, "src", "pages", "index.astro"),
    "utf8",
  )) !== originalIndex
) {
  throw new Error("The initializer replaced the adopter's existing page.");
}

await runGit(["init"], initializerDirectory);
await runGit(
  ["config", "user.name", "Astro-CMS Verification"],
  initializerDirectory,
);
await runGit(
  ["config", "user.email", "astro-cms@example.invalid"],
  initializerDirectory,
);
await runGit(["add", "."], initializerDirectory);
await runGit(["commit", "-m", "initial website"], initializerDirectory);

await runPnpm(["check"], initializerDirectory);
await runPnpm(["build"], initializerDirectory);
for (const generatedPath of [
  "ASTRO-CMS.md",
  "src/astro-cms.manifest.ts",
  "src/pages/astro-cms-demo.astro",
  "src/pages/astro-cms-demo/[...path].astro",
  "src/components/cms/Image.astro",
  "public/astro-cms-placeholder.svg",
  "content/pages/home.json",
  "dist/astro-cms-demo/index.html",
  "dist/astro-cms-placeholder.svg",
]) {
  if (!(await pathExists(path.join(initializerDirectory, generatedPath)))) {
    throw new Error(`Initializer output is missing: ${generatedPath}`);
  }
}
if (await pathExists(path.join(initializerDirectory, "dist", "admin"))) {
  throw new Error(
    "The initialized production build contains the editor route.",
  );
}

console.log(
  `Verified ${rootManifest.name}@${rootManifest.version} from archive install through production build.`,
);
console.log(`Consumer fixture: ${consumerDirectory}`);
console.log(`Initializer fixture: ${initializerDirectory}`);
