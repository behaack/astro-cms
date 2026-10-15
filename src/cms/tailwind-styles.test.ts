import { describe, expect, it } from "vitest";
import { cssForHtml, tailwindStyles } from "./tailwind-styles";

describe("page Tailwind utilities", () => {
  it("generates newly entered utility, responsive, hover, and arbitrary-value classes", async () => {
    const css = await tailwindStyles([
      "text-3xl",
      "md:text-5xl",
      "hover:text-red-500",
      "p-[23px]",
    ]);
    expect(css).toContain("[data-astro-cms-page] .text-3xl");
    expect(css).toContain("width>=48rem");
    expect(css).toContain("hover\\:text-red-500:hover");
    expect(css).toContain("padding:23px");
    expect(css).not.toContain("box-sizing:border-box");
  });

  it("keeps separately compiled pages independent and reports unrecognized utilities", async () => {
    await tailwindStyles(["text-6xl"]);
    expect(await tailwindStyles(["text-sm"])).not.toContain("text-6xl");
    await expect(tailwindStyles(["not-a-tailwind-utility"])).rejects.toThrow(
      "Unknown Tailwind class",
    );
    await expect(
      tailwindStyles(["bg-[url(javascript:alert)]"]),
    ).rejects.toThrow();
    expect(
      await tailwindStyles(["group", "group-hover:text-red-500"]),
    ).toContain("group");
  });

  it("prevents CSS content from closing an HTML style element", () => {
    expect(cssForHtml(".x{--label:'</style><script>'}")).not.toContain(
      "</style>",
    );
  });
});
