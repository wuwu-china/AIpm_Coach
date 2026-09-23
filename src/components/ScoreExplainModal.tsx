import type { DimensionMeta } from '../data/dimensions';
import type { AnswerRecord } from '../lib/types';
import { CONTRIB_CORRECT, CONTRIB_WRONG, INIT_SCORE } from '../lib/cat-engine';
import { scoreColor } from '../data/dimensions';

interface DimStat {
  answered: number;
  correct: number;
  high: number;
}

interface Props {
  dim: DimensionMeta;
  score: number;
  /** 当前会话的逐题记录（有则展示完整计分过程） */
  records: AnswerRecord[];
  /** 历史快照只有聚合统计时传入 */
  stat?: DimStat;
  onClose: () => void;
  onRetest: (dimId: DimensionMeta['id']) => void;
}

export default function ScoreExplainModal({ dim, score, records, stat, onClose, onRetest }: Props) {
  const color = scoreColor(score);
  const hasDetail = records.length > 0;
  const answered = hasDetail ? records.length : stat?.answered ?? 0;
  const correct = hasDetail ? records.filter((r) => r.correct).length : stat?.correct ?? 0;
  const high = hasDetail ? records.filter((r) => r.difficulty >= 4).length : stat?.high ?? 0;
  const wrong = answered - correct;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400">分数构成</p>
            <h3 className="mt-1 flex items-center gap-2 text-lg font-bold text-gray-900">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: dim.color }} />
              {dim.name}
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-4xl font-bold" style={{ color }}>
            {score}
          </span>
          <span className="text-sm text-gray-400">分（当前能力估计）</span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-gray-50 py-3">
            <p className="text-lg font-bold text-gray-800">{answered}</p>
            <p className="text-[11px] text-gray-400">作答题数</p>
          </div>
          <div className="rounded-lg bg-gray-50 py-3">
            <p className="text-lg font-bold text-green-700">{correct}</p>
            <p className="text-[11px] text-gray-400">答对</p>
          </div>
          <div className="rounded-lg bg-gray-50 py-3">
            <p className="text-lg font-bold text-orange-600">{wrong}</p>
            <p className="text-[11px] text-gray-400">答错/跳过</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-400">其中高难度题（L4–L5）{high} 道。</p>

        <div className="mt-4 rounded-lg bg-brand-50 px-4 py-3 text-xs leading-6 text-brand-800">
          <p className="font-bold">计分方式（自适应 EWMA）</p>
          <p className="mt-1">
            初始分 {INIT_SCORE}；每答一题更新：<b>新分 = 旧分 × 0.7 + 本题贡献 × 0.3</b>，越近的作答权重越高。
          </p>
          <p className="mt-1">
            答对贡献：L1 {CONTRIB_CORRECT[1]} / L2 {CONTRIB_CORRECT[2]} / L3 {CONTRIB_CORRECT[3]} / L4{' '}
            {CONTRIB_CORRECT[4]} / L5 {CONTRIB_CORRECT[5]}；答错或跳过：L1 {CONTRIB_WRONG[1]} / L2{' '}
            {CONTRIB_WRONG[2]} / L3 {CONTRIB_WRONG[3]} / L4 {CONTRIB_WRONG[4]} / L5 {CONTRIB_WRONG[5]}。
          </p>
        </div>

        {hasDetail ? (
          <div className="mt-4">
            <p className="mb-2 text-xs font-bold text-gray-500">逐题计分过程</p>
            <div className="space-y-1.5">
              {records.map((r) => (
                <div
                  key={r.gid}
                  className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-xs"
                >
                  <span className="text-gray-600">
                    第{r.order}题 · L{r.difficulty}
                  </span>
                  <span className={r.correct ? 'font-semibold text-green-700' : 'font-semibold text-orange-600'}>
                    {r.picked === 'SKIP' ? '跳过' : r.correct ? '答对' : '答错'} · 贡献 {r.contribution}
                  </span>
                  <span className="font-mono text-gray-500">→ {r.scoreAfter}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-xs leading-6 text-gray-500">
            这是历史快照，未保存逐题记录。完成一次新测评后可查看每道题的计分过程。
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">
            关闭
          </button>
          <button
            onClick={() => onRetest(dim.id)}
            className="rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
          >
            重测这个维度
          </button>
        </div>
        <p className="mt-2 text-right text-[11px] text-gray-400">
          重测为一套完整 21 题自适应测评，会在该维度额外加测。
        </p>
      </div>
    </div>
  );
}
