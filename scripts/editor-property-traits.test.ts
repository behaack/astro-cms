import grapesjs, { type ComponentDefinition, type Editor } from "grapesjs";
import { afterEach, describe, expect, it } from "vitest";
import { componentDefinitions } from "../src/cms/component-definitions";
import { traitFor } from "../src/editor/property-traits";
import {
  editorComponentToNode,
  nodeToEditorComponent,
} from "../src/editor/document-adapter";

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));

function createEditor() {
  const editor = grapesjs.init({ headless: true, storageManager: false });
  editors.push(editor);
  return editor;
}

function addComponent(editor: Editor, definition: ComponentDefinition) {
  return editor.getWrapper()!.components().add(definition);
}

describe("editor property controls", () => {
  it.each([1, 2, 3])("restores H%i from a numeric saved level", (level) => {
    const editor = createEditor();
    editor.Components.addType("astro-cms-heading", {});
    const component = addComponent(editor, {
      ...nodeToEditorComponent({
        id: "heading",
        type: "Heading",
        props: { text: "Saved heading", level },
      }),
      traits: [
        traitFor("level", componentDefinitions.Heading.properties.level),
      ],
    });
    const trait = component.getTrait("level");
    expect(trait.getValue()).toBe(String(level));
    expect(trait.getOptions().map((option) => option.id)).toContain(
      trait.getValue(),
    );
    expect(editorComponentToNode(component)?.props.level).toBe(level);
  });

  it("keeps numeric levels through changes, undo and redo", () => {
    const editor = createEditor();
    const component = addComponent(editor, {
      cmsType: "Heading",
      cmsId: "heading",
      text: "A heading",
      level: 1,
      traits: [
        traitFor("level", componentDefinitions.Heading.properties.level),
      ],
    });
    editor.UndoManager.clear();
    const trait = component.getTrait("level");
    trait.setValue("3");
    expect(component.get("level")).toBe(3);
    expect(trait.getValue()).toBe("3");
    expect(editorComponentToNode(component)?.props.level).toBe(3);
    editor.UndoManager.undo();
    expect(component.get("level")).toBe(1);
    expect(trait.getValue()).toBe("1");
    editor.UndoManager.redo();
    expect(component.get("level")).toBe(3);
    expect(trait.getValue()).toBe("3");
  });

  it("preserves string options and rejects unapproved values", () => {
    const editor = createEditor();
    const component = addComponent(editor, {
      tone: "brand",
      traits: [traitFor("tone", componentDefinitions.Section.properties.tone)],
    });
    const trait = component.getTrait("tone");
    expect(trait.getValue()).toBe("brand");
    trait.setValue("soft");
    expect(component.get("tone")).toBe("soft");
    trait.setValue("unknown");
    expect(component.get("tone")).toBe("soft");
  });
});
