import type { AiSettings, SessionState, Snapshot } from './types';
import { DIMENSIONS } from '../data/dimensions';

const KEY_SETTINGS = 'aipmcoach.ai_settings';
const KEY_SESSION = 'aipmcoach.current_session';
const KEY_HISTORY = 'aipmcoach.history';
const KEY_SNAPSHOTS = 'aipmcoach.snapshots';
const HISTORY_LIMIT = 30;
const SNAPSHOT_LIMIT = 50;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 隐私模式 / 配额超限时静默失败，不阻断答题
  }
}

/* —— BYOK AI 设置（Key 只存在用户自己浏览器）—— */
export function getSettings(): AiSettings | null {
  return read<AiSettings>(KEY_SETTINGS);
}
export function saveSettings(s: AiSettings): void {
  write(KEY_SETTINGS, s);
}
export function hasApiKey(): boolean {
  const s = getSettings();
  return !!s && !!s.apiKey.trim();
}

/* —— 当前测评会话（刷新续测 + 诊断/资源缓存）—— */
export function loadSession(): SessionState | null {
  return read<SessionState>(KEY_SESSION);
}
export function saveSession(s: SessionState): void {
  write(KEY_SESSION, s);
}
export function clearSession(): void {
  try {
    localStorage.removeItem(KEY_SESSION);
  } catch {
    /* ignore */
  }
}

/* —— 历史归档 —— */
export interface HistoryItem {
  finishedAt: number;
  total: number;
  scores: Record<string, number>;
  correctCount: number;
  bankVersion: string;
  gids?: number[];
}

export function loadHistory(): HistoryItem[] {
  return read<HistoryItem[]>(KEY_HISTORY) ?? [];
}

export function pushHistory(item: HistoryItem): void {
  const list = loadHistory();
  list.unshift(item);
  write(KEY_HISTORY, list.slice(0, HISTORY_LIMIT));
}

/* —— 能力快照（复测对比 / 成长曲线），按时间从旧到新累积 —— */
export function loadSnapshots(): Snapshot[] {
  const list = read<Snapshot[]>(KEY_SNAPSHOTS) ?? [];
  return [...list].sort((a, b) => a.date - b.date);
}

/** 同一次会话（sessionKey）只保存一个快照；返回保存后的全量列表（旧→新） */
export function saveSnapshotOnce(snap: Snapshot): Snapshot[] {
  const list = loadSnapshots();
  if (list.some((s) => s.sessionKey === snap.sessionKey)) return list;
  list.push(snap);
  list.sort((a, b) => a.date - b.date);
  write(KEY_SNAPSHOTS, list.slice(-SNAPSHOT_LIMIT));
  return list;
}

/** 汇总「本机历史上答过的所有题目 gid」，供复测抽题避让 */
export function collectAnsweredGids(): number[] {
  const set = new Set<number>();
  for (const s of loadSnapshots()) s.gids.forEach((g) => set.add(g));
  for (const h of loadHistory()) h.gids?.forEach((g) => set.add(g));
  const cur = loadSession();
  cur?.usedGids.forEach((g) => set.add(g));
  return [...set];
}

/** 从一次会话统计各维度作答题数 / 答对数 / 高难度题数（分数构成弹窗用） */
export function buildDimStats(state: SessionState): NonNullable<Snapshot['dimStats']> {
  return Object.fromEntries(
    DIMENSIONS.map((d) => {
      const recs = state.records.filter((r) => r.dimension === d.id);
      return [
        d.id,
        {
          answered: recs.length,
          correct: recs.filter((r) => r.correct).length,
          high: recs.filter((r) => r.difficulty >= 4).length,
        },
      ];
    }),
  ) as NonNullable<Snapshot['dimStats']>;
}
