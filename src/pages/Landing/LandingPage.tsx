import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DIMENSIONS } from '../../data/dimensions';
import { ESTIMATED_MINUTES, TOTAL_QUESTIONS } from '../../data/content';
import { getCompletedCount } from '../../lib/metrics';
import { clearSession, loadSession, loadSnapshots } from '../../lib/storage';

export default function LandingPage() {
  const navigate = useNavigate();
  const [completed, setCompleted] = useState(1234);
  const [hasHistory, setHasHistory] = useState(false);
  const [resumeCount, setResumeCount] = useState(0);

  useEffect(() => {
    setCompleted(getCompletedCount());
    setHasHistory(loadSnapshots().length > 0);
    const session = loadSession();
    if (session && session.status === 'in_progress' && session.records.length > 0) {
      setResumeCount(session.records.length);
    }
  }, []);

  const discardResume = () => {
    clearSession();
    setResumeCount(0);
    navigate('/intro');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-bold text-brand-800">
          <span className="inline-block h-5 w-5 rounded-md bg-brand-700" />
          AIPMCoach
        </div>
        {hasHistory ? (
          <Link to="/result" className="text-xs font-semibold text-brand-700 underline-offset-2 hover:underline">
            查看我的成长报告 →
          </Link>
        ) : (
          <span className="text-xs text-gray-400">AI 产品经理能力测评</span>
        )}
      </header>

      <main className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-2xl text-center">
          {/* 未完成测评恢复卡片 */}
          {resumeCount > 0 && (
            <div className="mb-8 rounded-xl border-2 border-brand-300 bg-brand-50 px-6 py-5 text-left shadow-sm">
              <p className="text-base font-bold text-brand-800">你有一次未完成的测评，继续作答？</p>
              <p className="mt-1 text-sm text-brand-700">
                已答 {resumeCount}/{TOTAL_QUESTIONS} 题，进度已保存在本机，关闭浏览器也不会丢失。
              </p>
              <div className="mt-4 flex items-center gap-4">
                <Link
                  to="/quiz"
                  className="rounded-lg bg-brand-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
                >
                  继续作答
                </Link>
                <button
                  onClick={discardResume}
                  className="text-sm text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
                >
                  放弃重来
                </button>
              </div>
            </div>
          )}

          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            自适应测评 · 像面试官一样看你的答卷
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-gray-900 sm:text-5xl">
            测出你的AIPM能力短板
          </h1>
          <p className="mx-auto mt-5 max-w-md text-base leading-8 text-gray-500">
            {ESTIMATED_MINUTES}分钟，6个维度，{TOTAL_QUESTIONS}道自适应题目，
            <br className="hidden sm:block" />
            告诉你该补什么。
          </p>
          <div className="mt-9 flex justify-center">
            <Link
              to="/intro"
              className="rounded-lg bg-brand-700 px-10 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-brand-800"
            >
              {resumeCount > 0 ? '开始新测评' : '开始测评'}
            </Link>
          </div>

          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            {DIMENSIONS.map((d) => (
              <span key={d.id} className="flex items-center gap-1.5 text-xs text-gray-400">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: d.color }} />
                {d.name}
              </span>
            ))}
          </div>
        </div>
      </main>

      <footer className="py-8 text-center text-xs text-gray-400">
        已有{completed.toLocaleString()}人完成测评
      </footer>
    </div>
  );
}
