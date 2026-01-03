import Delta from "../Delta/Delta";
import Op from "../Delta/Op";
import Prism from "prismjs";

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

    // 使用 while 循环，方便在处理代码块时跳过行
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const blockAttrs = line.attrs || {};

      // === 核心逻辑修改：处理代码块 ===
      if (blockAttrs["code-block"]) {
        let codeLines: string[] = [];
        let j = i;

        while (
          j < lines.length &&
          lines[j].attrs &&
          lines[j].attrs["code-block"]
        ) {
          // 获取该行的纯文本内容
          const rawText = lines[j].ops
            .map((op) => (typeof op.insert === "string" ? op.insert : ""))
            .join("");
          codeLines.push(rawText);
          j++;
        }

        // 将多行文本用 \n 拼接，Prism 才能正确处理多行注释
        const fullCodeText = codeLines.join("\n");
        const lang = "javascript"; // 后续可从 blockAttrs 获取语言
        let highlighted = "";

        if (Prism.languages[lang]) {
          highlighted = Prism.highlight(
            fullCodeText,
            Prism.languages[lang],
            lang
          );
        } else {
          highlighted = this._escapeHtml(fullCodeText);
        }

        if (fullCodeText.endsWith("\n")) highlighted += "\n";

        html += `<pre class="language-${lang}"><code>${highlighted}</code></pre>`;

        // 注意：因为循环末尾没有 i++ (我们是手动控制)，所以这里赋值即可
        i = j;
        continue;
      }

      // === 处理普通行 ===
      let contentHtml = this._renderInlineOps(line.ops);
      if (!contentHtml) contentHtml = "<br>";

      if (blockAttrs.list) {
        // 列表处理逻辑 (保持不变)
        const listType = blockAttrs.list === "ordered" ? "ol" : "ul";
        const prevLine = lines[i - 1];
        const nextLine = lines[i + 1];

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
      } else if (blockAttrs.blockquote) {
        html += `<blockquote>${contentHtml}</blockquote>`;
      } else {
        html += `<div>${contentHtml}</div>`;
      }

      // 移动到下一行
      i++;
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
