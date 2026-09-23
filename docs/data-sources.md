# 离线数据来源

数据实测清单见 `data/sources.json`，构建计数见 `data/generated/reports/build-summary.json`。原始大文件只存本机 `data/raw/`，不进入应用，也不提交仓库。

| 来源 | 实际版本/文件 | 许可 | 当前状态 |
|---|---|---|---|
| FreeDict / WikDict fra-zho | 2025.11.23，官方 src.tar.xz，TEI header 声明 10947 headwords | CC BY-SA 3.0 Unported | 已校验官方 SHA512 并导入 |
| FLELex / Beacco TreeTagger | FleLex_TT_Beacco.tsv，用户于2026-09-23保存；内容SHA256见manifest | 官方下载页 CC BY-NC-SA 4.0 | 14,236条已解析，正式词书已生成 |
| Tatoeba | 2026-09-19 官方每周法语/中文 detailed sentences + fra-cmn links | CC BY 2.0 FR | 已连接直接翻译关系，保留贡献者与句子链接 |

## 官方入口

- FreeDict catalog：https://freedict.org/freedict-database.json
- FreeDict source：https://download.freedict.org/dictionaries/fra-zho/2025.11.23/freedict-fra-zho-2025.11.23.src.tar.xz
- FLELex：https://cental.uclouvain.be/cefrlex/flelex/download/
- FLELex / Beacco：https://cental.uclouvain.be/cefrlex/static/resources/fr/FleLex_TT_Beacco.tsv
- Tatoeba：https://tatoeba.org/en/downloads
- 法语每周导出：https://downloads.tatoeba.org/exports/per_language/fra/
- 中文每周导出：https://downloads.tatoeba.org/exports/per_language/cmn/

FreeDict 的 publisher 是 Karl Bartel，sourceDesc 写明 WikDict 自动创建，基于 Wiktionary 经 DBnary 提取；TEI 没有单独 copyright 字段，不能据此补造版权人。保留实际 availability、publisher、source 字段及原始 COPYING。

FLELex 引用：François, T., Gala, N., Watrin, P. & Fairon, C. (2014). *FLELex: a graded lexical resource for French foreign learners*. LREC 2014。Beacco 分级引用：Pintard, A. & François, T. (2020). *Combining expert knowledge with frequency information to infer CEFR levels for words*. READI, 85–92。

Tatoeba 的一些句子另有 CC0 授权；本次使用普通详细导出，统一按其 CC BY 2.0 FR 导出说明记录，不自行推断具体句子为 CC0。连接的是官方直接翻译 links，没有借助第三种语言推断翻译。句子作者字段为空时明确标为 unknown contributor。
