import Delta from "../Delta/Delta";
import Op from "../Delta/Op";
import Prism from "prismjs";
import "prismjs/themes/prism.css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-css";
import "prismjs/components/prism-markup";

export class Renderer {
  static formats: Record<string, any> = {
    // 基础
    bold: { tag: "strong" },
    italic: { tag: "em" }, // 斜体 -> <em>
    underline: { tag: "u" }, // 下划线 -> <u>
    strike: { tag: "s" }, // 删除线 -> <s>
    code: {
      tag: "code",
      style:
        "background: #f0f0f0; padding: 2px 4px; border-radius: 4px; font-family: monospace;",
    }, // 行内代码 -> <code>

    // 样式
    link: { tag: "a", attr: "href" },
    color: { style: "color" }, // 字体颜色
    background: { style: "background-color" }, // 背景色

    // 字体 (如果以后做字号)
    size: { style: "font-size" },
  };

  render(delta: Delta): string {
    let html = "";
    const lines = this._splitDeltaIntoLines(delta);

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const attrs = line.attrs || {};

      if (attrs["code-block"]) {
        const result = this._renderCodeBlock(lines, i);
        html += result.html;
        i = result.nextIndex;
        continue;
      }

      if (attrs["table"]) {
        const result = this._renderTable(lines, i);
        html += result.html;
        i = result.nextIndex;
        continue;
      }

      if (attrs["list"]) {
        html += this._renderList(lines, i);
        i++;
        continue;
      }

      html += this._renderStandardBlock(line);
      i++;
    }
    return html;
  }

  private _renderList(lines: any[], index: number): string {
    const line = lines[index];
    const attrs = line.attrs;
    const content = this._renderInlineOps(line.ops);
    const styleAttr = this._getStyleAttr(attrs);

    if (attrs.list === "checked" || attrs.list === "unchecked") {
      const isChecked = attrs.list === "checked";
      return `<div class="todo-item ${
        isChecked ? "is-completed" : ""
      }"${styleAttr}><span class="todo-checkbox" contenteditable="false">${
        isChecked ? "☑️" : "⬜"
      }</span><span class="todo-content">${content}</span></div>`;
    }

    const listType = attrs.list === "ordered" ? "ol" : "ul";
    const prevLine = lines[index - 1];
    const nextLine = lines[index + 1];
    let html = "";

    const prevType = this._getListType(prevLine?.attrs?.list);
    if (listType !== prevType) {
      html += `<${listType}>`;
    }
    html += `<li${styleAttr}>${content}</li>`;

    const nextType = this._getListType(nextLine?.attrs?.list);
    if (listType !== nextType) {
      html += `</${listType}>`;
    }
    return html;
  }

  private _renderStandardBlock(line: any): string {
    const attrs = line.attrs || {};
    let content = this._renderInlineOps(line.ops);
    if (!content) content = "<br>";

    const styleAttr = this._getStyleAttr(attrs);
    if (attrs.header) {
      return `<h${attrs.header}${styleAttr}>${content}</h${attrs.header}>`;
    }
    if (attrs.blockquote) {
      return `<blockquote${styleAttr}>${content}</blockquote>`;
    }
    return `<div${styleAttr}>${content}</div>`;
  }

  private _renderTable(lines: any[], startIndex: number) {
    let i = startIndex;
    const tableLines = [];
    while (i < lines.length && lines[i].attrs?.table) {
      tableLines.push(lines[i]);
      i++;
    }

    let html = '<div class="table-wrapper"><table class="editor-table"><tbody>';
    let currentRowId: string | null = null;
    tableLines.forEach((line) => {
      const rowId = line.attrs.table;
      const content = this._renderInlineOps(line.ops);
      const styleAttr = this._getStyleAttr(line.attrs);

      // 如果换行，就闭合并且执行下一行
      if (rowId !== currentRowId) {
        if (currentRowId !== null) {
          html += "</tr>";
        }
        html += `<tr data-row="${rowId}">`;
        currentRowId = rowId;
      }
      html += `<td${styleAttr}>${content}</td>`;
    });

    if (currentRowId !== null) {
      html += "</tr>";
    }
    html += "</tbody></table></div>";
    return { html, nextIndex: i };
  }

  private _renderCodeBlock(lines: any[], startIndex: number) {
    let i = startIndex;
    const codeLines: string[] = [];
    while (i < lines.length && lines[i].attrs && lines[i].attrs["code-block"]) {
      const rawText = lines[i].ops
        .map((op: Op) => (typeof op.insert === "string" ? op.insert : ""))
        .join("");
      codeLines.push(rawText);
      i++;
    }

    const fullCodeText = codeLines.join("\n");
    const lang = "javascript";
    let highlighted = "";
    if (Prism.languages[lang]) {
      highlighted = Prism.highlight(fullCodeText, Prism.languages[lang], lang);
    } else {
      highlighted = this._escapeHtml(fullCodeText);
    }

    const styleAttr = this._getStyleAttr(lines[startIndex].attrs);
    const html = `<pre class="language-${lang}"${styleAttr}><code>${highlighted}</code></pre>`;
    return { html, nextIndex: i };
  }

  private _getStyleAttr(attrs: any): string {
    if (!attrs) return "";
    let styleStr = "";
    if (attrs.align) {
      styleStr += `text-align: ${attrs.align};`;
    }
    return styleStr ? ` style="${styleStr}"` : "";
  }

  private _getListType(listAttr: string | undefined): string | null {
    if (listAttr === "ordered") return "ol";
    if (listAttr === "bullet") return "ul";
    return null;
  }

  /**
   * 批量渲染Ops数组
   * _renderInline只能渲染单个text，这里一个循环就能处理一行内的所有的Ops
   * @param ops
   * @returns
   */
  private _renderInlineOps(ops: Op[]): string {
    return ops
      .map((op) => {
        if (typeof op.insert === "string") {
          return this._renderInline(op.insert, op.attributes);
        } else if (typeof op.insert === "object") {
          if (op.insert.image)
            return this._renderImage(op.insert.image, op.attributes);
          else if (op.insert.divider)
            return '<hr class="editor-divider" contenteditable="false" />';
        }
        return "";
      })
      .join("");
  }

  private _renderImage(src: string, attributes?: Record<string, any>): string {
    let style = "";
    if (attributes) {
      if (attributes.width) style += `width:${attributes.width}px;`;
      if (attributes.height) style += `height:${attributes.height}px`;
    }

    return `<img src="${src}" style="${style}" />`;
  }

  /**
   * 将Delta进行拆分
   * 返回结构 [{ ops: [...行内Op], attrs: { 换行符属性 }}，...]
   * @param doc
   * @returns
   */
  private _splitDeltaIntoLines(doc: Delta) {
    const lines: { ops: Op[]; attrs: any }[] = [];
    let currentOps: Op[] = [];

    for (const op of doc.ops) {
      if (typeof op.insert === "string") {
        const parts = op.insert.split("\n");
        parts.forEach((part, index) => {
          if (part)
            currentOps.push({ insert: part, attributes: op.attributes });

          if (index < parts.length - 1) {
            lines.push({
              ops: currentOps,
              attrs: op.attributes || {},
            });
            currentOps = [];
          }
        });
      } else {
        currentOps.push(op);
      }
    }

    if (currentOps.length > 0) {
      lines.push({ ops: currentOps, attrs: {} });
    }
    return lines;
  }

  /**
   * 渲染行内元素
   * 将对应位置上添加上标签
   * @param text
   * @param attributes
   * @returns
   */
  private _renderInline(
    text: string,
    attributes?: Record<string, any>
  ): string {
    if (!attributes) {
      return this._escapeHtml(text);
    }
    let content = this._escapeHtml(text);
    Object.keys(attributes).forEach((key) => {
      const value = attributes[key];
      const config = Renderer.formats[key];
      if (config) {
        if (config.tag) {
          if (config.attr) {
            content = `<${config.tag} ${config.attr}="${value}">${content}</${config.tag}>`;
          } else {
            content = `<${config.tag}>${content}</${config.tag}>`;
          }
        } else if (config.style) {
          content = `<span style="${config.style}:${value}">${content}</span>`;
        }
      }
    });
    return content;
  }
  
  /**
   *
   * @param str
   * @returns
   */
  private _escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
