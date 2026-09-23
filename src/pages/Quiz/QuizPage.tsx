import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { DimensionId, OptionKey, Question } from '../../data/questions';
import { DIMENSION_MAP } from '../../data/dimensions';
import { TOTAL_QUESTIONS } from '../../data/content';
import { CatEngine } from '../../lib/cat-engine';
import { collectAnsweredGids, loadSession, pushHistory, saveSession } from '../../lib/storage';
import { bankStatus } from '../../lib/bank-ready';
import type { Selection } from '../../lib/types';

type Current = Selection & { question: Question };
const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];

export default function QuizPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const engineRef = useRef<CatEngine | null>(null);
  const qStartRef = useRef<number>(Date.now());
  /** 防快速连点：一次提交完成前忽略后续点击 */
  const lockRef = useRef(false);
  const [current, setCurrent] = useState<Current | null>(null);
  const [picked, setPicked] = useState<OptionKey | null>(null);
  const [answered, setAnswered] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [bankError, setBankError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const isNew = params.get('new') === '1';
    const focus = (params.get('focus') as DimensionId | null) ?? null;
    if (!bankStatus().ready) {
      setBankError(true);
      return;
    }
    let engine: CatEngine;
    if (isNew) {
      // 复测/重测：优先避开本机历史答过的题；focus 时阶段二优先该维度
      engine = CatEngine.start(collectAnsweredGids(), focus);
    } else {
      const saved = loadSession();
      if (saved) {
        if (saved.status === 'finished') {
          navigate('/result', { replace: true });
          return;
        }
        engine = CatEngine.hydrate(saved);
      } else {
        engine = CatEngine.start(collectAnsweredGids());
      }
    }
    engineRef.current = engine;
    const cur = engine.nextQuestion();
    setCurrent(cur);
    setAnswered(engine.total);
    qStartRef.current = Date.now();
    saveSession(engine.state);
    if (isNew) navigate('/quiz', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advance = (choice: OptionKey | 'SKIP') => {
    const engine = engineRef.current;
    if (!engine || lockRef.current) return;
    lockRef.current = true;
    setSubmitting(true);
    try {
      engine.answer(choice, Date.now() - qStartRef.current);
      setPicked(null);
      const nxt = engine.nextQuestion();
      if (!nxt) {
        const r = engine.results();
        saveSession(engine.state);
        pushHistory({
          finishedAt: engine.state.finishedAt ?? Date.now(),
          total: r.total,
          scores: Object.fromEntries(r.dims.map((d) => [d.id, d.score])),
          correctCount: engine.state.records.filter((x) => x.correct).length,
          gids: engine.state.records.map((x) => x.gid),
          bankVersion: engine.state.bankVersion,
        });
        navigate('/result');
        return;
      }
      setCurrent(nxt);
      setAnswered(engine.total);
      qStartRef.current = Date.now();
      saveSession(engine.state);
    } finally {
      // 延迟一点点释放，挡住双击的第二次事件
      setTimeout(() => {
        lockRef.current = false;
        setSubmitting(false);
      }, 250);
    }
  };

  if (bankError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md rounded-lg border border-orange-200 bg-orange-50 px-6 py-8 text-center">
          <p className="text-base font-bold text-orange-800">题库未就绪，请联系管理员</p>
          <p className="mt-2 text-sm leading-6 text-orange-700">
            题库为空或部分维度题量不足，暂时无法开始测评。
          </p>
          <Link
            to="/"
            className="mt-5 inline-block rounded-lg bg-brand-700 px-8 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
          >
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  if (!current) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-brand-500">准备中…</div>;
  }

  const q = current.question;
  const dim = DIMENSION_MAP[current.dimension];
  const progress = Math.round((answered / TOTAL_QUESTIONS) * 100);
  const isLast = current.order === TOTAL_QUESTIONS;

  return (
    <div className="flex min-h-screen flex-col">
      {/* 顶部进度 */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4">
          <span className="shrink-0 text-sm font-semibold text-gray-700">
            第{current.order}题/共{TOTAL_QUESTIONS}题
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-brand-700 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <div
          className="rounded-lg border border-gray-200 bg-card p-6 shadow-sm sm:p-8"
          style={{ borderRadius: 8 }}
        >
          <div className="mb-4 flex items-center gap-2 text-xs font-semibold" style={{ color: dim.color }}>
            <span>#{current.order}</span>
            <span>·</span>
            <span>{dim.name}</span>
            <span className="text-gray-300">难度 L{current.difficulty}</span>
          </div>

          <h2 className="text-left text-[19px] font-semibold leading-[1.6] text-gray-900">
            {q.stem}
          </h2>

          <div className="mt-6 space-y-3">
            {OPTION_KEYS.map((key) => {
              const selected = picked === key;
              return (
                <button
                  key={key}
                  onClick={() => !submitting && setPicked(key)}
                  disabled={submitting}
                  className={`flex w-full items-start gap-3 rounded-lg border bg-white px-4 py-3.5 text-left transition disabled:cursor-default ${
                    selected
                      ? 'border-brand-600 bg-brand-50'
                      : 'border-gray-200 hover:border-brand-500'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                      selected ? 'border-brand-600 bg-brand-700 text-white' : 'border-gray-300 text-gray-500'
                    }`}
                  >
                    {key}
                  </span>
                  <span className="text-sm leading-7 text-gray-700">{q.options[key]}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-7 flex items-center gap-5">
            <button
              disabled={!picked || submitting}
              onClick={() => picked && advance(picked)}
              className={`rounded-lg px-8 py-2.5 text-sm font-semibold text-white transition ${
                picked && !submitting ? 'bg-brand-700 hover:bg-brand-800' : 'cursor-not-allowed bg-gray-300'
              }`}
            >
              {submitting ? '提交中…' : isLast ? '查看结果' : '下一题'}
            </button>
            <button
              onClick={() => advance('SKIP')}
              disabled={submitting}
              className="text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline disabled:opacity-50"
            >
              跳过本题
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
