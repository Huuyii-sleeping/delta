import { Editor } from "../Editor/Editor";

export class StorageManager {
  editor: Editor;
  storageKey: string;
  saveTimer: any = null;

  // 状态回调
  onStatusChange?: (state: "saving" | "saved" | "error") => void;

  constructor(editor: Editor, key: string = "my-editor-content") {
    this.editor = editor;
    this.storageKey = key;
    this.bindEvents();
  }

  bindEvents() {
    this.editor.on("text-change", () => {
      this.triggerAutoSave();
    });
  }

  triggerAutoSave() {
    if (this.onStatusChange) this.onStatusChange("saving");

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    const saveTimer = setTimeout(() => {
      this.save();
    }, 1000);
  }

  save() {
    try {
      const json = this.editor.getJSON();
      localStorage.setItem(this.storageKey, json);
      const selection = this.editor.selection.getSelection();
      if (selection) {
        localStorage.setItem(
          this.storageKey + ":selection",
          JSON.stringify(selection)
        );
      }

      console.log("✅ Auto-saved at " + new Date().toLocaleTimeString());
      if (this.onStatusChange) this.onStatusChange("saved");
    } catch (e) {
      console.error("Save failed", e);
      if (this.onStatusChange) this.onStatusChange("error");
    }
  }

  load() {
    try {
      const json = localStorage.getItem(this.storageKey);
      if (json) {
        this.editor.setContents(json);
        const savedSelection = localStorage.getItem(
          this.storageKey + ":selection"
        );
        if (savedSelection) {
          const range = JSON.parse(savedSelection);
          setTimeout(() => {
            if (range.index <= this.editor.doc.length()) {
              this.editor.selection.setSelection(range.index, range.length);
            }
          }, 0);
        }
      }
    } catch (error) {
      console.error("Load Failed", error);
    }
  }
}
