import { Editor } from "../Editor/Editor";

interface MenuItem {
  icon: string;
  label: string;
  action: () => void;
  hint?: string;
}

export class SlashMenu {
  editor: Editor;
  dom: HTMLElement;
  items: MenuItem[];

  constructor(editor: Editor) {
    this.editor = editor;
    this.items = this._getItems();
    this.dom = this._createDOM();
    document.body.appendChild(this.dom);
    document.addEventListener("click", (e) => {
      if (
        this.dom.style.display === "block" &&
        !this.dom.contains(e.target as Node)
      ) {
        this.hide();
      }
    });
  }

  private _getItems(): MenuItem[] {
    return [
      {
        icon: "H1",
        label: "一级标题",
        hint: "#",
        action: () => this.editor.formatLine("header", 1),
      },
      {
        icon: "H2",
        label: "二级标题",
        hint: "##",
        action: () => this.editor.formatLine("header", 2),
      },
      {
        icon: "📝",
        label: "文本",
        hint: "",
        action: () => this.editor.formatLine("header", null), // 清除标题即为普通文本
      },
      {
        icon: "•",
        label: "无序列表",
        hint: "- ",
        action: () => this.editor.formatLine("list", "bullet"),
      },
      {
        icon: "1.",
        label: "有序列表",
        hint: "1. ",
        action: () => this.editor.formatLine("list", "ordered"),
      },
      {
        icon: "“",
        label: "引用块",
        hint: "> ",
        action: () => this.editor.formatLine("blockquote", true),
      },
      {
        icon: "📦",
        label: "代码块",
        hint: "```",
        action: () => this.editor.insertCodeBlock(), // 调用你之前实现的方法
      },
      {
        icon: "🖼️",
        label: "插入图片",
        hint: "",
        action: () => {
          const url = prompt("请输入图片地址:", "https://");
          if (url) this.editor.insertImage(url);
        },
      },
      {
        icon: "➖",
        label: "分割线",
        hint: "---",
        action: () => {
          this.editor.insertDivider();
        },
      },
      {
        icon: "✅",
        label: "待办列表",
        hint: "[]",
        action: () => this.editor.formatLine("list", "unchecked"),
      },
    ];
  }

  private _createDOM(): HTMLElement {
    const div = document.createElement("div");
    div.id = "slash-menu";

    this.items.forEach((item) => {
      const btn = document.createElement("div");
      btn.className = "slash-menu-item";
      btn.innerHTML = `<span class="icon">${item.icon}</span>
                <span class="label">${item.label}</span>
                <span class="hint">${item.hint || ""}</span>`;
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this._execute(item);
      });
      div.appendChild(btn);
    });

    return div;
  }

  private _execute(item: MenuItem) {
    // 删除用户输入的光标 /
    const range = this.editor.selection.getSelection();
    if (range) {
      this.editor.deleteText(range.index - 1, 1);
    }
    item.action();
    this.hide();
  }

  show(x: number, y: number) {
    this.dom.style.left = `${x}px`;
    this.dom.style.top = `${y + 5}px`;
    this.dom.style.display = "block";
    this.dom.classList.add("is-active");
  }

  hide() {
    this.dom.style.display = "none";
    this.dom.classList.remove("is-active");
  }

  isVisiable() {
    return this.dom.style.display === "block";
  }
}
