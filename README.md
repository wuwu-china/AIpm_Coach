# AIPMCoach · AI 产品经理六维能力自适应测评

> 20 分钟、21 道自适应单选题，测出你作为 AI 产品经理的能力短板，给出**引用具体错题**的 AI 诊断与可自行验证的学习资源。

在线 Demo：_部署后替换为你的 Vercel 地址_

---

## 这是什么

一个面向「想转 AI 产品经理」人群的能力测评工具：

- **简化版 CAT 自适应测评**：不是固定抽题，而是根据你的实时对错调整每个维度的题目难度，并把更多题目分配给当前最薄弱的维度（纯代码实现，确定性、可复现）。
- **六维能力雷达图**：AI 基础认知 / 大模型技术理解 / AI 产品设计 / 数据与评估 / AI 伦理与风险 / AI 商业化与落地。
- **复测对比与成长曲线**：每次完成测评（≥10 题）自动沉淀能力快照；复测后把本次/上次雷达图叠加对比，给出总分变化、提升最大维度、仍需加强维度；3 次以上可看六维成长曲线。复测抽题优先避开上次答过的题，并按距上次天数给出复测节奏提示。
- **AI 弱点诊断**：以「8 年资深 AIPM 面试官」视角，逐维度输出一句话判断、引用你答错的题号与题干、原因推测、可立即执行的下一步，以及基于答对题目的鼓励。
- **学习资源推荐**：刻意**不让大模型输出 URL**（避免幻觉死链），改为给出 3–6 词搜索关键词，一键跳转 Google 搜索，由你自己验证来源。
- **BYOK（Bring Your Own Key）**：应用本身不内置任何大模型 Key、不产生 token 费用，使用者在页面里填自己的 Key，Key 只存在其本人浏览器。

## 技术栈

- React 18 + TypeScript + Vite
- Tailwind CSS v4
- React Router v6（路由级 `React.lazy` 懒加载）
- ECharts 5（按需引入雷达图；成长曲线折线图模块懒加载）
- 一个无状态 Serverless 中转函数（Vercel Edge Function），本地开发由 Vite 中间件模拟
- 无数据库：会话、能力快照与历史均存 `localStorage`

## 目录结构

```
aipmcoach/
├── api/chat.ts                 # Vercel Edge Function：无状态 BYOK 中转
├── server/relay.mjs            # 中转逻辑（Edge 与本地 dev 共用）
├── data/bank.md                # 题库真源（标准化选择题 MD）
├── scripts/
│   ├── build-questions.mjs     # 从 bank.md 确定性解析生成题库 TS
│   └── smoke-cat.ts            # CAT 引擎不变量测试
├── src/
│   ├── data/
│   │   ├── questions.ts        # 由脚本生成的题库（285 题，勿手改）
│   │   ├── dimensions.ts       # 六维定义与配色/分数配色
│   │   ├── diagnosis-fallback.ts # 24 段「基础诊断」兜底文本
│   │   └── content.ts          # 题量、时长、等级等常量
│   ├── lib/
│   │   ├── cat-engine.ts       # 纯代码 CAT：难度更新 + EWMA 计分 + 薄弱加测 + 复测避让旧题
│   │   ├── retest.ts           # 能力快照对比、复测按钮节奏状态（纯函数）
│   │   ├── metrics.ts          # 动态「已完成人数」（接后端后替换为真实统计）
│   │   ├── ai-client.ts        # SSE 流式调用 + 1s/3s 重试
│   │   ├── diagnosis-service.ts# 诊断 prompt、结构化解析、降级
│   │   ├── resource-service.ts # 资源 prompt、禁 URL 清洗、Google 搜索词
│   │   ├── storage.ts          # 会话/能力快照/历史/Key 的 localStorage
│   │   └── types.ts
│   ├── components/             # 雷达图（支持双次叠加）、成长曲线、错题回看、诊断卡片、AI 设置
│   └── pages/                  # 落地页 / 介绍页 / 答题页 / 结果页（复测对比主页）
```

## 本地运行

```bash
npm install
npm run dev        # http://localhost:5173 ，已内置 /api/chat 中转，无需后端
```

其他命令：

```bash
npm run build      # 类型检查 + 生产构建
npm run preview    # 本地预览构建产物
npm run test:cat   # CAT 不变量测试（题量/保底/不重复/掌握封顶/复测避让/续测）
npm run build:bank # 题库 MD 改动后重新生成 src/data/questions.ts
```

## BYOK：AI 能力如何工作

1. 结果页右上角「AI 设置」选择厂商（内置 DeepSeek / 智谱 GLM / OpenAI，或任意 OpenAI 兼容地址），填入自己的 Key。
2. Key 仅保存在浏览器 `localStorage`，请求经同源的 `/api/chat` **无状态中转**转发给厂商；中转不保存、不记录 Key，服务端也不配置任何 Secret，因此部署者零成本。
3. **不填 Key 也能完整答题与看雷达图**：诊断自动使用预置的 24 段「基础诊断」兜底（按维度 × 四分数段），资源区提示配置 Key。
4. 调用失败按「等 1 秒重试 → 等 3 秒重试 → 降级兜底」处理；进入结果页只生成最弱一维，其余维度点开才调用（懒生成），结果按维度缓存。

> 安全提示：BYOK 适合个人作品 / 工具型应用，Key 在使用者自己的浏览器与他自己的厂商账号之间使用。若做成面向公众的正式产品，应改为服务端统一出资调用并加上配额与鉴权。

## CAT 算法说明（作品集重点）

- 每个维度维护「当前难度（初始 3，答对 +1 封顶 5、答错/跳过 -1 封底 1）」和「EWMA 能力分（初始 50）」。
- 计分：`新分 = 旧分 × 0.7 + 本题贡献 × 0.3`；贡献分按对错 × 难度分档（答对 L1–L5：55/60/75/90/100；答错：20/30/45/50/60）。
- 抽题：
  - **阶段一（1–18 题）**：六维轮询保底，每维至少 3 题；
  - **阶段二（19–21 题）**：逐题把加测分配给当前 EWMA 最低、且未「掌握」的维度；某维在难度 5 上再答对 L5 题记为掌握、封顶 3 题；
  - 目标难度档无题时向相邻难度逐级扩散，且不重复抽题。
- 终止：满 21 题；总分 = 六维 EWMA 等权平均。全过程在浏览器控制台打印 `[CAT]` 抽题与判分日志。
- 可运行 `scripts/smoke-cat.ts` 校验：题量、六维保底、不重复、掌握封顶、分数边界、刷新续测等不变量。

## 题库维护

题库真源是 `data/bank.md`（每题含题干、A–D 选项、唯一答案、标签、难度、考核点）。维度由标签**确定性映射**（不依赖 AI），构建时由 `scripts/build-questions.mjs` 生成 `src/data/questions.ts`。更新题库后：

1. 替换 / 增补 `data/bank.md`；
2. `npm run build:bank` 重新生成并查看六维 × 难度分布（要求结构异常 0、未知标签无）；
3. `npm run test:cat` 与 `npm run build` 自测通过；
4. 更新 `BANK_VERSION` 与 `CHANGELOG.md`，提交 push，Vercel 自动发版。

> 完整的新增题目模板、标签→维度映射表、版本号规则与分支预览流程见 **[docs/MAINTAIN.md](./docs/MAINTAIN.md)**。
> 选项已做「长度均衡」处理：正确选项不会系统性地比干扰项更长/更详细，避免「字多即答案」。

## 边界条件自测

发版前按 **[docs/SELFTEST.md](./docs/SELFTEST.md)** 逐项手测：AI 失败重试与降级、题库门禁、中途关闭恢复、雷达空状态、防连点、数据不足不硬诊断、诊断强制引用题号、分数构成弹窗等；情景题相关条目在该功能上线前标注为 N/A。

## 部署到 Vercel（免费）

1. 把本仓库推到 GitHub。
2. [vercel.com](https://vercel.com) 用 GitHub 登录 → **Add New → Project** → Import 仓库 → Deploy（Vite 自动识别，无需填写任何环境变量）。
3. `api/chat.ts` 会自动部署为 Edge Function；前端路由回退已在 `vercel.json` 配置（并排除了 `/api`）。
4. 把得到的网址填回本 README 顶部。

## License

[MIT](./LICENSE)
