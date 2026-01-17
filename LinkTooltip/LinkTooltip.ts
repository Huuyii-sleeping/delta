import { Editor } from "../Editor/Editor";

export class LinkTooltip {
  editor: Editor;
  dom: HTMLElement;

  // 使用的相关的UI元素
  private _previewBox!: HTMLElement;
  private _editBox!: HTMLElement;
  private _linkInput!: HTMLInputElement;
  private _linkAnchor!: HTMLAnchorElement;

  private _currentLinkNode: HTMLAnchorElement | null = null;

  constructor(editor: Editor) {
    this.editor = editor;
    this.dom = this._createDOM();
    document.body.appendChild(this.dom);
    this._bindEvents();
  }

  private _createDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "editor-link-tooltip";
    Object.assign(container.style, {
      position: "fixed",
      display: "none",
      zIndex: "1000",
      backgroundColor: "#fff",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      border: "1px solid #ddd",
      borderRadius: "4px",
      padding: "8px",
      fontSize: "14px",
      alignItems: "center",
      gap: "8px",
    });

    this._previewBox = document.createElement("div");
    this._previewBox.style.display = "flex";
    this._previewBox.style.alignItems = "center";
    this._previewBox.style.gap = "8px";

    this._linkAnchor = document.createElement("a");
    this._linkAnchor.target = "_blank";
    this._linkAnchor.style.maxWidth = "200px";
    this._linkAnchor.style.overflow = "hidden";
    this._linkAnchor.style.textOverflow = "ellipsis";
    this._linkAnchor.style.whiteSpace = "nowrap";
    this._linkAnchor.style.color = "#007bff";
    this._linkAnchor.style.textDecoration = "none";
    this._linkAnchor.innerText = "https://...";

    const editBtn = document.createElement("button");
    editBtn.innerText = "🖊️";
    editBtn.title = "编辑链接";
    editBtn.onclick = () => this._switchMode("edit");

    const removeBtn = document.createElement("button");
    removeBtn.innerText = "🔗🚫";
    removeBtn.title = "移除链接";
    removeBtn.onclick = () => this._removeLink();

    this._previewBox.append(this._linkAnchor, editBtn, removeBtn);

    this._editBox = document.createElement("div");
    this._editBox.style.display = "none"; // 默认隐藏
    this._editBox.style.alignItems = "center";
    this._editBox.style.gap = "4px";

    this._linkInput = document.createElement("input");
    this._linkInput.type = "text";
    this._linkInput.placeholder = "输入链接地址...";
    this._linkInput.style.padding = "4px";
    this._linkInput.style.border = "1px solid #ddd";
    this._linkInput.style.borderRadius = "4px";

    const confirmBtn = document.createElement("button");
    confirmBtn.innerText = "✅";
    confirmBtn.onclick = () => this._confirmEdit();

    const cancelBtn = document.createElement("button");
    cancelBtn.innerText = "❌";
    cancelBtn.onclick = () => this._switchMode("preview");

    this._editBox.append(this._linkInput, confirmBtn, cancelBtn);
    container.append(this._previewBox, this._editBox);
    return container;
  }

  private _bindEvents() {
    // 监听光标是否再超链接的上面
    this.editor.on("selection-change", () => {
      setTimeout(() => {
        this._check();
      }, 20);
    });
  }

  private _check() {
    if (this._editBox.style.display === "flex") return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      this.hide();
      return;
    }

    let node = selection.anchorNode;
    if (node && node.nodeType === Node.TEXT_NODE) {
      node = node.parentNode;
    }

    const anchor = (node as HTMLElement)?.closest("a");
    if (anchor && this.editor.dom.contains(anchor)) {
      this._currentLinkNode = anchor;
      this.show(anchor as HTMLAnchorElement);
    } else {
      this.hide();
    }
  }

  show(anchorNode: HTMLAnchorElement) {
    const href = anchorNode.getAttribute("href") || "";

    this._linkAnchor.href = href;
    this._linkAnchor.innerText = href;
    this._switchMode("preview");

    // 确定定位的位置
    const rect = anchorNode.getBoundingClientRect();
    const tooltipRect = this.dom.getBoundingClientRect();

    // 找到定位的位置
    let top = rect.bottom + 5;
    let left = rect.left;

    if (left + 300 > window.innerWidth) {
      left = window.innerWidth - 310;
    }

    this.dom.style.top = `${top}px`;
    this.dom.style.left = `${left}px`;
    this.dom.style.display = "flex";
  }

  hide() {
    this.dom.style.display = "none";
    this._currentLinkNode = null;
    this._switchMode("preview");
  }

  private _switchMode(mode: "preview" | "edit") {
    if (mode === "preview") {
      this._previewBox.style.display = "flex";
      this._editBox.style.display = "none";
    } else {
      this._previewBox.style.display = "none";
      this._editBox.style.display = "flex";
      this._linkInput.value = this._linkAnchor.getAttribute("href") || "";
      this._linkInput.focus();
    }
  }

  private _confirmEdit() {
    const newUrl = this._linkInput.value.trim();
    if (newUrl) {
      this.editor.format("link", newUrl);
      this.hide();
    }
  }

  private _removeLink() {
    this.editor.format("link", null);
    this.hide();
  }
}
