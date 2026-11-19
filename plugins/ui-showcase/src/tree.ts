import type { PluginTreeProps, PluginTreeRow, PluginUi, PluginUiContent, PluginWidgetHandle } from "learnharness-plugin-api";
import { Scope, button, element, example, note, readout } from "./dom.ts";
import type { Translator } from "./i18n.ts";

/** Synthetic controlled values only; the host owns row presentation and keyboard behavior. */
export function mountTreeDemo(ui: PluginUi, body: HTMLElement, life: Scope, t: Translator): void {
  note(body, t("tree.note1"));
  note(body, t("tree.note2"));
  let selectionEnabled = false;
  const selectedOccurrenceKeys = new Set<string>();
  const expanded: Record<string, boolean> = { "example-folder": true, "another-folder": true };
  let draft = t("tree.draft.value");
  let lastCallback = "none";
  const show = readout(body, "tree", t);
  let tree: PluginWidgetHandle<PluginTreeProps>;
  const toggle = button(ui, body, life, "toggle-tree-selection", { label: t("tree.toggle.enable"), variant: "outline", onClick() {
    if (life.signal.aborted) return;
    selectionEnabled = !selectionEnabled;
    lastCallback = selectionEnabled ? "selection enabled" : "selection disabled";
    render();
  } });

  // One factory per family lifetime: controlled updates retain this content's
  // DOM, while disclosure unmounts it and a later mount restores the local draft.
  const draftContent: PluginUiContent = (container, signal) => {
    const content = new Scope(signal);
    if (life.signal.aborted || content.signal.aborted) { content.dispose(); return content.dispose; }
    const root = element("div");
    root.append(element("div", t("tree.draft.label"), "ui-showcase-label font-ui text-xs"));
    const input = element("input", undefined, "font-ui text-sm");
    input.type = "text";
    input.setAttribute("aria-label", t("tree.draft.aria"));
    input.value = draft;
    const change = () => {
      if (life.signal.aborted || content.signal.aborted) return;
      draft = input.value; lastCallback = "draft.onInput"; render();
    };
    input.addEventListener("input", change);
    root.append(input); container.append(root);
    content.own(() => { input.removeEventListener("input", change); root.remove(); });
    return content.dispose;
  };
  const selection = (key: string, label: string): Pick<PluginTreeRow, "selection"> => selectionEnabled ? { selection: {
    label, checked: selectedOccurrenceKeys.has(key), onChange(value) {
      if (life.signal.aborted || !selectionEnabled) return;
      if (value) selectedOccurrenceKeys.add(key); else selectedOccurrenceKeys.delete(key);
      lastCallback = `selection.onChange: ${key}`; render();
    },
  } } : {};
  const folder = (key: string, title: string, children: readonly PluginTreeRow[]): PluginTreeRow => ({
    key, content: title, cells: { kind: t("tree.cells.folder"), state: expanded[key] ? t("tree.cells.expanded") : t("tree.cells.collapsed") }, children,
    ...selection(key, t("tree.select", { name: title })),
    disclosure: { label: t("tree.disclosure", { name: title }), expanded: expanded[key]!, onChange(value) {
      if (life.signal.aborted) return;
      expanded[key] = value; lastCallback = `disclosure.onChange: ${key}`; render();
    } },
  });
  const rows = (): PluginTreeRow[] => [
    folder("example-folder", t("tree.exampleFolder"), [
      { key: "example-folder/shared-item", content: t("tree.sharedItem"), cells: { kind: t("tree.cells.note"), state: t("tree.cells.repeated") }, ...selection("example-folder/shared-item", t("tree.selectIn", { name: t("tree.sharedItem"), folder: t("tree.exampleFolder") })) },
      { key: "example-folder/draft-note", content: draftContent, cells: { kind: t("tree.cells.draft"), state: t("tree.cells.editable") }, ...selection("example-folder/draft-note", t("tree.select", { name: t("tree.draft.label") })) },
    ]),
    folder("another-folder", t("tree.anotherFolder"), [
      { key: "another-folder/shared-item", content: t("tree.sharedItem"), cells: { kind: t("tree.cells.note"), state: t("tree.cells.repeated") }, ...selection("another-folder/shared-item", t("tree.selectIn", { name: t("tree.sharedItem"), folder: t("tree.anotherFolder") })) },
    ]),
  ];
  const viewport = example(body, "tree");
  viewport.style.overflowX = "auto";
  const minimum = element("div"); minimum.style.minWidth = "36rem";
  viewport.append(minimum);
  tree = life.widget(ui.mountTree(minimum, {
    label: t("tree.label"), header: t("tree.header.name"), rows: rows(), columns: [
      { key: "kind", header: t("tree.header.kind"), width: 56 },
      { key: "state", header: t("tree.header.state"), width: 80 },
    ],
  }, { signal: life.signal }));
  function render() {
    tree.update({ rows: rows() });
    toggle.update({ label: selectionEnabled ? t("tree.toggle.disable") : t("tree.toggle.enable") });
    show({ selectionEnabled, selectedOccurrenceKeys: [...selectedOccurrenceKeys], expanded: { ...expanded }, draft, lastCallback });
  }
  render();
}
