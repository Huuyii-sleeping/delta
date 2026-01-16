import Delta from "../Delta/Delta";
import Op from "../Delta/Op";
import { HistoryManager } from "../History/History";
import { Renderer } from "../Render/Renderer";
import { SelectionManager } from "../Selection/Selection";
import { Clipboard } from "../Clipboard/Clipboard";
import { EventEmitter } from "../EventEmitter/EventEmitter";
import { FloatingMenu } from "../FloatingMenu/FloatingMenu";
import { ImageResizer } from "../ImageResizer/ImageResizer";
import { SlashMenu } from "../SlashMenu/SlashMenu";
import { InputManager } from "./Helper/InputManager";
import { DragManager } from "./Helper/DragManager";
import { DocumentHelper } from "./Helper/DocumentHelper";
import { ShortcutManager } from "./Helper/ShortcutManager";
import { StorageManager } from "../Storage/Storage";
import { TableMenu } from "../TableMenu/TableMenu";

export class Editor extends EventEmitter {
  dom: HTMLElement;
  doc: Delta;
  // 渲染中心
  renderer: Renderer;
  // 选区管理
  selection: SelectionManager;
  // 历史记录
  history: HistoryManager;
  // 粘贴操作
  clipboard: Clipboard;
  // 标记位：标记是否正在进行中文输入
  isComposing: boolean = false;
  // 记录：防止因为中文输入法导致光标乱飞的问题，明确插入的具体位置
  lastSelection: { index: number; length: number } | null = null;
  // 浮动菜单
  floatingMenu: FloatingMenu;
  // 图片缩放工具
  imageResizer: ImageResizer;
  // / 展示菜单功能
  slashMenu: SlashMenu;
  // 拦截input的操作集合
  inputManager: InputManager;
  // 拖拽上传
  dragManager: DragManager;
  // 快捷键
  shortcutManager: ShortcutManager;
  // 存储功能
  storageManager: StorageManager;
  // 表格右键操作
  tableMenu: TableMenu;

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
    this.imageResizer = new ImageResizer(this);
    this.slashMenu = new SlashMenu(this);
    this.inputManager = new InputManager(this);
    this.dragManager = new DragManager(this);
    this.shortcutManager = new ShortcutManager(this);
    this.storageManager = new StorageManager(this, false);
    this.tableMenu = new TableMenu(this);

    const statusDiv = document.getElementById("editor-status");
    if (statusDiv) {
      this.storageManager.onStatusChange = (status) => {
        if (status) statusDiv.innerHTML = "Saving";
        if (status) statusDiv.innerHTML = "All Changed Saved";
        if (status) statusDiv.innerHTML = "Saved Error";
      };
    }

    // 保证数据的持久储存
    this.storageManager.load();

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

  bindEvents() {
    this.dom.addEventListener("click", (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // 待办事项
      if (target.classList.contains("todo-checkbox")) {
        const selection = this.selection.getSelection();
        this.lastSelection = selection;

        e.preventDefault();
        const lineNode = target.closest(".todo-item");
        if (lineNode) {
          const index = DocumentHelper.findDOMNodeIndex(this.dom, target);
          if (index !== -1) {
            const format = DocumentHelper.getLineFormat(this.doc, index);
            console.log("format:", format);
            const newStatus =
              format.list === "checked" ? "unchecked" : "checked";
            const lineEnd = DocumentHelper.findLineEnd(this.doc, index);
            const change = new Delta()
              .retain(lineEnd)
              .retain(1, { list: newStatus });

            this.submitChange(change);
          }
        }
        this.selection.setSelection(this.lastSelection?.index as number);
        this.lastSelection = null;
        return;
      }

      // 超链接
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

    document.addEventListener("selectionchange", () => {
      setTimeout(() => {
        const range = this.selection.getSelection();
        this.emit("selection-change", range);
      }, 0);
    });
  }

  deleteText(index: number, length: number) {
    const change = new Delta().retain(index).delete(length);
    this.doc = this.doc.compose(change);
    this.updateView();
    this.selection.setSelection(index);
  }

  submitChange(change: Delta) {
    const range = this.selection.getSelection();
    this.history.record(change, this.doc, range);
    this.doc = this.doc.compose(change);
    this.updateView();
    // 内容变了，触发事件监听
    this.emit("text-change", this.doc);
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

  /**
   * 文档内容的格式化
   * @param format 属性名
   * @param value 属性值
   */
  format(format: string, value: any) {
    // 获取当前选取
    const range = this.selection.getSelection();
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
    console.log(range);
    if (!range) return;

    // 找到当前行的结尾 => 换行符的位置
    const lineEndIndex = DocumentHelper.findLineEnd(this.doc, range.index);

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
    const lineFormat = DocumentHelper.getLineFormat(this.doc, range.index);
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

  insertCodeBlock() {
    const selection = this.selection.getSelection();
    if (!selection) return;

    const change = new Delta()
      .retain(selection.index)
      .insert("\n")
      .insert("\u200B", { "code-block": true })
      .insert("\n", { "code-block": true })
      .insert("\n");

    this.doc = this.doc.compose(change);
    this.updateView();
    this.selection.setSelection(selection.index + 2);
  }

  insertDivider() {
    const range = this.selection.getSelection();
    const index = range ? range.index : 0;

    const change = new Delta()
      .retain(index)
      .insert("\n")
      .insert({ divider: true } as any)
      .insert("\n");

    this.history.record(change, this.doc, range);
    this.doc = this.doc.compose(change);
    this.updateView();

    this.selection.setSelection(index + 2);
  }

  insertTable(rows: number = 3, cols: number = 2) {
    const range = this.selection.getSelection();
    if (!range) return;
    const delta = new Delta().retain(range.index);
    delta.insert("\n");
    for (let r = 0; r < rows; r++) {
      const rowId = DocumentHelper.generateId();
      for (let c = 0; c < cols; c++) {
        // 每个结尾都是回车并携带table的属性
        delta.insert(" ");
        delta.insert("\n", { table: rowId });
      }
    }
    this.submitChange(delta);
    this.selection.setSelection(range.index + 2);
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
