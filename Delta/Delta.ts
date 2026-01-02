import { isEqual } from "lodash-es";
import Op from "./Op";
import OpIterator from "./OpIterator";
import AttributeMap from "./AttributeMap";

class Delta {
  // 存储全部的数据
  ops: Op[] = [];

  constructor(ops: Op[] = []) {
    this.ops = ops;
  }

  /**
   *
   * @param text 插入的内容
   * @param attributes 内容的属性性质
   * @returns
   */
  insert(text: string, attributes?: Object) {
    // 向op中添加内容
    const op: Op = { insert: text };
    if (attributes) op.attributes = attributes;
    this.push(op);
    return this;
  }

  /**
   *
   * @param length 删除的具体内容
   */
  delete(length: number): Delta {
    if (length <= 0) return this;
    this.push({ delete: length });
    return this;
  }

  /**
   *
   * @param length 保留的内容
   * @param attributes 内容具体的性质
   */
  retain(length: number, attributes?: any): Delta {
    if (length <= 0) return this;
    const newOp: Op = { retain: length };

    if (
      attributes !== null &&
      typeof attributes === "object" &&
      Object.keys(attributes).length > 0
    ) {
      newOp.attributes = attributes;
    }
    this.push(newOp);
    return this;
  }

  push(newOp: Op) {
    const index = this.ops.length;
    const lastOp = this.ops[index - 1];

    if (!lastOp) {
      this.ops.push(newOp);
      return this.ops;
    }

    // 连续insert 并且 属性attribute 相同 直接进行合并
    if (typeof lastOp.insert === "string" && typeof newOp.insert === "string") {
      if (isEqual(lastOp.attributes, newOp.attributes)) {
        lastOp.insert += newOp.insert;
        return this.ops;
      }
    }

    // 连续delete直接合并即可 没有属性
    if (typeof lastOp.delete === "number" && typeof newOp.delete === "number") {
      lastOp.delete += newOp.delete;
      return this.ops;
    }

    // 连续retain 属性相同合并
    if (typeof lastOp.retain === "number" && typeof newOp.retain === "number") {
      if (isEqual(lastOp.attributes, newOp.attributes)) {
        lastOp.retain += newOp.retain;
        return this.ops;
      }
    }

    this.ops.push(newOp);
    return this.ops;
  }

  /**
   * 用来做文档的合并
   * @param other 待合并的文档类型
   * @returns
   */
  compose(other: Delta) {
    const thisIter = new OpIterator(this.ops);
    const otherIter = new OpIterator(other.ops);
    const delta = new Delta();

    while (thisIter.hasNext() || otherIter.hasNext()) {
      if (otherIter.peekType() === "insert") {
        // 插入直接进行合并就行}
        delta.push(otherIter.next());
      } else if (thisIter.peekType() === "delete") {
        // delete不操作，直接放到数组当中
        delta.push(thisIter.next());
      } else {
        // 计算一共需要找到多长的内容
        const length = Math.min(thisIter.peekLength(), otherIter.peekLength());

        // 拿出需要处理的片段 [处理的长度是相同的]
        const thisOp = thisIter.next(length);
        const otherOp = otherIter.next(length);

        if (otherOp.retain) {
          const newOp: Op = {};

          // 决定新的Op的类型，insert还是retain
          // 如果A也是retain retain + retain = retain
          // 如果A是insert insert + retain = insert（应用修改后的新的插入）
          const isRetain = typeof thisOp.retain === "number";
          if (isRetain) {
            newOp.retain = length;
          } else {
            newOp.insert = thisOp.insert;
          }
          const attributes = AttributeMap.compose(
            thisOp.attributes,
            otherOp.attributes,
            isRetain // 根据是不是retain决定是否保留null值作为指令
          );
          if (attributes) {
            newOp.attributes = attributes;
          }

          delta.push(newOp);
        } else if (otherOp.delete) {
          // 当B要执行删除操作的时候 就是A的内容被B删除了

          // 如果A是Insert，现在删除了，就是相互抵消，什么都不会留下
          // 如果A是Retain，现在删除了，就必须记录这个操作
          if (typeof thisOp.retain === "number") {
            delta.push({ delete: length });
          }
        }
      }
    }

    return delta;
  }

  length(): number {
    return this.ops.reduce((length, elem) => {
      return length + Op.length(elem);
    }, 0);
  }
}

export default Delta;
