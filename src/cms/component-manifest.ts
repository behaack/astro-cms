import type { ComponentManifestEntry } from "./component-contract";

/**
 * The single declarative registration point for native Astro primitives.
 *
 * Each key must match a file in `src/components/primitives/<key>.astro`.
 * Nothing in the editor runtime should need to change when a component is
 * added here.
 */
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
        label: "Tone",
        defaultValue: "plain",
        options: [
          { id: "plain", label: "Plain" },
          { id: "soft", label: "Soft" },
          { id: "brand", label: "Brand" },
        ],
      },
      width: {
        type: "select",
        label: "Content width",
        defaultValue: "wide",
        options: [
          { id: "narrow", label: "Narrow" },
          { id: "wide", label: "Wide" },
          { id: "full", label: "Full" },
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
        defaultValue: "medium",
        options: [
          { id: "small", label: "Small" },
          { id: "medium", label: "Medium" },
          { id: "large", label: "Large" },
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
        defaultValue: "A clear heading",
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
        defaultValue: "/abstract-grid.svg",
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
        defaultValue: "primary",
        options: [
          { id: "primary", label: "Primary" },
          { id: "secondary", label: "Secondary" },
          { id: "quiet", label: "Quiet" },
        ],
      },
    },
  },
  Callout: {
    label: "Callout",
    category: "Content",
    acceptsChildren: false,
    allowedParents: ["Section", "Stack"],
    properties: {
      text: {
        type: "text",
        label: "Message",
        required: true,
        defaultValue: "Highlight an important piece of information.",
      },
      tone: {
        type: "select",
        label: "Tone",
        defaultValue: "note",
        options: [
          { id: "note", label: "Note" },
          { id: "tip", label: "Tip" },
          { id: "important", label: "Important" },
        ],
      },
    },
  },
} as const satisfies Record<string, ComponentManifestEntry>;

export type ManifestComponentType = keyof typeof componentManifest;

export const componentTypeValues = Object.freeze(
  Object.keys(componentManifest),
) as readonly [ManifestComponentType, ...ManifestComponentType[]];
