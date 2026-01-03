import Delta from "../../Delta/Delta";
import { Editor } from "../Editor";
import { DocumentHelper } from "./DocumentHelper";

interface MarkdownRule {
  match: RegExp;
  format: string;
  value: any;
  length: number;
}

export class InputManager {
  editor: Editor;
  isComposing: boolean = false;
  dom: HTMLElement;
  lastSelection: { index: number; length: number } | null = null;

  private markdownRules: MarkdownRule[] = [
    { match: /^#$/, format: "header", value: 1, length: 1 },
    { match: /^##$/, format: "header", value: 2, length: 2 },
    { match: /^###$/, format: "header", value: 3, length: 3 },
    { match: /^(\*|-)$/, format: "list", value: "bullet", length: 1 },
    { match: /^1\.$/, format: "list", value: "ordered", length: 2 },
    { match: /^>$/, format: "blockquote", value: true, length: 1 },
    { match: /^```$/, format: "code-block", value: true, length: 3 },
    { match: /^\[\]$/, format: "list", value: "unchecked", length: 2 },
    { match: /^\[ \]$/, format: "list", value: "unchecked", length: 3 },
    { match: /^\[x\]$/, format: "list", value: "checked", length: 3 },
  ];

  constructor(editor: Editor) {
    this.editor = editor;
    this.dom = editor.dom;
    this.bindEvents();
  }

  bindEvents() {
    const dom = this.dom;

    // 中文输入
    dom.addEventListener("compositionstart", () =>
      this.handleCompositionStart()
    );
    dom.addEventListener("compositionend", (e: Event) =>
      this.handleCompositionEnd(e as CompositionEvent)
    );

    // 核心输入拦截
    dom.addEventListener("beforeinput", (e: Event) =>
      this.handleBeforeInput(e as InputEvent)
    );
  }

  private handleCompositionStart() {
    this.isComposing = true;
    this.lastSelection = this.editor.selection.getSelection();
    this.dom.classList.remove("is-empty");
    console.log("中文输入开始,锁定光标的位置:", this.lastSelection);
  }

  private handleCompositionEnd(e: CompositionEvent) {
    this.isComposing = false;
    console.log("中文输入结束,上屏内容:", e.data);
    if (e.data) {
      const insertIndex = this.lastSelection ? this.lastSelection.index : 0;

      // 注意：此时浏览器已经修改了DOM，此时getSelection算出来的index可能不准
      // 通常具有compositionend发生时，光标还在原来的位置（或者被浏览器移动到文字后面）
      // 稳妥做法：假设光标在输入开始的位置
      // 或者直接插入，使用updateView进行修正
      const change = new Delta().retain(insertIndex).insert(e.data);
      this.editor.history.record(change, this.editor.doc, this.lastSelection);
      this.editor.doc = this.editor.doc.compose(change);
      this.editor.updateView();
      const newIndex = insertIndex + e.data.length;
      this.editor.selection.setSelection(newIndex);
      this.editor.emit("text-change", this.editor.doc);
    } else {
      this.editor.updateView();
      if (this.lastSelection) {
        this.editor.selection.setSelection(this.lastSelection.index);
      }
    }
    this.lastSelection = null;
  }

  private handleBeforeInput(e: InputEvent) {
    if (this.isComposing) return;
    if (e.inputType === "insertFromComposition") return;

    const range = this.editor.selection.getSelection();
    const currentIndex = range ? range.index : 0;

    if (e.inputType === "insertText" && e.data === " ") {
      if (this.handleMarkdown(currentIndex, e)) return;
    }

    if (e.inputType === "insertText" && e.data === "/") {
      this.handleSlashMenu();
      return;
    } else {
      if (this.editor.slashMenu.isVisiable()) {
        this.editor.slashMenu.hide();
      }
    }

    e.preventDefault();

    const change = this.getDeltaFromInput(e, currentIndex);
    if (change) {
      const oldDocLength = this.editor.doc.length();
      this.editor.history.record(change, this.editor.doc, range);
      this.editor.doc = this.editor.doc.compose(change);
      this.editor.updateView();

      let newIndex = currentIndex;
      const newDocLength = this.editor.doc.length();
      if (e.inputType === "deleteContentBackward") {
        newIndex = Math.max(0, newIndex - 1);
      } else {
        const diff = newDocLength - oldDocLength;
        if (diff > 0) newIndex += diff;
      }
      this.editor.selection.setSelection(newIndex);
    }
  }

  private handleSlashMenu() {
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        // 延时处理以等待渲染
        this.editor.slashMenu.show(
          rect.left + window.scrollX,
          rect.bottom + window.scrollY
        );
      }
    }, 0);
  }

  private handleMarkdown(currentIndex: number, e: InputEvent): boolean {
    const textBefore = DocumentHelper.getTextBeforeCursor(
      this.editor.doc,
      currentIndex
    );
    for (const rule of this.markdownRules) {
      if (rule.match.test(textBefore)) {
        e.preventDefault();
        const lineEnd = DocumentHelper.findLineEnd(
          this.editor.doc,
          currentIndex
        );
        const change = new Delta()
          .retain(currentIndex - rule.length)
          .delete(rule.length)
          .retain(lineEnd - currentIndex)
          .retain(1, { [rule.format]: rule.value });

        this.editor.submitChange(change);
        this.editor.selection.setSelection(currentIndex - rule.length);
        return true;
      }
    }
    return false;
  }

  private getDeltaFromInput(e: InputEvent, index: number): Delta | null {
    if (e.inputType === "insertText" && e.data) {
      return new Delta().retain(index).insert(e.data);
    }

    if (e.inputType === "deleteContentBackward") {
      if (index <= 0) return null;
      return new Delta().retain(index - 1).delete(1);
    }

    if (e.inputType === "insertParagraph") {
      const currentFormat = DocumentHelper.getLineFormat(
        this.editor.doc,
        index
      );

      // 如果是空列表项回车，则取消列表样式
      if (
        currentFormat.list &&
        DocumentHelper.isLineEmpty(this.editor.doc, index)
      ) {
        const lineEnd = DocumentHelper.findLineEnd(this.editor.doc, index);
        return new Delta().retain(lineEnd).retain(1, { list: null });
      }

      const delta = new Delta().retain(index).insert("\n", currentFormat);
      // 清除Header属性的延续
      if (currentFormat.header) {
        const lineEnd = DocumentHelper.findLineEnd(this.editor.doc, index);
        const distanceToOldNewLine = lineEnd - index;
        delta.retain(distanceToOldNewLine).retain(1, { header: null });
      }
      return delta;
    }

    console.warn("未处理的输入类型:", e.inputType);
    return null;
  }
}
