import { QUESTIONS_BY_GID, type DimensionId, type OptionKey } from '../data/questions';
import { DIMENSION_MAP } from '../data/dimensions';
import type { AnswerRecord } from '../lib/types';

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];

export default function WrongReviewModal({
  open,
  records,
  dimensionId = null,
  onClose,
}: {
  open: boolean;
  records: AnswerRecord[];
  /** 传入维度时只显示该维度错题 */
  dimensionId?: DimensionId | null;
  onClose: () => void;
}) {
  if (!open) return null;
  const scoped = dimensionId ? records.filter((r) => r.dimension === dimensionId) : records;
  const wrong = scoped.filter((r) => !r.correct);
  const scopeName = dimensionId ? DIMENSION_MAP[dimensionId]?.name : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-base font-bold text-gray-900">
            {scopeName ? `${scopeName}错题` : '本次错题'}（{wrong.length}）
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {wrong.length === 0 && <p className="py-8 text-center text-sm text-gray-400">这次没有错题，发挥得很好。</p>}
          {wrong.map((r) => {
            const q = QUESTIONS_BY_GID[r.gid];
            if (!q) return null;
            const dim = DIMENSION_MAP[r.dimension];
            return (
              <div key={r.gid} className="rounded-lg border border-gray-200 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold" style={{ color: dim.color }}>
                  <span>#{r.order}</span>
                  <span>·</span>
                  <span>{dim.name}</span>
                  <span className="text-gray-300">L{r.difficulty}</span>
                  {r.picked === 'SKIP' && <span className="text-gray-400">（本题跳过）</span>}
                </div>
                <p className="text-sm font-semibold leading-7 text-gray-900">{q.stem}</p>
                <div className="mt-3 space-y-1.5">
                  {OPTION_KEYS.map((k) => {
                    const isAnswer = k === q.answer;
                    const isPicked = k === r.picked;
                    return (
                      <div
                        key={k}
                        className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm leading-6 ${
                          isAnswer
                            ? 'border-green-300 bg-green-50 text-green-800'
                            : isPicked
                              ? 'border-orange-300 bg-orange-50 text-orange-800'
                              : 'border-gray-100 text-gray-600'
                        }`}
                      >
                        <span className="font-bold">{k}.</span>
                        <span className="flex-1">{q.options[k]}</span>
                        {isAnswer && <span className="shrink-0 text-xs font-semibold">正确答案</span>}
                        {isPicked && !isAnswer && <span className="shrink-0 text-xs font-semibold">你的选择</span>}
                      </div>
                    );
                  })}
                </div>
                {q.examinePoint && (
                  <p className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500">
                    考察点：{q.examinePoint}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
