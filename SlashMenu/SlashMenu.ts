import Delta from "../Delta/Delta";
import { Editor } from "../Editor/Editor";
import { DocumentHelper } from "../Editor/Helper/DocumentHelper";

interface MenuItem {
  icon: string;
  label: string;
  action?: () => void;
  hint?: string;

  format?: string;
  value?: any;
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
      // --- 标题 ---
      {
        icon: "H1",
        label: "一级标题",
        hint: "#",
        format: "header",
        value: 1,
      },
      {
        icon: "H2",
        label: "二级标题",
        hint: "##",
        format: "header",
        value: 2,
      },
      {
        icon: "📝",
        label: "文本",
        hint: "",
        format: "header",
        value: null, // 清除标题
      },

      // --- 列表 ---
      {
        icon: "•",
        label: "无序列表",
        hint: "- ",
        format: "list",
        value: "bullet",
      },
      {
        icon: "1.",
        label: "有序列表",
        hint: "1. ",
        format: "list",
        value: "ordered",
      },
      {
        icon: "✅",
        label: "待办列表",
        hint: "[]",
        format: "list",
        value: "unchecked",
      },

      // --- 引用 ---
      {
        icon: "“",
        label: "引用块",
        hint: "> ",
        format: "blockquote",
        value: true,
      },

      // --- 对齐方式 ---
      {
        icon: "⬅️",
        label: "左对齐",
        hint: "默认",
        format: "align",
        value: null,
      },
      {
        icon: "↔️",
        label: "居中对齐",
        hint: "",
        format: "align",
        value: "center",
      },
      {
        icon: "➡️",
        label: "右对齐",
        hint: "",
        format: "align",
        value: "right",
      },
      {
        icon: "📰",
        label: "两端对齐",
        hint: "Justify",
        format: "align",
        value: "justify",
      },

      // --- 复杂操作 (保留 Action) ---
      // 代码块涉及多行插入，比较复杂，暂时保留 action
      {
        icon: "📦",
        label: "代码块",
        hint: "```",
        action: () => this.editor.insertCodeBlock(),
      },
      // 图片需要弹窗，必须用 action
      {
        icon: "🖼️",
        label: "插入图片",
        hint: "",
        action: () => {
          const url = prompt("请输入图片地址:", "https://");
          if (url) this.editor.insertImage(url);
        },
      },
      // 分割线是插入操作，保留 action
      {
        icon: "➖",
        label: "分割线",
        hint: "---",
        action: () => this.editor.insertDivider(),
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
    const range = this.editor.selection.getSelection();
    if (!range) {
      this.hide();
      return;
    }

    if (item.format) {
      const slashIndex = range.index - 1;
      const lineEndIndex = DocumentHelper.findLineEnd(
        this.editor.doc,
        range.index
      );
      const change = new Delta()
        .retain(slashIndex)
        .delete(1)
        .retain(lineEndIndex - range.index)
        .retain(1, { [item.format!]: item.value });

      this.editor.submitChange(change);
      this.editor.selection.setSelection(range.index - 1);
    } else if (item.action) {
      const targetIndex = range.index - 1;
      this.editor.deleteText(targetIndex, 1);
      setTimeout(() => {
        this.editor.dom.focus();
        this.editor.selection.setSelection(targetIndex);
        item.action!();
      }, 0);
    }
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
