import type {
  ComponentDefinition,
  ComponentType,
} from "./document-types";

const sectionContent: readonly ComponentType[] = [
  "Stack",
  "Heading",
  "Text",
  "Image",
  "Button",
];

const stackContent: readonly ComponentType[] = [
  "Stack",
  "Heading",
  "Text",
  "Image",
  "Button",
];

export const componentDefinitions = {
  Section: {
    type: "Section",
    label: "Section",
    category: "Layout",
    acceptsChildren: true,
    allowedChildren: sectionContent,
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
    type: "Stack",
    label: "Stack",
    category: "Layout",
    acceptsChildren: true,
    allowedChildren: stackContent,
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
    type: "Heading",
    label: "Heading",
    category: "Content",
    acceptsChildren: false,
    allowedChildren: [],
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
    type: "Text",
    label: "Text",
    category: "Content",
    acceptsChildren: false,
    allowedChildren: [],
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
    type: "Image",
    label: "Image",
    category: "Content",
    acceptsChildren: false,
    allowedChildren: [],
    properties: {
      src: {
        type: "url",
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
    type: "Button",
    label: "Button",
    category: "Action",
    acceptsChildren: false,
    allowedChildren: [],
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
} satisfies Record<ComponentType, ComponentDefinition>;
