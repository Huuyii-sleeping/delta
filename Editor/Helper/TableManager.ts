import Delta from "../../Delta/Delta";
import { Editor } from "../Editor";
import { DocumentHelper } from "./DocumentHelper";

export class TableManager {
  editor: Editor;
  constructor(editor: Editor) {
    this.editor = editor;
  }

  /**
   * 指定的位置当中插入行
   * @param cellIndex 光标所在的行索引
   * @param offset 0：上方插入 1下方插入
   * @returns
   */
  insertRow(cellIndex: number, offset: number) {
    // 获取当前行的ID
    const format = DocumentHelper.getLineFormat(this.editor.doc, cellIndex);
    const currentRowId = format.table;
    if (!currentRowId) return;

    // 计算表格有多少列
    let colsCount = 0;
    const lines = this.editor.doc.ops;
    let startIndexOfRow = -1,
      endIndexOfRow = -1;

    let currentPos = 0;
    this.editor.doc.ops.forEach((op) => {
      const len = typeof op.insert === "string" ? op.insert.length : 1;
      if (op.attributes && op.attributes.table === currentRowId) {
        colsCount++;
        if (startIndexOfRow === -1) startIndexOfRow = currentPos;
        endIndexOfRow = currentPos + len;
      }
      currentPos += len;
    });

    const insertPos = offset === 1 ? endIndexOfRow : startIndexOfRow;

    const newRowId = DocumentHelper.generateId();
    const insertDelta = new Delta().retain(insertPos);
    for (let i = 0; i < colsCount; i++) {
      insertDelta.insert("\u200B");
      insertDelta.insert("\n", { table: newRowId });
    }
    this.editor.submitChange(insertDelta);
  }

  /**
   * 删除当前行
   * @param cellIndex
   * @returns
   */
  deleteRow(cellIndex: number) {
    const format = DocumentHelper.getLineFormat(this.editor.doc, cellIndex);
    const currentRowId = format.table;
    if (!currentRowId) return;

    // 删除行，就要找到行所在位置的开头和结尾的位置
    let firstNewlineIndex = -1,
      lastNewlineIndex = -1,
      currentPos = 0;
    this.editor.doc.ops.forEach((op) => {
      const len = typeof op.insert === "string" ? op.insert.length : 1;

      if (op.attributes && op.attributes.table === currentRowId) {
        if (typeof op.insert === "string") {
          const relativeIndex = op.insert.indexOf("\n");
          if (relativeIndex !== -1) {
            if (firstNewlineIndex === -1) {
              firstNewlineIndex = currentPos + relativeIndex;
            }
            lastNewlineIndex = currentPos + op.insert.lastIndexOf("\n");
          }
        }
      }
      currentPos += len;
    });

    if (firstNewlineIndex === -1 || lastNewlineIndex === -1) return;

    const rowStart = DocumentHelper.findLineStart(
      this.editor.doc,
      firstNewlineIndex
    );
    const rowEnd = lastNewlineIndex + 1;
    const lengthToDelete = rowEnd - rowStart;
    const delta = new Delta().retain(rowStart).delete(lengthToDelete);
    this.editor.submitChange(delta);
  }
}
