declare module "astro-cms:manifest" {
  export const componentManifest: Record<
    string,
    import("./cms/component-contract").ComponentManifestEntry
  >;
  export type ManifestComponentType = keyof typeof componentManifest;
  export const componentTypeValues: readonly [
    ManifestComponentType,
    ...ManifestComponentType[],
  ];
}

declare module "astro-cms:registry" {
  export const componentRegistry: Record<string, unknown>;
}

declare module "astro-cms:preview-layout" {
  const PreviewLayout: any;
  export default PreviewLayout;
}
