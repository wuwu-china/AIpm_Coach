import type { DimensionId } from './questions';

export interface DimensionMeta {
  id: DimensionId;
  /** 展示序号（雷达图轴顺序） */
  order: number;
  name: string;
  /** 一句话说明（介绍页用） */
  brief: string;
  /** 低饱和主题色 */
  color: string;
}

// 顺序固定：D1 蓝 / D2 青 / D3 绿 / D4 橙 / D5 紫 / D6 粉
export const DIMENSIONS: DimensionMeta[] = [
  {
    id: 'ai_basics',
    order: 0,
    name: 'AI基础认知',
    brief: '大模型原理、Prompt、多轮记忆、意图识别与上下文工程',
    color: '#45679c',
  },
  {
    id: 'llm_tech',
    order: 1,
    name: '大模型技术理解',
    brief: '模型选型、微调、RAG、合成数据与性能成本工程',
    color: '#2f9e97',
  },
  {
    id: 'ai_product',
    order: 2,
    name: 'AI产品设计',
    brief: 'AI 功能设计、Agent 编排、工具调用、badcase 闭环与方法论',
    color: '#57a06f',
  },
  {
    id: 'data_eval',
    order: 3,
    name: '数据与评估',
    brief: '评测集构建、模型评测、指标体系与实验设计',
    color: '#d0822f',
  },
  {
    id: 'ai_ethics',
    order: 4,
    name: 'AI伦理与风险',
    brief: '合规、隐私、内容安全、偏见治理与风险兜底',
    color: '#8567bd',
  },
  {
    id: 'ai_business',
    order: 5,
    name: 'AI商业化与落地',
    brief: 'ROI 算账、定价增长、行业认知与跨团队落地',
    color: '#cf739c',
  },
];

export const DIMENSION_MAP: Record<DimensionId, DimensionMeta> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.id, d]),
) as Record<DimensionId, DimensionMeta>;

/** 雷达图高分/低分提示阈值 */
export const SCORE_GOOD = 80;
export const SCORE_WEAK = 60;

export function scoreColor(score: number): string {
  if (score < SCORE_WEAK) return '#d0822f'; // 橙
  if (score <= SCORE_GOOD) return '#2f4d7d'; // 主色深蓝
  return '#3f8f6b'; // 绿
}
