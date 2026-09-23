import type { DimensionId, OptionKey, Question } from '../data/questions';

/** 一次作答记录（picked 为 'SKIP' 表示跳过，按答错处理） */
export interface AnswerRecord {
  /** 在本次测评中的展示题号，1-21 */
  order: number;
  gid: number;
  dimension: DimensionId;
  /** 该题实际难度档 */
  difficulty: 1 | 2 | 3 | 4 | 5;
  picked: OptionKey | 'SKIP';
  correct: boolean;
  /** 作答用时（毫秒） */
  ms: number;
  /** 本题贡献分 */
  contribution: number;
  /** 作答后该维度 EWMA 分数 */
  scoreAfter: number;
}

export interface Selection {
  order: number;
  gid: number;
  dimension: DimensionId;
  difficulty: 1 | 2 | 3 | 4 | 5;
  reason: string;
}

export interface DimState {
  diff: number;
  score: number;
  count: number;
  mastered: boolean;
}

export interface SessionState {
  bankVersion: string;
  startedAt: number;
  finishedAt?: number;
  status: 'in_progress' | 'finished';
  usedGids: number[];
  /** 复测时传入的「历史已答过 gid」，抽题优先避开（不够再放开） */
  historyGids?: number[];
  /** 「重测这个维度」：阶段二加测优先该维度 */
  focusDim?: DimensionId | null;
  dims: Record<DimensionId, DimState>;
  records: AnswerRecord[];
  /** 当前已抽出、尚未作答的题（刷新后用于恢复现场） */
  current: (Selection & { question: Question }) | null;
  diagnosisCache: Partial<Record<DimensionId, CachedDiagnosis>>;
  resourceCache: Partial<Record<DimensionId, CachedResource>>;
}

export type DiagnosisStatus = 'ok' | 'fallback' | 'insufficient';

export interface WeakPoint {
  title: string;
  evidence: string;
  reason: string;
}

export interface ParsedDiagnosis {
  summary: string;
  weakPoints: WeakPoint[];
  nextStep: string;
  encouragement: string;
  /** >90 分时的进阶方向（替代薄弱点） */
  advancedNote: string;
  raw: string;
}

export interface CachedDiagnosis {
  status: DiagnosisStatus;
  score: number;
  /** status=ok */
  parsed?: ParsedDiagnosis;
  /** status=fallback：基础诊断文本 */
  text?: string;
  at: number;
}

export interface LearningResource {
  title: string;
  platform: string;
  kind: '文章' | '视频' | '书' | '课程';
  minutes: string;
  reason: string;
  keyword: string;
}

export type ResourceStatus = 'ok' | 'error' | 'need-key';

export interface CachedResource {
  status: ResourceStatus;
  resources?: LearningResource[];
  at: number;
}

/** BYOK：用户自带的大模型配置，仅保存在其本人浏览器 */
export interface AiSettings {
  provider: 'openai' | 'deepseek' | 'zhipu' | 'custom';
  apiKey: string;
  /** custom 时必填 */
  baseUrl: string;
  model: string;
}

/** 一次完整测评沉淀的「能力快照」，用于复测对比与成长曲线 */
export interface Snapshot {
  /** 去重键：同一次会话只存一个快照（取会话 startedAt） */
  sessionKey: string;
  /** 完成时间戳 */
  date: number;
  /** 六维得分 */
  dims: Record<DimensionId, number>;
  /** 总分（六维等权平均） */
  total: number;
  /** 本次作答题数 */
  answered: number;
  /** 答对题数 */
  correct: number;
  /** 本次答过的题目 gid（复测抽题避让 + 错题回看用） */
  gids: number[];
  /** 各维度作答统计（分数构成弹窗用；旧快照可能没有） */
  dimStats?: Record<DimensionId, { answered: number; correct: number; high: number }>;
  bankVersion: string;
}
