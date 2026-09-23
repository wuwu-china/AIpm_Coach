import { QUESTIONS } from '../data/questions';
import { DIMENSIONS } from '../data/dimensions';
import { MIN_PER_DIMENSION } from '../data/content';
import type { DimensionId } from '../data/questions';
import { debugEmptyBank } from './debug';

export interface BankStatus {
  ready: boolean;
  total: number;
  perDim: Record<DimensionId, number>;
  /** 题量不足保底要求的维度名 */
  missing: string[];
}

/** 启动测评前的题库门禁：题库为空或任一维度少于保底题量则不允许开始 */
export function bankStatus(): BankStatus {
  const perDim = Object.fromEntries(DIMENSIONS.map((d) => [d.id, 0])) as Record<DimensionId, number>;
  for (const q of QUESTIONS) perDim[q.dimension] += 1;

  const missing = DIMENSIONS.filter((d) => perDim[d.id] < MIN_PER_DIMENSION).map((d) => d.name);
  const ready = !debugEmptyBank() && QUESTIONS.length > 0 && missing.length === 0;

  return { ready, total: QUESTIONS.length, perDim, missing };
}
