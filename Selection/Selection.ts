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
          index += (li.textContent || "").length + 1;
        }
      } else {
        if (node === targetLine) return index;
        index += (node.textContent || "").length + 1;
      }
    }
    return index;
  }

  /**
   * 局部测量，找到在本行当中的偏移量
   * @param line
   * @param node
   * @param offset
   * @returns
   */
  private _getOffsetInLine(line: Element, node: Node, offset: number): number {
    const range = document.createRange();

    if (node === line) {
      return 0;
    }

    range.setStart(line, 0);
    range.setEnd(node, offset);
    return range.toString().length;
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
          const lineText = li.textContent || "";
          const lineLength = lineText.length + 1;

          if (currentLength + lineLength > targetIndex) {
            return this._findInLine(li, targetIndex - currentLength);
          }
          currentLength += lineLength;
        }
      } else {
        const lineText = node.textContent || "";
        const lineLength = lineText.length + 1;
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
    if (element.textContent === "") return { node: element, offset: 0 };

    if (localIndex === 0) {
      const firstText = this._findFirstTextNode(element);
      return firstText
        ? { node: firstText, offset: 0 }
        : { node: element, offset: 0 };
    }

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node = walker.nextNode();
    let current = 0;
    while (node) {
      const len = node.textContent?.length || 0;
      if (current + len >= localIndex) {
        return { node: node, offset: localIndex - current };
      }

      current += len;
      node = walker.nextNode();
    }

    return { node: element, offset: 0 };
  }

  /**
   * 找到一行当中的第一个文本节点
   * @param root
   * @returns
   */
  private _findFirstTextNode(root: Node): Node | null {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    return walker.nextNode();
  }
}
