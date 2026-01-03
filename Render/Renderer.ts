import Delta from "../Delta/Delta";
import Op from "../Delta/Op";

export class Renderer {
  static formats: Record<string, any> = {
    // 基础
    bold: { tag: "strong" },
    italic: { tag: "em" }, // 斜体 -> <em>
    underline: { tag: "u" }, // 下划线 -> <u>
    strike: { tag: "s" }, // 删除线 -> <s>
    code: { tag: "code" }, // 行内代码 -> <code>

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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const prevLine = lines[i - 1];
      const nextLine = lines[i + 1];

      const blockAttrs = line.attrs || {};

      const contentHtml = this._renderInlineOps(line.ops) || "<br>";

      if (blockAttrs.list) {
        const listType = blockAttrs.list === "ordered" ? "ol" : "ul";

        // 检查上一行，决定是否需要开启一个新的列表标签
        // 检查上一行有没有list属性，或者list属性和我的是否不一样
        const prevLineType =
          prevLine?.attrs?.list === "ordered"
            ? "ol"
            : prevLine?.attrs?.list
            ? "ul"
            : null;
        if (listType !== prevLineType) {
          html += `<${listType}>`;
        }

        html += `<li>${contentHtml}</li>`;

        const nextLineType =
          nextLine?.attrs?.list === "ordered"
            ? "ol"
            : nextLine?.attrs?.list
            ? "ul"
            : null;
        if (listType !== nextLineType) {
          html += `</${listType}>`;
        }
      } else if (blockAttrs.header) {
        const tagName = `h${blockAttrs.header}`;
        html += `<${tagName}>${contentHtml}</${tagName}>`;
      } else {
        html += `<div>${contentHtml}</div>`;
      }
    }
    return html;
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
        } else if (typeof op.insert === "object" && op.insert.image) {
          return this._renderImage(op.insert.image, op.attributes);
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
   * 渲染块级元素
   * 默认包裹在 div 或者 p 里面
   * 如果具有 header 就放在 h 标签当中
   * @param content
   * @param attributes
   */
  private _renderBlock(
    content: string,
    attributes?: Record<string, any>
  ): string {
    let tagName = "div";

    if (attributes) {
      if (attributes.header) {
        tagName = `h${attributes.header}`;
      }
      // [新增] 引用块
      else if (attributes.blockquote) {
        tagName = "blockquote";
      }
      // [新增] 代码块 (通常需要配合 pre 标签，这里简化处理)
      else if (attributes["code-block"]) {
        tagName = "pre";
      }
    }

    return `<${tagName}>${content}</${tagName}>`;
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
