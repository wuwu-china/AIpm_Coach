import { useEffect, useRef, useState } from 'react';
import type { DimensionMeta } from '../data/dimensions';
import { scoreColor } from '../data/dimensions';
import type { AiSettings, CachedDiagnosis, CachedResource, SessionState } from '../lib/types';
import { generateDiagnosis } from '../lib/diagnosis-service';
import { generateResources, googleSearchUrl } from '../lib/resource-service';

interface Props {
  dim: DimensionMeta;
  score: number;
  count: number;
  auto: boolean;
  state: SessionState;
  settings: AiSettings | null;
  onOpenSettings: () => void;
  onPatch: (patch: Partial<SessionState>) => void;
}

const KIND_STYLE: Record<string, string> = {
  文章: 'bg-blue-50 text-blue-700',
  视频: 'bg-purple-50 text-purple-700',
  书: 'bg-amber-50 text-amber-700',
  课程: 'bg-green-50 text-green-700',
};

export default function DiagnosisCard({
  dim,
  score,
  count,
  auto,
  state,
  settings,
  onOpenSettings,
  onPatch,
}: Props) {
  const diagnosis: CachedDiagnosis | undefined = state.diagnosisCache[dim.id];
  const resource: CachedResource | undefined = state.resourceCache[dim.id];

  const [expanded, setExpanded] = useState(auto);
  const [loadingDiag, setLoadingDiag] = useState(false);
  const [stream, setStream] = useState('');
  const [notice, setNotice] = useState('');
  const [showResource, setShowResource] = useState(false);
  const [loadingRes, setLoadingRes] = useState(false);
  const booted = useRef(false);

  /** 该维度有效题数 <3 时不硬诊断（CAT 保底 3 题，正常流程不会触发） */
  const insufficient = count < 3;

  const runDiagnosis = async () => {
    if (loadingDiag) return;
    if (insufficient) {
      onPatch({
        diagnosisCache: {
          ...state.diagnosisCache,
          [dim.id]: { status: 'insufficient', score, at: Date.now() },
        },
      });
      return;
    }
    setLoadingDiag(true);
    setStream('');
    setNotice('');
    const result = await generateDiagnosis(
      dim.id,
      state,
      settings,
      (_d, full) => setStream(full),
      (msg) => setNotice(msg),
    );
    onPatch({ diagnosisCache: { ...state.diagnosisCache, [dim.id]: result } });
    setLoadingDiag(false);
  };

  useEffect(() => {
    if (auto && !booted.current) {
      booted.current = true;
      setExpanded(true);
      if (!diagnosis) void runDiagnosis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !diagnosis && !loadingDiag) void runDiagnosis();
  };

  const runResources = async () => {
    if (loadingRes) return;
    setLoadingRes(true);
    const result = await generateResources(dim.id, state, settings);
    onPatch({ resourceCache: { ...state.resourceCache, [dim.id]: result } });
    setLoadingRes(false);
  };

  const toggleResource = () => {
    const next = !showResource;
    setShowResource(next);
    if (next && !resource && !loadingRes) void runResources();
  };

  const color = scoreColor(score);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <button className="flex w-full items-center justify-between text-left" onClick={toggleExpand}>
        <span className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: dim.color }} />
          <span className="font-bold text-gray-800">{dim.name}</span>
          <span className="text-xs text-gray-400">{count} 题</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-2xl font-bold" style={{ color }}>
            {score}分
          </span>
          <span className="text-gray-400">{expanded ? '收起 ▴' : '展开查看诊断 ▾'}</span>
        </span>
      </button>

      {expanded && (
        <div className="mt-4">
          {loadingDiag && !diagnosis && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm text-brand-600">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-300 border-t-brand-700" />
                AI正在为你生成针对性诊断（约3秒）
              </div>
              {notice && (
                <p className="mb-2 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                  {notice}
                </p>
              )}
              {stream && (
                <div className="typing-cursor whitespace-pre-wrap text-sm leading-6 text-gray-600">
                  {stream}
                </div>
              )}
            </div>
          )}

          {(insufficient || diagnosis?.status === 'insufficient') && (
            <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-500">
              答题数据不足，无法生成针对性诊断。建议你做一次专项测评。
            </p>
          )}

          {!insufficient && diagnosis?.status === 'fallback' && (
            <div>
              <div className="mb-2 flex justify-end">
                <span className="text-[10px] text-gray-400">基础诊断</span>
              </div>
              <p className="text-sm leading-7 text-gray-700">{diagnosis.text}</p>
            </div>
          )}

          {!insufficient && diagnosis?.status === 'ok' && diagnosis.parsed && (
            <div className="animate-fade-up space-y-4">
              <p className="text-lg font-semibold leading-7" style={{ color }}>
                {diagnosis.parsed.summary}
              </p>

              {diagnosis.parsed.advancedNote ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-500">进阶方向</p>
                  <p className="whitespace-pre-wrap text-sm leading-7 text-gray-700">
                    {diagnosis.parsed.advancedNote}
                  </p>
                </div>
              ) : (
                diagnosis.parsed.weakPoints.length > 0 && (
                  <div className="space-y-3">
                    {diagnosis.parsed.weakPoints.map((wp, i) => (
                      <div key={i}>
                        <p className="text-sm font-bold text-gray-800">{wp.title}</p>
                        {wp.evidence && (
                          <div className="mt-1 rounded-md bg-gray-50 px-3 py-2 text-xs leading-6 text-gray-600">
                            {wp.evidence}
                          </div>
                        )}
                        {wp.reason && (
                          <p className="mt-1 text-sm leading-7 text-gray-600">{wp.reason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}

              {diagnosis.parsed.nextStep && (
                <p className="text-sm font-bold leading-7 text-brand-700">
                  → {diagnosis.parsed.nextStep}
                </p>
              )}

              {diagnosis.parsed.encouragement && (
                <div className="rounded-md border border-green-300 bg-green-50/60 px-4 py-3 text-sm leading-7 text-green-800">
                  {diagnosis.parsed.encouragement}
                </div>
              )}
            </div>
          )}

          {/* 学习资源 */}
          {!insufficient && diagnosis && diagnosis.status !== 'insufficient' && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <button
                className="rounded-full border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={toggleResource}
                disabled={loadingRes}
              >
                {loadingRes ? '正在匹配资源…' : showResource ? '收起推荐资源' : '查看推荐资源'}
              </button>

              {showResource && (
                <div className="mt-3 space-y-3">
                  {loadingRes && (
                    <p className="flex items-center gap-2 text-xs text-brand-600">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-300 border-t-brand-700" />
                      正在为你匹配学习资源…
                    </p>
                  )}

                  {resource?.status === 'need-key' && (
                    <div className="rounded-lg bg-brand-50 px-4 py-3 text-xs text-brand-700">
                      个性化学习资源需要调用大模型。填入你自己的 Key 后即可生成（费用由你的账号承担）。
                      <button className="ml-2 font-bold underline" onClick={onOpenSettings}>
                        去配置 AI Key
                      </button>
                    </div>
                  )}

                  {resource?.status === 'error' && (
                    <div className="flex items-center gap-3 text-xs text-orange-700">
                      资源暂时生成失败，请稍后重试
                      <button className="font-bold underline" onClick={runResources}>
                        重试
                      </button>
                    </div>
                  )}

                  {resource?.status === 'ok' &&
                    resource.resources?.map((r, i) => (
                      <div key={i} className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-gray-800">{r.title}</span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${KIND_STYLE[r.kind] ?? KIND_STYLE.文章}`}
                          >
                            {r.kind}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-gray-400">
                          {r.platform} · 约{r.minutes}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-gray-500">{r.reason}</p>
                        <a
                          className="mt-2 inline-block text-xs font-semibold text-brand-700 hover:underline"
                          href={googleSearchUrl(r.keyword)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          搜索：{r.keyword} →
                        </a>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
