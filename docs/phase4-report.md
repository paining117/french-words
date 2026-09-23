# Phase 4 交付报告：本地查词、我的生词本、词书浏览

后续用户修正：查词交互恢复首页下拉松手进入独立页面，顶部输入框／放大镜、自动方向且隐藏方向与标题、模糊背景、从上方淡入、右滑返回；历史显示实际选中的单词／词性／释义。下文首页滚动第二部分及手动方向 UI 为本报告交付时的历史规则，已被覆盖。生词本、词书浏览、查询去重及数据边界保留；新增历史所选词使用已有文本主键携带 word_id，无 migration。

本次只实现 Phase 4。Phase 1～3 已由用户确认通过 iPhone 验收；本次新增功能完成代码与自动验证，尚未进行 Phase 4 iPhone 真机验收。未进入 Phase 5。

## 1. 修改文件

| 范围 | 文件 | 修改内容 |
| --- | --- | --- |
| 首页 | `app/index.tsx` | 保留第一屏，查词嵌入同一纵向 ScrollView 的第二部分；键盘避让 |
| 查词 UI | `src/components/dictionary/DictionarySearch.tsx` | 自动／手动方向、实时结果、历史重查与清空、键盘 Search 打开唯一结果；复用到原 search 路由 |
| 单词详情 | `app/word/[id].tsx` | 映射词性、多释义及例句、生词本状态、加入、确认移除、安全区 |
| 词书 | `app/books/index.tsx`、`app/books/[id].tsx` | 当前词书标记、真实进度、有序词表、学习状态、切换词书 |
| Repository | `src/repositories/wordRepository.ts`、`wordBookRepository.ts`、`searchRepository.ts`、`settingsRepository.ts`、`studyRoundRepository.ts` | 本地来源、词书 JOIN、生词本关系写入、历史清空去重、设置切换、按当前词书读取未完成轮 |
| 词典服务 | `src/services/dictionaryService.ts`、`dictionaryHistory.ts`、`dictionary/LocalDictionaryProvider.ts`、`dictionary/rankFrenchWords.ts`、`dictionary/suggestionSearch.ts` | 只读查询、Provider 边界、历史文本重放、确定性排序、250ms 防抖 |
| 学习衔接 | `src/services/studyService.ts`、`homeService.ts` | 记录轮次来源词书；恢复时排除移除的未评分词及已在别处学过的词；首页与所选词书一致 |
| 类型与工具 | `src/types/dictionary.ts`、`study.ts`、`src/utils/normalizeFrench.ts`、`wordLabel.ts` | 本地来源和方向、轮次 bookId、包含汉字的方向判断、未知词性隐藏 |
| 既有测试 | `tests/phase1.test.ts`、`phase2.test.ts`、`dictionarySearch.test.ts` | 保留旧测试，更新被本次规格替换的断言：含汉字方向、只读查询不写历史、250ms、防止换词书继续旧轮 |
| 文档 | `README.md`、`docs/device-checklist.md` | 当前规则及 Phase 4 验收内容；不覆盖旧验收记录 |

`app/settings.tsx` 已检查，无需重复实现：其当前词书入口已连接 `/books`，返回聚焦会刷新。Card Repository、Review 调度、FSRS 和统计定义未修改。

## 2. 新增文件

- `tests/phase4.test.ts`：8 组真实 SQLite 集成测试。
- `docs/phase4-report.md`：本报告。

## 3. Migration

不新增 migration，数据库保持 `user_version = 3`。未修改历史 migration、未删除数据库、无需清除 Expo Go 数据。现有关系表、历史表与词书设置可直接使用。

学习轮次现有 JSON 新增可选 `bookId`，不是新增数据库字段。新轮写入来源词书；旧版未完成轮在正式切换设置前，于同一事务补上原词书 ID。既有 Card、评分日志、星数、选项顺序和完成历史保留。

## 4. 本地搜索实现

首页第二部分使用原生 TextInput，输入停顿 250ms 后：DictionarySearch → dictionaryService.suggestLocal → LocalDictionaryProvider.suggest → wordRepository.findWords。建议列表只取轻量词条，不加载例句。详情通过已有 Repository 读取所有释义与例句。

Provider 的查询结果带 `query`、`direction`、`provider: local`、`entries`，词条带 `source: local`。完整查询 `lookupLocal` 同样只读。空输入不查询词条；过期请求的结果与错误不会覆盖最新请求。

本次遵循最新规格，将首页恢复为“第一屏 + 向下滚动查词”，覆盖之前“下拉松手进入独立查词页”的入口规则。原 `/search` 路由保留，复用同一组件，没有新增 Tab。第一屏底部不恢复“下拉查词”提示。

## 5. 法语 normalization

继续使用现有工具，不改词条身份：`normalizeFrench` 执行 trim、Unicode NFC、法语小写；`foldFrenchSearch` 仅用于搜索，进一步 NFD 去组合重音、œ→oe、æ→ae、统一弯引号与连续空格。

因此 ecole、etre、soeur、VOITURE 和 une voiture 可匹配原词。显示及数据库 lemma 保持 école、être、sœur 等原始形式，ou 与 où 不合并实体。名词 le／la 仍仅在详情单词下方显示。

## 6. 中文搜索

输入含汉字时自动采用中→法，也可手动切换或恢复自动。参数化 SQL 在 `primary_meaning_zh` 和 `meanings.meaning_zh` 中做 substring 查询，转义 `%`、`_`、反斜线，最多 20 条；精确主释义优先，随后按规范化 lemma 和 ID 稳定排序。

## 7. Search 排序

法语依次为：原拼写 lemma 精确匹配、重音／连字折叠后的 lemma 精确匹配、lemma 前缀、display_form 前缀、包含匹配。同级按法语 lemma 和 word_id 稳定排序，截取 20 条。不同 word_id 的同形异词性全部保留，不按 lemma 去重；不实现编辑距离或词形还原。

## 8. Search History

输入和仅查询不写历史。点击结果或提交后打开唯一匹配结果，才调用 `saveSearch` 保存实际 query、direction、searched_at。多个同形结果不擅自挑一个打开。

去重键为方向与 NFC／大小写规范化查询，重复使用更新时间并置前，同时间使用 rowid 排序。写入后数据库只留最新 20 条；同文本的旧 `entry:wordId` 记录在新查询保存时合并。旧历史不会清空，包含无法唯一解析的旧查询文本仍可点击重查。可解析的条目补充词性、中文意思。

历史点击填回文本与原方向并执行查询；清空只 DELETE search_history，不影响词库、词书或学习数据。

## 9. 我的生词本

沿用 `my-vocabulary`，不创建第二本生词本。详情加载真实 membership；加入成功立即显示“已加入生词本”，并提供弱操作“移出生词本”。UI 用提交锁和禁用状态防连点。移除使用原生二次确认。

Repository 在事务中先取得写锁，验证词书与 word_id，计算 `MAX(order_index)+1` 后 `INSERT OR IGNORE`。空本从 0 开始，重复加入保持原位置，新加入或移除后再加入排末尾。身份按 word_id，允许同形不同词性分别加入。

## 10. 加入／移除的数据边界

加入只新增 `word_book_words` 关系；没有调用 FSRS，没有创建 Card，没有评分日志或学习统计增加。

移除只 DELETE `book_id = my-vocabulary AND word_id = ?`；不删 words、释义、例句、其他词书关系、Card、review_logs 或学习历史。已有 Card 仍参加全局复习。保存失败不乐观修改 membership，显示失败提示并在开发环境记录真实错误。没有删除词书功能。

## 11. 当前词书切换

词书详情点击“设为当前词书”，验证本地词书存在后事务更新 settings.current_book_id。词书列表标记当前项；首页和 Settings 原有聚焦刷新读取新词书。进度以 JOIN cards 的存在性计算，加入未学词只增加总数。

## 12. 与 Phase 2 Study 衔接

仍用 current_book_id → getUnlearnedWords → 原 Study 三步流程。每轮 10 词，未存在 Card 的词进入新轮；第一次实际评分才建 Card。生词本为空或没有未学词时沿用 empty 行为。

为满足换词书后立即使用新来源，未完成轮按 bookId 暂存；切回恢复原星数和选项。恢复时只过滤“还没有评分”的失效队列项：已移出生词本，或已在另一词书创建 Card。已经评分的强化项继续保留到本轮完成，即使后来移出生词本也不抹掉学习过程。旧轮全部未评分且全部移除时正常结束空轮，再检查所选词书的新词。

保留原有评分事务、三颗星、首次复习 1／3／5 天、跨日累计与防重复评分；没有另一套生词本学习算法。

## 13. 与 Phase 3 Review 的边界

Review 代码及 Card due 查询保持原样：全局到期且未暂停的 Card，按回忆概率风险排序，每轮最多 20 词。新集成测试验证：设生词本为当前词书、移除已学词后，A1 中的该 Card 仍能进入正式 Review。统计仍来自真实 Card／日志；加入生词本不算学习。

## 14. 新增测试

8 组 Phase 4 集成测试覆盖：

1. 原拼写、大小写、重音／显示形式、中法匹配、20 条限制、不同词性、排序和只读 Provider。
2. 加入、重复加入、顺序、同形词、无效词 ID；Card／日志／其他表不变。
3. 生词本→切换→Study→首次评分建 Card→移除保留内容与评分→全局 Review；已有 Card 不再当新词。
4. 未完成轮中的未学词移除、整轮移空、首页同步。
5. 词书切换、旧星数恢复、跨词书共享词不重复建 Card。
6. 旧版无 bookId 轮次兼容、重启持久化、非法切换回滚、schema 仍为 3。
7. 注入 SQLite 加入／移除失败，关系与学习记录保持一致。
8. 历史方向／文本、规范化去重、旧记录合并、25→20 条、置顶、无法解析查询仍可重放；清空不影响已存在 Card／日志。

没有删除任何旧测试。三处规格相关旧断言作了更新，其余学习、复习、调度及数据回滚测试继续执行。

## 15. 自动验证结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| TypeScript | 通过 | `npm run typecheck` |
| Phase 1～4 自动测试 | 95 / 95 通过，0 失败、0 跳过 | `.verification/phase4-tests.txt` |
| iOS / Android 资源编译 | 通过 | `.verification/phase4-native`、`.verification/phase4-export.txt` |
| Expo 离线启动 | 成功 | 检查服务临时使用 8082，未占用／关闭原 8081 服务 |
| `/status` | HTTP 200，packager-status:running | `.verification/phase4-startup.json` |
| iOS / Android 开发 manifest | 均 HTTP 200，SDK 57.0.0，项目路径正确 | 同上 |
| lint | 未运行 | package.json 未提供 lint script；未安装新 lint 依赖 |

验证使用 Node 的真实 SQLite，不直接操作手机数据库。检查用的临时 Expo 服务已停止。依赖和锁文件未修改，未引入任何网络依赖。

## 16. iPhone 手动验收

完整清单已追加到 `docs/device-checklist.md` 的“Phase 4 - Local Dictionary & Vocabulary Book 真机验收”。重点走一次：向下滚动→查 voiture→详情→加入→词书列表→我的生词本→设为当前→首页学习→第一次评分。

另检查键盘 Search、中文输入、方向按钮、无结果、历史重查／清空、移除确认、快速连点、小屏 Safe Area、重启、换词书后恢复星数。检查内容覆盖 Phase 1～3 首页数字、签到、强化和全局复习，不把自动编译结果当作真机验收。

## 17. 已知限制

- 本地仍是既有 66 词示例数据；查不到时明确显示“本地词库中没有找到这个词”，不是完整生产词典。
- 法语重音容错沿用小词库的 JS 规范化扫描，无 search_key 索引；目前不需要 migration，几千词以上应再评估。
- 不做复杂拼写纠错、词形还原和冠词替换；原词／已有 display_form 之外不保证匹配。
- 旧版以选中单词记录的历史可能没有当时的原始查询文本，只能保留其已有 lemma；新记录保存实际 query 与 direction。
- Phase 4 的实际键盘、滚动、视觉、确认弹窗及触摸行为尚待 iPhone 验收。

## 18. Phase 5 前的注意事项

后续如另行授权 Phase 5，应先确定生产词库来源与数据许可、远程查询数据结构和持久化规则、同形词身份、缓存与离线失败行为，并保持“查词／加入 ≠ 学习评分”的边界。词库扩大时可新增带 backfill 的搜索键 migration，不改旧迁移或词条 ID。

正式发布前仍必须按 `docs/release-checklist.md` 删除开发日期编辑、持久化与时钟偏移能力。本次保留开发功能及 __DEV__ 限制。

本次到 Phase 4 停止。没有实现远程 Provider、PONS、AI、账号、同步、音频或其他 Phase 5 功能。
