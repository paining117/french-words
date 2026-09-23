# 构建和导入离线词库

## 本轮状态

FreeDict、FLELex / Beacco、Tatoeba 均已构建并验证。FLELex 文件由用户从官方页面下载后保存到指定目录，实际14,236条均能解析。正式词书A1 624、A2 251、B1 510、B2 906；App的A1保留旧样例关系后为642。

现在只需双击项目中的“启动法语背单词.cmd”，iPhone扫码重新进入，等待“正在准备词库…”结束，再在“词书”中选择相应等级。**不要清除Expo Go数据。** 当前词书不会自动切换。

## 日后更新或重新下载 FLELex

1. 浏览器打开 https://cental.uclouvain.be/cefrlex/flelex/download/ 。
2. 点击第一项 **FLELex / Beacco with TreeTagger parts of speech** 的 Download，文件名 `FleLex_TT_Beacco.tsv`。不要下载只有频率的 FLELex_TT.csv 代替。
3. 保存到 `D:\同济大学\french-words\data\raw\flelex\FleLex_TT_Beacco.tsv`。
4. 在项目目录运行 `npm.cmd run data:build`，再运行 `npm.cmd run data:verify`。如实际文件表头与支持的明确等级字段不符，构建会停止并列出表头；需要核对后调整映射，不猜等级。
5. 重新打开开发 App。数据版本改变后会自动补齐，仍不需清 Expo Go 数据。

也可重试 `npm.cmd run data:fetch:flelex`。本机自动下载曾失败；本次已用用户手动取得的官方文件成功构建，没有更换不明镜像。

## 可复现命令

使用项目要求的 Node >=22.13（本轮24.19）、npm 与系统 tar。可选 Tatoeba 解压/连接辅助脚本使用 Python 3 标准库，不成为应用依赖。

```powershell
npm.cmd ci
npm.cmd run data:fetch:freedict
npm.cmd run data:fetch:flelex
npm.cmd run data:fetch:tatoeba
npm.cmd run data:build
npm.cmd run data:verify
npm.cmd run typecheck
npm.cmd test
```

下载只发生于显式 data:fetch 命令；单元测试使用 fixtures，构建只读取 raw 文件。Tatoeba helper 会复用已存在的官方压缩文件；要更新导出，请先将旧 raw 文件备份到另一目录，再下载同一周的三个文件。

Raw → TEI/TSV parser → POS 归一 → normalized lemma + POS 匹配 → CEFR 非累计词书 → 例句完整词匹配 → validator → JSONL、分级 JSON、每250词一个 seed JSON → Expo SQLite。

FreeDict 缺失会报错；FLELex 缺失会产生明确 warning 并只构建词典；Tatoeba 缺失允许跳过。`sources.json` 包含实际版本、SHA256/SHA512、下载时间、官方 URL 和许可。相同输入的词条、分级关系及 dataset version 保持确定性，manifest 的 generatedAt 是本次构建时间。

## SQLite 与旧数据

- 新增 v4 migration；保留 v1～v3 内容。增加词搜索列、同形词区分列、例句来源列、字典ID映射表。只替换唯一索引，不删除任何 words/Card/log/session/checkin。
- 旧词按保留重音的 lemma + POS 匹配，优先保留原 ID；明确不同阴阳性同形词分别保留。搜索折叠键不参与身份去重。
- 保留已有非空词头/主释义/性别/display form/例句，追加不重复的新释义。词典导入不创建 Card，不写 review_logs，不调用 FSRS。
- 每250个词一个事务；进度与该批数据在同一事务提交。只有词条与关系全部完成后才保存成功版本，失败下次从已提交批次继续。
- 后续启动版本相同则不读取种子分片、不重新遍历词典。版本改变只做安全补充；历史学习状态完全独立。
- `a1-core` ID 和旧66词关系/顺序保留。正式A1到位后，按频率顺序追加缺失关系，因此升级安装的 A1 有少量历史保留项，不等于纯正式A1集合。A2/B1/B2 是各等级本级词，C1/C2只保留词条元数据。
- current_book_id 不自动切换；Study 复用 getUnlearnedWords；Review 继续全局 due 查询。

## 检索与性能

SQL 使用存储的 search_key/display_search_key，最多20条返回，不将一万词读入 JS 排序。精确原拼写 → 无重音完全匹配 → lemma前缀 → display前缀 → 子串。中文在主释义和全部meanings内匹配。NFC 保留身份；NFD去附加符号、œ→oe、æ→ae、撇号和空白统一仅用于查找。索引为后续前缀查询保留；包含式兜底仍可能扫描表，实测见 import-verification.json，不能替代 iPhone 200ms 目标实测。

词书详情采用 FlatList。首次导入显示“正在准备词库…”。正式发布前仍须按 release-checklist.md 删除开发改日期功能；本轮没有发布。
