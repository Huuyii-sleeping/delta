import { Editor } from "../Editor/Editor";
import { DocumentHelper } from "../Editor/Helper/DocumentHelper";
import { TableManager } from "../Editor/Helper/TableManager";

export class TableMenu {
  editor: Editor;
  dom: HTMLElement;
  tableManager: TableManager;
  targetCellIndex: number | null = null;

  constructor(editor: Editor) {
    this.editor = editor;
    this.tableManager = new TableManager(editor);
    this.dom = this._createDOM();
    document.body.appendChild(this.dom);
    this._bindEvents();
  }

  private _createDOM(): HTMLElement {
    const div = document.createElement("div");
    div.id = "editor-table-menu";
    div.style.display = "none";
    div.style.position = "fixed";
    div.style.background = "#fff";
    div.style.border = "1px solid #ddd";
    div.style.boxShadow = "0 2px 10px rgba(0,0,0,0.1)";
    div.style.zIndex = "1000";
    div.style.padding = "5px 0";
    div.style.borderRadius = "4px";

    const menus = [
      { label: "在上方插入行", action: () => this._insertRow(0) },
      { label: "在下方插入行", action: () => this._insertRow(1) },
      { label: "删除当前行", action: () => this._deleteRow() },
    ];

    menus.forEach((item) => {
      const btn = document.createElement("div");
      btn.innerHTML = item.label;
      btn.style.padding = "8px 15px";
      btn.style.cursor = "pointer";
      btn.style.fontSize = "14px";
      btn.onmouseover = () => (btn.style.backgroundColor = "#f5f5f5");
      btn.onmouseout = () => (btn.style.backgroundColor = "#fff");

      btn.onmousedown = (e) => {
        e.preventDefault();
        item.action();
        this.hide();
      };
      div.appendChild(btn);
    });
    return div;
  }

  private _bindEvents() {
    this.editor.dom.addEventListener("contextmenu", (e) => {
      const target = e.target as HTMLElement;
      const td = target.closest("td");
      if (td) {
        e.preventDefault();
        const index = this._findCellIndex(td);
        if (index !== -1) {
          this.targetCellIndex = index;
          this.show(e.clientX, e.clientY);
        }
      } else {
        this.hide();
      }
    });

    document.addEventListener("click", () => this.hide());
  }

  private _findCellIndex(td: HTMLElement): number {
    const index = DocumentHelper.findDOMNodeIndex(this.editor.dom, td);
    return index;
  }

  show(x: number, y: number) {
    this.dom.style.left = `${x}px`;
    this.dom.style.top = `${y}px`;
    this.dom.style.display = "block";
  }

  hide() {
    this.dom.style.display = "none";
  }

  private _insertRow(offset: number) {
    if (this.targetCellIndex !== null) {
      this.tableManager.insertRow(this.targetCellIndex, offset);
    }
  }

  private _deleteRow() {
    if (this.targetCellIndex !== null) {
      this.tableManager.deleteRow(this.targetCellIndex);
      this.targetCellIndex = null;
    }
  }
}
