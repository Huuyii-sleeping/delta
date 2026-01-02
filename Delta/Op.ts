interface Op {
  // 核心数据 三选一
  // 插入对象或者文字
  insert?: string | Record<string, any>;
  // 删除N个字符
  delete?: number;
  // 跳过N个字符（保存不会做出改变）
  retain?: number;
  // 元数据
  attributes?: Record<string, any>;
}

namespace Op {
  export function length(op: Op): number {
    if (typeof op.delete === "number") return op.delete;
    else if (typeof op.retain === "number") return op.retain;
    else if (typeof op.retain === "object" && op.retain !== null) return 1;
    else return typeof op.insert === "string" ? op.insert.length : 1;
  }
}

export default Op;
