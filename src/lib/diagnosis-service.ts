import { QUESTIONS_BY_GID } from '../data/questions';
import { DIMENSION_MAP } from '../data/dimensions';
import { bandOf, FALLBACK_DIAGNOSIS } from '../data/diagnosis-fallback';
import type {
  AiSettings,
  AnswerRecord,
  CachedDiagnosis,
  ParsedDiagnosis,
  SessionState,
  WeakPoint,
} from './types';
import type { DimensionId } from '../data/questions';
import { resolveProvider, streamChat, withRetry, type ChatMessage } from './ai-client';

function systemPrompt(advanced: boolean): string {
  const weakSection = advanced
    ? '【进阶方向】该用户已掌握得很好，不要罗列薄弱点；给出 2-3 个他可以挑战的更难话题/项目，说明为什么适合他当前水平。'
    : [
        '【薄弱点】1-3 个，每个薄弱点严格按下面三行书写：',
        '▶ 考察点标题（加粗短句，不要序号）',
        '证据：必须引用他实际答错的题号与简短题干，写成“你在第X题、第Y题都搞错了……”',
        '原因：只基于这些答错题的特征推测他为什么会错，不许凭空臆造',
      ].join('\n');
  return [
    '你是一位有 8 年经验的资深 AI 产品经理面试官，看过无数候选人的表现，清楚什么是好答案、什么是有缺陷的答案。',
    '任务：根据用户在某个维度的真实答题数据，生成针对性诊断报告。',
    '你会收到：维度名、维度得分(0-100)、该维度每道题的题号、考核点、难度、对错与题干摘要。',
    '全部用结构化中文自然语言输出，禁止输出 JSON 或代码块，严格使用下列固定小节标记：',
    '【一句话总结】30 字以内、犀利不圆滑的水平判断（例如“你对大模型选型缺乏判断框架”），禁止“还有提升空间”这类圆滑话。',
    weakSection,
    '【下一步】一个具体、立刻能开始的动作（例如“先读 OpenAI 官方 Evaluation Guide 文档第 3 章”），禁止“建议多学习”这类空话。',
    '【鼓励】引用该维度他答对的具体题号给肯定（例如“你在第5题对 Token 成本权衡的判断，说明你已具备产品权衡思维”）；若该维度全错，就肯定他在难度最高那道题上的真实尝试，绝不许编造他答对过的题。',
    '【死规矩】正文（证据、进阶方向或鼓励中）必须至少出现 1 个具体题号，格式为“第N题”，且 N 必须取自上面明细里真实给过的题号；完全不引用题号的输出视为不合格。',
    '硬性限定：不许说“你在X方面有潜力但缺乏深度”这类废话；原因必须基于答错题；鼓励必须引用答对的具体题。',
  ].join('\n');
}

function buildUserMessage(dim: DimensionId, score: number, recs: AnswerRecord[]): string {
  const meta = DIMENSION_MAP[dim];
  const lines = recs.map((r) => {
    const q = QUESTIONS_BY_GID[r.gid];
    const point = q?.examinePoint || q?.primaryTag || '综合';
    const result = r.picked === 'SKIP' ? '跳过' : r.correct ? '答对' : '答错';
    const stem = (q?.stem ?? '').slice(0, 44);
    return `第${r.order}题 · 难度L${r.difficulty} · 考核点「${point}」 · ${result}。题干摘要：${stem}`;
  });
  return [
    `维度：${meta.name}`,
    `维度得分：${score}`,
    `本维度共作答 ${recs.length} 题，明细如下（证据里的题号请使用“第N题”）：`,
    ...lines,
    score > 90
      ? '该维度得分超过 90，请输出【进阶方向】而非【薄弱点】。'
      : '请如实指出薄弱点并引用答错的题号。',
  ].join('\n');
}

function clean(s: string): string {
  return s.replace(/^[\s:：]+/, '').trim();
}

function section(text: string, name: string): string {
  const re = new RegExp(`【${name}】([\\s\\S]*?)(?=【(?:一句话总结|薄弱点|进阶方向|下一步|鼓励)】|$)`);
  const m = text.match(re);
  return m ? clean(m[1]) : '';
}

function parseWeakPoints(body: string): WeakPoint[] {
  const chunks = body
    .split(/▶/)
    .map((s) => s.trim())
    .filter(Boolean);
  const points: WeakPoint[] = [];
  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    let title = lines[0].replace(/^标题[:：]\s*/, '');
    let evidence = '';
    let reason = '';
    for (const ln of lines) {
      if (/^证据[:：]/.test(ln)) evidence = ln.replace(/^证据[:：]\s*/, '');
      else if (/^原因[:：]/.test(ln)) reason = ln.replace(/^原因[:：]\s*/, '');
    }
    if (!evidence && !reason) {
      // 模型没按三行写：整段作为原因，标题保留
      reason = lines.slice(1).join(' ') || title;
    }
    points.push({ title: title.replace(/^[▶\s]+/, ''), evidence, reason });
  }
  return points.slice(0, 3);
}

export function parseDiagnosis(text: string): ParsedDiagnosis {
  const summary = section(text, '一句话总结');
  const nextStep = section(text, '下一步');
  const encouragement = section(text, '鼓励');
  const weakBody = section(text, '薄弱点');
  const advancedNote = section(text, '进阶方向');
  return {
    summary,
    weakPoints: weakBody ? parseWeakPoints(weakBody) : [],
    nextStep,
    encouragement,
    advancedNote,
    raw: text,
  };
}

/** 诊断正文是否引用了本维度真实给过的题号（第N题 / #N） */
export function citesQuestionNumber(text: string, orders: number[]): boolean {
  const nums = [
    ...text.matchAll(/第\s*(\d+)\s*题/g),
    ...text.matchAll(/#\s*(\d+)/g),
  ].map((m) => Number(m[1]));
  return nums.some((n) => orders.includes(n));
}

export async function generateDiagnosis(
  dim: DimensionId,
  state: SessionState,
  settings: AiSettings | null,
  onToken?: (delta: string, full: string) => void,
  onNotice?: (msg: string) => void,
): Promise<CachedDiagnosis> {
  const recs = state.records.filter((r) => r.dimension === dim);
  const score = Math.round(state.dims[dim].score);
  const at = Date.now();

  if (recs.length < 3) {
    return { status: 'insufficient', score, at };
  }

  const fallbackText = FALLBACK_DIAGNOSIS[dim][bandOf(score)];
  const provider = resolveProvider(settings);
  if (!provider) {
    return { status: 'fallback', score, text: fallbackText, at };
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(score > 90) },
    { role: 'user', content: buildUserMessage(dim, score, recs) },
  ];
  const orders = recs.map((r) => r.order);
  const valid = (raw: string, parsed: ParsedDiagnosis) =>
    !!parsed.summary && citesQuestionNumber(raw, orders);

  try {
    const raw = await withRetry(() => streamChat(messages, settings as AiSettings, onToken));
    let parsed = parseDiagnosis(raw);

    // 内容质量闸门：缺一句话总结或没引用任何真实题号 → 提示并带上下文重新生成一次
    if (!valid(raw, parsed)) {
      onNotice?.('AI 没有引用具体题号，正在重新生成…');
      const corrective: ChatMessage[] = [
        ...messages,
        { role: 'assistant', content: raw },
        {
          role: 'user',
          content:
            '你上一版没有按要求引用具体题号（或缺一句话总结）。请重新输出完整诊断：证据/进阶方向/鼓励中必须至少出现一个“第N题”，N 必须取自我给你的题号清单 ' +
            orders.join('、') +
            '，其余小节保持原格式。',
        },
      ];
      const raw2 = await withRetry(() => streamChat(corrective, settings as AiSettings, onToken));
      const parsed2 = parseDiagnosis(raw2);
      if (!valid(raw2, parsed2)) throw new Error('诊断仍未引用题号');
      parsed = parsed2;
    }
    return { status: 'ok', score, parsed, at };
  } catch {
    // 网络/限流/格式始终失败：用预置通用诊断托底，前端绝不出现空白或错误页
    return { status: 'fallback', score, text: fallbackText, at };
  }
}
