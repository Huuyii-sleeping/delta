import Delta from "../Delta/Delta";

export class Parser {
  parse(html: string): Delta {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;

    const delta = new Delta();
    this._traverse(tempDiv, delta, {}, { inPre: false });
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
   * @param node 当前节点
   * @param delta delta 对象
   * @param attributes attributes 当前继承的行内样式
   * @param options options 上下文选项
   */
  private _traverse(
    node: Node,
    delta: Delta,
    attributes: Record<string, any>,
    options: { listType?: string; inPre?: boolean }
  ) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (text) {
        if (options.inPre) {
          delta.insert(text, attributes);
        } else {
          const cleanText = text.replace(/[\n\r]+/g, "");
          if (cleanText.length > 0) delta.insert(cleanText, attributes);
        }
      }
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const tagName = element.tagName.toLowerCase();
      const newAttributes = { ...attributes };
      let nextOptions = { ...options };

      if (element.classList.contains("todo-checkbox")) return;

      if (tagName === "img") {
        const src = element.getAttribute("src");
        if (src) {
          const imageAttrs: any = {};
          const width = element.getAttribute("width") || element.style.width;
          if (width) {
            const widthNum = parseInt(width);
            if (!isNaN(widthNum)) imageAttrs.width = widthNum;
          }
          delta.insert({ image: src } as any, imageAttrs);
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
        element.style.fontWeight === "bold" ||
        parseInt(element.style.fontWeight) >= 700
      ) {
        newAttributes.bold = true;
      }
      if (
        tagName === "em" ||
        tagName === "i" ||
        element.style.fontStyle === "italic"
      ) {
        newAttributes.italic = true;
      }
      if (
        tagName === "u" ||
        element.style.textDecoration.includes("underline")
      ) {
        newAttributes.underline = true;
      }
      if (
        tagName === "s" ||
        tagName === "strike" ||
        element.style.textDecoration.includes("line-through")
      ) {
        newAttributes.strike = true;
      }
      if (tagName === "code" && !options.inPre) {
        // 只有不在 pre 里的 code 才是行内代码
        newAttributes.code = true;
      }
      if (tagName === "a" && element.getAttribute("href")) {
        newAttributes.link = element.getAttribute("href");
      }
      if (element.style.color) {
        newAttributes.color = element.style.color;
      }

      if (tagName === "ul") nextOptions.listType = "bullet";
      if (tagName === "ol") nextOptions.listType = "ordered";
      if (tagName === "pre") nextOptions.inPre = true;

      element.childNodes.forEach((child) => {
        this._traverse(child, delta, newAttributes, nextOptions);
      });

      if (this._isBlock(tagName) || element.classList.contains("todo-item")) {
        const blockAttributes: any = {};
        if (tagName === "h1") blockAttributes.header = 1;
        if (tagName === "h2") blockAttributes.header = 2;
        if (tagName === "h3") blockAttributes.header = 3;
        if (tagName === "blockquote") blockAttributes.blockquote = true;
        if (tagName === "pre") blockAttributes["code-block"] = true;
        if (tagName === "li") {
          if (options.listType) {
            blockAttributes.list = options.listType;
          } else {
            // 默认无序
            blockAttributes.list = "bullet";
          }
        }
        if (element.classList.contains("todo-item")) {
          const isCompleted =
            element.classList.contains("is-completed") ||
            element.querySelector(".todo-checkbox")?.textContent?.includes("☑");
          blockAttributes.list = isCompleted ? "checked" : "unchecked";
        }
        // 块级元素最后插入换行元素
        delta.insert("\n", blockAttributes);
      }
    }
  }

  private _isBlock(tag: string): boolean {
    return [
      "div",
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "li",
      "ul",
      "ol",
      "blockquote",
      "pre",
      "section",
      "article",
    ].includes(tag);
  }
}
