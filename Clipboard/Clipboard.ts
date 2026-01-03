// 剪切板模块

import Delta from "../Delta/Delta";
import { Editor } from "../Editor/Editor";
import { Parser } from "../Parser/Parser";

export class Clipboard {
  editor: Editor;
  parser: Parser;

  constructor(editor: Editor) {
    this.editor = editor;
    this.parser = new Parser();
    this.init();
  }

  init() {
    this.editor.dom.addEventListener("paste", (e: ClipboardEvent) => {
      e.preventDefault();

      if (!e.clipboardData) return;

      const html = e.clipboardData.getData("text/html");
      const text = e.clipboardData.getData("text/plain");

      let delta: Delta;
      if (html) {
        console.log("Pasting HTML", html);
        delta = this.parser.parse(html);
      } else {
        console.log("Paser Text", text);
        delta = new Delta().insert(text.replace(/\r/g, ""));
      }
      this.insertDelta(delta);
    });
  }

  /**
   * 在当前的位置插入Delta
   */
  insertDelta(pasteDelta: Delta) {
    const selection = this.editor.selection.getSelection();
    if (!selection) return;
    // const change = new Delta().retain(selection.index).concat(pasteDelta);
    const changeOps = new Delta()
      .retain(selection.index)
      .ops.concat(pasteDelta.ops);
    const change = new Delta(changeOps);

    this.editor.history.record(change, this.editor.doc, selection);
    this.editor.doc = this.editor.doc.compose(change);
    this.editor.updateView();

    const newIndex = selection.index + pasteDelta.length();
    this.editor.selection.setSelection(newIndex);
  }
}
