import Delta from "../Delta/Delta";
import Op from "../Delta/Op";
import { HistoryManager } from "../History/History";
import { Renderer } from "../Render/Renderer";
import { SelectionManager } from "../Selection/Selection";
import { Clipboard } from "../Clipboard/Clipboard";
import { EventEmitter } from "../EventEmitter/EventEmitter";
import { FloatingMenu } from "../FloatingMenu/FloatingMenu";

interface MarkdownRule {
  match: RegExp;
  format: string;
  value: any;
  length: number;
}

export class Editor extends EventEmitter {
  dom: HTMLElement;
  doc: Delta;
  renderer: Renderer;
  selection: SelectionManager;
  history: HistoryManager;
  clipboard: Clipboard;
  // 标记位：标记是否正在进行中文输入
  isComposing: boolean = false;
  // 记录：防止因为中文输入法导致光标乱飞的问题，明确插入的具体位置
  lastSelection: { index: number; length: number } | null = null;
  floatingMenu: FloatingMenu;

  private markdownRules: MarkdownRule[] = [
    { match: /^#$/, format: "header", value: 1, length: 1 }, // # -> H1
    { match: /^##$/, format: "header", value: 2, length: 2 }, // ## -> H2
    { match: /^###$/, format: "header", value: 3, length: 3 }, // ### -> H3
    { match: /^(\*|-)$/, format: "list", value: "bullet", length: 1 }, // * 或 - -> 无序列表
    { match: /^1\.$/, format: "list", value: "ordered", length: 2 }, // 1. -> 有序列表
    { match: /^>$/, format: "blockquote", value: true, length: 1 }, // > -> 引用 (如果你支持的话)
    { match: /^>$/, format: "blockquote", value: true, length: 1 },
    { match: /^```$/, format: "code-block", value: true, length: 3 },
  ];

  constructor(selector: string) {
    super();
    this.dom = document.querySelector(selector) as HTMLElement;
    if (!this.dom) throw new Error(`找不到元素, ${selector}`);

    this.dom.contentEditable = "true";
    this.dom.style.whiteSpace = "pre-wrap";
    this.dom.style.outline = "none";

    this.doc = new Delta().insert("\n");
    this.renderer = new Renderer();
    this.selection = new SelectionManager(this.dom);
    this.history = new HistoryManager(this);
    this.clipboard = new Clipboard(this);
    this.floatingMenu = new FloatingMenu(this);

    this.updateView();
    this.bindEvents();
  }

  // 更新视图
  updateView() {
    const html = this.renderer.render(this.doc);
    if (this.dom.innerHTML !== html) {
      this.dom.innerHTML = html;
    }
    if (this.isEmpty()) {
      this.dom.classList.add("is-empty");
    } else {
      this.dom.classList.remove("is-empty");
    }
  }

  // 事件绑定
  bindEvents() {
    // 监听拖拽上传
    this.dom.addEventListener("drag", (e: DragEvent) => {
      e.preventDefault();

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith("image/")) {
          // 体验优化：
          // 我们希望放到鼠标移动的位置，而不是当前光标的位置
          this._updateSelectionByMouse(e.clientX, e.clientY);
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event?.target?.result as string;
            if (base64) this.insertImage(base64);
          };
          reader.readAsDataURL(file);
        }
      }
    });

    // 监听点击事件，处理超链接的跳转
    this.dom.addEventListener("click", (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const linkNode = target.closest("a");
      if (linkNode && linkNode.getAttribute("href")) {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const href = linkNode.getAttribute("href");
          if (href) {
            window.open(href, "_blank");
          }
        }
      }
    });

    // 监听中文输入
    this.dom.addEventListener("compositionstart", () => {
      this.isComposing = true;
      this.lastSelection = this.selection.getSelection();
      this.dom.classList.remove("is-empty");
      console.log("中文输入开始,锁定光标的位置:", this.lastSelection);
    });

    this.dom.addEventListener("compositionend", (e: CompositionEvent) => {
      this.isComposing = false;
      console.log("中文输入结束,上屏内容:", e.data);
      if (e.data) {
        const insertIndex = this.lastSelection ? this.lastSelection.index : 0;

        // 注意：此时浏览器已经修改了DOM，此时getSelection算出来的index可能不准
        // 通常具有compositionend发生时，光标还在原来的位置（或者被浏览器移动到文字后面）
        // 稳妥做法：假设光标在输入开始的位置
        // 或者直接插入，使用updateView进行修正
        const change = new Delta().retain(insertIndex).insert(e.data);
        // this._handleDeltaChange(change, currentIndex, e.data.length);
        this.history.record(change, this.doc, this.lastSelection);
        this.doc = this.doc.compose(change);
        this.updateView();
        const newIndex = insertIndex + e.data.length;
        this.selection.setSelection(newIndex);
        this.emit("text-change", this.doc);
      } else {
        this.updateView();
        if (this.lastSelection) {
          this.selection.setSelection(this.lastSelection.index);
        }
      }
      this.lastSelection = null;
    });

    // 使用beforeInput拦截输入操作
    this.dom.addEventListener("beforeinput", (e: InputEvent) => {
      if (this.isComposing) return;
      if (e.inputType === "insertFromComposition") return;

      const range = this.selection.getSelection();
      const currentIndex = range ? range.index : 0;

      // 监听 #+" " => 实现标题的作用
      if (e.inputType === "insertText" && e.data === " ") {
        const textBefore = this._getTextBeforeCursor(currentIndex);
        for (const rule of this.markdownRules) {
          if (rule.match.test(textBefore)) {
            e.preventDefault();

            const lineEnd = this._findLineEnd(currentIndex);
            const change = new Delta()
              .retain(currentIndex - rule.length) // 跳转到#之前
              .delete(rule.length) // 删除#
              .retain(lineEnd - currentIndex) // 跳过中间的内容
              .retain(1, { [rule.format]: rule.value }); // 格式化\n

            this.history.record(change, this.doc, range);
            this.doc = this.doc.compose(change);
            this.updateView();

            this.selection.setSelection(currentIndex - rule.length);
            return;
          }
        }
      }

      e.preventDefault(); // 直接阻止默认行为，不允许直接修改DOM元素

      // 自己计算出Delta的变更
      const change = this.getDeltaFromInput(e, currentIndex);
      if (change) {
        const oldDocLength = this.doc.length();
        this.history.record(change, this.doc, range);
        this.doc = this.doc.compose(change);
        this.updateView();

        let newIndex = currentIndex;
        const newDocLength = this.doc.length();
        if (e.inputType === "deleteContentBackward") {
          newIndex = Math.max(0, newIndex - 1);
        } else {
          const diff = newDocLength - oldDocLength;
          if (diff > 0) newIndex += diff;
        }
        this.selection.setSelection(newIndex);
      }
    });

    this.dom.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") {
          e.preventDefault();
          if (e.shiftKey) {
            this.history.redo();
          } else {
            this.history.undo();
          }
        }

        if (e.key === "y") {
          e.preventDefault();
          this.history.redo();
        }
      }
    });

    document.addEventListener("selectionchange", () => {
      setTimeout(() => {
        const range = this.selection.getSelection();
        this.emit("selection-change", range);
      }, 0);
    });
  }

  enable(enabled: boolean = true) {
    this.dom.contentEditable = String(enabled);
    if (enabled) {
      this.dom.classList.remove("read-only");
    } else {
      this.dom.classList.add("read-only");
    }
  }

  disable() {
    this.enable(false);
  }

  isEmpty(): boolean {
    if (this.isComposing) return false;
    if (this.doc.length() > 1) return false;
    const firstOp = this.doc.ops[0];
    return !firstOp || (firstOp.insert === "\n" && this.doc.ops.length === 1);
  }

  // 将输入的事件翻译成Delta
  getDeltaFromInput(e: InputEvent, index: number): Delta | null {
    if (e.inputType === "insertText" && e.data) {
      return new Delta().retain(index).insert(e.data);
    }

    if (e.inputType === "deleteContentBackward") {
      if (index <= 0) return null;
      // 使用backspace删除键
      return new Delta().retain(index - 1).delete(1);
    }

    if (e.inputType === "insertParagraph") {
      // 查看当前的样式
      const currentFormat = this._getLineFormat(index);

      if (currentFormat.list && this._isLineEmpty(index)) {
        const lineEnd = this._findLineEnd(index);
        return new Delta().retain(lineEnd).retain(1, { list: null });
      }
      // 处理逻辑：
      // 在当前位置插入一个具有继承属性的回车
      // 清除最后的回车当中的样式
      const delta = new Delta().retain(index).insert("\n", currentFormat);
      if (currentFormat.header) {
        const lineEnd = this._findLineEnd(index);
        const distanceToOldNewLine = lineEnd - index;
        delta.retain(distanceToOldNewLine).retain(1, { header: null });
      }
      return delta;
    }

    console.warn("未处理的输入类型:", e.inputType);
    return null;
  }

  /**
   * 文档内容的格式化
   * @param format 属性名
   * @param value 属性值
   */
  format(format: string, value: any) {
    // 获取当前选取
    const range = this.selection.getSelection();
    console.log(range);
    if (!range || range.length === 0) return;

    // 只有选中了文本才会处理
    // 如果光标只是闪烁状态，通常是“设置下面的格式”

    const docLength = this.doc.length();

    let safeLength = range.length;
    if (range.index + safeLength > docLength) {
      safeLength = docLength - range.index;
      console.warn(
        `选区越界修正: 原长 ${range.length} -> 修正后 ${safeLength}`
      );
    }

    if (safeLength <= 0) return;

    const change = new Delta()
      .retain(range.index) // 跳过前面的内容
      .retain(range.length, { [format]: value }); // 对选中的内容进行格式化

    // 记录操作历史
    this.history.record(change, this.doc, range);
    this.doc = this.doc.compose(change);
    this.updateView();
    // 恢复原来的选区
    this.selection.setSelection(range.index, safeLength);
    console.log("Applied Format:", format, value);
  }

  /**
   * 格式化当前行（块级样式）
   * @param format
   * @param value
   * @returns
   */
  formatLine(format: string, value: any) {
    const range = this.selection.getSelection();
    if (!range) return;

    // 找到当前行的结尾 => 换行符的位置
    const lineEndIndex = this._findLineEnd(range.index);

    const change = new Delta()
      .retain(lineEndIndex)
      .retain(1, { [format]: value });

    console.log("Apply Block Format:", JSON.stringify(change.ops));
    this.history.record(change, this.doc, range);
    this.doc = this.doc.compose(change);
    this.updateView();

    this.selection.setSelection(range.index, range.length);
  }

  /**
   * 获取样式，用来给对应的按钮添加样式
   * @returns
   */
  getFormat(): Record<string, any> {
    const range = this.selection.getSelection();
    if (!range) return {};

    const formats: Record<string, any> = {};

    // 如果具有选区，通常看开头的格式，或者计算所有字符的交集
    // 简化处理：选取开始位置的属性
    // 注意：如果text-change刚刚发生，doc已经是最新的了
    let currentPos = 0;
    for (const op of this.doc.ops) {
      const len = typeof op.insert === "string" ? op.insert.length : 1;
      if (currentPos + len > range.index) {
        if (op.attributes) {
          Object.assign(formats, op.attributes);
        }
        break;
      }
      currentPos += len;
    }

    //还需要检查当前行的块级样式
    const lineFormat = this._getLineFormat(range.index);
    Object.assign(formats, lineFormat);
    return formats;
  }

  /**
   * 插入图片当中的方法
   * @param url
   */
  insertImage(url: string) {
    const range = this.selection.getSelection();
    const index = range ? range.index : 0;

    const change = new Delta().retain(index).insert({ image: url } as any);
    this.history.record(change, this.doc, range);
    this.doc = this.doc.compose(change);
    this.updateView();
    this.selection.setSelection(index + 1);
  }

  /**
   * 获取当前行，光标之前的文本（检测md文件使用）
   * @param index 光标位置
   * @returns
   */
  private _getTextBeforeCursor(index: number): string {
    const lineStart = this._findLineStart(index);
    const slice = this.doc.slice(lineStart, index);

    return slice.ops.reduce((text, op) => {
      if (typeof op.insert === "string") return text + op.insert;
      return text;
    }, "");
  }

  private _updateSelectionByMouse(x: number, y: number) {
    let range: Range | null = null;
    // 兼容性处理
    if (document.caretRangeFromPoint) {
      // Chrome Safari Edge
      range = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
      // Firefox
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }

    if (range && this.dom.contains(range.startContainer)) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      // 同步更新最新的状态
    }
  }

  /**
   * 辅助方法：
   * 找到当前位置最后的第一个换行符的索引
   * 用于定位当前行的结尾，以便于应用块级样式
   * @param startIndex
   */
  private _findLineEnd(startIndex: number): number {
    let currentPos = 0;

    for (const op of this.doc.ops) {
      const len = typeof op.insert === "string" ? op.insert.length : 1;

      // 如果当前的op在我们查找的范围之后，或者包含查找起点
      if (currentPos + len > startIndex) {
        if (typeof op.insert === "string") {
          const offsetInOp = Math.max(0, startIndex - currentPos);
          const relativeIndex = op.insert.indexOf("\n", offsetInOp);

          if (relativeIndex !== -1) {
            // 返回绝对索引，Op起始位置+偏移的位置
            return currentPos + relativeIndex;
          }
        }
      }
      currentPos += len;
    }

    return this.doc.length();
  }

  /**
   * 辅助方法：
   * 找到当前行的开始位置
   * @param index
   */
  private _findLineStart(index: number): number {
    let currentPos = 0;
    let lastNewLinePos = -1;

    for (const op of this.doc.ops) {
      const len = typeof op.insert === "string" ? op.insert.length : 1;

      if (currentPos < index) {
        if (typeof op.insert === "string") {
          let relativeIndex = op.insert.indexOf("\n");
          while (relativeIndex !== -1 && currentPos + relativeIndex < index) {
            lastNewLinePos = currentPos + relativeIndex;
            relativeIndex = op.insert.indexOf("\n", relativeIndex + 1);
          }
        }
      } else {
        break;
      }

      currentPos += len;
    }
    return lastNewLinePos + 1;
  }

  /**
   * 判断是不是空行
   * @param index
   * @returns
   */
  private _isLineEmpty(index: number): boolean {
    const start = this._findLineStart(index);
    const end = this._findLineEnd(index);
    return start === end;
  }

  /**
   * 获取当前行结尾的回车属性
   * @param index
   * @returns
   */
  private _getLineFormat(index: number): Record<string, any> {
    // 找到这一行的结尾
    const lineEndIndex = this._findLineEnd(index);

    if (lineEndIndex >= this.doc.length()) return {};

    // 获取\n的Op
    let currentPos = 0;
    for (const op of this.doc.ops) {
      const len = typeof op.insert === "string" ? op.insert.length : 1;
      if (currentPos + len > lineEndIndex) {
        return op.attributes || {};
      }
      currentPos += len;
    }

    return {};
  }

  /**
   * 导出JSON数据
   * @returns
   */
  getJSON(): string {
    return JSON.stringify(this.doc.ops);
  }

  /**
   * 导入数据(用来回显)
   * @param content JSON字符或者Ops对象数组
   */
  setContents(content: string | Op[]) {
    let ops;
    try {
      if (typeof content === "string") {
        ops = JSON.parse(content);
      } else {
        ops = content;
      }

      this.doc = new Delta(ops);
      if (this.doc.length() > 0) {
        const lastOp = this.doc.ops[this.doc.ops.length - 1];
        if (
          typeof lastOp.insert === "string" &&
          !lastOp.insert.endsWith("\n")
        ) {
          this.doc.insert("\n");
        } else {
          this.doc.insert("\n");
        }
      }

      this.updateView();
      this.history.undoStack = [];
      this.history.redoStack = [];
    } catch (error) {
      console.error("加载内容失败", error);
    }
  }
}
