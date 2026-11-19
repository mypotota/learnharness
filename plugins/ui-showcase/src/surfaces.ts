import type { PluginUi, PluginSurfaceTarget, PluginSurfaceProps, PluginWidgetHandle } from "learnharness-plugin-api";
import { Scope, button, element, example, family, note, readout, row } from "./dom.ts";
import type { Translator } from "./i18n.ts";

/** Shared ordinary overlays, always using the real host stack and keyboard policy. */
export function mountOverlayExamples(ui: PluginUi, body: HTMLElement, life: Scope, kind: "menus" | "dialogs", t: Translator): void {
  let selection: string | null = null;
  let lastCallback = "none";
  let opens = 0;
  const show = readout(body, kind, t);
  const render = () => show({ selection, opens, lastCallback });
  if (kind === "menus") {
    note(body, t("menus.note"));
    const actions = row(body);
    for (const preferredSide of ["down", "up"] as const) {
      const anchor = example(actions, `menu-${preferredSide}`);
      life.widget(ui.mountButton(anchor, { label: t("menus.open", { side: preferredSide }), variant: "outline", onClick() {
        if (life.signal.aborted) return;
        opens++; lastCallback = `openMenu (${preferredSide})`; render();
        life.widget(ui.openMenu(anchor.querySelector("button") ?? anchor, {
          label: t("menus.showcase", { side: preferredSide }), preferredSide,
          items: [
            { key: "first", label: t("menus.selectFirst"), onSelect() { selection = "first"; lastCallback = "first.onSelect"; render(); } },
            { key: "disabled", label: t("menus.disabledItem"), disabled: true, onSelect() { throw new Error("Disabled menu item must not run"); } },
            { key: "second", label: t("menus.selectSecond"), onSelect() { selection = "second"; lastCallback = "second.onSelect"; render(); } },
          ],
          onClose() { if (!life.signal.aborted) { lastCallback = "menu.onClose"; render(); } },
        }, { signal: life.signal }));
      } }, { signal: life.signal }));
    }
  } else {
    note(body, t("dialogs.note"));
    const actions = row(body);
    for (const mode of ["ordinary", "long", "nested"] as const) {
      button(ui, actions, life, `dialog-${mode}`, { label: mode === "long" ? t("dialogs.openLong") : t("dialogs.open", { mode }), variant: "outline", onClick() {
        opens++; lastCallback = `openDialog (${mode})`; render();
        openDialog(ui, life, mode, t, () => { if (!life.signal.aborted) { lastCallback = `${mode}.onClose`; render(); } });
      } });
    }
  }
  render();
}

function openDialog(ui: PluginUi, owner: Scope, mode: "ordinary" | "long" | "nested", t: Translator, onClose: () => void): void {
  owner.widget(ui.openDialog({
    title: mode === "long" ? t("dialogs.titleLong") : mode === "nested" ? t("dialogs.titleParent") : t("dialogs.titleOrdinary"),
    content(container, signal) {
      const life = new Scope(signal);
      if (signal.aborted) return life.dispose;
      const root = element("div", undefined, "ui-showcase ui-showcase-overlay");
      root.dataset.showcase = `dialog-${mode}`;
      container.append(root); life.own(() => root.remove());
      note(root, t("dialogs.contentNote"));
      retainedField(ui, root, life, `dialog-${mode}`, t);
      if (mode === "ordinary") knowledgeExample(ui, root, life, "dialog-ordinary-knowledge", t);
      if (mode === "long") {
        for (let index = 1; index <= 32; index++) {
          note(root, t("dialogs.paragraph", { index: String(index) }));
        }
      }
      if (mode !== "ordinary") {
        button(ui, root, life, `dialog-${mode}-child`, { label: t("dialogs.openChild"), onClick() { openDialog(ui, life, "ordinary", t, () => {}); } });
      }
      return life.dispose;
    },
    onClose,
  }, { signal: owner.signal }));
}

function retainedField(ui: PluginUi, root: HTMLElement, life: Scope, id: string, t: Translator): void {
  let value = t("retained.value");
  let lastCallback = "none";
  const show = readout(root, id, t);
  const schema = () => ({ rows: [{ key: "retained", type: "text" as const, label: t("retained.label"), description: t("retained.description"), value,
    onChange(next: string) { if (!life.signal.aborted) { value = next; lastCallback = "retained.onChange"; field.update(schema()); render(); } },
  }] });
  const field = life.widget(ui.mountSettingsRows(example(root, `${id}-retained-field`), schema(), { signal: life.signal }));
  function render() { show({ value, lastCallback }); }
  render();
}

function knowledgeExample(ui: PluginUi, root: HTMLElement, life: Scope, id: string, t: Translator): void {
  note(root, t("pickers.knowledge.note"));
  let value: readonly string[] = [];
  const show = readout(root, id, t);
  const picker = life.widget(ui.mountKnowledgePicker(example(root, `${id}-picker`, t("pickers.knowledge.label")), {
    value, onChange(next) {
      if (life.signal.aborted) return;
      value = [...next]; picker.update({ value }); show({ value });
    },
  }, { signal: life.signal }));
  show({ value });
}

/** The target is passed through unchanged from the native action context. */
export function openSurfaceDemo(ui: PluginUi, target: PluginSurfaceTarget, signal: AbortSignal, t: Translator, onClose?: () => void): PluginWidgetHandle<PluginSurfaceProps> {
  return openDemo(ui, signal, target, t, onClose);
}

/** Direct opening captures the current page body through the public host API. */
export function openPageSurfaceDemo(ui: PluginUi, signal: AbortSignal, t: Translator, onClose: () => void): PluginWidgetHandle<PluginSurfaceProps> {
  return openDemo(ui, signal, undefined, t, onClose);
}

function openDemo(ui: PluginUi, signal: AbortSignal, target: PluginSurfaceTarget | undefined, t: Translator, onClose?: () => void): PluginWidgetHandle<PluginSurfaceProps> {
  const open = (surface: PluginSurfaceProps, lifetime: AbortSignal) => target === undefined
    ? ui.openSurface(surface, { signal: lifetime })
    : ui.openSurface(target, surface, { signal: lifetime });
  let handle: PluginWidgetHandle<PluginSurfaceProps> | undefined;
  handle = open({
    title: t("surface.title"),
    content(container, contentSignal) {
      const scope = new Scope(contentSignal);
      if (contentSignal.aborted) return scope.dispose;
      const root = element("div", undefined, "ui-showcase ui-showcase-surface");
      root.dataset.showcase = "surface";
      container.append(root); scope.own(() => root.remove());
      family(ui, root, scope, "surfaces", t("surface.familyTitle"), t, (body, life) => {
        note(body, t("surface.note"));
        retainedField(ui, body, life, "surface-parent", t);
        knowledgeExample(ui, body, life, "surface-knowledge", t);
        let opened = 0; let closed = 0; let lastCallback = "none";
        let background: NonNullable<PluginSurfaceProps["background"]> = "dimmed";
        handle?.update({ background });
        const show = readout(body, "surfaces", t);
        const render = () => show({ background, nestedOpened: opened, nestedClosed: closed, lastCallback });
        const backgrounds = row(body);
        for (const preset of ["dimmed", "opaque"] as const) {
          button(ui, backgrounds, life, `surface-background-${preset}`, { label: preset === "dimmed" ? t("surface.background.dimmed") : t("surface.background.opaque"), variant: "outline", onClick() {
            if (life.signal.aborted) return;
            background = preset; handle?.update({ background }); lastCallback = `surface.update (${preset})`; render();
          } });
        }
        button(ui, body, life, "surface-nested", { label: t("surface.openNested"), onClick() {
          if (life.signal.aborted) return;
          opened++; lastCallback = target === undefined ? "openSurface (current page body)" : "openSurface (same opaque native target)"; render();
          life.widget(open({
            title: t("surface.nested.title"),
            content(childContainer, childSignal) {
              const child = new Scope(childSignal);
              if (childSignal.aborted) return child.dispose;
              const content = element("div", undefined, "ui-showcase ui-showcase-surface");
              content.dataset.showcase = "surface-nested";
              childContainer.append(content); child.own(() => content.remove());
              note(content, t("surface.nested.note"));
              retainedField(ui, content, child, "surface-child", t);
              family(ui, content, child, "menus", t("surface.menusAbove"), t, (area, lifetime) => mountOverlayExamples(ui, area, lifetime, "menus", t));
              family(ui, content, child, "dialogs", t("surface.dialogsAbove"), t, (area, lifetime) => mountOverlayExamples(ui, area, lifetime, "dialogs", t));
              return child.dispose;
            },
            onClose() { if (!life.signal.aborted) { closed++; lastCallback = "nested surface.onClose"; render(); } },
          }, life.signal));
        } });
        family(ui, body, life, "menus", t("surface.menusAbove"), t, (area, lifetime) => mountOverlayExamples(ui, area, lifetime, "menus", t));
        family(ui, body, life, "dialogs", t("surface.dialogsAbove"), t, (area, lifetime) => mountOverlayExamples(ui, area, lifetime, "dialogs", t));
        render();
      });
      return scope.dispose;
    },
    onClose,
  }, signal);
  return handle;
}
