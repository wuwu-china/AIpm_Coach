/**
 * 仅用于自测清单（docs/SELFTEST.md）的本地调试开关，普通用户不会接触。
 * 全部从 localStorage 读取、只影响当前浏览器，删除 key 即恢复正常。
 */
export function debugEmptyBank(): boolean {
  try {
    return localStorage.getItem('aipmcoach.debug') === 'bank_empty';
  } catch {
    return false;
  }
}

/** 强制某维度「答题数据不足」，传维度 id（如 data_eval）；空串关闭 */
export function debugInsufficientDim(): string {
  try {
    return localStorage.getItem('aipmcoach.debug_insufficient') ?? '';
  } catch {
    return '';
  }
}
