// 剪切板模块

import Delta from "../Delta/Delta";
import { Editor } from "../Editor/Editor";
import { Parser } from "../Parser/Parser";

export class Clipboard {
  editor: Editor;
  parser: Parser;

  constructor(editor: Editor) {
    this.editor = editor;
    this.parser = new Parser();
    this.init();
  }

  init() {
    this.editor.dom.addEventListener("paste", (e: ClipboardEvent) => {
      e.preventDefault();

      if (!e.clipboardData) return;

      // 优先检查是否包含文件 比如粘贴图片文件
      // 粘贴和拖拽拿到的是File对象（二进制）
      // 解决方案：我们生成一个中间层，将File转成Base64字符串，然后再生成Delta插入
      if (e.clipboardData.files && e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        if (file.type.startsWith("image/")) {
          this._handleImageFile(file);
          return;
        }
      }

      const html = e.clipboardData.getData("text/html");
      const text = e.clipboardData.getData("text/plain");

      let delta: Delta;
      if (html) {
        console.log("Pasting HTML", html);
        delta = this.parser.parse(html);
      } else {
        console.log("Paser Text", text);
        delta = new Delta().insert(text);
      }
      this.insertDelta(delta);
    });
  }

  /**
   * 新增：处理图片 演示转换base64 生产环境通常是上传服务器拿到URL
   * @param file
   */
  private _handleImageFile(file: File) {
    const render = new FileReader();
    render.onload = (e) => {
      const base64 = e.target?.result as string;
      if (base64) {
        this.editor.insertImage(base64);
      }
    };
    render.readAsDataURL(file);
  }

  /**
   * 在当前的位置插入Delta
   */
  insertDelta(pasteDelta: Delta) {
    const selection = this.editor.selection.getSelection();
    if (!selection) return;
    const changeOps = new Delta()
      .retain(selection.index)
      .ops.concat(pasteDelta.ops);
    const change = new Delta(changeOps);
    this.editor.submitChange(change);
  }
}
