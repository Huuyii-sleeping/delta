import Delta from "../Delta/Delta";
import { HistoryManager } from "../History/History";
import { Renderer } from "../Render/Renderer";
import { SelectionManager } from "../Selection/Selection";
import { Clipboard } from "../Module/Clipboard";

export class Editor {
  dom: HTMLElement;
  doc: Delta;
  renderer: Renderer;
  selection: SelectionManager;
  history: HistoryManager;
  clipboard: Clipboard;

  constructor(selector: string) {
    this.dom = document.querySelector(selector) as HTMLElement;
    if (!this.dom) throw new Error(`找不到元素, ${selector}`);

    this.dom.contentEditable = "true";
    this.dom.style.whiteSpace = "pre-wrap";
    this.dom.style.outline = "none";

    this.doc = new Delta().insert("Hello World\n");
    this.renderer = new Renderer();
    this.selection = new SelectionManager(this.dom);
    this.history = new HistoryManager(this);
    this.clipboard = new Clipboard(this);

    this.updateView();
    this.bindEvents();
  }

  // 更新视图
  updateView() {
    const html = this.renderer.render(this.doc);
    if (this.dom.innerHTML !== html) {
      this.dom.innerHTML = html;
    }
  }

  // 事件绑定
  bindEvents() {
    // 使用beforeInput拦截输入操作
    this.dom.addEventListener("beforeinput", (e: InputEvent) => {
      e.preventDefault(); // 直接阻止默认行为，不允许直接修改DOM元素

      const range = this.selection.getSelection();
      const currentIndex = range ? range.index : 0;

      // 自己计算出Delta的变更
      const change = this.getDeltaFromInput(e, currentIndex);
      if (change) {
        const oldDocLength = this.doc.length();
        // compose 之前记录旧的文档，因为要对比旧的文档生成历史记录
        this.history.record(change, this.doc, range);
        this.doc = this.doc.compose(change);
        this.updateView();

        // 调用setSelection恢复光标的位置
        let newIndex = currentIndex;
        const newDocLength = this.doc.length();
        if (e.inputType === "deleteContentBackward") {
          newIndex = Math.max(0, newIndex - 1);
        } else {
          const diff = newDocLength - oldDocLength;
          if (diff > 0) newIndex += diff;
        }

        this.selection.setSelection(newIndex);
        console.log("Current Model:", JSON.stringify(this.doc.ops));
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
}
