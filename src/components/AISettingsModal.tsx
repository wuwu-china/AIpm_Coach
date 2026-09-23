import { useEffect, useState } from 'react';
import { PROVIDERS, resolveProvider, streamChat } from '../lib/ai-client';
import { getSettings, saveSettings } from '../lib/storage';
import type { AiSettings } from '../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const EMPTY: AiSettings = { provider: 'deepseek', apiKey: '', baseUrl: '', model: '' };

export default function AISettingsModal({ open, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<AiSettings>(EMPTY);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(getSettings() ?? EMPTY);
      setTestResult(null);
    }
  }, [open]);

  if (!open) return null;

  const preset = PROVIDERS.find((p) => p.id === draft.provider);
  const isCustom = draft.provider === 'custom';
  const resolved = resolveProvider(draft);

  const handleTest = async () => {
    if (!resolved) {
      setTestResult({ ok: false, msg: '请先补全厂商地址、模型和 Key' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const reply = await streamChat(
        [
          { role: 'system', content: '只回复两个字：正常' },
          { role: 'user', content: '连通性测试' },
        ],
        draft,
      );
      setTestResult({ ok: true, msg: `连接成功，模型回复：${reply.slice(0, 20)}` });
    } catch (e) {
      setTestResult({ ok: false, msg: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (!draft.apiKey.trim()) {
      setTestResult({ ok: false, msg: '请填入 API Key' });
      return;
    }
    if (isCustom && (!draft.baseUrl.trim() || !draft.model.trim())) {
      setTestResult({ ok: false, msg: '自定义厂商需要填写 Base URL 和模型名' });
      return;
    }
    saveSettings(draft);
    onSaved?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-brand-100 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-lg font-bold text-brand-800">AI 设置（用你自己的 Key）</div>
        <p className="mb-4 text-xs leading-5 text-gray-500">
          诊断与学习资源由大模型实时生成。Key 只保存在你本人浏览器的 localStorage，每次请求直接发给模型厂商，
          本网站的中转服务<b>不保存、不记录</b>，token 费用由你自己的账号承担。不填 Key 也能答题和看雷达图，
          诊断会使用通用「基础诊断」兜底。
        </p>

        <label className="mb-1 block text-xs font-semibold text-gray-600">模型厂商</label>
        <select
          className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600"
          value={draft.provider}
          onChange={(e) =>
            setDraft({ ...draft, provider: e.target.value as AiSettings['provider'], baseUrl: '', model: '' })
          }
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        {isCustom ? (
          <>
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              Base URL（OpenAI 兼容，需含 /v1）
            </label>
            <input
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-600"
              placeholder="https://api.example.com/v1"
              value={draft.baseUrl}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
            />
            <label className="mb-1 block text-xs font-semibold text-gray-600">模型名</label>
            <input
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-600"
              placeholder="例如 gpt-4o-mini"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            />
          </>
        ) : (
          <div className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            默认地址 {preset?.baseUrl}，默认模型 {preset?.model}（一般无需修改）
            {preset?.docs && (
              <a className="ml-1 underline" href={preset.docs} target="_blank" rel="noopener noreferrer">
                去获取 Key
              </a>
            )}
          </div>
        )}

        <label className="mb-1 block text-xs font-semibold text-gray-600">API Key</label>
        <input
          type="password"
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-600"
          placeholder="粘贴你的 Key（仅存于本机浏览器）"
          value={draft.apiKey}
          onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
        />

        {testResult && (
          <div
            className={`mb-3 rounded-lg px-3 py-2 text-xs ${
              testResult.ok ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
            }`}
          >
            {testResult.msg}
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            className="rounded-lg border border-brand-200 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? '测试中…' : '测试连接'}
          </button>
          <div className="flex gap-2">
            <button
              className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
              onClick={onClose}
            >
              取消
            </button>
            <button
              className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
              onClick={handleSave}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
