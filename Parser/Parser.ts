import Delta from "../Delta/Delta";

export class Parser {
  parse(html: string): Delta {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;

    const delta = new Delta();
    this._traverse(tempDiv, delta, {});
    if (delta.length() > 0) {
      const lastOp = delta.ops[delta.ops.length - 1];
      if (typeof lastOp.insert === "string" && !lastOp.insert.endsWith("\n")) {
        delta.insert("\n");
      }
    }

    return delta;
  }

  /**
   * 递归遍历节点，生成Ops
   * @param node
   * @param delta
   * @param attributes
   */
  private _traverse(node: Node, delta: Delta, attributes: Record<string, any>) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (text) {
        // 简单的清理，将换行符换成空格，避免破坏块级结构
        const cleanText = text.replace(/\n/g, " ");
        delta.insert(cleanText, attributes);
      }
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const tagName = element.tagName.toLowerCase();
      const newAttributes = { ...attributes };

      if (tagName === "img") {
        const src = element.getAttribute("src");
        if (src) {
          delta.insert({ image: src } as any, attributes);
        }
        return;
      }

      if (tagName === "hr") {
        delta.insert({ divider: true } as any, attributes);
        return;
      }

      if (
        tagName === "strong" ||
        tagName === "b" ||
        element.style.fontWeight === "bold"
      ) {
        newAttributes.bold = true;
      }

      if (tagName === "em") {
        newAttributes.italic = true;
      }

      if (tagName === "span" && element.style.color) {
        newAttributes.color = element.style.color;
      }

      element.childNodes.forEach((child) => {
        this._traverse(child, delta, newAttributes);
      });

      if (this._isBlock(tagName)) {
        const blockAttributes: any = {};
        if (tagName === "h1") blockAttributes.header = 1;
        if (tagName === "h2") blockAttributes.header = 2;
        if (tagName === "h3") blockAttributes.header = 3;
        if (tagName === "li") blockAttributes.list = "bullet";

        delta.insert("\n", blockAttributes);
      }
    }
  }

  private _isBlock(tag: string): boolean {
    return ["div", "p", "h1", "h2", "li", "ul", "ol"].includes(tag);
  }
}
