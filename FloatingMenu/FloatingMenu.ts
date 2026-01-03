// 实现渲染菜单 不用绑定外界事件

import { Editor } from "../Editor/Editor";

export class FloatingMenu {
  dom: HTMLElement;
  editor: Editor;

  constructor(editor: Editor) {
    this.editor = editor;
    this.dom = this._createDOM();
    document.body.appendChild(this.dom);
    this._bindEvents();
  }

  private _createDOM(): HTMLElement {
    const div = document.createElement("div");
    div.id = "editor-floating-menu";
    div.style.display = "none";

    const buttons = [
      // --- 基础样式 ---
      { label: "B", format: "bold", value: true },
      { label: "I", format: "italic", value: true }, // 斜体
      { label: "U", format: "underline", value: true }, // 下划线
      { label: "S", format: "strike", value: true }, // 删除线
      { label: "`", format: "code", value: true }, // 行内代码

      // --- 颜色 (特殊处理 value) ---
      { label: "🔴", format: "color", value: "red" }, // 红字
      { label: "🔵", format: "color", value: "#007bff" }, // 蓝字

      // --- 块级样式 ---
      { label: "H1", format: "header", value: 1 },
      { label: "H2", format: "header", value: 2 },
      { label: "”", format: "blockquote", value: true }, // 引用

      // --- 功能 ---
      { label: "🔗", format: "link", value: "prompt" },
      { label: "✕", format: "clean", value: null }, // 清除
    ];

    buttons.forEach((btn) => {
      const button = document.createElement("button");
      button.innerHTML = btn.label;
      // dataset 存储操作类型
      button.dataset.format = btn.format;
      button.dataset.value = String(btn.value);
      button.title = `${btn.format} ${
        btn.value === true ? "" : btn.value || ""
      }`;
      button.onmousedown = (e) => {
        e.preventDefault();
        this._handleFormat(btn.format, btn.value);
      };

      div.appendChild(button);
    });

    return div;
  }

  private _handleFormat(format: string, value: any) {
    if (format === "link") {
      const url = prompt("请输入链接地址:", "https://");
      if (url) {
        this.editor.format("link", url);
      }
    } else if (format === "clean") {
      // [扩展] 清除格式时，需要清除所有已知的行内样式
      const inlineFormats = [
        "bold",
        "italic",
        "underline",
        "strike",
        "code",
        "color",
        "link",
      ];
      inlineFormats.forEach((fmt) => this.editor.format(fmt, null));
      // 也可以选择是否清除块级样式 (header, blockquote)
      this.editor.format("header", null);
      this.editor.format("blockquote", null);
    } else {
      const currentFormat = this.editor.getFormat();
      if (currentFormat[format] === value) {
        this.editor.format(format, null);
      } else {
        this.editor.format(format, value);
      }
    }
    this.update();
  }

  private _bindEvents() {
    this.editor.on("selection-change", () => {
      this.update();
    });

    window.addEventListener("scroll", () => {
      if (this.dom.style.display !== "none") {
        this._updatePosition();
      }
    });
  }

  update() {
    const range = this.editor.selection.getSelection();
    if (!range || range.length === 0) {
      this.dom.style.display = "none";
      return;
    }

    this.dom.style.display = "flex";
    this._updateButtonState();
    this._updatePosition();
  }

  private _updateButtonState() {
    const formats = this.editor.getFormat();
    const buttons = this.dom.querySelectorAll("button");

    buttons.forEach((button) => {
      const format = button.dataset.format;
      const value = button.dataset.value;

      // 简单的类型转换
      if (formats[format!] == value) {
        button.classList.add("is-active");
      } else {
        button.classList.remove("is-active");
      }
    });
  }

  private _updatePosition() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const nativeRange = selection.getRangeAt(0);
    const rect = nativeRange.getBoundingClientRect(); // 获取选区在视口中的矩形
    // 菜单的实际渲染高度/宽度 包含内边距，边框，但是不包含外边距
    const menuHeight = this.dom.offsetHeight;
    const menuWidth = this.dom.offsetWidth;

    // scrollX/Y 获取页面垂直/水平滚动的距离 视口坐标 => 页面全局坐标
    // 先到上方 再去加上滚动的距离 就是实际的位置
    let top = rect.top - menuHeight - 10 + window.scrollY;
    let left = rect.left + rect.width / 2 - menuWidth / 2 + window.scrollX;

    let isBelow = false;

    if (left < 10) left = 10;
    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 10;
    }

    if (top < window.scrollY) {
      top = rect.bottom + 10 + window.scrollY;
      isBelow = true;
    }

    if (isBelow) this.dom.classList.add("is-flipped");
    else this.dom.classList.remove("is-flipped");

    this.dom.style.top = `${top}px`;
    this.dom.style.left = `${left}px`;
  }
}
