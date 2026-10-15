import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const project = fileURLToPath(new URL("../", import.meta.url));
const fixture = path.join(
  project,
  ".package-verification",
  "initializer-consumer",
);
const homePath = path.join(fixture, "content", "pages", "home.json");
const source = await readFile(homePath, "utf8");
const page = JSON.parse(source);
const findHeading = (nodes) => {
  for (const node of nodes) {
    if (node.type === "Heading") return node;
    const child = findHeading(node.children ?? []);
    if (child) return child;
  }
};
const heading = findHeading(page.content);
if (!heading)
  throw new Error("The installed initializer fixture needs a Heading.");
heading.styles = {
  classes: ["verification-global"],
  tailwind: ["text-3xl", "md:text-5xl", "text-amber-300"],
  css: "font-size: 40px; color: #ff5500; line-height: 1.5; letter-spacing: 0.02em; text-align: center;",
  phoneCss: "font-size: 20px;",
  text: {
    text: [
      {
        start: 0,
        end: Math.min(5, heading.props.text.length),
        bold: true,
        italic: true,
        underline: true,
      },
    ],
  },
};
page.stylesheets = ["/verification.css"];
await writeFile(
  path.join(fixture, "public", "verification.css"),
  ".verification-global { text-decoration: underline; }\n",
);

try {
  await writeFile(homePath, `${JSON.stringify(page, null, 2)}\n`);
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli)
    throw new Error(
      "Run through pnpm verify:styles after pnpm verify:package.",
    );
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [pnpmCli, "build"], {
      cwd: fixture,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Style proof build failed (${code}).`)),
    );
  });
  const html = await readFile(
    path.join(fixture, "dist", "astro-cms-demo", "index.html"),
    "utf8",
  );
  const requirements = [
    [/<link[^>]*href="\/verification\.css"/, "global stylesheet reference"],
    [
      /<h[123][^>]*class="[^"]*verification-global[^"]*text-3xl/,
      "classes on the actual native heading",
    ],
    [/\[data-astro-cms-page\] \.text-3xl/, "generated Tailwind utilities"],
    [/md\\:text-5xl/, "responsive Tailwind utilities"],
    [/font-size:40px/, "local CSS"],
    [/<strong><em><u>[^<]+<\/u><\/em><\/strong>/, "semantic word formatting"],
    [/line-height:1.5/, "line spacing"],
    [/letter-spacing:0.02em/, "letter spacing"],
    [/text-align:center/, "text alignment"],
    [/max-width:\s*639px[^]*?font-size:20px/, "phone override"],
  ];
  for (const [pattern, label] of requirements) {
    if (!pattern.test(html))
      throw new Error(`Production output is missing ${label}.`);
  }
  if (/<script\b/i.test(html))
    throw new Error(
      "Styled native output unexpectedly requires browser JavaScript.",
    );
  if (/data-astro-cms-(?:node|text|selected)=/i.test(html))
    throw new Error(
      "Production output unexpectedly includes editor selection markers.",
    );
  console.log(
    "Verified global styles, Tailwind, responsive local CSS, semantic word formatting, alignment and spacing in the archive-installed static production page, without browser JavaScript.",
  );
} finally {
  await writeFile(homePath, source);
}
