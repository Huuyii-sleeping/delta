export class SelectionManager {
  dom: HTMLElement;

  constructor(dom: HTMLElement) {
    this.dom = dom;
  }

  /**
   * 获取当前光标在Delta文档中的索引（Index）
   * 核心思路：使用Range计算从编辑器的头部到光标位置的文本长度
   * @returns
   */
  getSelection(): { index: number; length: number } | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    if (!this.dom.contains(range.startContainer)) return null;

    // 找到光标所在行 就是编辑器所在的直接子元素
    const startLine = this._getLineNode(range.startContainer);
    const endLine = this._getLineNode(range.endContainer);

    if (!startLine) return null;

    const startIndex =
      this._calculateLineIndex(startLine) +
      this._getOffsetInLine(startLine, range.startContainer, range.startOffset);

    // 计算出终点索引
    let endIndex = startIndex;
    if (range.collapsed) {
      endIndex = startIndex;
    } else if (endLine) {
      endIndex =
        this._calculateLineIndex(endLine) +
        this._getOffsetInLine(endLine, range.endContainer, range.endOffset);
    }

    return {
      index: startIndex,
      length: endIndex - startIndex,
    };
  }

  /**
   * 给定一个深层嵌套的DOM节点，找到属于【哪一行】
   * 就是编辑器直接的子元素 ‘div’
   * @param node
   * @returns
   */
  private _getLineNode(node: Node): Element | null {
    let current: Node | null = node;
    while (current && current !== this.dom) {
      if (current.parentNode === this.dom) {
        return current as Element;
      }
      if (
        current.parentNode &&
        (current.parentNode.nodeName === "UL" ||
          current.parentNode.nodeName === "OL") &&
        current.parentNode.parentNode === this.dom
      ) {
        return current as Element;
      }
      if (current.nodeName === "TD") {
        return current as Element;
      }
      current = current.parentNode;
    }
    return null;
  }

  /**
   * 累加器
   * 计算目标行之前所有行的长度总和
   * @param targetLine
   * @returns
   */
  private _calculateLineIndex(targetLine: Element): number {
    let index = 0;
    const topLevelNodes = this.dom.children;
    for (let i = 0; i < topLevelNodes.length; i++) {
      const node = topLevelNodes[i];

      if (node.tagName === "UL" || node.tagName === "OL") {
        const listItems = node.children;
        for (let j = 0; j < listItems.length; j++) {
          const li = listItems[j];
          if (li === targetLine) return index;
          index += this._getNodeLength(li) + 1;
        }
      } else if (node.classList.contains("table-wrapper")) {
        const tds = node.querySelectorAll("td");
        for (let k = 0; k < tds.length; k++) {
          const td = tds[k];
          if (td === targetLine) return index;
          // 记得每一行的最后都具有一个回车
          index += this._getNodeLength(td) + 1;
        }
      } else {
        if (node === targetLine) return index;
        index += this._getNodeLength(node) + 1;
      }
    }
    return index;
  }

  private _getNodeLength(element: Element): number {
    let len = 0;
    element.childNodes.forEach((child) => {
      // 遇到复选框直接跳过就行
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        (child as Element).classList.contains("todo-checkbox")
      ) {
        return;
      }
      if (child.nodeName === "BR") {
        if (element.childNodes.length > 1) len += 1;
      }
      if (child.nodeName === "IMG" || child.nodeName === "HR") {
        len += 1;
      } else {
        len += (child.textContent || "").length;
      }
    });
    return len;
  }

  /**
   * 局部测量，找到在本行当中的偏移量
   * @param line
   * @param node
   * @param offset
   * @returns
   */
  private _getOffsetInLine(line: Element, node: Node, offset: number): number {
    if (node === line && offset === 0) return 0;
    const range = document.createRange();
    range.setStart(line, 0);
    range.setEnd(node, offset);

    const preCaretFragment = range.cloneContents();
    return this._calculateFragmentLength(preCaretFragment);
  }

  private _calculateFragmentLength(root: Node): number {
    let len = 0;
    root.childNodes.forEach((child) => {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        (child as Element).classList.contains("todo-checkbox")
      ) {
        return;
      }
      if (child.nodeName === "BR") {
        if (child.parentNode && child.parentNode.childNodes.length > 1)
          len += 1;
      }
      if (child.nodeName === "IMG" || child.nodeName === "HR") {
        len += 1;
      } else if (child.nodeType === Node.TEXT_NODE) {
        len += (child.textContent || "").length;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        len += this._calculateFragmentLength(child);
      }
    });
    return len;
  }

  /**
   * 设置光标位置 index -> DOM
   * 核心难点：遍历DOM树，将扁平的index映射回具体的Node和Offset
   * @param index
   */
  setSelection(index: number, length: number = 0) {
    const target = this._findNodeAndOffset(index);

    if (target) {
      const selection = window.getSelection();
      const range = document.createRange();

      const start = this._findNodeAndOffset(index);
      if (!start) return;
      range.setStart(start.node, start.offset);

      if (length > 0) {
        const end = this._findNodeAndOffset(index + length);
        if (end) {
          range.setEnd(end.node, end.offset);
        }
      } else {
        range.collapse(true);
      }

      selection?.removeAllRanges(); // 清除旧光标
      selection?.addRange(range); // 添加新光标
    }
  }

  /**
   * 核心：在DOM树当中找到第N个字符的位置
   * @param targetIndex
   */
  private _findNodeAndOffset(targetIndex: number): {
    node: Node;
    offset: number;
  } | null {
    let currentLength = 0;

    // 我们的render渲染出来的子元素就是行
    const topLevelNodes = this.dom.children;

    for (let i = 0; i < topLevelNodes.length; i++) {
      const node = topLevelNodes[i];

      if (node.tagName === "UL" || node.tagName === "OL") {
        const listItems = node.children;
        for (let j = 0; j < listItems.length; j++) {
          const li = listItems[j];
          const lineLength = this._getNodeLength(li) + 1;

          if (currentLength + lineLength > targetIndex) {
            return this._findInLine(li, targetIndex - currentLength);
          }
          currentLength += lineLength;
        }
      } else if (node.classList.contains("table-wrapper")) {
        const tds = node.querySelectorAll("td");
        for (let k = 0; k < tds.length; k++) {
          const td = tds[k];
          const lineLength = this._getNodeLength(td) + 1;
          if (currentLength + lineLength > targetIndex) {
            return this._findInLine(td, targetIndex - currentLength);
          }
          currentLength += lineLength;
        }
      } else {
        const lineLength = this._getNodeLength(node) + 1;
        if (currentLength + lineLength > targetIndex) {
          return this._findInLine(node, targetIndex - currentLength);
        }
        currentLength += lineLength;
      }
    }
    return null;
  }

  /**
   * 在单行当中找到正确的位置
   * @param element
   * @param localIndex
   * @returns
   */
  private _findInLine(
    element: Element,
    localIndex: number
  ): { node: Node; offset: number } | null {
    let current = 0;
    for (let i = 0; i < element.childNodes.length; i++) {
      const child = element.childNodes[i];

      if (
        child.nodeType === Node.ELEMENT_NODE &&
        (child as Element).classList.contains("todo-checkbox")
      ) {
        continue; // 直接 continue，不要增加 current
      }

      if (child.nodeName === "BR") {
        if (element.childNodes.length === 1) continue;
      }

      if (child.nodeName === "IMG" || child.nodeName === "HR") {
        if (localIndex === current) {
          return { node: element, offset: i };
        }
        if (current + 1 >= localIndex) {
          return { node: element, offset: i + 1 };
        }
        current += 1;
      } else {
        const textLen = child.textContent?.length || 0;
        if (current + textLen >= localIndex) {
          return this._findInTextNode(child, localIndex - current);
        }
        current += textLen;
      }
    }

    return { node: element, offset: element.childNodes.length };
  }

  /**
   * 进入节点内部找到纯文本TextNode节点
   * @param root
   * @param offset
   * @returns
   */
  private _findInTextNode(
    root: Node,
    offset: number
  ): { node: Node; offset: number } {
    if (root.nodeType === Node.TEXT_NODE) {
      return { node: root, offset: offset };
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node = walker.nextNode();
    let current = 0;
    while (node) {
      const len = node.textContent?.length || 0;
      if (current + len >= offset) {
        return { node: node, offset: offset - current };
      }
      current += len;
      node = walker.nextNode();
    }

    return { node: root, offset: 0 };
  }
}
