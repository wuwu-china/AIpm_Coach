// 从 data/bank.md（标准化选择题题库）构建前端题库 src/data/questions.ts
// 用法：node scripts/build-questions.mjs
// 纯确定性解析：维度由「题目类型标签」按固定映射得到，难度取题库标注，不做任何 AI 推断。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'data/bank.md');
const OUT = resolve(ROOT, 'src/data/questions.ts');

const text = readFileSync(SRC, 'utf-8');

// —— 标签 -> 六维度（主维度取题目标签中按出现顺序首个命中的标签）——
const DIMENSIONS = [
  { id: 'ai_basics', name: 'AI基础认知', tags: ['大模型基础认知', '机器学习基础', 'Prompt工程', '多轮对话与记忆', '意图识别与槽位', '上下文工程', '多模态'] },
  { id: 'llm_tech', name: '大模型技术理解', tags: ['模型选型', '模型微调与训练', '合成数据', '搜索推荐系统', '性能与成本工程', 'RAG与知识库'] },
  { id: 'ai_product', name: 'AI产品设计', tags: ['AI产品设计', 'Agent与工作流编排', '工具调用与MCP·A2A', 'badcase闭环迭代', '产品方法论', '需求分析与管理', '0—1产品规划', '产品版本规划', '用户研究与画像', '项目经验与复盘'] },
  { id: 'data_eval', name: '数据与评估', tags: ['数据工程与评测集', '模型评测', '数据分析与指标体系'] },
  { id: 'ai_ethics', name: 'AI伦理与风险', tags: ['合规安全与伦理'] },
  { id: 'ai_business', name: 'AI商业化与落地', tags: ['商业化与ROI', '增长与运营', '行业认知与趋势', '项目管理与跨团队协同'] },
];
// 纯软素质标签：当且仅当一道题的全部标签都属于此集合时不入池（与线上口径一致）
const SOFT_TAGS = ['职业规划与自我认知', '职场沟通与软素质', 'HR面与通用素质', '薪酬谈判', '团队管理'];

const tagToDim = new Map();
for (const d of DIMENSIONS) for (const t of d.tags) tagToDim.set(t, d.id);

const blocks = text.split(/^### /m).slice(1);
const questions = [];
const excluded = [];
const unknownTags = new Set();
let problems = 0;

for (const block of blocks) {
  const lines = block.split('\n');
  const header = lines[0].match(/^(\d+)\s*[、.]\s*(.*)$/);
  if (!header) { problems++; continue; }
  const gid = Number(header[1]);

  const tagLine = block.match(/【题目类型】\*\*\s*(.+)/);
  const tags = tagLine ? tagLine[1].split('/').map((s) => s.trim()).filter(Boolean) : [];

  const diffM = block.match(/【难度】\*\*\s*([1-5])/);
  const difficulty = diffM ? Number(diffM[1]) : 3;

  // 题干：【选择题】标记所在行的剩余内容；若为空则取到 A 选项前的非空行
  let stem = '';
  const stemM = block.match(/【选择题】\*\*\s*(.*)/);
  if (stemM && stemM[1].trim()) {
    stem = stemM[1].trim();
  } else {
    const after = block.split(/【选择题】\*\*/)[1] || '';
    for (const ln of after.split('\n')) {
      const t = ln.trim();
      if (!t) continue;
      if (/^A[.、]/.test(t)) break;
      stem += t;
    }
  }

  const options = {};
  for (const L of ['A', 'B', 'C', 'D']) {
    const m = block.match(new RegExp(`^${L}[.、]\\s*(.+)$`, 'm'));
    if (!m) { problems++; options[L] = ''; continue; }
    options[L] = m[1].trim();
  }

  const ansM = block.match(/正确答案：\*\*\s*([ABCD])/);
  if (!ansM) { problems++; continue; }
  const answer = ansM[1];

  const epM = block.match(/【考核点】\*\*\s*(.+)/);
  const examinePoint = epM ? epM[1].trim() : '';

  for (const t of tags) {
    if (!tagToDim.has(t) && !SOFT_TAGS.includes(t)) unknownTags.add(t);
  }

  // 全部标签均为软素质 -> 不入池
  if (tags.length > 0 && tags.every((t) => SOFT_TAGS.includes(t))) {
    excluded.push(gid);
    continue;
  }
  // 主维度：题目标签顺序中首个命中
  let dimension = null;
  let primaryTag = '';
  for (const t of tags) {
    if (tagToDim.has(t)) { dimension = tagToDim.get(t); primaryTag = t; break; }
  }
  if (!dimension) { problems++; console.error(`gid ${gid} 无法映射维度，tags=${tags.join('|')}`); continue; }

  questions.push({ gid, dimension, difficulty, primaryTag, tags, stem, options, answer, examinePoint });
}

// —— 统计与断言 ——
const byDim = {};
const grid = {};
for (const d of DIMENSIONS) { byDim[d.id] = 0; grid[d.id] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; }
for (const q of questions) { byDim[q.dimension]++; grid[q.dimension][q.difficulty]++; }
const ansDist = { A: 0, B: 0, C: 0, D: 0 };
for (const q of questions) ansDist[q.answer]++;

console.log('解析题块数:', blocks.length, '| 入池:', questions.length, '| 剔除(纯软素质):', excluded.length, excluded.join(','));
console.log('结构异常数:', problems, '| 未知标签:', [...unknownTags].join('；') || '无');
console.log('答案分布:', JSON.stringify(ansDist));
for (const d of DIMENSIONS) {
  console.log(`${d.id.padEnd(12)} ${String(byDim[d.id]).padStart(3)}  难度分布 L1-L5:`, Object.values(grid[d.id]).join('/'));
}

const header = `// 此文件由 scripts/build-questions.mjs 从 data/bank.md 自动生成，请勿手改。
// 共 ${questions.length} 题；维度由标签确定性映射，难度取题库标注。

export type DimensionId =
  | 'ai_basics'
  | 'llm_tech'
  | 'ai_product'
  | 'data_eval'
  | 'ai_ethics'
  | 'ai_business';

export type OptionKey = 'A' | 'B' | 'C' | 'D';

export interface Question {
  gid: number;
  dimension: DimensionId;
  difficulty: 1 | 2 | 3 | 4 | 5;
  primaryTag: string;
  tags: string[];
  stem: string;
  options: Record<OptionKey, string>;
  answer: OptionKey;
  examinePoint: string;
}

export const QUESTIONS: Question[] = ${JSON.stringify(questions, null, 2)};

export const QUESTIONS_BY_GID: Record<number, Question> = Object.fromEntries(
  QUESTIONS.map((q) => [q.gid, q]),
) as Record<number, Question>;

export function getQuestionsByDimension(dimension: DimensionId): Question[] {
  return QUESTIONS.filter((q) => q.dimension === dimension);
}

export function getQuestionsByDimensionAndDiff(
  dimension: DimensionId,
  difficulty: number,
): Question[] {
  return QUESTIONS.filter((q) => q.dimension === dimension && q.difficulty === difficulty);
}
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, header, 'utf-8');
console.log('\n已写出', OUT);
