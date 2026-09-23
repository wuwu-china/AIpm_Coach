import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import RadarChart from '../../components/RadarChart';
import DiagnosisCard from '../../components/DiagnosisCard';
import AISettingsModal from '../../components/AISettingsModal';
import WrongReviewModal from '../../components/WrongReviewModal';
import ScoreExplainModal from '../../components/ScoreExplainModal';
// 折线图模块较重，仅在用户打开成长曲线时按需加载
const GrowthTrendChart = lazy(() => import('../../components/GrowthTrendChart'));
import { DIMENSIONS, scoreColor } from '../../data/dimensions';
import { levelOf } from '../../data/content';
import { CatEngine } from '../../lib/cat-engine';
import {
  buildDimStats,
  getSettings,
  loadSession,
  loadSnapshots,
  saveSession,
  saveSnapshotOnce,
} from '../../lib/storage';
import { buildComparison, fmtDate, retestState } from '../../lib/retest';
import { debugInsufficientDim } from '../../lib/debug';
import type { AiSettings, SessionState, Snapshot } from '../../lib/types';
import type { DimensionId } from '../../data/questions';

const GREEN = '#3f8f6b';
const ORANGE = '#d0822f';

export default function ResultPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionState | null>(null);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [trendOpen, setTrendOpen] = useState(false);
  const [wrongOpen, setWrongOpen] = useState(false);
  const [wrongDim, setWrongDim] = useState<DimensionId | null>(null);
  const openWrong = (dimId: DimensionId | null = null) => {
    setWrongDim(dimId);
    setWrongOpen(true);
  };
  const [explainDim, setExplainDim] = useState<DimensionId | null>(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const s = loadSession();
    let list = loadSnapshots();

    if (s && s.status === 'finished') {
      setSession(s);
      // 完成至少 10 题即沉淀能力快照；同一会话只存一次
      const sessionKey = `s-${s.startedAt}`;
      if (s.records.length >= 10 && !list.some((x) => x.sessionKey === sessionKey)) {
        const r = CatEngine.hydrate(s).results();
        list = saveSnapshotOnce({
          sessionKey,
          date: s.finishedAt ?? Date.now(),
          dims: Object.fromEntries(r.dims.map((d) => [d.id, d.score])) as Record<DimensionId, number>,
          total: r.total,
          answered: s.records.length,
          correct: s.records.filter((x) => x.correct).length,
          gids: s.records.map((x) => x.gid),
          dimStats: buildDimStats(s),
          bankVersion: s.bankVersion,
        });
      }
    }

    setSnaps(list);
    setSettings(getSettings());
    setBooted(true);
  }, []);

  const latest = snaps[snaps.length - 1] ?? null;
  const prev = snaps.length >= 2 ? snaps[snaps.length - 2] : null;

  // 当前会话模式才有逐题记录（可做个性化诊断）；仅有快照时为「历史报告」模式
  const results = session ? CatEngine.hydrate(session).results() : null;
  // 雷达图统一以最近一次快照为数据源（分数完成后即冻结，避免诊断流式更新时重建图表）
  const scoreMap = useMemo(() => {
    const map = {} as Record<DimensionId, number>;
    if (latest) DIMENSIONS.forEach((d) => (map[d.id] = latest.dims[d.id] ?? 0));
    return map;
  }, [latest]);
  const countMap = useMemo(() => {
    const map = Object.fromEntries(DIMENSIONS.map((d) => [d.id, 0])) as Record<DimensionId, number>;
    results?.dims.forEach((d) => (map[d.id] = d.count));
    // 自测调试开关：强制某维度「数据不足」
    const force = debugInsufficientDim();
    if (force && force in map) map[force as DimensionId] = 0;
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // 各维度错题数（用于诊断卡片角标）
  const wrongMap = useMemo(() => {
    const map = Object.fromEntries(DIMENSIONS.map((d) => [d.id, 0])) as Record<DimensionId, number>;
    session?.records.forEach((r) => {
      if (!r.correct) map[r.dimension]++;
    });
    return map;
  }, [session]);
  const totalWrong = session ? session.records.filter((r) => !r.correct).length : 0;

  const comparison = buildComparison(prev, latest);
  const deltaMap = useMemo(() => {
    const m = {} as Record<DimensionId, number>;
    comparison?.dims.forEach((d) => (m[d.id] = d.delta));
    return m;
  }, [comparison]);

  const justFinished = !!session && !!latest && latest.sessionKey === `s-${session.startedAt}`;
  const rs = retestState(latest);
  const weakest = latest
    ? DIMENSIONS.map((d) => ({ id: d.id, name: d.name, score: latest.dims[d.id] ?? 0 })).reduce((a, b) =>
        b.score < a.score ? b : a,
      )
    : null;

  if (!booted) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-brand-500">加载结果…</div>;
  }

  // 雷达图空状态：没有任何测评数据时不渲染空白雷达
  if (!latest) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2 font-bold text-brand-800">
            <span className="inline-block h-5 w-5 rounded-md bg-brand-700" />
            AIPMCoach
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-md rounded-xl border border-dashed border-gray-300 bg-white px-8 py-14 text-center shadow-sm">
            <div className="mx-auto mb-5 h-24 w-24 rounded-full border-[6px] border-gray-100 opacity-60" />
            <p className="text-base font-semibold text-gray-700">完成测评后查看你的能力雷达图</p>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              21 道自适应单选题，约 20 分钟，生成六维能力分布与针对性诊断。
            </p>
            <Link
              to="/intro"
              className="mt-6 inline-block rounded-lg bg-brand-700 px-10 py-3 text-sm font-semibold text-white hover:bg-brand-800"
            >
              开始测评
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const onPatch = (patch: Partial<SessionState>) => {
    setSession((prevSession) => {
      if (!prevSession) return prevSession;
      const next = { ...prevSession, ...patch };
      saveSession(next);
      return next;
    });
  };

  // —— 复测完成后的四种反馈（仅本次刚完成且有上次快照时显示）——
  const banner = (() => {
    if (!justFinished || !comparison) return null;
    const d = comparison.totalDelta;
    const breakthrough = comparison.dims.filter((x) => x.delta >= 15);
    if (d >= 10) {
      return {
        tone: 'brand',
        title: `你在 ${comparison.days} 天里提升了 ${d} 分！`,
        body: '持续学习正在转化为真实的能力变化，保持这个节奏。',
      };
    }
    if (breakthrough.length) {
      return {
        tone: 'green',
        title: `你的【${breakthrough.map((b) => b.name).join('、')}】维度突破了！`,
        body: `单项分别提升 ${breakthrough.map((b) => `+${b.delta}`).join('、')} 分，具体维度的进步比总分更有意义。`,
      };
    }
    if (d <= -6) {
      return {
        tone: 'orange',
        title: '今天的表现可能不在最佳状态。',
        body: '不必在意一次波动，我们一起回顾这次答错的题，看看是哪里出了问题。',
        action: '查看本次错题',
      };
    }
    if (d >= 6) {
      return {
        tone: 'green',
        title: `稳中有升（+${d} 分）`,
        body: `建议针对【${weakest?.name}】继续补强，下次会有更明显的突破。`,
      };
    }
    return {
      tone: 'muted',
      title: '本次表现稳定。',
      body: `建议针对【${weakest?.name}】做专项练习，下次会有突破。`,
    };
  })();

  const retestClass =
    rs?.variant === 'overdue'
      ? 'bg-brand-800 text-white ring-2 ring-brand-300 hover:bg-brand-700'
      : rs?.variant === 'soon'
        ? 'border border-gray-200 bg-white text-gray-400 hover:text-gray-600'
        : 'bg-brand-700 text-white hover:bg-brand-800';

  const DeltaText = ({ id }: { id: DimensionId }) => {
    const v = deltaMap[id];
    if (v === undefined) return null;
    if (v === 0) return <span className="text-[11px] text-gray-300">0</span>;
    return (
      <span className="text-[11px] font-bold" style={{ color: v > 0 ? GREEN : ORANGE }}>
        {v > 0 ? `+${v}` : v}
      </span>
    );
  };

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-bold text-brand-800">
          <span className="inline-block h-5 w-5 rounded-md bg-brand-700" />
          AIPMCoach
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setAiOpen(true)}
            className="rounded-full border border-brand-200 px-4 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
          >
            AI 设置
            <span
              className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full ${settings?.apiKey ? 'bg-green-500' : 'bg-gray-300'}`}
            />
          </button>
          <button
            onClick={() => navigate('/quiz?new=1')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${retestClass}`}
          >
            立即复测
          </button>
        </div>
      </header>
      {rs && <p className="mx-auto max-w-5xl px-6 text-right text-[11px] text-gray-400">{rs.hint}</p>}

      <main className="mx-auto w-full max-w-5xl px-6 pb-20">
        {/* 复测反馈横幅 */}
        {banner && (
          <section
            className={`mt-2 rounded-lg px-6 py-4 ${
              banner.tone === 'brand'
                ? 'bg-brand-700 text-white'
                : banner.tone === 'green'
                  ? 'border border-green-200 bg-green-50'
                  : banner.tone === 'orange'
                    ? 'border border-orange-200 bg-orange-50'
                    : 'border border-brand-100 bg-brand-50'
            }`}
          >
            <p
              className={`text-base font-bold ${
                banner.tone === 'brand' ? 'text-white' : banner.tone === 'orange' ? 'text-orange-800' : 'text-green-800'
              }`}
            >
              {banner.title}
            </p>
            <p className={`mt-1 text-sm ${banner.tone === 'brand' ? 'text-white/85' : 'text-gray-600'}`}>{banner.body}</p>
            {banner.action && (
              <button
                onClick={() => openWrong(null)}
                className="mt-3 rounded-md border border-orange-300 bg-white px-4 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50"
              >
                {banner.action}
              </button>
            )}
          </section>
        )}

        {/* 总分 */}
        <section className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            {session ? '你的 AIPM 综合能力' : '我的成长报告 · 最近一次测评'}
          </p>
          <div className="mt-2 flex items-end justify-center gap-3">
            <span className="text-[48px] font-bold leading-none text-brand-800">{latest.total}</span>
            <span className="pb-1.5 text-lg font-semibold text-gray-600">分 · {levelOf(latest.total)}</span>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            {fmtDate(latest.date)} · 本次答 {latest.answered} 题、答对 {latest.correct} 题
            {!settings?.apiKey && ' · 当前为通用「基础诊断」，可在「AI 设置」填入自己的 Key 获取个性化诊断'}
          </p>
        </section>

        {/* 雷达图 + 概览 */}
        <section className="mt-8 grid gap-5 lg:grid-cols-[1.3fr,1fr]">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            {prev && (
              <div className="mb-1 flex items-center justify-center gap-5 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0 w-5 border-t-2 border-[#2f4d7d]" />
                  本次 · {fmtDate(latest.date)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0 w-5 border-t-2 border-dashed border-[#b4b0a6]" />
                  上次 · {fmtDate(prev.date)}
                </span>
              </div>
            )}
            <RadarChart scores={scoreMap} prevScores={prev?.dims ?? null} />
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="mb-4 text-sm font-bold text-gray-800">
              六维得分{prev ? '（括号为较上次变化）' : ''}
              <span className="ml-1 font-normal text-gray-400">· 点击分数查看构成</span>
            </p>
            <div className="space-y-3.5">
              {DIMENSIONS.map((meta) => {
                const v = latest.dims[meta.id] ?? 0;
                return (
                  <button
                    key={meta.id}
                    onClick={() => setExplainDim(meta.id)}
                    className="block w-full rounded-md px-1 py-0.5 text-left transition hover:bg-brand-50/60"
                    title="查看这个分数是怎么算出来的"
                  >
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-gray-600">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: meta.color }} />
                        {meta.name}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <DeltaText id={meta.id} />
                        <span className="font-bold underline-offset-2 hover:underline" style={{ color: scoreColor(v) }}>
                          {v}
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full" style={{ width: `${v}%`, background: scoreColor(v) }} />
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-[11px] leading-5 text-gray-400">绿色：高于 80；橙色：低于 60；升降用绿/橙标注。</p>
          </div>
        </section>

        {/* 错题回看入口（明显样式） */}
        {session && (
          <div className="mt-5 text-center">
            <button
              onClick={() => openWrong(null)}
              className="rounded-lg border border-orange-300 bg-white px-6 py-2.5 text-sm font-semibold text-orange-700 shadow-sm hover:bg-orange-50"
            >
              查看本次错题（{totalWrong} 道）
            </button>
          </div>
        )}

        {/* 单快照引导 / 对比关键数字 */}
        {snaps.length === 1 ? (
          <section className="mt-6 rounded-lg border border-dashed border-brand-300 bg-brand-50/60 px-6 py-6 text-center">
            <p className="text-sm font-semibold text-brand-800">完成下一次测评后，你可以看到自己的进步对比。</p>
            <button
              onClick={() => navigate('/quiz?new=1')}
              className="mt-4 rounded-lg bg-brand-700 px-8 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
            >
              立即复测
            </button>
          </section>
        ) : (
          comparison && (
            <section className="mt-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <p className="text-xs text-gray-400">总分变化</p>
                  <p className="mt-2 text-sm font-semibold text-gray-700">
                    上次 {prev!.total} 分 → 本次 {latest.total} 分
                  </p>
                  <p
                    className="mt-1 text-2xl font-bold"
                    style={{ color: comparison.totalDelta > 0 ? GREEN : comparison.totalDelta < 0 ? ORANGE : '#9ca3af' }}
                  >
                    {comparison.totalDelta > 0 ? `+${comparison.totalDelta}` : comparison.totalDelta} 分
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <p className="text-xs text-gray-400">提升最大的维度</p>
                  {comparison.best && comparison.best.delta > 0 ? (
                    <>
                      <p className="mt-2 text-sm font-semibold text-gray-700">{comparison.best.name}</p>
                      <p className="mt-1 text-2xl font-bold" style={{ color: GREEN }}>
                        +{comparison.best.delta} 分
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-gray-400">本次各维度暂无明显提升</p>
                  )}
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <p className="text-xs text-gray-400">仍需加强</p>
                  {comparison.weak ? (
                    <>
                      <p className="mt-2 text-sm font-semibold text-gray-700">{comparison.weak.name}仍是你的弱项</p>
                      <p className="mt-1 text-sm font-bold" style={{ color: ORANGE }}>
                        {comparison.weak.delta < 0
                          ? `本次回落 ${-comparison.weak.delta} 分`
                          : '与上次持平，需要专项突破'}
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm font-semibold" style={{ color: GREEN }}>
                      各维度都在进步，继续保持
                    </p>
                  )}
                </div>
              </div>
              {snaps.length >= 3 && (
                <div className="mt-5 text-center">
                  <button
                    onClick={() => setTrendOpen(true)}
                    className="text-sm font-semibold text-brand-700 underline-offset-2 hover:underline"
                  >
                    查看完整成长曲线（{snaps.length} 次测评）→
                  </button>
                </div>
              )}
            </section>
          )
        )}

        {/* 诊断卡片：仅本次会话有逐题记录时可生成 */}
        {session && results ? (
          <section id="diagnosis" className="mt-10 scroll-mt-6">
            <h2 className="mb-4 text-lg font-bold text-gray-900">针对性诊断与学习资源</h2>
            <div className="space-y-4">
              {DIMENSIONS.map((meta) => (
                <DiagnosisCard
                  key={meta.id}
                  dim={meta}
                  score={scoreMap[meta.id]}
                  count={countMap[meta.id]}
                  wrongCount={wrongMap[meta.id]}
                  auto={meta.id === weakest?.id}
                  state={session}
                  settings={settings}
                  onOpenSettings={() => setAiOpen(true)}
                  onPatch={onPatch}
                  onReviewWrong={() => openWrong(meta.id)}
                />
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-10 rounded-lg border border-gray-200 bg-white px-6 py-5 text-center text-sm text-gray-400 shadow-sm">
            个性化诊断与学习资源在每次测评完成后即时生成；点击右上角「立即复测」，获取基于本次错题的最新诊断。
          </section>
        )}

        {session && results && (
          <div className="mt-12 text-center">
            <button
              onClick={() => document.getElementById('diagnosis')?.scrollIntoView({ behavior: 'smooth' })}
              className="rounded-lg bg-brand-700 px-10 py-3 text-base font-semibold text-white opacity-90 hover:bg-brand-800"
            >
              查看诊断与学习资源
            </button>
          </div>
        )}
      </main>

      <AISettingsModal open={aiOpen} onClose={() => setAiOpen(false)} onSaved={() => setSettings(getSettings())} />

      {/* 成长曲线 */}
      {trendOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setTrendOpen(false)}>
          <div
            className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">成长曲线</h3>
              <button onClick={() => setTrendOpen(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>
            <p className="mb-2 text-xs text-gray-400">
              {snaps.length} 次测评 · {fmtDate(snaps[0].date)} 至 {fmtDate(latest.date)}
            </p>
            <Suspense fallback={<div className="flex h-[380px] items-center justify-center text-sm text-gray-400">加载成长曲线…</div>}>
              <GrowthTrendChart snapshots={snaps} />
            </Suspense>
          </div>
        </div>
      )}

      {/* 错题回看 */}
      <WrongReviewModal
        open={wrongOpen}
        records={session?.records ?? []}
        dimensionId={wrongDim}
        onClose={() => setWrongOpen(false)}
      />

      {/* 分数构成 */}
      {explainDim && (
        <ScoreExplainModal
          dim={DIMENSIONS.find((d) => d.id === explainDim)!}
          score={latest.dims[explainDim] ?? 0}
          records={(session?.records ?? []).filter((r) => r.dimension === explainDim)}
          stat={latest.dimStats?.[explainDim]}
          onClose={() => setExplainDim(null)}
          onRetest={(id) => navigate(`/quiz?new=1&focus=${id}`)}
        />
      )}
    </div>
  );
}
