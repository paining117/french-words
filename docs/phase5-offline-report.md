# Phase 5 离线词典实施报告

2026-09-23。**用户已补齐官方FLELex文件；离线词典、例句、正式A1/A2/B1/B2词书、旧数据升级及自动化验证均已完成。iPhone新增功能仍待真机验收。** 本轮没有进入后续阶段，没有发布，也没有要求清除用户数据。

## 1. 修改文件

- `src/db/database.ts`、`migrations.ts`：安全启动与 v4 迁移。
- `scripts/import-wordbook.ts`：样例导入写搜索键，兼容旧 schema 测试夹具。
- `src/repositories/wordRepository.ts`：SQL 搜索、来源和例句署名；`wordBookRepository.ts` 清理过时远程注释。
- `src/services/dictionaryService.ts`、`dictionary/LocalDictionaryProvider.ts`、`src/types/dictionary.ts`：仅本地查询与扩充数据来源。
- `src/components/dictionary/DictionarySearch.tsx`：去掉远程流程，保留已验收的独立下拉查词界面。
- `app/about.tsx`、`app/word/[id].tsx`、`src/components/word/ExampleSentence.tsx`：来源、许可、贡献者与例句链接。
- `app/books/[id].tsx`：FlatList；`app/_layout.tsx`、`LoadState.tsx`：准备词库提示。
- `package.json`、`package-lock.json`：构建命令与仅开发时使用的 XML/CSV 解析依赖；`.gitignore`、`.env.example`、`tsconfig.json`、README、真机清单。
- 原 Phase 1～4 测试只调整样例初始化入口、schema 版本断言和真实旧 schema 夹具，保留业务断言。

## 2. 新增文件

`src/db/migrationV4.ts`、`importOfflineDataset.ts`、`src/types/dataset.ts`；`scripts/data/` 下官方 fetch、三个 parser、POS 映射、merge、validator、build、完整 SQLite verify 与可选 Python 标准库 Tatoeba 导出连接脚本；`tests/offlineDataset.test.ts`；`data/sources.json`、`data/generated/` 的 JSONL、词书 JSON、44个250词以内的种子分片及报告；`docs/data-sources.md`、`data-licenses.md`、`data-import.md`、原始许可文本与本报告。

取消的 server、远程 Provider、PONS/AI 展示、共享协议和6项远程专属测试已移至忽略目录 `.verification/cancelled-remote-phase5/`，不参与编译。原 Phase 1～4 的96项测试均保留。

## 3. 数据源版本

FreeDict fra-zho **2025.11.23**，官方 archive SHA512 校验通过；Tatoeba **2026-09-19** 周导出，实际下载于2026-09-23；FLELex / Beacco TreeTagger 官方 TSV 由用户于2026-09-23保存，共718,413 bytes，文件没有独立版本字段，以内容版本 `sha256:e0cbdb672fa4f83155acec4c8f01f179b30be08cb3d2d6cf0d9f25042b01e3d4` 标识。完整 URL、校验值和下载时间见 `data/sources.json`。

## 4. 实际许可证

FreeDict TEI availability 明示 **CC BY-SA 3.0 Unported**，publisher Karl Bartel，来源 WikDict/Wiktionary/DBnary；COPYING 已保留。FLELex 官方下载页声明 **CC BY-NC-SA 4.0**，按个人/非商业用途使用。Tatoeba 本次普通详细导出按 **CC BY 2.0 FR** 记录，不能将部分 CC0 的说明扩大到全部句子。详见 `data-licenses.md`。

## 5. Raw → Generated

原始文件仅在 `data/raw/`。官方文件 → 解析/规范化 → 合并 → CEFR匹配与排序 → 例句筛选/匹配 → validator → JSONL/词书JSON/250词seed分片。应用没有下载、解析XML、调用API或服务器的流程。重新构建的种子 SHA256 逐片一致。manifest 的 generatedAt 随构建更新。

## 6. FreeDict Parser

读取实际 TEI header、form/orth、gramGrp 和递归 sense/cit/quote。仅接受明确中文翻译并去重；没有汉字释义或无有效词头的记录进入跳过报告。未知词性归 other 并保留警告。原始 **10947**，成功解析 **10923**，跳过 **24**，未知POS警告416条。

## 7. FLELex Parser

实际文件表头为 word、tag、freq_A1～freq_C2、freq_total、level；无需修改parser即可读取。14,236条全部解析成功，按文件明确level分级，不从频率猜测。成功匹配 2924 条，未匹配 11287 条，歧义报告 18 项（涉及 25 条原始记录；一组冲突可含多条），均保留原始审核报告。不同FLELex记录可能归到同一规范化词条，因此分级词书按最终word_id去重。

官方地址：https://cental.uclouvain.be/cefrlex/flelex/download/ 。文件由用户手动取得；没有使用未经确认的镜像。

## 8. Tatoeba Parser

官方法语和中文 detailed sentences 与直接 fra-cmn links 连接，保留双语原文、两端句子ID/URL及贡献者。取得 **21222** 对，短句/中文/噪音筛选后 **20152** 对可供匹配。约3～15词且法语不超过120字符；完整token/连续短语匹配，处理撇号和连字符，保留重音，不让 chat 匹配 château，也不做词形还原。每词最多1条例句。

## 9. Merge规则

保留重音的 normalized lemma + POS 匹配；同形且明确阴阳性不同的名词另保留实体。同身份合并中文释义，155组重复源记录被整理；多候选 CEFR 匹配报告歧义，不强行关联。仅 FreeDict 词仍可查；仅 FLELex 而无中文释义的词不进入学习书。

## 10. CEFR规则

仅生成各自本级 A1/A2/B1/B2，不累积；C1/C2可记录但不生成词书；专名不进核心词书。同级频率降序、总频率降序、词头及稳定ID排序。真实分级文件缺失时发warning，App保持旧书，不创建空的正式词书。

## 11. Stable ID

`dict_` + SHA256(JSON[保留重音的normalizedLemma, POS, homograph])前24位。搜索折叠键不用于身份。`dictionary_word_map` 将生成ID映射到已有单词ID。释义追加ID基于释义文本，防止新版释义顺序变化导致新增内容漏入。

## 12. 旧Sample/Card/FSRS保护

66个旧样例ID全部保留；非空主释义、display form、gender及例句优先，源数据冲突不会覆盖人工性别。保持 `a1-core`、当前词书、全部已有关系/顺序，后续正式A1只追加缺失关系。保存旧Card、review_logs、sessions、study_rounds、checkins逐字段快照并在完整导入后比对一致。

这是**模拟已使用安装的真实SQLite验证**，并非读取了用户iPhone数据库。仍需手机升级验收，不宣称真机数据已经核实。

## 13. SQLite import

v4增加搜索键、同形词区分、例句出处/署名和ID映射；旧迁移不改动。不删除words或用户记录。每250词事务，批量SQL控制绑定参数数量；进度和本批写入一起提交。失败回滚当前批，已提交批可续导。导入不调用FSRS、不创建Card和日志。

## 14. Dataset version

当前 `offline-v1-c9011a32432e3b83c703`，由词条+关系内容hash产生。完整导入结束才保存成功版本；已完成版本直接跳过种子加载。补齐FLELex已为已有词补空缺CEFR字段，关系沿用现有ID。中断续导、失败回滚、重复导入、下一版本补充均有测试。

## 15. A1/A2/B1/B2实际词数

| 项目 | 正式分级集合 | App显示 |
|---|---:|---:|
| A1 | 624 | 642 |
| A2 | 251 | 251 |
| B1 | 510 | 510 |
| B2 | 906 | 906 |

A1多出的18个词是兼容保留的旧样例；已有66词关系全部保留，其中48词也在正式A1中。正式分级集合之间不累计、不重复；兼容保留项可能同时属于其他正式级别。C1/C2记录可保留元数据，不生成词书。

## 16. 完整词典实际词数

生成集 **10767个词条 / 14956条中文释义**。在66词样例基础上安全合并后，验证数据库为 **10780个词条 / 14991条中文释义**；二者差异来自保留的旧样例实体/释义。

## 17. 例句覆盖

生成集 **2445个词带Tatoeba例句**，**8322个词没有补充例句**。实际合并后examples表 **2458条**，其中已有例句优先，不被替换。匹配只证明出现该词，不保证符合该词所有义项；同形异义、多词性、专名仍需人工检查。

## 18. 自动测试结果

- TypeScript：通过；107项测试：107通过、0失败。
- 包含原96项业务测试及新增11项：TEI、FLELex、Tatoeba、CEFR匹配/顺序、v3回填、旧记录保留、重复/断点/故障导入、同形名词、版本追加、性别冲突、Study/全局Review与生词本边界。
- 真实完整数据validator、官方FreeDict校验、逐片重复构建一致性、SQLite foreign_key_check/integrity_check：通过。
- iOS与Android Hermes打包：通过，结果 `.verification/offline-export-final/`。
- Expo offline启动：通过，/status和iOS manifest均HTTP200；验证进程已停止，日常可双击启动文件。
- 在上个无CEFR版本的完整数据库副本上升级：10,780个已有单词ID及7张数据表逐字段保持一致；切到正式A2可启动Study，全局Review结果不变。证据 `data/generated/reports/cefr-upgrade-verification.json`。
- package没有lint script，未伪称lint通过。自动测试不下载网络数据。

桌面Node24.19/SQLite实测：首次导入 **997.323ms**，重复启动初始化 **1.645ms**，12个查询最大 **9.009ms**（不含UI防抖），不是iPhone耗时保证。原始证据见 `data/generated/reports/import-verification.json` 及 `.verification/offline-*.log`。

## 19. SQLite / bundle数据大小

下表MB按1,000,000字节，实测未压缩大小；不是App安装包大小。

| 项目 | bytes | MB |
|---|---:|---:|
| 合并后SQLite，WAL已checkpoint | 8359936 | 8.359936 |
| generated目录含构建报告 | 10985862 | 10.985862 |
| 运行时seed目录 | 3645118 | 3.645118 |
| iOS Hermes bundle | 4802270 | 4.802270 |
| Android Hermes bundle | 5125026 | 5.125026 |

验证数据库预先建立1张Card和1条Log用于保留测试，导入后仍各1条；不是导入产生的学习记录。原始TEI、压缩包、XML/CSV parser与服务器不进入运行包。

## 20. iPhone手动验收

双击项目中的“启动法语背单词.cmd”，手机与电脑同Wi-Fi，Expo Go扫描二维码；保留手机已有数据，等待首次准备词库。检查旧进度、进行中的星数、全局Review、生词本；查询 voiture/ecole/汽车及原样例之外的词，检查例句/署名/键盘/返回手势。重启不重复导入；首次导入退出再开可续导。详见追加的 `device-checklist.md` 离线Phase5小节。Expo Go从Metro加载开发代码仍依赖局域网，业务离线与开发加载过程应分开验收。

## 21. 已知问题

FLELex中11,287条记录没有可靠匹配到当前中文词典（含词性不兼容等情况）；没有中文含义的词未强行放入词书。歧义项也未猜测匹配。FreeDict来自自动提取，含繁简混用、专名、未知词性及细粒度/生僻词义；24条因没有有效汉字释义等原因跳过。Tatoeba自动词匹配未经逐义人工审核，8322词无补充例句。历史A1兼容保留会令升级后的A1含不属于正式A1的旧项，报告会与纯generatedA1计数区分。

开发日期修改功能仍按原要求只在开发模式存在；正式发布前须真实删除相关代码，遵循发布清单。本轮没有发布或新增联网服务。

## 22. FLELex非商业许可注意事项

官方说明见 https://cental.uclouvain.be/cefrlex/flelex/download/ 。CC BY-NC-SA 4.0限制不能通过转换JSON/SQLite消除。未来公开或商业发布前，需要复核所选用途是否获准、署名/修改说明、相同方式共享以及与CC BY-SA 3.0词典混合分发的方式；有商业用途时应取得授权或替换合规分级来源。当前没有作出商业使用许可结论。
