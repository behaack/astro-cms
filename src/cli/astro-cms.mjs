#!/usr/bin/env node

import path from "node:path";

import { AstroCmsInitError, initializeProject } from "./init.mjs";

function printUsage() {
  console.log(`Astro-CMS

Usage:
  astro-cms init [directory] [--dry-run]

Commands:
  init       Add a safe starter integration to an existing Astro project.

Options:
  --dry-run  Show the planned changes without writing files.
  --help     Show this help.`);
}

function parseArguments(arguments_) {
  if (arguments_.length === 0 || arguments_.includes("--help")) {
    return { help: true };
  }
  const [command, ...rest] = arguments_;
  if (command !== "init") {
    throw new AstroCmsInitError(`Unknown command: ${command}`);
  }

  let directory;
  let dryRun = false;
  for (const argument of rest) {
    if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument.startsWith("-")) {
      throw new AstroCmsInitError(`Unknown option: ${argument}`);
    } else if (directory) {
      throw new AstroCmsInitError("Only one target directory may be provided.");
    } else {
      directory = argument;
    }
  }

  return { help: false, directory: directory ?? process.cwd(), dryRun };
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printUsage();
  } else {
    const result = await initializeProject(options.directory, {
      dryRun: options.dryRun,
    });
    const action = result.dryRun ? "Would initialize" : "Initialized";
    console.log(
      `${action} Astro-CMS in ${path.resolve(result.projectDirectory)}`,
    );
    if (result.configChanged) {
      console.log(
        `  ${result.dryRun ? "Would update" : "Updated"} ${result.configRelativePath}`,
      );
    }
    for (const fileName of result.created) {
      console.log(
        `  ${result.dryRun ? "Would create" : "Created"} ${fileName}`,
      );
    }
    if (!result.configChanged && result.created.length === 0) {
      console.log(
        "  No changes were needed; this project is already initialized.",
      );
    }
    if (!result.dryRun) {
      console.log("\nStart the Astro development server, then open:");
      console.log("  /astro-cms-demo  Starter page");
      console.log("  /admin            Visual editor");
      console.log(
        "\nRead ASTRO-CMS.md before adapting the starter components.",
      );
    }
  }
} catch (error) {
  if (error instanceof AstroCmsInitError) {
    console.error(
      `Astro-CMS could not initialize this project.\n\n${error.message}`,
    );
    process.exitCode = 1;
  } else {
    throw error;
  }
}
