import type { ComponentManifestEntry } from "@astro-cms/core/contract";

export const componentManifest = {
  Band: {
    label: "Band",
    category: "Layout",
    acceptsChildren: true,
    allowedAtRoot: true,
    allowedParents: [],
    properties: {
      tone: {
        type: "select",
        label: "Background",
        defaultValue: "paper",
        options: [
          { id: "paper", label: "Paper" },
          { id: "ink", label: "Ink" },
          { id: "accent", label: "Accent" },
        ],
      },
      width: {
        type: "select",
        label: "Content width",
        defaultValue: "standard",
        options: [
          { id: "standard", label: "Standard" },
          { id: "narrow", label: "Narrow" },
        ],
      },
    },
  },
  Group: {
    label: "Group",
    category: "Layout",
    acceptsChildren: true,
    allowedParents: ["Band", "Group"],
    properties: {
      gap: {
        type: "select",
        label: "Spacing",
        defaultValue: "normal",
        options: [
          { id: "tight", label: "Tight" },
          { id: "normal", label: "Normal" },
          { id: "roomy", label: "Roomy" },
        ],
      },
      align: {
        type: "select",
        label: "Alignment",
        defaultValue: "start",
        options: [
          { id: "start", label: "Start" },
          { id: "center", label: "Center" },
        ],
      },
    },
  },
  Title: {
    label: "Title",
    category: "Content",
    acceptsChildren: false,
    allowedParents: ["Band", "Group"],
    properties: {
      text: {
        type: "text",
        label: "Text",
        required: true,
        defaultValue: "A useful title",
      },
      level: {
        type: "select",
        label: "Level",
        defaultValue: 2,
        options: [
          { id: 1, label: "H1" },
          { id: 2, label: "H2" },
          { id: 3, label: "H3" },
        ],
      },
    },
  },
  Copy: {
    label: "Copy",
    category: "Content",
    acceptsChildren: false,
    allowedParents: ["Band", "Group"],
    properties: {
      text: {
        type: "text",
        label: "Text",
        required: true,
        defaultValue: "Add the supporting message.",
      },
    },
  },
  LinkButton: {
    label: "Link button",
    category: "Action",
    acceptsChildren: false,
    allowedParents: ["Band", "Group"],
    properties: {
      label: {
        type: "text",
        label: "Label",
        required: true,
        defaultValue: "Learn more",
      },
      href: {
        type: "url",
        label: "Destination",
        required: true,
        defaultValue: "/",
      },
      appearance: {
        type: "select",
        label: "Appearance",
        defaultValue: "solid",
        options: [
          { id: "solid", label: "Solid" },
          { id: "outline", label: "Outline" },
        ],
      },
    },
  },
} as const satisfies Record<string, ComponentManifestEntry>;

export type ManifestComponentType = keyof typeof componentManifest;
export const componentTypeValues = Object.freeze(
  Object.keys(componentManifest),
) as readonly [ManifestComponentType, ...ManifestComponentType[]];
