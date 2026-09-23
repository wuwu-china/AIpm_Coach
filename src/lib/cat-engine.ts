import {
  QUESTIONS,
  QUESTIONS_BY_GID,
  type DimensionId,
  type OptionKey,
  type Question,
} from '../data/questions';
import { DIMENSIONS } from '../data/dimensions';
import { BANK_VERSION, MIN_PER_DIMENSION, TOTAL_QUESTIONS } from '../data/content';
import type { AnswerRecord, DimState, Selection, SessionState } from './types';

// —— 贡献分表（纯代码，确定性）——
export const CONTRIB_CORRECT: Record<number, number> = { 1: 55, 2: 60, 3: 75, 4: 90, 5: 100 };
export const CONTRIB_WRONG: Record<number, number> = { 1: 20, 2: 30, 3: 45, 4: 50, 5: 60 };
export const INIT_SCORE = 50;
const INIT_DIFF = 3;
const DIM_IDS = DIMENSIONS.map((d) => d.id);
const dimName = (id: DimensionId) => DIMENSIONS.find((d) => d.id === id)!.name;

function initialDims(): Record<DimensionId, DimState> {
  return Object.fromEntries(
    DIMENSIONS.map((d) => [d.id, { diff: INIT_DIFF, score: INIT_SCORE, count: 0, mastered: false }]),
  ) as Record<DimensionId, DimState>;
}

const byDim: Record<DimensionId, Question[]> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.id, QUESTIONS.filter((q) => q.dimension === d.id)]),
) as Record<DimensionId, Question[]>;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface DimResult {
  id: DimensionId;
  name: string;
  score: number;
  count: number;
  diff: number;
  mastered: boolean;
}

export class CatEngine {
  state: SessionState;

  private constructor(state: SessionState) {
    this.state = state;
  }

  /**
   * 开始一次新测评。
   * @param historyGids 本机历史上答过的题目 gid（复测时传入），抽题优先避开，
   *                    某维度未答题不够时再放开限制复用旧题。
   * @param focusDim 「重测这个维度」时传入，阶段二加测优先该维度。
   */
  static start(historyGids: number[] = [], focusDim: DimensionId | null = null): CatEngine {
    return new CatEngine({
      bankVersion: BANK_VERSION,
      startedAt: Date.now(),
      status: 'in_progress',
      usedGids: [],
      historyGids: [...new Set(historyGids)],
      focusDim,
      dims: initialDims(),
      records: [],
      current: null,
      diagnosisCache: {},
      resourceCache: {},
    });
  }

  static hydrate(state: SessionState): CatEngine {
    // 兼容旧会话缺字段
    state.diagnosisCache ??= {};
    state.resourceCache ??= {};
    state.focusDim ??= null;
    return new CatEngine(state);
  }

  get total(): number {
    return this.state.records.length;
  }

  get isFinished(): boolean {
    return this.state.records.length >= TOTAL_QUESTIONS;
  }

  /** 选出下一题；已完成返回 null。会把结果写入 state.current（刷新可恢复）。 */
  nextQuestion(): (Selection & { question: Question }) | null {
    if (this.state.current) return this.state.current;
    if (this.state.records.length >= TOTAL_QUESTIONS) return null;

    const used = new Set(this.state.usedGids);
    const dim = this.chooseDimension();
    if (!dim) return null;

    const d = this.state.dims[dim];
    const question = this.pickQuestion(dim, d.diff, used);
    if (!question) {
      // 目标维度题库耗尽（理论上不会），按优先级从其它维度兜底
      const fallbackDim = this.dimPriority().find((id) => this.pickQuestion(id, this.state.dims[id].diff, used));
      if (!fallbackDim) return null;
      return this.selectFor(fallbackDim, used);
    }
    return this.selectFor(dim, used, question);
  }

  private selectFor(dim: DimensionId, used: Set<number>, question?: Question): (Selection & { question: Question }) | null {
    const d = this.state.dims[dim];
    const q = question ?? this.pickQuestion(dim, d.diff, used);
    if (!q) return null;
    const order = this.state.records.length + 1;
    const phase1 = this.state.records.length < MIN_PER_DIMENSION * DIMENSIONS.length;
    const focusNow = !phase1 && this.state.focusDim === dim;
    const reason = phase1
      ? `保底覆盖(${dimName(dim)} 第${d.count + 1}题)`
      : focusNow
        ? `维度专项加试(${dimName(dim)})`
        : `薄弱加试(当前EWMA最低=${Math.round(d.score)}分)`;
    const selection: Selection & { question: Question } = {
      order,
      gid: q.gid,
      dimension: dim,
      difficulty: q.difficulty,
      reason,
      question: q,
    };
    this.state.current = selection;
    // eslint-disable-next-line no-console
    console.log(
      `[CAT] 第${order}题 维度=${dim} ${dimName(dim)} 选维理由=${reason} 难度=L${q.difficulty} 题号=${q.gid}`,
    );
    return selection;
  }

  /** 阶段一：未达保底维度（count 升序、维度顺序）；阶段二：EWMA 最低、未掌握维度 */
  private chooseDimension(): DimensionId | null {
    const order = (a: DimensionId, b: DimensionId) =>
      DIMENSIONS.findIndex((d) => d.id === a) - DIMENSIONS.findIndex((d) => d.id === b);

    const answered = this.state.records.length;
    if (answered < MIN_PER_DIMENSION * DIMENSIONS.length) {
      const under = DIM_IDS.filter((id) => {
        const d = this.state.dims[id];
        return !d.mastered && d.count < MIN_PER_DIMENSION;
      });
      if (under.length) {
        under.sort((a, b) => this.state.dims[a].count - this.state.dims[b].count || order(a, b));
        return under[0];
      }
    }
    // 阶段二：加测给当前最弱、未掌握维度
    let candidates = DIM_IDS.filter((id) => !this.state.dims[id].mastered);
    if (candidates.length === 0) candidates = [...DIM_IDS];
    // 「重测这个维度」：阶段二在该维度未掌握前优先加测它
    const focus = this.state.focusDim;
    if (focus && candidates.includes(focus)) {
      // eslint-disable-next-line no-console
      console.log(`[CAT] 阶段二·维度专项：加测优先 ${dimName(focus)}`);
      return focus;
    }
    candidates.sort((a, b) => this.state.dims[a].score - this.state.dims[b].score || order(a, b));
    return candidates[0];
  }

  /** 阶段二维度优先级（兜底用） */
  private dimPriority(): DimensionId[] {
    const ids = [...DIM_IDS];
    ids.sort((a, b) => this.state.dims[a].score - this.state.dims[b].score);
    return ids;
  }

  /**
   * 在指定维度、目标难度档选题；该档无题则向相邻难度逐级扩散，不重复本次 gid。
   * 复测时优先选「本机从未答过」的题（fresh），未答题池不够再放开限制复用旧题。
   */
  private pickQuestion(dim: DimensionId, targetDiff: number, used: Set<number>): Question | null {
    const history = new Set(this.state.historyGids ?? []);

    const tryPick = (excludeHistory: boolean): Question | null => {
      const pool = byDim[dim];
      const usable = (q: Question) =>
        !used.has(q.gid) && (!excludeHistory || !history.has(q.gid));
      for (let radius = 0; radius <= 4; radius++) {
        const levels = [targetDiff + radius, radius === 0 ? targetDiff : targetDiff - radius].filter(
          (lv) => lv >= 1 && lv <= 5,
        );
        const levelSet = new Set(levels);
        const candidates = pool.filter((q) => usable(q) && levelSet.has(q.difficulty));
        if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
      }
      const anyLeft = pool.filter(usable);
      return anyLeft.length ? anyLeft[Math.floor(Math.random() * anyLeft.length)] : null;
    };

    const fresh = tryPick(true);
    if (fresh) return fresh;
    const reused = tryPick(false);
    if (reused) {
      // eslint-disable-next-line no-console
      console.log(`[CAT] 维度 ${dimName(dim)} 未答过的题不足，复用旧题 gid=${reused.gid}`);
    }
    return reused;
  }

  /** 提交答案（picked='SKIP' 为跳过，按答错处理） */
  answer(picked: OptionKey | 'SKIP', ms: number): AnswerRecord {
    const sel = this.state.current;
    if (!sel) throw new Error('没有待作答的题目');
    const q = QUESTIONS_BY_GID[sel.gid];
    const correct = picked !== 'SKIP' && picked === q.answer;
    const d = this.state.dims[q.dimension];

    const contribution = correct
      ? CONTRIB_CORRECT[q.difficulty]
      : CONTRIB_WRONG[q.difficulty];
    const scoreAfter = round1(d.score * 0.7 + contribution * 0.3);

    const record: AnswerRecord = {
      order: sel.order,
      gid: sel.gid,
      dimension: q.dimension,
      difficulty: q.difficulty,
      picked,
      correct,
      ms,
      contribution,
      scoreAfter,
    };
    this.state.records.push(record);
    this.state.usedGids.push(sel.gid);
    d.count += 1;
    d.score = scoreAfter;
    if (correct) {
      d.diff = Math.min(5, d.diff + 1);
      if (q.difficulty === 5) {
        d.mastered = true;
        // eslint-disable-next-line no-console
        console.log(`[CAT] 维度 ${dimName(q.dimension)} 在 L5 答对，标记为已掌握，封顶 3 题`);
      }
    } else {
      d.diff = Math.max(1, d.diff - 1);
    }
    // eslint-disable-next-line no-console
    console.log(
      `[CAT] 判分 第${sel.order}题 ${correct ? '✓答对' : picked === 'SKIP' ? '⏭跳过' : '✗答错'} L${q.difficulty} 贡献=${contribution} ${dimName(q.dimension)}新分=${scoreAfter} 难度→L${d.diff}`,
    );

    this.state.current = null;
    if (this.state.records.length >= TOTAL_QUESTIONS) {
      this.state.status = 'finished';
      this.state.finishedAt = Date.now();
      // eslint-disable-next-line no-console
      console.log('[CAT] 测评结束', this.results());
    }
    return record;
  }

  results(): { dims: DimResult[]; total: number } {
    const dims: DimResult[] = DIMENSIONS.map((meta) => {
      const d = this.state.dims[meta.id];
      return {
        id: meta.id,
        name: meta.name,
        score: Math.round(d.score),
        count: d.count,
        diff: d.diff,
        mastered: d.mastered,
      };
    });
    const total = Math.round(dims.reduce((s, d) => s + d.score, 0) / dims.length);
    return { dims, total };
  }
}
