import { DIMENSIONS } from '../data/dimensions';
import type { Snapshot } from './types';
import type { DimensionId } from '../data/questions';

const DAY = 86_400_000;

export function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function daysBetween(from: number, to: number): number {
  return Math.max(0, Math.round((to - from) / DAY));
}

export type RetestVariant = 'soon' | 'normal' | 'overdue';

export interface RetestState {
  days: number;
  variant: RetestVariant;
  hint: string;
}

/** 「立即复测」按钮随距上次测评天数变化的状态（按钮始终可点） */
export function retestState(latest: Snapshot | null): RetestState | null {
  if (!latest) return null;
  const days = daysBetween(latest.date, Date.now());
  if (days < 3) {
    return { days, variant: 'soon', hint: '建议再过几天复测，让学习有时间发挥作用。' };
  }
  if (days <= 14) {
    return {
      days,
      variant: 'normal',
      hint: days <= 7 ? `距离上次测评 ${days} 天，来复测一次看看进步。` : `距离上次测评 ${days} 天，保持节奏复测一次。`,
    };
  }
  return { days, variant: 'overdue', hint: `已经 ${days} 天没测评了，回来看看自己的水平吧。` };
}

export interface DimDelta {
  id: DimensionId;
  name: string;
  prev: number;
  now: number;
  delta: number;
}

/** 最近两次快照的逐维度差值（按维度固定顺序） */
export function compareSnapshots(prev: Snapshot, latest: Snapshot): DimDelta[] {
  return DIMENSIONS.map((d) => {
    const now = latest.dims[d.id] ?? 0;
    const before = prev.dims[d.id] ?? 0;
    return { id: d.id, name: d.name, prev: before, now, delta: now - before };
  });
}

export interface Comparison {
  totalDelta: number;
  days: number;
  dims: DimDelta[];
  /** 提升最大的维度（delta 最大） */
  best: DimDelta | null;
  /** 仍需加强：退步或停滞中当前分最低的维度 */
  weak: DimDelta | null;
}

export function buildComparison(prev: Snapshot | null, latest: Snapshot | null): Comparison | null {
  if (!prev || !latest) return null;
  const dims = compareSnapshots(prev, latest);
  const best = dims.reduce<DimDelta | null>((a, b) => (a === null || b.delta > a.delta ? b : a), null);
  const stalled = dims.filter((d) => d.delta <= 0);
  const weak = stalled.reduce<DimDelta | null>(
    (a, b) => (a === null || b.now < a.now ? b : a),
    null,
  );
  return {
    totalDelta: latest.total - prev.total,
    days: daysBetween(prev.date, latest.date),
    dims,
    best,
    weak,
  };
}
