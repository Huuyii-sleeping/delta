import Delta from "../Delta/Delta";
import { Renderer } from "../Render/Renderer";
import { SelectionManager } from "../Selection/Selection";

export class Editor {
  dom: HTMLElement;
  doc: Delta;
  renderer: Renderer;
  selection: SelectionManager;

  constructor(selector: string) {
    this.dom = document.querySelector(selector) as HTMLElement;
    if (!this.dom) throw new Error(`找不到元素, ${selector}`);

    this.dom.contentEditable = "true";
    this.dom.style.whiteSpace = "pre-wrap";
    this.dom.style.outline = "none";

    this.doc = new Delta().insert("Hello World\n");
    this.renderer = new Renderer();
    this.selection = new SelectionManager(this.dom);

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
        this.doc = this.doc.compose(change);
        this.updateView();

        // 调用setSelection恢复光标的位置
        let newIndex = currentIndex;
        if (e.inputType === "insertText" && e.data) {
          newIndex += e.data.length;
        } else if (e.inputType === "deleteContentBackward") {
          newIndex = Math.max(0, newIndex - 1);
        } else if (e.inputType === "insertParagraph") {
          newIndex += 1;
        }

        this.selection.setSelection(newIndex);
        console.log("Current Model:", JSON.stringify(this.doc.ops));
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
      return new Delta().retain(index).insert("\n");
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
    console.log(change);
    this.doc = this.doc.compose(change);
    this.updateView();
    // 恢复原来的选区
    this.selection.setSelection(range.index, safeLength);
    console.log("Applied Format:", format, value);
  }
}
