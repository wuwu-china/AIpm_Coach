// 全局文案与测评常量
export const TOTAL_QUESTIONS = 21;
export const MIN_PER_DIMENSION = 3;
export const ESTIMATED_MINUTES = 20;
export const BANK_VERSION = '2026.09-balanced-285';
export const FAKE_COMPLETED_COUNT = 1234;

export const LEVELS = [
  { min: 85, label: '高级水平' },
  { min: 70, label: '中级水平' },
  { min: 60, label: '进阶水平' },
  { min: 0, label: '入门水平' },
];

export function levelOf(score: number): string {
  return LEVELS.find((l) => score >= l.min)?.label ?? '入门水平';
}
