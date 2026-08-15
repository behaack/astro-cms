import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = fileURLToPath(new URL("../", import.meta.url));
if (path.basename(projectDirectory) !== "adoption-site") {
  throw new Error("Refusing to reset files outside the adoption-site fixture.");
}

const pilotDirectory = path.join(projectDirectory, "pilot");
const pagesDirectory = path.join(projectDirectory, "content", "pages");
const templatesDirectory = path.join(projectDirectory, "content", "templates");

await mkdir(pagesDirectory, { recursive: true });
await rm(templatesDirectory, { recursive: true, force: true });
await mkdir(templatesDirectory, { recursive: true });
await copyFile(
  path.join(pilotDirectory, "starting-page.json"),
  path.join(pagesDirectory, "home.json"),
);
await copyFile(
  path.join(pilotDirectory, "starting-template.json"),
  path.join(templatesDirectory, "adoption-hero.json"),
);

console.log("Usability pilot content reset to its known starting state.");
