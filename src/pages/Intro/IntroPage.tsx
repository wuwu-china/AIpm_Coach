import { Link, useNavigate } from 'react-router-dom';
import { DIMENSIONS } from '../../data/dimensions';
import { ESTIMATED_MINUTES, TOTAL_QUESTIONS } from '../../data/content';
import { bankStatus } from '../../lib/bank-ready';

export default function IntroPage() {
  const navigate = useNavigate();
  const bank = bankStatus();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2 font-bold text-brand-800">
          <span className="inline-block h-5 w-5 rounded-md bg-brand-700" />
          AIPMCoach
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-16">
        <h1 className="text-2xl font-bold text-gray-900">测评会考察什么</h1>
        <p className="mt-3 text-sm leading-7 text-gray-500">
          题目采用自适应方式：先保证六个维度各有覆盖，再根据你的实时表现，把更多题目分配给当前最薄弱的维度。
          答完后会生成六维能力雷达图，并由 AI 针对你答错的题给出诊断与学习资源。
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {DIMENSIONS.map((d, i) => (
            <div key={d.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                {i + 1}. {d.name}
              </div>
              <p className="mt-1.5 text-xs leading-6 text-gray-500">{d.brief}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-4 rounded-lg bg-brand-50 px-5 py-4 text-sm text-brand-800">
          <div>
            <div className="font-bold">约 {ESTIMATED_MINUTES} 分钟</div>
            <div className="text-xs text-brand-600">共 {TOTAL_QUESTIONS} 题 · 单选 · 可跳过</div>
          </div>
          <div className="h-8 w-px bg-brand-200" />
          <div className="text-xs leading-5 text-brand-700">
            答题过程不显示对错，避免影响后续判断；结果仅保存在你本地浏览器。
          </div>
        </div>

        {!bank.ready ? (
          <div className="mt-8 rounded-lg border border-orange-200 bg-orange-50 px-5 py-4 text-sm text-orange-800">
            <p className="font-bold">题库未就绪，请联系管理员</p>
            <p className="mt-1 text-xs leading-6 text-orange-700">
              当前题库共 {bank.total} 题
              {bank.missing.length > 0 ? `，以下维度题量不足：${bank.missing.join('、')}` : '，题库为空'}
              ，暂时无法开始测评。
            </p>
          </div>
        ) : (
          <div className="mt-8 flex items-center gap-4">
            <button
              onClick={() => navigate('/quiz?new=1')}
              className="rounded-lg bg-brand-700 px-10 py-3 text-base font-semibold text-white hover:bg-brand-800"
            >
              开始
            </button>
            <Link to="/" className="text-sm text-gray-400 hover:text-gray-600">
              返回首页
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
