import type { ComponentNode } from "../cms/document-types";
import type { ReusableTemplate } from "../cms/template-types";

interface TemplateApiResponse {
  ok: boolean;
  templates?: ReusableTemplate[];
  template?: ReusableTemplate;
  message?: string;
}

interface ReusableTemplateControlsOptions {
  nameInput: HTMLInputElement;
  saveButton: HTMLButtonElement;
  list: HTMLElement;
  status: HTMLElement;
  selectedNode: () => ComponentNode | null;
  insertTemplate: (template: ReusableTemplate) => boolean;
}

export interface ReusableTemplateControls {
  refreshSelection(): void;
  reload(): Promise<void>;
}

function responseMessage(
  response: TemplateApiResponse,
  fallback: string,
): string {
  return response.message ?? fallback;
}

export function createReusableTemplateControls(
  options: ReusableTemplateControlsOptions,
): ReusableTemplateControls {
  let templates: ReusableTemplate[] = [];

  const setStatus = (
    message: string,
    state: "neutral" | "pending" | "success" | "error" = "neutral",
  ): void => {
    options.status.textContent = message;
    options.status.dataset.state = state;
  };

  const render = (): void => {
    options.list.replaceChildren();

    if (templates.length === 0) {
      const empty = document.createElement("p");
      empty.className = "template-library__empty";
      empty.textContent = "No reusable templates yet.";
      options.list.append(empty);
      return;
    }

    templates.forEach((template) => {
      const row = document.createElement("div");
      row.className = "template-library__item";

      const detail = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = template.name;
      const type = document.createElement("span");
      type.textContent = `${template.root.type} composition`;
      detail.append(name, type);

      const insert = document.createElement("button");
      insert.type = "button";
      insert.textContent = "Insert";
      insert.setAttribute("aria-label", `Insert ${template.name}`);
      insert.addEventListener("click", () => {
        if (options.insertTemplate(template)) {
          setStatus(
            `${template.name} inserted as an independent copy with fresh identities.`,
            "success",
          );
        } else {
          setStatus(
            `${template.name} cannot be inserted at the current selection.`,
            "error",
          );
        }
      });

      row.append(detail, insert);
      options.list.append(row);
    });
  };

  const reload = async (): Promise<void> => {
    setStatus("Loading reusable templates…", "pending");
    try {
      const response = await fetch("/api/templates", { cache: "no-store" });
      const result = (await response.json()) as TemplateApiResponse;
      if (!response.ok || !result.ok || !result.templates) {
        throw new Error(
          responseMessage(result, "Reusable templates could not be loaded."),
        );
      }

      templates = result.templates;
      render();
      setStatus(
        templates.length === 0
          ? "Select a component subtree and save it for reuse."
          : `${templates.length} reusable template${templates.length === 1 ? "" : "s"} available.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(message, "error");
    }
  };

  const refreshSelection = (): void => {
    options.saveButton.disabled = options.selectedNode() === null;
  };

  options.nameInput.addEventListener("input", refreshSelection);
  options.saveButton.addEventListener("click", async () => {
    const root = options.selectedNode();
    const name = options.nameInput.value.trim();
    if (!root) {
      setStatus(
        "Select a component or section before saving a template.",
        "error",
      );
      return;
    }
    if (!name) {
      setStatus("Give the reusable template a name.", "error");
      options.nameInput.focus();
      return;
    }

    options.saveButton.disabled = true;
    setStatus("Saving reusable template…", "pending");
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, root }),
      });
      const result = (await response.json()) as TemplateApiResponse;
      if (!response.ok || !result.ok || !result.template) {
        throw new Error(
          responseMessage(result, "Reusable template could not be saved."),
        );
      }

      templates = [...templates, result.template].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      options.nameInput.value = "";
      render();
      setStatus(
        `${result.template.name} saved to content/templates/${result.template.id}.json.`,
        "success",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setStatus(message, "error");
    } finally {
      refreshSelection();
    }
  });

  render();
  refreshSelection();
  void reload();

  return { refreshSelection, reload };
}
