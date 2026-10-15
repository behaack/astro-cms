import { createRobotsTxt } from "@astro-cms/core/search-discovery";
import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  if (!site) {
    throw new Error(
      "Astro site metadata is required to generate robots.txt and its sitemap URL.",
    );
  }

  return new Response(createRobotsTxt(site), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
