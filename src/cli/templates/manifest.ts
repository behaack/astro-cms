import type { ComponentManifestEntry } from "@astro-cms/core/contract";

export const componentManifest = {
  Section: {
    label: "Section",
    category: "Layout",
    acceptsChildren: true,
    allowedAtRoot: true,
    allowedParents: [],
    properties: {
      tone: {
        type: "select",
        label: "Background",
        defaultValue: "light",
        options: [
          { id: "light", label: "Light" },
          { id: "dark", label: "Dark" },
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
  Stack: {
    label: "Stack",
    category: "Layout",
    acceptsChildren: true,
    allowedParents: ["Section", "Stack"],
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
  Heading: {
    label: "Heading",
    category: "Content",
    acceptsChildren: false,
    allowedParents: ["Section", "Stack"],
    properties: {
      text: {
        type: "text",
        label: "Text",
        required: true,
        defaultValue: "A useful heading",
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
  Text: {
    label: "Text",
    category: "Content",
    acceptsChildren: false,
    allowedParents: ["Section", "Stack"],
    properties: {
      text: {
        type: "text",
        label: "Text",
        required: true,
        defaultValue: "Add supporting copy.",
      },
    },
  },
  Image: {
    label: "Image",
    category: "Content",
    acceptsChildren: false,
    allowedParents: ["Section", "Stack"],
    properties: {
      src: {
        type: "image",
        label: "Image path",
        required: true,
        defaultValue: "/astro-cms-placeholder.svg",
      },
      alt: {
        type: "text",
        label: "Alternative text",
        required: true,
        defaultValue: "Abstract geometric illustration",
      },
      aspect: {
        type: "select",
        label: "Aspect ratio",
        defaultValue: "landscape",
        options: [
          { id: "landscape", label: "Landscape" },
          { id: "square", label: "Square" },
        ],
      },
    },
  },
  Button: {
    label: "Button",
    category: "Action",
    acceptsChildren: false,
    allowedParents: ["Section", "Stack"],
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
