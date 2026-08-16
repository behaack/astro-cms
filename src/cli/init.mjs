import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_FILE_NAMES = [
  "astro.config.mjs",
  "astro.config.js",
  "astro.config.ts",
  "astro.config.mts",
];

const REQUIRED_PACKAGES = [
  "astro",
  "@astro-cms/core",
  "@astrojs/react",
  "react",
  "react-dom",
];

const TEMPLATE_FILES = [
  ["manifest.ts", "src/astro-cms.manifest.ts"],
  ["components/Section.astro", "src/components/cms/Section.astro"],
  ["components/Stack.astro", "src/components/cms/Stack.astro"],
  ["components/Heading.astro", "src/components/cms/Heading.astro"],
  ["components/Text.astro", "src/components/cms/Text.astro"],
  ["components/Button.astro", "src/components/cms/Button.astro"],
  [
    "layouts/AstroCmsPreviewLayout.astro",
    "src/layouts/AstroCmsPreviewLayout.astro",
  ],
  ["pages/astro-cms-demo.astro", "src/pages/astro-cms-demo.astro"],
  [
    "pages/astro-cms-demo/[...path].astro",
    "src/pages/astro-cms-demo/[...path].astro",
  ],
  ["content/home.json", "content/pages/home.json"],
  ["ASTRO-CMS.md", "ASTRO-CMS.md"],
];

export class AstroCmsInitError extends Error {
  constructor(message) {
    super(message);
    this.name = "AstroCmsInitError";
  }
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function maskNonCode(source) {
  const characters = [...source];
  let state = "code";

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const next = characters[index + 1];

    if (state === "code") {
      if (character === "/" && next === "/") {
        characters[index] = " ";
        characters[index + 1] = " ";
        index += 1;
        state = "line-comment";
      } else if (character === "/" && next === "*") {
        characters[index] = " ";
        characters[index + 1] = " ";
        index += 1;
        state = "block-comment";
      } else if (character === '"') {
        characters[index] = " ";
        state = "double-quote";
      } else if (character === "'") {
        characters[index] = " ";
        state = "single-quote";
      } else if (character === "`") {
        characters[index] = " ";
        state = "template";
      }
      continue;
    }

    if (character === "\n" || character === "\r") {
      if (state === "line-comment") state = "code";
      continue;
    }

    characters[index] = " ";
    if (character === "\\") {
      if (index + 1 < characters.length) {
        characters[index + 1] = " ";
        index += 1;
      }
      continue;
    }

    if (
      (state === "double-quote" && character === '"') ||
      (state === "single-quote" && character === "'") ||
      (state === "template" && character === "`") ||
      (state === "block-comment" && character === "*" && next === "/")
    ) {
      if (state === "block-comment") {
        characters[index + 1] = " ";
        index += 1;
      }
      state = "code";
    }
  }

  return characters.join("");
}

function findMatching(source, openIndex, openCharacter, closeCharacter) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === openCharacter) depth += 1;
    if (source[index] === closeCharacter) depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function skipWhitespace(source, start) {
  let index = start;
  while (/\s/.test(source[index] ?? "")) index += 1;
  return index;
}

function defaultImportIdentifier(source, packageName) {
  const escapedPackageName = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(
      `import\\s+([A-Za-z_$][\\w$]*)\\s+from\\s+["']${escapedPackageName}["']`,
    ),
  );
  return match?.[1];
}

function availableIdentifier(source, preferred) {
  const masked = maskNonCode(source);
  if (!new RegExp(`\\b${preferred}\\b`).test(masked)) return preferred;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${preferred}${suffix}`;
    if (!new RegExp(`\\b${candidate}\\b`).test(masked)) return candidate;
  }
  throw new AstroCmsInitError(
    "Could not choose a safe integration identifier.",
  );
}

function findIntegrationsArray(masked, objectStart, objectEnd) {
  let braces = 1;
  let brackets = 0;
  let parentheses = 0;

  for (let index = objectStart + 1; index < objectEnd; index += 1) {
    const character = masked[index];
    if (character === "{") braces += 1;
    else if (character === "}") braces -= 1;
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets -= 1;
    else if (character === "(") parentheses += 1;
    else if (character === ")") parentheses -= 1;

    if (braces !== 1 || brackets !== 0 || parentheses !== 0) continue;
    if (!masked.startsWith("integrations", index)) continue;

    const previous = masked[index - 1] ?? "";
    const afterName = masked[index + "integrations".length] ?? "";
    if (/[\w$]/.test(previous) || /[\w$]/.test(afterName)) continue;

    let valueIndex = skipWhitespace(masked, index + "integrations".length);
    if (masked[valueIndex] !== ":") continue;
    valueIndex = skipWhitespace(masked, valueIndex + 1);
    if (masked[valueIndex] !== "[") {
      throw new AstroCmsInitError(
        "The Astro config's integrations property is not an array, so it cannot be updated safely.",
      );
    }
    return valueIndex;
  }

  return undefined;
}

function lineIndent(source, index) {
  const lineStart = source.lastIndexOf("\n", index) + 1;
  return source.slice(lineStart, index).match(/^\s*/)?.[0] ?? "";
}

function integrationLines(cmsIdentifier, reactIdentifier, includeReact) {
  const lines = [];
  if (includeReact) lines.push(`${reactIdentifier}(),`);
  lines.push(
    `${cmsIdentifier}({`,
    '  manifest: "src/astro-cms.manifest.ts",',
    '  components: "src/components/cms",',
    '  previewLayout: "src/layouts/AstroCmsPreviewLayout.astro",',
    '  injectRoutes: "dev-only",',
    "}),",
  );
  return lines;
}

function indentLines(lines, indent) {
  return lines.map((line) => `${indent}${line}`).join("\n");
}

export function patchAstroConfig(source) {
  const existingCmsIdentifier = defaultImportIdentifier(
    source,
    "@astro-cms/core/integration",
  );
  const existingReactIdentifier = defaultImportIdentifier(
    source,
    "@astrojs/react",
  );
  const cmsAlreadyCalled =
    existingCmsIdentifier &&
    new RegExp(`\\b${existingCmsIdentifier}\\s*\\(`).test(maskNonCode(source));

  if (cmsAlreadyCalled) {
    return { source, changed: false, alreadyConfigured: true };
  }

  const cmsIdentifier =
    existingCmsIdentifier ?? availableIdentifier(source, "astroCms");
  const reactIdentifier =
    existingReactIdentifier ?? availableIdentifier(source, "react");
  const masked = maskNonCode(source);
  const defineConfigMatch = /\bdefineConfig\s*\(/.exec(masked);
  if (!defineConfigMatch) {
    throw new AstroCmsInitError(
      "The Astro config is not a direct defineConfig({...}) call and cannot be updated safely.",
    );
  }

  const callOpen = masked.indexOf("(", defineConfigMatch.index);
  const objectStart = skipWhitespace(masked, callOpen + 1);
  if (masked[objectStart] !== "{") {
    throw new AstroCmsInitError(
      "The Astro config uses a computed configuration and cannot be updated safely.",
    );
  }
  const objectEnd = findMatching(masked, objectStart, "{", "}");
  if (objectEnd < 0) {
    throw new AstroCmsInitError("The Astro config object is not balanced.");
  }

  const integrationsOpen = findIntegrationsArray(
    masked,
    objectStart,
    objectEnd,
  );
  const reactAlreadyCalled =
    existingReactIdentifier &&
    new RegExp(`\\b${existingReactIdentifier}\\s*\\(`).test(masked);
  const includeReact = !reactAlreadyCalled;
  let patched;

  if (integrationsOpen !== undefined) {
    const propertyIndent = lineIndent(source, integrationsOpen);
    const itemIndent = `${propertyIndent}  `;
    const closing = findMatching(masked, integrationsOpen, "[", "]");
    if (closing < 0) {
      throw new AstroCmsInitError(
        "The Astro integrations array is not balanced.",
      );
    }
    const isEmpty = !source.slice(integrationsOpen + 1, closing).trim();
    const insertion = `\n${indentLines(
      integrationLines(cmsIdentifier, reactIdentifier, includeReact),
      itemIndent,
    )}${isEmpty ? `\n${propertyIndent}` : ""}`;
    patched =
      source.slice(0, integrationsOpen + 1) +
      insertion +
      source.slice(integrationsOpen + 1);
  } else {
    const propertyIndent = `${lineIndent(source, objectStart)}  `;
    const itemIndent = `${propertyIndent}  `;
    const insertion = `\n${propertyIndent}integrations: [\n${indentLines(
      integrationLines(cmsIdentifier, reactIdentifier, includeReact),
      itemIndent,
    )}\n${propertyIndent}],`;
    patched =
      source.slice(0, objectStart + 1) +
      insertion +
      source.slice(objectStart + 1);
  }

  const imports = [];
  if (!existingReactIdentifier) {
    imports.push(`import ${reactIdentifier} from "@astrojs/react";`);
  }
  if (!existingCmsIdentifier) {
    imports.push(`import ${cmsIdentifier} from "@astro-cms/core/integration";`);
  }
  if (imports.length > 0) patched = `${imports.join("\n")}\n${patched}`;

  return { source: patched, changed: true, alreadyConfigured: false };
}

function directDependencies(manifest) {
  return {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  };
}

async function installCommand(projectDirectory, missingPackages) {
  const packageList = missingPackages.join(" ");
  if (await pathExists(path.join(projectDirectory, "pnpm-lock.yaml"))) {
    return `pnpm add ${packageList}`;
  }
  return `npm install ${packageList}`;
}

async function locateAstroConfig(projectDirectory) {
  const matches = [];
  for (const fileName of CONFIG_FILE_NAMES) {
    const candidate = path.join(projectDirectory, fileName);
    if (await pathExists(candidate)) matches.push(candidate);
  }
  if (matches.length === 0) {
    throw new AstroCmsInitError(
      "No conventional astro.config file was found in the target project.",
    );
  }
  if (matches.length > 1) {
    throw new AstroCmsInitError(
      `More than one Astro config was found: ${matches.map((item) => path.basename(item)).join(", ")}.`,
    );
  }
  return matches[0];
}

async function loadTemplate(templatePath) {
  return readFile(
    fileURLToPath(new URL(`./templates/${templatePath}`, import.meta.url)),
    "utf8",
  );
}

export async function createInitPlan(targetDirectory = process.cwd()) {
  const projectDirectory = path.resolve(targetDirectory);
  let projectStats;
  try {
    projectStats = await stat(projectDirectory);
  } catch {
    throw new AstroCmsInitError(
      `The target directory does not exist: ${projectDirectory}`,
    );
  }
  if (!projectStats.isDirectory()) {
    throw new AstroCmsInitError(
      `The target is not a directory: ${projectDirectory}`,
    );
  }

  const manifestPath = path.join(projectDirectory, "package.json");
  if (!(await pathExists(manifestPath))) {
    throw new AstroCmsInitError(
      "The target does not contain a package.json file.",
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    throw new AstroCmsInitError("The target package.json is not valid JSON.");
  }

  const dependencies = directDependencies(manifest);
  const missingPackages = REQUIRED_PACKAGES.filter(
    (packageName) => !dependencies[packageName],
  );
  if (missingPackages.length > 0) {
    const command = await installCommand(projectDirectory, missingPackages);
    throw new AstroCmsInitError(
      `Install the required project dependencies first:\n\n  ${command}`,
    );
  }

  const configPath = await locateAstroConfig(projectDirectory);
  const originalConfig = await readFile(configPath, "utf8");
  const configPatch = patchAstroConfig(originalConfig);
  const creates = [];
  const unchanged = [];
  const conflicts = [];

  for (const [templatePath, relativeTarget] of TEMPLATE_FILES) {
    const targetPath = path.join(projectDirectory, relativeTarget);
    const content = await loadTemplate(templatePath);
    if (!(await pathExists(targetPath))) {
      creates.push({ path: targetPath, relativePath: relativeTarget, content });
      continue;
    }
    const existingContent = await readFile(targetPath, "utf8");
    if (existingContent === content) {
      unchanged.push(relativeTarget);
    } else {
      conflicts.push(relativeTarget);
    }
  }

  if (conflicts.length > 0) {
    throw new AstroCmsInitError(
      `Initialization stopped without changes because these files already exist:\n\n${conflicts
        .map((fileName) => `  - ${fileName}`)
        .join("\n")}\n\nMove or rename them, then run the initializer again.`,
    );
  }

  return {
    projectDirectory,
    configPath,
    configRelativePath: path.relative(projectDirectory, configPath),
    originalConfig,
    patchedConfig: configPatch.source,
    configChanged: configPatch.changed,
    creates,
    unchanged,
  };
}

async function applyInitPlan(plan) {
  const createdPaths = [];
  let configBackup;
  let configTemporary;

  try {
    for (const operation of plan.creates) {
      await mkdir(path.dirname(operation.path), { recursive: true });
      await writeFile(operation.path, operation.content, {
        encoding: "utf8",
        flag: "wx",
      });
      createdPaths.push(operation.path);
    }

    if (plan.configChanged) {
      const transactionId = randomUUID();
      configTemporary = `${plan.configPath}.astro-cms-${transactionId}.tmp`;
      configBackup = `${plan.configPath}.astro-cms-${transactionId}.bak`;
      await writeFile(configTemporary, plan.patchedConfig, {
        encoding: "utf8",
        flag: "wx",
      });
      await rename(plan.configPath, configBackup);
      await rename(configTemporary, plan.configPath);
      await rm(configBackup, { force: true });
      configBackup = undefined;
      configTemporary = undefined;
    }
  } catch (error) {
    await Promise.all(
      createdPaths.map((createdPath) => rm(createdPath, { force: true })),
    );
    if (configBackup && (await pathExists(configBackup))) {
      await rm(plan.configPath, { force: true });
      await rename(configBackup, plan.configPath);
    }
    if (configTemporary) await rm(configTemporary, { force: true });
    throw error;
  }
}

export async function initializeProject(
  targetDirectory = process.cwd(),
  options = {},
) {
  const plan = await createInitPlan(targetDirectory);
  if (!options.dryRun) await applyInitPlan(plan);
  return {
    projectDirectory: plan.projectDirectory,
    configRelativePath: plan.configRelativePath,
    configChanged: plan.configChanged,
    created: plan.creates.map((operation) => operation.relativePath),
    unchanged: plan.unchanged,
    dryRun: Boolean(options.dryRun),
  };
}
