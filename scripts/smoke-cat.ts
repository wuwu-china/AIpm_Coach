/*  CAT 引擎冒烟测试（不参与前端构建）：
 *  npx esbuild scripts/smoke-cat.ts --bundle --platform=node --format=esm --outfile=/tmp/smoke.mjs && node /tmp/smoke.mjs
 */
import { CatEngine } from '../src/lib/cat-engine';
import { QUESTIONS_BY_GID } from '../src/data/questions';
import { TOTAL_QUESTIONS, MIN_PER_DIMENSION } from '../src/data/content';
import type { OptionKey } from '../src/data/questions';

const KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];
let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error('  ✗ ' + msg);
  }
}

function run(mode: 'all-right' | 'all-wrong' | 'random', seed: number) {
  let rng = seed;
  const rand = () => {
    rng = (rng * 1103515245 + 12345) % 2147483648;
    return rng / 2147483648;
  };
  const eng = CatEngine.start();
  const seen = new Set<number>();
  for (let i = 0; i < TOTAL_QUESTIONS + 2; i++) {
    const cur = eng.nextQuestion();
    if (i < TOTAL_QUESTIONS) {
      assert(!!cur, `[${mode}] 第${i + 1}题应能抽出`);
      if (!cur) break;
      assert(!seen.has(cur.gid), `[${mode}] gid ${cur.gid} 重复`);
      seen.add(cur.gid);
      const q = QUESTIONS_BY_GID[cur.gid];
      let picked: OptionKey | 'SKIP';
      if (mode === 'all-right') picked = q.answer;
      else if (mode === 'all-wrong') picked = KEYS.find((k) => k !== q.answer)!;
      else picked = rand() < 0.55 ? q.answer : KEYS.find((k) => k !== q.answer)!;
      eng.answer(picked, 30000 + Math.floor(rand() * 60000));
    } else {
      assert(cur === null, `[${mode}] 超过 ${TOTAL_QUESTIONS} 题应终止`);
    }
  }
  const r = eng.results();
  assert(eng.state.records.length === TOTAL_QUESTIONS, `[${mode}] 记录数=${eng.state.records.length}`);
  let sum = 0;
  for (const d of r.dims) {
    sum += d.count;
    assert(d.count >= MIN_PER_DIMENSION, `[${mode}] ${d.name} 仅 ${d.count} 题，未达保底`);
    assert(d.score >= 0 && d.score <= 100, `[${mode}] ${d.name} 分数越界 ${d.score}`);
    assert(d.diff >= 1 && d.diff <= 5, `[${mode}] ${d.name} 难度越界 ${d.diff}`);
    // 非“全部掌握”情形下，已掌握维度应封顶 3 题
    const allMastered = r.dims.every((x) => x.mastered);
    if (d.mastered && !allMastered) assert(d.count === 3, `[${mode}] 已掌握维度 ${d.name} 未封顶(${d.count})`);
  }
  assert(sum === TOTAL_QUESTIONS, `[${mode}] 六维题数合计=${sum}`);
  assert(r.total >= 0 && r.total <= 100, `[${mode}] 总分越界 ${r.total}`);
  return r;
}

// 极端情形
run('all-right', 7);
run('all-wrong', 7);
// 200 个随机会话
let tilted = 0;
for (let s = 1; s <= 200; s++) {
  const r = run('random', s);
  if (r.dims.some((d) => d.count > 3)) tilted++;
}
console.log(`随机会话中出现“薄弱维度加测(>3题)”的比例: ${tilted}/200`);

// 刷新续测：答 7 题、抽出第 8 题（未答）后序列化再 hydrate，应回到同一题并能答完
{
  const eng = CatEngine.start();
  for (let i = 0; i < 7; i++) {
    eng.answer(eng.nextQuestion()!.question.answer, 40000);
  }
  const pending = eng.nextQuestion()!; // 第 8 题已抽出、未作答
  const snapshot = JSON.parse(JSON.stringify(eng.state));
  const restored = CatEngine.hydrate(snapshot);
  assert(restored.nextQuestion()?.gid === pending.gid, 'hydrate 后应回到刷新前那道未答题');
  for (let i = 0; i < TOTAL_QUESTIONS - 7; i++) {
    const cur = restored.nextQuestion()!;
    const q = QUESTIONS_BY_GID[cur.gid];
    restored.answer(Math.random() < 0.5 ? q.answer : 'A' === q.answer ? 'B' : 'A', 40000);
  }
  assert(restored.state.records.length === TOTAL_QUESTIONS, '续测应能答满 21 题');
}

// 复测避让：第二次测评传入第一次的全部 gid，题库充足时应做到 0 重复
{
  const runOnce = (history: number[]) => {
    const eng = CatEngine.start(history);
    const gids: number[] = [];
    for (let i = 0; i < TOTAL_QUESTIONS; i++) {
      const cur = eng.nextQuestion()!;
      gids.push(cur.gid);
      const q = QUESTIONS_BY_GID[cur.gid];
      eng.answer(Math.random() < 0.5 ? q.answer : 'A' === q.answer ? 'B' : 'A', 40000);
    }
    return { eng, gids };
  };
  const first = runOnce([]);
  const second = runOnce(first.gids);
  const overlap = second.gids.filter((g) => first.gids.includes(g)).length;
  assert(overlap === 0, `复测应优先避开旧题，仍有 ${overlap} 题与上次重复`);
  assert(second.eng.state.records.length === TOTAL_QUESTIONS, '复测应答满 21 题');
}

// 维度专项重测：focusDim 在阶段二（19-21 题）应优先加测该维度（未掌握时）
{
  for (let seed = 0; seed < 20; seed++) {
    const eng = CatEngine.start([], 'ai_basics');
    const phase2Reasons: string[] = [];
    const phase2Dims: string[] = [];
    for (let i = 0; i < TOTAL_QUESTIONS; i++) {
      const cur = eng.nextQuestion()!;
      if (cur.order > MIN_PER_DIMENSION * 6) {
        phase2Reasons.push(cur.reason);
        phase2Dims.push(cur.dimension);
      }
      eng.answer('A', 40000); // 固定选 A，多数答错，focus 维度通常不会被掌握
    }
    if (!eng.state.dims.ai_basics.mastered) {
      assert(
        phase2Dims.every((d) => d === 'ai_basics') && phase2Reasons.every((r) => r.includes('维度专项')),
        `focusDim 应让阶段二全部加测该维度（seed=${seed}）`,
      );
    }
  }
}

if (failures === 0) {
  console.log('\n✅ CAT 冒烟测试全部通过');
} else {
  console.error(`\n❌ 失败 ${failures} 项`);
  process.exit(1);
}
