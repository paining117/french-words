# 正式复习与每轮 10 词交付报告

> 后续规则更新：Review 改为三步题型，首次四选一正确直接掌握，首次错误后需完成三步。第一题加入红绿框及自动／手动进入详情，学习四选一移除模糊／不认识按钮。FSRS 和正式次数仍只记录每词首次回答；下文“本轮只展示一次”等旧交互被覆盖。最新实现及 85 项验证见 [复习三步与选择反馈](review-three-step.md)。

2026-09-21。按附件实现 Phase 3，同时执行用户本轮确认的 Study 修改；最新明确指示覆盖附件“不改 Study”和旧版“一天一轮”限制。没有实现远程词典、账号、音频、云同步或 Phase 4。

## 1. 修改的文件

- `app/study.tsx`：新词全程星星、四选一的模糊／不认识操作、总结继续学习按钮。
- `app/review.tsx`：替换占位页，完整复习状态和总结；复用背景、题目、答案与评分组件。
- `app/stats.tsx`、`app/settings.tsx`：正式复习统计、每轮词数文案。
- `src/services/studyService.ts`、`studyQueue.ts`、`initialReviewSchedule.ts`、`homeService.ts`：全程三步、持久化多轮、次数间隔及首页入口。
- `src/types/study.ts`、`src/repositories/studyRoundRepository.ts`、`src/db/migrations.ts`、`database.ts`：v3 多轮兼容；启动不追溯修改已完成旧词的 due。
- `src/services/fsrs/fsrs.ts`、`src/repositories/cardRepository.ts`、`sessionRepository.ts`：FSRS 回忆概率、全局到期查询与复习事务操作。
- `src/components/home/DailyActions.tsx`、`HomeHero.tsx`：下一轮／继续当前轮入口。
- `src/components/word/RatingButtons.tsx`、`WordPrompt.tsx`、`ReinforcementPrompt.tsx`：适配首轮选择题，题干更紧凑；正式 Review 仍只显示法语题目。
- `tests/phase1.test.ts`、`phase2.test.ts`、`threeStarStudy.test.ts`、`debugDate.test.ts`：更新被新产品规则覆盖的断言，保留事务、重启、日期、查词等回归检查。
- README 和学习规则文档：标注现行规则，保留旧版本历史记录；验收清单追加本次内容。

## 2. 新增文件

- `src/types/review.ts`：复习题目与页面状态类型。
- `src/services/reviewService.ts`：快照、排序、评分、事务、统计与完成签到。
- `src/hooks/useReviewSession.ts`：复习页面加载、提交锁、错误及重试。
- `src/services/statsService.ts`：正式复习次数查询。
- `tests/review.test.ts`：正式复习集成测试。
- `tests/studyRounds.test.ts`：连续多轮、跨天、升级、次数间隔及创建重试。
- 本交付报告。未增加依赖，package.json 和锁文件无需变更。

## 3. Review Queue 生成方式

进入 Review 时取一次 appNow，查询 due_at ≤ 启动时刻且 suspended=0 的 Card，读取完整词条，恢复 FSRS Card 并计算回忆概率。队列仅保存在内存，没有新建 review_queue 表。没有可读到期词时不创建 Session。

## 4. 全局跨词书

到期查询不读取 current_book_id。切换当前学习词书仍会复习其他词书中已到期的 Card；仅新词抽取使用当前词书。首页数量继续由全局 COUNT cards 查询得到。

## 5. Retrievability 排序与损坏数据

FSRS wrapper 使用已安装 ts-fsrs 5.4.2 的 get_retrievability(card, now, false)。按回忆概率升序排列，概率相同或极近时按 due 升序、词 ID 排序。可恢复的卡片若概率计算失败，整个快照退回稳定的 due 升序，避免混合比较器产生不一致顺序。

无法恢复的 Card 或缺失词条被跳过，开发日志记录 wordId 与异常；不创建空卡、不重置记忆、不删除原始数据。如果全都无法读取，显示内容暂时无法读取并提示记录保留。首页仍按真实 due 条件计数，所以损坏数据可能导致首页数量多于实际可复习数量；修复数据需后续明确操作。

## 6. Snapshot 规则

本轮分母固定为启动时成功读取的到期词数。中途新到期的词不加入；Again 后即使在本轮结束前又到期，也不会再次插队。回到首页会按当前时刻重新统计，下一次复习重新生成快照。当前示例词库仅 66 词，未设置 500 张截断，也未针对超大词库做性能优化。

## 7. Rating → FSRS 数据流

认识→Good，模糊→Hard，不认识→Again，统一复用现有 mapping。每次提交读取当时 appNow，恢复原 Card，调用原 wrapper 的 scheduler.next。due_at、完整 FSRS JSON、last_review_at 来自库输出；first_learned_at、origin、created_at 保留。正式 Review 不调用首次复习间隔覆盖逻辑，Again 可以在几分钟后再到期。

appNow 生产模式始终为设备真实时间；开发模式兼容用户已有的主页日期调试。正式发布前仍必须按 release-checklist.md 物理移除日期调试能力。

## 8. Transaction 与重复提交

一次评分通过同一 SQLite exclusive transaction 更新 Card、插入 context=review 的 Log、递增 Session 评分计数。提交成功后才显示答案；失败保留原题和星数／进度。UI 和服务均有提交锁，Session＋词 ID 组成持久化操作凭据，提交响应丢失后重试读取已写入凭据，不再评分。不同 Review 快照遇到已被修改的 Card 会提示重新加载，不覆盖新状态。

## 9. Review Session

创建时保存 type=review、started_at、快照 total_count。每次评分更新 good/hard/again 计数；三者之和即顶部已复习数量。完成时验证三者之和等于 total，原子写 ended_at 与签到。签到按自然日幂等。中断后保留已评分卡片和计数，但不恢复旧 Review 内存队列；下次进入建立新快照。

## 10. 首页刷新与 Study 多轮

首页现有聚焦、回到前台、30 秒定时及调试日期变化刷新机制保留；待复习数字始终来自真实 due 查询，不写死为 0。

每轮最多 10 个新词；不足 10 时取剩余词。未完成轮次优先恢复，跨天仍是同一轮；完成后“继续学习”或回首页点学习都会抽取下一组未学词，不受旧 daily_new_words 每日上限限制。历史完成轮次仍保存在数据库，首页不再用学习入口打开上一轮总结。

总结保持单页紧凑列表，包含单词、释义和几天后复习；底部今日已学跨轮累计、继续学习、返回首页。当前“今日已学”延续已有定义：当天首次创建学习 Card 的不同词数；顶部“已掌握”只有第三颗星成功才增加。

SQLite v3 将 study_rounds 从 local_date 主键改为 round_id 主键，复制保存的 JSON、日期和 revision。原始 cards、review_logs、sessions 等保留。旧完成词和完成轮次保留，旧未完成轮次保留已有三步阶段与星数，旧 new/relearn 项转为四选一 0 星；无需卸载或清数据。

## 11. Stats 区分 Study / Review

设置 → 学习记录显示今日／累计正式复习次数。只统计 review_logs.context='review'，今日边界为本地自然日对应的 UTC 区间。新词第一次评分及后续星星练习均写 context='study'，不混入正式复习。

## 12. 新增及更新自动测试

- Due 小于、等于、大于 now；暂停过滤；跨词书；空队列不建 Session。
- 实际 FSRS 回忆概率排序、近似相等的 due 次序、概率不可用的回退排序、损坏卡片保留。
- 三种 Rating 的 FSRS/Card/Log、真实评分时间与身份字段保持；Again 分钟级 due。
- Snapshot 排除后到期词，Again 本轮不重复，结束后到期数重新出现。
- 快速点击、过时 token、并发快照冲突、日志与计数失败回滚、提交响应丢失恢复、签到原子性。
- 真实文件 SQLite 关闭重开后，已评分保持、剩余词构成新 Review 快照。
- 正式统计不计 Study，跨自然日统计正确。
- 同日 66 词分成 10×6＋6 七轮，不重复选词；今日累计 66、198 次成功评分、一次签到。
- 下一轮和旧总结独立保存，跨天恢复未完成轮次，旧控制器不能写入新轮次。
- 3 次→5 天、4 次→3 天、≥5 次→次日，首次不认识次日优先；重开同一题不计额外次数。
- 旧 v2 表形状迁移保留真实状态、Card、Log 和星数；轮次创建响应丢失后不重复创建。

## 13. 自动检查结果

- TypeScript 检查通过。
- 81 项测试全部通过，无跳过。
- iOS / Android Hermes 资源编译通过：`.verification/phase3-review-rounds`。
- Expo 开发服务启动成功；`/status`、iOS 和 Android 开发 manifest 均返回 HTTP 200。启动检查使用离线模式，不依赖远程 API。
- 项目没有 lint 脚本，未新增大型工具。
- 编译和 SQLite 测试不等同于 iPhone 触摸、动画和真实设备启动验收。

## 14. iPhone 手动验收

双击根目录“启动法语背单词.cmd”，扫码或在 Expo Go 完整重新加载；不卸载、不清数据。先验证第一道题就显示三颗空星：四选一正确 1 星、看中文认识 2 星、看法语认识 3 星；首次只完成一星时掌握数不加。任一步失败清零，从四选一重来。

学完首轮后检查紧凑十词总结及 5／3／1 天；点继续学习应出现下一组。第二轮中途退出、清后台重开应恢复星数和题目，完成后今日累计应为 20。返回首页再点学习进入第三轮。小屏、刘海、Home Indicator 下检查总结完整、按钮不遮挡。

用主页开发日期推进 1／3／5 天，检查 due 数，再进入正式复习。初始只显示法语；三种评分后均显示释义、词性／阴阳性与例句，顶部进度增加，点继续进入另一词。完成看三项计数之和及签到，返回首页确认实际剩余 due；设置中核对今日正式复习次数。中途退出和清后台后，已评分词不应丢失，下一次进入重新取得到期清单。详见 device-checklist.md 追加项。

## 15. 已知问题与边界

尚未执行本次 iPhone 真机验收。星形沿用系统字体；小屏的四选一允许滚动，总结保持单页。损坏 Card 被保留并跳过，不自动修复。无新网络服务，仍为 66 词开发示例词库。Review 中断 Session 的 ended_at 为空且只保留已发生计数，属于未完成历史记录；当前统计不依赖 Session 完成数量。

“总出现次数”按成功保存的学习作答计数；看答案、重渲染、未作答就退出重进不增加次数。首次四选一选错按“不认识”处理。3／4／≥5 对应首次复习规则仅作用于新词学习，正式 Review 后的间隔完全由 FSRS 决定。

## 16. Phase 4 前注意事项

先完成本清单真机验收并观察实际复习间隔。接入大规模词库前再评估全局复习队列与查询的性能；正式发布前删除日期调试，替换示例词库并核对数据来源。未自行开始 Phase 4。
