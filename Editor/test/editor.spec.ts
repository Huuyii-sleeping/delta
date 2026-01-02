/**
 * @vitest-environment jsdom
 */
// 因为需要使用浏览器环境 所以直接安装jsdom使用就行
import { describe, beforeEach, it, expect, vi } from "vitest";
import { Editor } from "../Editor";

describe("Editor Controller", () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '<div id="editor"></div>';
    container = document.getElementById("editor") as HTMLElement;
  });

  it("正确初始化编辑器", () => {
    const editor = new Editor("#editor");

    expect(editor.dom).toBe(container);
    expect(container.contentEditable).toBe("true");
    expect(container.style.whiteSpace).toBe("pre-wrap");
    expect(container.style.outline).toBe("none");

    expect(container.textContent).toContain("Hello World");
  });

  it("如果找不到元素应该抛出错误", () => {
    expect(() => {
      new Editor("#not-exist");
    }).toThrow("找不到元素");
  });

  it("应该拦截 insertText 输入并更新视图", () => {
    const editor = new Editor("#editor");
    const initialHtml = container.innerHTML;
    const initialDocLength = editor.doc.length();

    // 1. 模拟用户输入 "A"
    const event = new InputEvent("beforeinput", {
      inputType: "insertText",
      data: "A",
      bubbles: true,
      cancelable: true,
    });

    // 监听 preventDefault
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");

    // 2. 触发事件
    container.dispatchEvent(event);

    // 验证 A: 必须阻止浏览器默认行为
    expect(preventDefaultSpy).toHaveBeenCalled();

    // 验证 B: 模型 (Delta) 长度增加 1
    // 你的逻辑是 retain(length).insert(data)，所以总长度+1
    expect(editor.doc.length()).toBe(initialDocLength + 1);

    // 验证 C: 视图 (DOM) 发生变化
    expect(container.innerHTML).not.toBe(initialHtml);
    expect(container.innerHTML).toContain("A");
  });

  it("应该拦截 deleteContentBackward (退格键) 并更新视图", () => {
    const editor = new Editor("#editor");
    // 初始内容 "Hello World\n" (长度 12)
    const initialLength = editor.doc.length();

    // 🔴 核心修复：模拟光标在文档末尾
    // 告诉编辑器：现在光标在第 12 个位置
    vi.spyOn(editor.selection, "getSelection").mockReturnValue({
      index: initialLength,
      length: 0,
    });

    // 1. 模拟按下退格键
    const event = new InputEvent("beforeinput", {
      inputType: "deleteContentBackward",
      bubbles: true,
      cancelable: true,
    });

    const preventDefaultSpy = vi.spyOn(event, "preventDefault");

    // 2. 触发事件
    container.dispatchEvent(event);

    // 验证 A: 阻止默认行为
    expect(preventDefaultSpy).toHaveBeenCalled();

    // 验证 B: 模型长度减少 1
    // 现在光标在 12，退格键会删掉第 11 个字符
    expect(editor.doc.length()).toBe(initialLength - 1);
  });

  it("未知的 inputType 不应该改变模型", () => {
    const editor = new Editor("#editor");
    const initialLength = editor.doc.length();
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // 模拟一个暂不支持的操作，比如 "粘贴" (insertFromPaste)
    const event = new InputEvent("beforeinput", {
      inputType: "insertFromPaste",
      data: "PasteContent",
      bubbles: true,
      cancelable: true,
    });

    container.dispatchEvent(event);

    // 应该调用 console.warn
    expect(consoleSpy).toHaveBeenCalledWith(
      "未处理的输入类型:",
      "insertFromPaste"
    );
    // 模型长度不应该变
    expect(editor.doc.length()).toBe(initialLength);

    consoleSpy.mockRestore();
  });
});
