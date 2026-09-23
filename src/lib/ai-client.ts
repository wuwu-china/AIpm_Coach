import type { AiSettings } from './types';

export interface ProviderPreset {
  id: AiSettings['provider'];
  label: string;
  baseUrl: string;
  model: string;
  /** 申请 Key 的说明页（仅展示，不参与调用） */
  docs: string;
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    docs: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    docs: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    docs: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    baseUrl: '',
    model: '',
    docs: '',
  },
];

export interface ResolvedProvider {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export function resolveProvider(s: AiSettings | null): ResolvedProvider | null {
  if (!s || !s.apiKey.trim()) return null;
  if (s.provider === 'custom') {
    if (!s.baseUrl.trim() || !s.model.trim()) return null;
    return { baseUrl: s.baseUrl.trim(), model: s.model.trim(), apiKey: s.apiKey.trim() };
  }
  const preset = PROVIDERS.find((p) => p.id === s.provider)!;
  return {
    baseUrl: s.baseUrl.trim() || preset.baseUrl,
    model: s.model.trim() || preset.model,
    apiKey: s.apiKey.trim(),
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 调用同源无状态中转 /api/chat，逐 token 回调。
 * 中转函数只转发，不接触任何服务端密钥。
 */
export async function streamChat(
  messages: ChatMessage[],
  settings: AiSettings,
  onToken?: (delta: string, full: string) => void,
): Promise<string> {
  const provider = resolveProvider(settings);
  if (!provider) throw new Error('AI 未配置完整（需要厂商地址、模型和 Key）');

  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.model,
      messages,
      temperature: 0.6,
    }),
  });

  if (!resp.ok || !resp.body) {
    let detail = '';
    try {
      const j = await resp.json();
      detail = j?.error || j?.detail || '';
    } catch {
      /* ignore */
    }
    throw new Error(detail || `AI 服务请求失败（HTTP ${resp.status}）`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const evt of events) {
      for (const line of evt.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const data = t.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            full += delta;
            onToken?.(delta, full);
          }
        } catch {
          // 非标准 SSE 分片，忽略
        }
      }
    }
  }
  if (!full.trim()) throw new Error('AI 返回内容为空');
  return full.trim();
}

/** 三次尝试：失败后等 1s、再失败等 3s，第三次仍失败则抛出 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [1000, 3000];
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('AI 调用失败');
}
