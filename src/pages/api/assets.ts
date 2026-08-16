import type { APIRoute } from "astro";

import { listLocalImageAssets } from "../../cms/local-asset-store";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const assets = await listLocalImageAssets();
    return Response.json(
      { ok: true, assets },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, message: "Project images could not be read." },
      { status: 500 },
    );
  }
};
