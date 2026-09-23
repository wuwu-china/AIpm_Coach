import { FAKE_COMPLETED_COUNT } from '../data/content';

/**
 * 「已完成测评人数」——纯前端演示版动态统计。
 *
 * 无后端时无法获得真实跨用户计数，这里在 1234 基线之上叠加两部分，让数字自然增长、不随刷新乱跳：
 *   1) 每个浏览器「会话」首次进入 +1（统计本机真实到访）；
 *   2) 按自然日补一段确定性的「自然增长」（5–12/天，由日期哈希决定，同一天恒定）。
 * 接入真实后端后，把 getCompletedCount() 换成服务端统计接口即可，调用方无需改动。
 */
const KEY_METRICS = 'aipmcoach.metrics';
const SESSION_FLAG = 'aipmcoach.session_counted';
// 以首个版本发布日为增长起点，保证第一天从基线 1234 开始
const LAUNCH_DAY = '2026-09-22';

interface MetricsState {
  count: number;
  lastDay: string; // YYYY-MM-DD
}

function dayStr(ts: number = Date.now()): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function toDay(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function hash01(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1_000_000_007;
  return (h % 1000) / 1000;
}

/** 第 dayIndex 个自然日的确定性自然增长量：5–12 人 */
function organicOfDay(dayIndex: number): number {
  return 5 + Math.floor(hash01(`organic-${dayIndex}`) * 8);
}

function read(): MetricsState | null {
  try {
    const raw = localStorage.getItem(KEY_METRICS);
    return raw ? (JSON.parse(raw) as MetricsState) : null;
  } catch {
    return null;
  }
}

function write(m: MetricsState): void {
  try {
    localStorage.setItem(KEY_METRICS, JSON.stringify(m));
  } catch {
    /* 隐私模式等场景静默降级 */
  }
}

export function getCompletedCount(): number {
  const today = dayStr();
  const m: MetricsState = read() ?? { count: FAKE_COMPLETED_COUNT, lastDay: LAUNCH_DAY };

  // 补算跨过的自然日（同一天重复打开不增长）
  const elapsedDays = Math.max(0, Math.round((toDay(today) - toDay(m.lastDay)) / 86_400_000));
  if (elapsedDays > 0) {
    const baseIndex = Math.round((toDay(m.lastDay) - toDay(LAUNCH_DAY)) / 86_400_000);
    for (let i = 1; i <= Math.min(elapsedDays, 3650); i++) m.count += organicOfDay(baseIndex + i);
    m.lastDay = today;
  }

  // 本次浏览器会话首次进入，记一次真实到访
  try {
    if (!sessionStorage.getItem(SESSION_FLAG)) {
      m.count += 1;
      sessionStorage.setItem(SESSION_FLAG, '1');
    }
  } catch {
    /* sessionStorage 不可用时忽略 */
  }

  write(m);
  return m.count;
}
