import Delta from "../../Delta/Delta";

export class DocumentHelper {
  static findLineEnd(doc: Delta, startIndex: number): number {
    let currentPos = 0;

    for (const op of doc.ops) {
      const len = typeof op.insert === "string" ? op.insert.length : 1;

      if (currentPos + len > startIndex) {
        if (typeof op.insert === "string") {
          const offsetInOp = Math.max(0, startIndex - currentPos);
          const relativeIndex = op.insert.indexOf("\n", offsetInOp);

          if (relativeIndex !== -1) {
            return currentPos + relativeIndex;
          }
        }
      }
      currentPos += len;
    }
    return doc.length();
  }

  static findLineStart(doc: Delta, index: number): number {
    let currentPos = 0;
    let lastNewLinePos = -1;

    for (const op of doc.ops) {
      const len = typeof op.insert === "string" ? op.insert.length : 1;

      if (currentPos < index) {
        if (typeof op.insert === "string") {
          let relativeIndex = op.insert.indexOf("\n");
          while (relativeIndex !== -1 && currentPos + relativeIndex < index) {
            lastNewLinePos = currentPos + relativeIndex;
            relativeIndex = op.insert.indexOf("\n", relativeIndex + 1);
          }
        }
      } else {
        break;
      }
      currentPos += len;
    }
    return lastNewLinePos + 1;
  }

  static isLineEmpty(doc: Delta, index: number): boolean {
    const start = this.findLineStart(doc, index);
    const end = this.findLineEnd(doc, index);
    return start === end;
  }

  static getLineFormat(doc: Delta, index: number): Record<string, any> {
    const lineEndIndex = this.findLineEnd(doc, index);
    if (lineEndIndex >= doc.length()) return {};

    let currentPos = 0;
    for (const op of doc.ops) {
      const len = typeof op.insert === "string" ? op.insert.length : 1;
      if (currentPos + len > lineEndIndex) {
        return op.attributes || {};
      }
      currentPos += len;
    }
    return {};
  }

  static getTextBeforeCursor(doc: Delta, index: number): string {
    const lineStart = this.findLineStart(doc, index);
    const slice = doc.slice(lineStart, index);

    return slice.ops.reduce((text, op) => {
      if (typeof op.insert === "string") return text + op.insert;
      return text;
    }, "");
  }

  static findDOMNodeIndex(dom: HTMLElement, targetNode: Node): number {
    let index = 0;
    const lines = dom.children;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.contains(targetNode)) {
        const childNodes = line.childNodes;
        for (let j = 0; j < childNodes.length; j++) {
          const child = childNodes[j];
          if (child === targetNode) {
            return index;
          }

          if (
            child.nodeType === Node.ELEMENT_NODE &&
            (child as Element).classList.contains("todo-checkbox")
          ) {
            continue;
          }

          if (child.nodeType === Node.TEXT_NODE) {
            index += (child.textContent || "").length;
          } else if (child.nodeName === "IMG") {
            index += 1;
          } else if (
            ["SPAN", "STRONG", "EM", "CODE", "A"].includes(child.nodeName)
          ) {
            index += (child.textContent || "").length;
          }
        }
      } else {
        // 行尾的回车
        index += this._calculateLineLength(line) + 1;
      }
    }
    return -1;
  }

  private static _calculateLineLength(line: Element): number {
    let len = 0;
    line.childNodes.forEach((child) => {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        (child as Element).classList.contains("todo-checkbox")
      ) {
        return;
      }
      if (child.nodeType === Node.TEXT_NODE) {
        len += (child.textContent || "").length;
      } else if (child.nodeName === "IMG") {
        len += 1;
      } else {
        len += (child.textContent || "").length;
      }
    });
    return len;
  }
}
