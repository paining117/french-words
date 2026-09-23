# Phase 2 · Study 交付报告

> 最新轮次定义：当天整组新词算同一轮，退出重进恢复同一轮及强化状态；总结包含全组单词和各自 due。数据库已增加 v2 migration。详见 [每日轮次与复习清单](daily-study-round.md)，覆盖以下历史轮次/临时队列说明。

> 2026-09-20 更新：曾选“不认识”的词改为不限次数、允许短间隔重复，并要求两次认识确认。最新规则见 [强化规则更新](study-reinforcement-rules.md)，覆盖本文及首次验收修复记录中有关三次上限、队尾跳过的旧说明。

> 本文保留首次交付时的说明。首轮真机反馈后，顶部进度已改为“本轮已掌握”，完成页已增加跨 Session 的今日累计；背景模糊新增 expo-blur，测试更新为 29 项。与下文旧说明冲突时，以 [真机反馈修复记录](phase2-acceptance-fixes.md) 为准。

仅实现新词 Study。用户已确认 Phase 1 在 iPhone + Expo Go 真机验收通过；本阶段自动验证通过，Phase 2 真机交互仍需用户按清单验收。

## 1. 本阶段修改的文件

| 文件 | 修改原因 |
| --- | --- |
| `app/study.tsx` | 将占位替换为加载、回忆、答案、完成、空队列和错误状态；固定底部操作区，复用 Safe Area |
| `src/repositories/cardRepository.ts` | 新词自然日计数、读取/插入/更新 Card |
| `src/repositories/reviewRepository.ts` | 每次评分日志、按稳定 ID 查询已提交评分 |
| `src/repositories/sessionRepository.ts` | 创建 Session、评分时保存首次统计、完成标记及写锁 |
| `src/repositories/wordBookRepository.ts` | 当前词书未学单词的有序、限量查询；复用原有词书进度 |
| `src/services/homeService.ts` | 加入今日剩余额度与当前词书实际可学数量 |
| `src/components/home/HomeHero.tsx` | 传入新的剩余数量及完成状态 |
| `src/components/home/DailyActions.tsx` | 学习入口显示剩余新词、今日已完成或词书已学完 |
| `src/utils/date.ts` | 增加本地自然日起止时间转换到 UTC 的函数 |
| `tests/sqliteAdapter.ts` | 文件数据库测试的 exclusive transaction 使用独立 SQLite 连接，模拟 Expo 的连接隔离 |
| `README.md` | 增加当前阶段入口，保留 Phase 1 历史报告 |
| `src/services/fsrs/README.md`、`src/components/word/README.md` | 将旧占位说明更新为已实现职责 |
| `docs/device-checklist.md` | 仅末尾追加 Phase 1 用户确认说明和 Phase 2 清单，保留原文 |

## 2. 新增的文件

```text
src/types/study.ts
src/utils/wordLabel.ts
src/services/studyQuota.ts
src/services/studyQueue.ts
src/services/studyService.ts
src/services/fsrs/fsrs.ts
src/services/fsrs/serializeCard.ts
src/hooks/useStudySession.ts
src/components/word/WordPrompt.tsx
src/components/word/WordAnswer.tsx
src/components/word/ExampleSentence.tsx
src/components/word/RatingButtons.tsx
src/components/word/StudySummary.tsx
tests/phase2.test.ts
docs/phase2-report.md
```

没有新增依赖、没有改变 schema、没有新增 migration。`package.json`、`package-lock.json`、`src/db/schema.ts`、`src/db/migrations.ts`、`src/db/database.ts` 和 `app/review.tsx` 保持原样。

## 3. Study 数据流

```text
首页学习入口
→ useStudySession
→ startStudy 读取设置、当天额度、当前词书未学词
→ 无额度/无词：显示空状态，不创建 Session
→ 有词：加载本组有限数量词条，创建 study Session 与内存队列
→ prompt：仅 lemma
→ 点击评分：提交锁 → 原子保存 Card + Log + 首次评分统计
→ 提交成功才显示 answer
→ 点击继续：下一个词；或完成 Session + 自动签到
→ completed：展示本组唯一新词及首次评分统计
→ 返回首页：沿用 Phase 1 的 focus refresh 重新读取 SQLite
```

临时队列不写 SQLite。每次首次评分都会立即更新 Session 的计数，因此中途退出不会丢失已经发生的首次统计。中途退出/杀进程的 Session 保留 `ended_at = NULL`，代表未完成；不恢复它的强化队列。再次进入只创建剩余额度对应的新 Session。

顶部从 `0 / 本组新词数` 开始，只有首次评分提交成功才增加分子。强化不改变分子和分母。若今天先学 4 个退出，再进入时显示 `0 / 6`，本组完成 Summary 为新词 6；当天累计仍为 10。

## 4. FSRS 接入方式

使用 lockfile 与本地类型声明确认的 **ts-fsrs 5.4.2**：

- `createEmptyCard(now)` 创建标准空 Card。
- `scheduler.next(card, now, rating)` 获取 `{ card, log }`。
- 认识 → `Rating.Good = 3`；模糊 → `Rating.Hard = 2`；不认识 → `Rating.Again = 1`。UI 只显示中文。
- 配置保持原规格：retention 0.9、fuzz 开启、short term 开启、learning steps 1m/10m、relearning steps 10m。
- 完整 Card JSON 保留，`due` 与可选 `last_review` 从 ISO 字符串显式恢复为 Date。损坏 JSON/缺失必要字段直接报错，不静默创建新 Card 覆盖旧数据。
- `due_at`、`last_review_at` 使用库返回值。首次创建时 `first_learned_at`、`created_at` 为当前 UTC 时间，`origin = 'study'` 沿用现有约定。
- 强化会再次调用同一个 FSRS wrapper，更新 Card 并保存真实 Log；不覆盖首次学习时间、创建时间或来源。

未实现正式 Review UI、到期词队列或 retrievability 排序。

## 5. 新词配额计算方法

通过设备当前时区创建“今天本地 00:00”和“明天本地 00:00”，分别转换成 UTC ISO8601。SQL 采用左闭右开范围：

```sql
COALESCE(first_learned_at, created_at) >= start
AND COALESCE(first_learned_at, created_at) < end
```

`first_learned_at` 为正常计数依据；为空时采用 Card 创建时间，以兼容现有或未来已经进入系统的 Card。cards 的 word_id 主键保证只计唯一词，包含暂停卡，不因暂停或强化重新发放额度。额度为全局当日额度，不按词书重置。

`remainingToday = max(0, dailyNewWords - learnedToday)`。

从当前词书查询不存在 Card 的词，按 `order_index, word_id` 排序并 LIMIT。首页显示 `min(remainingToday, 当前词书未学数)`，Settings 仍显示每日计划数。

每次首次评分事务内重新读取配额，避免旧页面超额写入；若另一个 Session 已学习同词或额度已满，提示重新加载，不把该词偷偷转换成复习。跨午夜时，评分计入实际提交时所在本地日期；正在进行的组不自动扩容。

## 6. 强化队列实现方式

**采用用户本轮追加确认的新规则，覆盖原先“队列不足放到队尾”的规定。**

- Good：不主动插入强化。
- Again：只有队列中还有至少 3 个其他词展示时才插入。
- Hard：只有队列中还有至少 5 个其他词展示时才插入。
- 其他词的新词展示和强化展示都算间隔，当前词自身不算。
- 强化项记录 attempt 和 minGap；每词最多 3 次展示，包含首次。
- 间隔不足直接跳过当前 Session 强化，保留 FSRS 返回的 due；不降低间隔、不强制放队尾、不加倒计时等待。

队列更新只在评分事务提交成功后发生。以后其他词插入强化，只会延长已排定的间隔。

## 7. SQLite transaction 实现方式

本地确认 `expo-sqlite 57.0.3` 的 `withExclusiveTransactionAsync` 支持 iOS/Android。一次评分：

1. 在事务对象 `tx` 上取得当前 Session 写锁，检查 Session 仍未结束。
2. 查询本次稳定 Log ID 是否已存在；若存在，恢复已提交结果，不二次评分。
3. 在 `tx` 内检查 Card、配额及源词是否存在。
4. INSERT/UPDATE Card。
5. INSERT Review Log。
6. 首次展示时递增 Session 的唯一新词及对应首次评分计数；强化不递增。

任何失败均回滚，UI 保留 prompt 并提示“保存失败，请重试”。所有事务内查询都使用 `tx`，未混用主连接。Expo exclusive transaction 会开新连接，不继承主连接外键设置，因此服务在持有写锁时显式验证源词存在；没有修改 Phase 1 的初始化方式。

完成阶段在另一个事务中更新 `ended_at`/Summary，并调用既有 `checkIn(tx, now)`。签到失败则完成标记也回滚，仍可点击继续重试。

防连点采用 UI 提交锁 + Service single-flight + 当前 attempt token 检查。Log 主键由 `(sessionId, wordId, attempt)` 构成，在提交已成功但返回异常时也可安全恢复；不会新增重复 Log 或跳词。重试会使用已经提交的原评分，不能改写它。

## 8. 新增测试

新增 20 项 Phase 2 测试，加上原有 6 项，共 26 项：

- 三个 Rating 映射；Card/Log 序列化、Date 恢复、due 更新及损坏数据拒绝。
- 10→10、4→6、10→0 配额；本地午夜边界、上海时区、DST 23/25 小时自然日。
- 当前词书限制、order_index、已学排除、空词书/无额度不创建 Session。
- 3/5 个其他词间隔，其他词强化也可充当间隔，短队尾跳过，最多 3 次。
- 混合闭环：10 Card / 14 Log / Summary 10；强化不计入 Summary。
- 最后一个 Hard 词不强制重复，仍保留 FSRS due。
- 快速双击、重复评分、旧 token、重复继续的幂等处理。
- Log、Session 统计、强化 Log 故障注入与回滚。
- 提交成功但返回异常时，利用持久化记录恢复，不重复写。
- 两个旧 Session 不得重复创建 Card；评分时再次核对额度。
- 学 4 个关闭数据库、重开只发 6 个；未评分词未创建 Card；完整学习后再次重开仍保留 Card、FSRS JSON、Session、签到与配额。
- 完成与签到原子性、重试幂等；不同词性的性别标签显示。

文件数据库用独立事务连接验证，不仅是内存 mock。测试写入的都是临时 SQLite 数据库，没有连接或清空 iPhone 用户数据库。

## 9. 自动测试结果

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck`（现有脚本） | 通过，无 TypeScript 错误 |
| `npm test`（现有脚本） | 26/26 通过，含 6 项 Phase 1 回归 |
| lint | 项目无 lint 脚本，本轮未额外引入工具 |
| Android/iOS 原生 JS/资源编译 | 两平台 `expo export` 成功 |
| Expo 服务 | 已有 Metro 服务 `/status` 返回 HTTP 200、packager-status:running |
| iOS 开发加载 | manifest 与完整开发 bundle 均返回 HTTP 200，最终代码可由现有服务加载 |

两平台产物位于本地 `.verification/phase2-native-export/`。这是 JS/Hermes/资源编译，不是签名安装包，也不代表已完成 Phase 2 真机验收。

## 10. 需要用户在 iPhone 上手动验收

完整项目已追加在 `docs/device-checklist.md` 的“Phase 2 - Study 真机验收”。重点：

1. 重新加载 Expo Go，进入 Study，确认 Prompt 只显示法语，底部三个按钮可点击。
2. 在组前部选择 Hard/Again，验证 5/3 个其他词间隔和再次主动回忆；尾部间隔不足时应直接交给 FSRS。
3. 学完 10 个唯一新词，确认 Summary 三项相加为 10、自动签到、首页进度 +10、再次进入显示已完成。
4. 中途学 4 个退出，再进入只有 6 个；未评分词仍可学习。
5. 关闭 Expo Go 重开，确认上述记录仍在。
6. 检查连点、长词、中文换行、重音、刘海/Dynamic Island、Home Indicator 和返回导航。
7. 回归原首页、签到、本地查词、词书/设置页面。

## 11. 已知问题与边界

- 本阶段尚未由我操作 iPhone 验收，所有 Phase 2 设备项保持待勾选；Phase 1 真机通过为本轮用户确认。
- 中途退出的强化队列不恢复；已经提交的所有 Card/Log/首次统计保留。未完成 Session 的 ended_at 保留空值。
- 首次评分成功创建的 Card 可能很快到期，首页待复习数因此增加属于真实 FSRS 状态；正式 Review 业务按要求继续保持占位。
- 配额使用 first_learned_at，空值回退 created_at。未来加入词典 Card 时需要保持或明确调整该语义。
- 依赖与锁文件未改动；Phase 1 的上游依赖审计记录仍在历史 README，本轮未重新审计，也未擅自升级。

## 12. Phase 3 开始前建议注意的问题

先完成本阶段 iPhone 验收，再单独授权 Phase 3。后续正式 Review 应复用现在的 FSRS wrapper 和 Card/Log 原子写入要求；需要另行实现 due 查询与 retrievability 排序、Review Session/统计、重复提交保护以及 Review 完成签到。不要把 Study 的 best-effort 内存强化队列当成正式 due 队列，也不要把强化 Log 数量当作新词数量。

本轮没有实现 Phase 3、远程词典、音频或其他扩展功能。
