import { Editor } from "../Editor/Editor";

export class TableResizer {
  editor: Editor;
  handle: HTMLElement;

  activeTable: HTMLElement | null = null;
  activeColIndex: number = -1;
  startX: number = 0;
  startWidth: number = 0;

  constructor(editor: Editor) {
    console.log(111)
    this.editor = editor;
    this.handle = this._createHandle();
    this._bindEvents();
  }

  private _createHandle() {
    const div = document.createElement("div");
    div.className = "table-resizer-handle";
    Object.assign(div.style, {
      position: "fixed",
      width: "4px",
      height: "100%", // 拖拽时变成屏幕高度
      backgroundColor: "#007bff",
      cursor: "col-resize",
      display: "none",
      zIndex: "2000",
      opacity: "0.5",
      pointerEvents: "none", // 让鼠标事件透传给 document
    });
    console.log(div)
    document.body.appendChild(div);
    return div;
  }

  private _bindEvents() {
    // 鼠标移动：检测是否靠近表格列表框
    this.editor.dom.addEventListener("mousemove", (e) => this._checkHover(e));

    // 拖拽逻辑
    document.addEventListener("mousedown", (e) => this._startDrag(e));
    document.addEventListener("mousemove", (e) => this._onDrag(e));
    document.addEventListener("mouseup", (e) => this._endDrag(e));
  }

  private _checkHover(e: MouseEvent) {
    if (this.activeColIndex !== -1 && this.handle.style.display === "block")
      return;

    const target = e.target as HTMLElement;
    const td = target.closest("td");
    if (!td) {
      this.editor.dom.style.cursor = "";
      return;
    }

    const rect = td.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    if (Math.abs(rect.width - offsetX) < 10) {
      this.editor.dom.style.cursor = "col-resize";
      this.activeTable = td.closest("table");
      const tr = td.parentElement;
      if (tr) {
        this.activeColIndex = Array.from(tr.children).indexOf(td);
      }
    } else {
      this.editor.dom.style.cursor = "";
      this.activeTable = null;
      this.activeColIndex = -1;
    }
  }

  private _startDrag(e: MouseEvent) {
    if (this.editor.dom.style.cursor !== "col-resize" || !this.activeTable)
      return;

    e.preventDefault();
    this.startX = e.clientX;
    const rows = this.activeTable.querySelectorAll("tr");
    const firstCell = rows[0]?.children[this.activeColIndex] as HTMLElement;
    if (firstCell) {
      this.startWidth = firstCell.offsetWidth;
    }

    this.handle.style.left = `${e.clientX}px`;
    this.handle.style.top = `${this.activeTable.getBoundingClientRect().top}px`;
    this.handle.style.height = `${this.activeTable.offsetHeight}px`;
    this.handle.style.display = "block";
    this.handle.style.pointerEvents = "auto";
  }

  private _onDrag(e: MouseEvent) {
    if (this.handle.style.display === "none") return;
    this.handle.style.left = `${e.clientX}px`;
  }

  private _endDrag(e: MouseEvent) {
    if (this.handle.style.display === "none") return;
    const diff = e.clientX - this.startX;
    const newWidth = Math.max(30, this.startWidth + diff);

    this.handle.style.display = "none";
    this.handle.style.pointerEvents = "none";
    this.editor.dom.style.cursor = "";

    if (this.activeColIndex !== -1) {
      this._applyWidthToDOM(newWidth);
      // [TODO] 对Delta的更改
    }
    this.activeTable = null;
    this.activeColIndex = -1;
  }

  private _applyWidthToDOM(width: number) {
    if (!this.activeTable) return;
    const rows = this.activeTable.querySelectorAll("tr");
    rows.forEach((row) => {
      const cell = row.children[this.activeColIndex] as HTMLElement;
      if (cell) cell.style.width = `${width}px`;
    });
  }
}
