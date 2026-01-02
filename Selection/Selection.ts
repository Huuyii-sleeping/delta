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

    // 创建一个临时的Range，从编辑器的开头选到光标位置 这样就能定位到具体的光标位置上了
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(this.dom); // 先选中所有
    preCaretRange.setEnd(range.startContainer, range.startOffset); // 将终点缩回到光标位置

    // 这个range的文本长度，就是我们的index
    // ！：toStirng，不同的浏览器可能会有细微的差异，但是现在只是简单的实现
    const start = preCaretRange.toString().length;
    const length = range.toString().length;

    return {
      index: start,
      length: length,
    };
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

    const walker = document.createTreeWalker(
      this.dom,
      NodeFilter.SHOW_TEXT, // 只关注文本节点
      null
    );

    let node = walker.nextNode();
    while (node) {
      const textLength = node.textContent ? node.textContent.length : 0;

      // 判断索引的位置是否就在这个length节点内部
      if (currentLength + textLength >= targetIndex) {
        return {
          node: node,
          offset: targetIndex - currentLength,
        };
      }

      currentLength += textLength;

      // [TODO] 这里可能会有换行符的坑，有问题就回来解决
      node = walker.nextNode();
    }

    return null;
  }
}
