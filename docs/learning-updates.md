# 学习、复习、生熟标记与拼写更新

完成日期：2026-09-23。运行仍完全离线，没有增加依赖，也没有清空任何用户数据。

## 已实现行为

1. 日期编辑入口、调试弹窗、日期偏移能力和启动恢复代码已物理删除，统一使用设备时间。
2. 正式 Review 的下一次 due 至少为次日本地零点；首页计数和 Review 查询同时排除当日已有正式复习日志的词，防止旧数据造成重复。本轮必要的三步强化不受影响。
3. Study 和 Review 均有“生”“熟”。“生”加入生词本、变色、顶部提示，不自动切题，不创建 Card 或评分。“熟”保存 30 天后排期、按钮变绿、显示详情，1.5 秒后切题；后台或离开页面会暂停自动切题。
4. 新增我的熟词本，生词本/熟词本支持确认后逐词撤回。撤回熟词恢复原 Card/排期和未完成 Study 的待学状态；标熟前没有 Card 且此后没有真实评分的词，撤回后重新成为未学习词。如果标熟后已有真实复习，保留新进度，仅撤回标记。
5. Study 完成先显示“总结”“开始拼写”。选择总结直接进入原单屏列表；拼写采用本轮实际词数，不足 10 也可完成。
6. 拼写：中文提示、原生输入框、iOS 键盘上方 ×/√ 工具栏；正确显示绿色原词，√ 变 →。错误字位标红，绿色正确词在下方；必须改对才能前进。错误状态按回退清空整个输入。错词改对后间隔最多 3 个其他词再考；队列不足时放在末尾，剩一个也可反复考。只有当前次直接拼对才计入拼写掌握。
7. 拼写忽略首尾空格、大小写、重音差异，接受 œ/oe、æ/ae、直/弯撇号等价写法，正确展示始终使用原始 lemma。不会接受任意错字、词形或额外冠词。
8. ×、顶部返回和系统返回触发“确定要退出拼写吗”是/否。是进入总结，否继续。题目、提交结果、错词队列和进度持久化；未提交的输入草稿不要求保存。
9. 学习/复习的可见进度只有比例，不再带“已掌握”。

拼写是本轮附加练习，独立计数，不再创建 Card、不追加 FSRS 评分、不重复增加每日学习量。

## 数据与代码

新增 migrationV5.ts：新增 sessions.manual_count、familiar_marks、familiar_actions、study_completion；建立按词/日期查询日志的索引，创建稳定 ID 为 my-familiar 的词书，仅清理 dev_date_offset_days 旧设置。旧 migration 未修改。

- 熟词快照记录标熟前 Card、标熟后的 Card 和未完成 Study 队列信息；与排期、关系、轮次在同一事务提交。
- 新词标熟使用 origin=familiar 的手动排期 Card，不伪造 Review Log，不调用 FSRS 评分；撤回仅可删除这种无真实评分的手动 Card，既有 Card、words 和日志保留。
- 熟词重复点击、保存失败回滚和丢失提交响应均有测试；正式复习后再次标熟可重新延至 30 天，撤回恢复最近一次标记之前的安排。
- 主要修改：app/index.tsx、app/study.tsx、app/review.tsx、app/books/[id].tsx、HomeHero、appClock、database/migrations、card/session Repository、Study/Review Service 与 hooks、学习类型。
- 新增：familiarService.ts、spellingService.ts、WordActions.tsx、StudyCompletion.tsx、useFamiliarAdvance.ts、migrationV5.ts、learningUpdates.test.ts。
- 删除：DebugDateDialog.tsx、debugDateService.ts、clockCore.ts。旧日期测试改为 calendarRegression.test.ts，保留跨日、每日数量、签到与轮次恢复的回归场景。

## 验证结果

- TypeScript：通过。
- 自动测试：117 / 117 通过，包括原有数据导入、搜索、Study、Review、SQLite 升级回归。
- iOS、Android 生产资源导出：通过；输出位于 .verification/learning-updates-export。
- 两个平台 Hermes 包中未发现日期调试模块、偏移 API 和日期编辑提示文案。迁移仍保留旧设置键的 DELETE 语句，这是数据清理用途。
- lint：项目没有此 script。
- 没有声称完成 iPhone 实机测试，也没有生成签名安装包或发布应用。

## iPhone 待验收

详见 device-checklist.md 末尾新增清单。重点是英文/法文键盘工具栏、安全区、小屏布局、错误回退清空、退出确认、熟词详情停留与后台重开。

实现参考原生 [InputAccessoryView](https://reactnative.dev/docs/inputaccessoryview) 和 [usePreventRemove](https://reactnavigation.org/docs/use-prevent-remove/) 的接口文档。没有将未核实的第三方 App 行为当作产品规则；未明确的间隔采用 3 个其他词，标熟详情停留 1.5 秒。


## 后续调整：按钮位置与生熟互斥

三颗星已恢复到进度行右侧；生、熟放在顶部导航栏右侧，18 号字、44 点点击区域，iOS 26 隐藏共享胶囊背景。提示框在页面内独立显示，避免导航栏裁切。

生词本和熟词本互斥：选中一个，另一个置灰；需先从对应词本撤回才能改选。此规则同时用于学习、复习、查词详情及数据写入。SQLite v6 添加局部唯一索引，以 word_id 限制两本最多一条关系。同形但不同 word_id 的实体互不影响。旧版本重叠条目保留熟词关系及原排期，仅移除重复生词关系；不修改 Card、Review Log、Study 轮次或撤回快照。

类型检查和 120 项自动测试通过，新增测试覆盖两方向阻止、撤回后改选、SQL 写入约束、Review 拒绝时不改排期及 v5 升级数据保留。外观、提示框及点击体验仍待 iPhone 真机验收。


## 后续调整：拼写页与轮次设置

- 勾/叉/箭头改为统一圆角线条图标，置于 44 点浅色圆形按钮内；去掉输入下划线，输入字号 32，中文释义移到下方，字号 16。
- 错误答案仅用于红字反馈，底层 TextInput 在错误提交后清空。下一次键入直接产生新答案，不会拼接旧内容；错误次数、再次安排和掌握规则不变。
- iOS 请求 ascii-capable 字母键盘，Android 请求 visible-password 无拼音建议模式，同时关闭自动纠正、拼写检查和自动填充；不使用密码遮盖，不改变正确答案展示。仍需对用户实际键盘做 iPhone 验收。接口依据 [React Native 0.86 TextInput](https://reactnative.dev/docs/0.86/textinput#keyboardtype)。
- 设置新增每轮新词数编辑：5～50 的快捷选项、加减 5、自定义整数输入；接受任意可安全表示的正整数 5 倍数，不限定为快捷选项。
- 沿用 settings.daily_new_words，无需 migration。首页和新一轮 Study 使用该值，恢复中的轮次保持原样，拼写和总结沿用实际本轮词表。复习每轮仍为 20。
- 类型检查及 123 项自动测试通过，覆盖新设置持久化、非法值拒绝、5/25/60 配额衔接、不足一轮及错后新输入。视觉和键盘行为不冒充已真机验收。
