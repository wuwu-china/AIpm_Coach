import { QUESTIONS_BY_GID, type DimensionId } from '../data/questions';
import { DIMENSION_MAP } from '../data/dimensions';
import type {
  AiSettings,
  CachedResource,
  LearningResource,
  SessionState,
} from './types';
import { resolveProvider, streamChat, withRetry, type ChatMessage } from './ai-client';

const URL_RE = /(https?:\/\/\S+|www\.\S+)/g;

function systemPrompt(): string {
  return [
    '你是 AI 产品经理学习教练，熟悉行业内的优质学习资源。',
    '任务：根据用户的弱点维度和具体考察点，推荐 3-5 个学习资源帮他补强。',
    '每个资源严格按下面格式输出，资源之间空一行，禁止输出 JSON 或代码块：',
    '【资源1】',
    '标题：具体到能直接搜到（例如《Building Systems for LLM Applications》by Andrew Ng），不能模糊',
    '平台：具体来源平台（如 DeepLearning.AI、OpenAI 官方文档、Anthropic Docs、YouTube 某频道、某经典书）',
    '类型：文章 / 视频 / 书 / 课程，四选一',
    '时长：预计学习分钟数，只写数字加“分钟”',
    '理由：一句话，说明为什么它正好补这个弱点',
    '搜索词：3-6 个词的搜索关键词，拿去搜索引擎能定位到该资源',
    '死规矩：',
    '一、绝对不许输出任何 URL/链接，即使你记得网址也不许写，只给搜索关键词；',
    '二、只推荐稳定、不易过时的来源：知名作者（Andrew Ng、Karpathy、Chip Huyen 等）、大公司官方资源（OpenAI、Anthropic、Google 等）、经典书籍；禁止知乎/掘金/CSDN 单篇文章、不知名博主推文、时效性新文章；',
    '三、搜索词 3-6 个词，具体可定位，但不要长到没人会输入。',
  ].join('\n');
}

function weakExaminePoints(dim: DimensionId, state: SessionState): string[] {
  const points = new Set<string>();
  for (const r of state.records.filter((x) => x.dimension === dim && !x.correct)) {
    const q = QUESTIONS_BY_GID[r.gid];
    if (q?.examinePoint) {
      q.examinePoint.split(/[；;]/).map((s) => s.trim()).filter(Boolean).forEach((p) => points.add(p));
    } else if (q?.primaryTag) {
      points.add(q.primaryTag);
    }
  }
  return [...points].slice(0, 6);
}

function field(block: string, labels: string[]): string {
  for (const label of labels) {
    const re = new RegExp(`${label}[:：]\\s*([^\n]*)`);
    const m = block.match(re);
    if (m) return m[1].replace(URL_RE, '').trim();
  }
  return '';
}

function normalizeKind(raw: string): LearningResource['kind'] {
  if (raw.includes('视频')) return '视频';
  if (raw.includes('课')) return '课程';
  if (raw.includes('书')) return '书';
  return '文章';
}

export function parseResources(text: string): LearningResource[] {
  const cleaned = text.replace(URL_RE, '');
  const blocks = cleaned
    .split(/【资源\s*\d+】/)
    .map((s) => s.trim())
    .filter((s) => s && /标题[:：]/.test(s));

  const list: LearningResource[] = [];
  for (const block of blocks) {
    const title = field(block, ['标题']);
    const keyword = field(block, ['搜索词', '搜索建议', '关键词']).replace(/^["“]|["”]$/g, '');
    if (!title || !keyword) continue;
    const kind = normalizeKind(field(block, ['类型']));
    let minutes = field(block, ['时长', '预计时长', '学习时长']);
    const minMatch = minutes.match(/\d+/);
    minutes = minMatch ? `${minMatch[0]}分钟` : minutes || '约30分钟';
    list.push({
      title,
      platform: field(block, ['平台', '来源平台', '来源']) || '公开优质资源',
      kind,
      minutes,
      reason: field(block, ['理由', '推荐理由']) || '针对当前薄弱考察点的补强材料。',
      keyword,
    });
    if (list.length >= 5) break;
  }
  return list;
}

export function googleSearchUrl(keyword: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(keyword)}`;
}

export async function generateResources(
  dim: DimensionId,
  state: SessionState,
  settings: AiSettings | null,
  onToken?: (delta: string, full: string) => void,
): Promise<CachedResource> {
  const at = Date.now();
  if (!resolveProvider(settings)) {
    return { status: 'need-key', at };
  }
  const score = Math.round(state.dims[dim].score);
  const weak = weakExaminePoints(dim, state);
  const user = [
    `弱点维度：${DIMENSION_MAP[dim].name}（得分 ${score}）`,
    weak.length ? `需要补强的具体考察点：${weak.join('、')}` : '请按该维度的核心能力推荐。',
    score > 90 ? '该用户已很熟练，请推荐进阶/有挑战的资源。' : '',
  ]
    .filter(Boolean)
    .join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: user },
  ];

  try {
    const raw = await withRetry(() => streamChat(messages, settings as AiSettings, onToken));
    const resources = parseResources(raw);
    if (!resources.length) throw new Error('未解析到有效资源');
    return { status: 'ok', resources, at };
  } catch {
    return { status: 'error', at };
  }
}
