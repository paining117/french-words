# 法语背单词 App V1 开发规格

## 0. 开发目标

从零开发一款面向中文母语法语学习者的移动端背单词 App。

产品设计参考“不背单词”的核心思路：

- 极简首页
- 大图/沉浸式背景
- 首页直接进入“学习”和“复习”
- 学习时一次只关注一个法语单词
- 用户通过“认识 / 模糊 / 不认识”进行反馈
- 释义和例句在作答之后出现
- 复习时间由间隔重复算法自动安排
- 首页继续向下滚动可以进入查词区域

只借鉴交互逻辑和信息层级。

不要复制“不背单词”的：

- 品牌名称
- Logo
- 图标
- 原始背景图片
- 字体
- 文案
- 像素级页面布局
- 专有视觉素材

整个 App 必须使用自己的视觉设计。

---

# 1. V1 产品边界

V1 只解决一件事：

> 学习法语单词，并在合适的时间复习。

核心流程：

```text
打开 App
→ 签到
→ 学习今日新词
→ 按 FSRS 自动生成复习计划
→ 第二天或之后复习
→ 平时可以查询陌生法语单词
→ 将查询结果加入生词本
→ 生词进入相同复习系统
```

V1 实现：

1. 首页
2. 签到
3. 连续学习天数
4. 当前词书
5. 每日新词数量
6. 新词学习
7. FSRS 间隔复习
8. 认识 / 模糊 / 不认识
9. 单词释义
10. 法语例句
11. 中文例句翻译
12. 首页向下滚动查词
13. 生词本
14. 学习记录
15. 本地 SQLite 数据持久化
16. 外部词典接口抽象
17. PONS 查词接口预留/接入
18. AI 查词 fallback 接口

V1 不实现：

- 听力
- 单词发音
- TTS
- 录音
- 口语
- 拼写训练
- 听写
- 语法课程
- 阅读课程
- AI 对话
- 写作
- 社交
- 排行榜
- 积分
- 金币
- 商城
- 成就
- 好友
- 账号系统
- 云同步
- 多设备同步
- 推送通知
- 深色模式

不要自行添加以上功能。

---

# 2. 技术栈

移动端：

```text
React Native
Expo
TypeScript
Expo Router
expo-sqlite
ts-fsrs
```

Node.js：

```text
>= 20
```

不要引入 Redux。

不要引入大型 UI Framework。

状态管理优先使用：

```text
React Context
React hooks
SQLite
```

SQLite 是学习数据的唯一持久化数据源。

简单 UI 临时状态使用：

```text
useState
useReducer
```

---

# 3. 项目初始化

创建：

```bash
npx create-expo-app french-words
```

使用 TypeScript。

安装：

```bash
npx expo install expo-sqlite
npm install ts-fsrs
```

需要 Expo Router。

启动：

```bash
npx expo start
```

项目必须能够在：

- Android
- iOS

正常运行。

Web 不是 V1 验收目标。

---

# 4. 信息架构

不要使用底部 Tab Bar。

整个 App 从首页向外导航。

路由：

```text
app/
  _layout.tsx

  index.tsx

  study.tsx
  review.tsx

  word/
    [id].tsx

  books/
    index.tsx
    [id].tsx

  settings.tsx
  stats.tsx
```

关系：

```text
                    首页
                     │
       ┌─────────────┼─────────────┐
       │             │             │
      学习           复习          查词
       │             │             │
       │             │         单词详情
       │             │             │
       └───────┬─────┘         加入生词本
               │
             SQLite

首页右上角
    │
    ↓
   设置
    │
    ├─ 选择词书
    ├─ 每日新词数
    ├─ 学习记录
    └─ 关于
```

---

# 5. 首页设计

首页必须是一整个纵向 ScrollView。

第一屏是主学习界面。

第二屏是查词界面。

用户正常向上滑动页面，使内容向下滚动，即可进入查词区域。

不要实现复杂的自定义拖拽手势。

---

# 6. 首页第一屏

第一屏高度接近一个完整设备屏幕。

背景：

```text
全屏背景图或柔和渐变
+
轻微暗色遮罩
```

V1 必须提供渐变 fallback。

即使没有真实背景图片，App 仍然可以正常运行。

页面结构：

```text
┌─────────────────────────────┐
│                       ⚙     │
│                             │
│                             │
│          09 / 19            │
│          Saturday           │
│                             │
│           签到              │
│       连续学习 7 天          │
│                             │
│                             │
│       学习                  │
│       今日新词 10           │
│                             │
│       复习                  │
│       待复习 26             │
│                             │
│                             │
│    A1 基础词汇               │
│    238 / 800                │
│    ━━━━━━━━━━━              │
│                             │
│         ↓ 查词              │
└─────────────────────────────┘
```

整体视觉要求：

- 大量留白
- 字体清晰
- 信息量少
- 背景有氛围感
- 文字具有足够对比度
- 页面不要堆卡片
- 不使用游戏化装饰

---

# 7. 签到逻辑

签到以设备当前本地日期为准。

数据库中一天只能签到一次。

点击：

```text
签到
```

以后显示：

```text
今日已签到
```

完成一次学习 Session 或 Review Session 时，如果当天尚未签到：

自动签到。

连续学习天数按照连续自然日计算。

例如：

```text
9月17日 ✓
9月18日 ✓
9月19日 ✓
```

则：

```text
连续学习 3 天
```

如果 9 月 18 日没有签到：

连续天数重新计算。

签到不产生：

- 积分
- 金币
- 奖励
- 补签卡

---

# 8. 首页学习入口

显示：

```text
学习

今日新词
10
```

点击进入：

```text
/study
```

每天新词数量来自 Settings。

默认：

```text
10
```

选项：

```text
5
10
15
20
30
50
```

---

# 9. 首页复习入口

显示：

```text
复习

待复习
26
```

数字来自：

```sql
cards.due_at <= 当前时间
```

点击进入：

```text
/review
```

如果没有待复习单词：

显示：

```text
今日复习已完成
```

点击后不进入空页面。

---

# 10. 当前词书

首页显示：

```text
A1 基础词汇

238 / 800
```

其中：

```text
238 = 已经创建 Card 的词
800 = 词书总词数
```

点击进入：

```text
/books
```

---

# 11. 首页查词区域

首页继续滚动后显示：

```text
查词

[ 输入法语或中文 ]

最近查询

permis
occasion
pourtant
```

搜索框支持：

```text
法语 → 中文
中文 → 法语
```

V1 可以通过简单规则判断：

如果主要包含汉字：

```text
zh → fr
```

否则：

```text
fr → zh
```

用户也可以在搜索框右侧手动切换方向。

---

# 12. 查词优先级

查词必须按照以下顺序：

```text
1. 本地 SQLite words
        ↓ 未找到

2. External Dictionary Provider
        ↓ 未找到 / 信息不足

3. AI Dictionary Provider
```

不得直接默认调用 AI。

---

# 13. Dictionary Provider 抽象

创建统一接口：

```ts
export interface DictionaryProvider {
  lookup(
    query: string,
    direction: "fr-zh" | "zh-fr"
  ): Promise<DictionaryLookupResult>;
}
```

返回统一结构：

```ts
export interface DictionaryLookupResult {
  query: string;

  provider:
    | "local"
    | "pons"
    | "ai";

  entries: DictionaryEntry[];
}
```

DictionaryEntry：

```ts
export interface DictionaryEntry {
  lemma: string;

  displayForm?: string;

  partOfSpeech?: string;

  gender?: "m" | "f";

  ipa?: string;

  meaningsZh: string[];

  examples: {
    french: string;
    chinese: string;
  }[];

  sourceLabel?: string;
}
```

---

# 14. 本地查词

首先执行本地查询。

优先匹配：

```text
lemma
display_form
primary_meaning_zh
```

法语查询：

进行：

```text
trim
lowercase
Unicode normalization
```

例如：

```text
Voiture
voiture
VOITURE
```

均应该查询到：

```text
voiture
```

---

# 15. PONS Provider

PONS 是首选外部词典 Provider。

不要在 React Native App 内保存：

```text
PONS_SECRET
```

必须通过服务端 Proxy。

App：

```text
App
 ↓
Dictionary API Proxy
 ↓
PONS API
```

环境变量：

```env
EXPO_PUBLIC_LOOKUP_API_BASE_URL=
```

App 只知道 Proxy 地址。

PONS Secret 只能存在服务端。

---

# 16. Dictionary API Proxy

V1 创建独立目录：

```text
server/
```

目标：

只提供非常薄的一层 Dictionary Proxy。

接口：

```http
POST /lookup
```

Request：

```json
{
  "query": "permis",
  "direction": "fr-zh"
}
```

Response：

```json
{
  "provider": "pons",
  "query": "permis",
  "entries": [
    {
      "lemma": "permis",
      "displayForm": "un permis",
      "partOfSpeech": "noun",
      "gender": "m",
      "meaningsZh": [
        "许可证",
        "执照"
      ],
      "examples": []
    }
  ]
}
```

---

# 17. PONS 接入规则

不要自行抓取 PONS 网页。

只能通过正式 API。

不要硬编码未经验证的 dictionary code。

获得实际 PONS API Key 后，根据真实 API 响应编写：

```text
PonsDictionaryProvider
```

如果没有配置：

```env
PONS_SECRET
```

则 PONS Provider 返回：

```text
provider unavailable
```

而不是让 App 崩溃。

如果启用 PONS，在查词结果页底部显示：

```text
Dictionary powered by PONS
```

不要把 PONS Logo 当成 App 品牌元素。

---

# 18. AI Provider

AI 只作为 fallback。

AI API Key 同样只能放服务端。

不要放：

```env
EXPO_PUBLIC_AI_API_KEY
```

正确：

```text
App
 ↓
Server
 ↓
AI API
```

AI Provider 必须返回严格结构化 JSON。

Prompt 目标：

给定法语或中文单词，生成适合中文法语学习者使用的简洁词典条目。

返回：

```json
{
  "entries": [
    {
      "lemma": "occasion",
      "displayForm": "une occasion",
      "partOfSpeech": "noun",
      "gender": "f",
      "meaningsZh": [
        "机会",
        "时机"
      ],
      "examples": [
        {
          "french": "C'est une bonne occasion.",
          "chinese": "这是一个好机会。"
        }
      ]
    }
  ]
}
```

要求：

- 不生成长解释
- 一般最多返回 3 个主要释义
- 默认生成 1 个自然、简单的例句
- 法语例句必须符合对应词义
- 中文翻译自然
- 名词尽可能返回阴阳性
- 动词使用 infinitif
- 不生成音频字段

AI 数据必须在 UI 中标记：

```text
AI 补充
```

---

# 19. 查询失败

如果：

```text
本地没有
PONS失败
AI失败
```

显示：

```text
未找到这个词。

请检查拼写后重试。
```

不要显示技术错误。

开发模式允许 console 输出真实错误。

---

# 20. 查词结果页面

搜索后结果：

```text
permis

un permis
n.m.

许可证；执照


常见搭配

permis de conduire
驾驶执照


例句

J'ai obtenu mon permis de conduire.
我取得了驾驶执照。


[ + 加入生词本 ]
```

如果多个词性：

分别显示。

例如：

```text
livre

1. n.m.
书

2. adj.
自由的
```

---

# 21. 加入生词本

点击：

```text
+ 加入生词本
```

以后：

1. 创建或复用 `words` 条目。
2. 加入 `My Vocabulary` 词书。
3. 如果该词不存在 Card：
   创建 FSRS Card。
4. 如果已经存在：
   不重复创建。

显示：

```text
已加入生词本
```

同一个 lemma 不要重复加入。

如果同形词词性不同：

允许不同 word_id。

例如：

```text
livre noun
livre adjective
```

视为两个词义实体。

---

# 22. 词书系统

V1 数据模型支持：

```text
A1 基础词汇
A2 基础词汇
B1 核心词汇
B2 核心词汇
我的生词本
```

但初次开发：

只需要真正准备：

```text
A1 示例词书
我的生词本
```

A1 示例词书提供：

```text
60～100 个测试单词
```

用于验证整个学习系统。

不要让 Codex 自动生成 1000～5000 个最终正式词汇。

正式词库以后通过独立数据文件导入。

---

# 23. 词书导入机制

创建：

```text
scripts/import-wordbook.ts
```

支持导入：

```text
JSON
```

未来可以扩展 CSV。

示例：

```json
{
  "id": "a1-core",
  "name": "A1 基础词汇",
  "level": "A1",
  "words": [
    {
      "lemma": "bonjour",
      "partOfSpeech": "interjection",
      "meaningsZh": ["你好"]
    },
    {
      "lemma": "voiture",
      "displayForm": "une voiture",
      "partOfSpeech": "noun",
      "gender": "f",
      "meaningsZh": ["汽车"],
      "examples": [
        {
          "french": "J'ai une voiture.",
          "chinese": "我有一辆汽车。"
        }
      ]
    }
  ]
}
```

---

# 24. 法语单词存储原则

名词尽量使用：

```text
冠词 + 名词
```

例如：

```text
une voiture
un livre
la maison
```

但 lemma 始终存：

```text
voiture
livre
maison
```

动词 lemma 使用不定式：

```text
être
avoir
prendre
venir
```

形容词尽量使用：

```text
阳性单数原形
```

---

# 25. 单词学习页面

Route：

```text
/study
```

页面视觉必须非常简单。

未作答：

```text
3 / 10



        voiture



认识        模糊        不认识
```

此时：

不要显示中文。

不要显示例句。

不要显示解释。

让用户先主动回忆。

---

# 26. 点击认识 / 模糊 / 不认识后

显示：

```text
voiture

une voiture
n.f.

汽车


J'ai une voiture.
我有一辆汽车。


[继续]
```

顶部保持当前学习进度。

---

# 27. 三个按钮与 FSRS 映射

固定：

```text
不认识
→ Rating.Again

模糊
→ Rating.Hard

认识
→ Rating.Good
```

V1 不提供：

```text
Rating.Easy
```

用户只看到三个中文反馈。

---

# 28. FSRS 配置

创建：

```text
src/services/fsrs/fsrs.ts
```

初始化：

```ts
const scheduler = fsrs({
  request_retention: 0.9,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ["1m", "10m"],
  relearning_steps: ["10m"]
});
```

不要自己实现：

```text
1天
3天
7天
14天
30天
```

间隔。

所有正式复习日期由 FSRS 决定。

---

# 29. 创建新 Card

一个单词第一次进入学习系统：

```ts
createEmptyCard()
```

创建 FSRS Card。

然后序列化并存储。

不要自己手写 FSRS 内部 Difficulty / Stability 初始化值。

---

# 30. FSRS 存储原则

因为 ts-fsrs Card 数据结构未来可能升级：

SQLite 不要拆成几十个 FSRS 专有字段。

使用：

```text
fsrs_card_json
```

保存完整 card JSON。

同时冗余保存：

```text
due_at
last_review_at
```

便于查询。

结构：

```text
cards
├── word_id
├── fsrs_card_json
├── due_at
├── last_review_at
├── first_learned_at
├── created_at
├── origin
└── suspended
```

Date 序列化成 ISO8601。

加载 Card 时恢复成 Date 对象。

---

# 31. Review Log

每次用户点击：

```text
认识
模糊
不认识
```

必须记录 review log。

字段：

```text
word_id

rating

context
study | review

reviewed_at

fsrs_log_json
```

之后可以用于：

- 学习统计
- 调试
- 未来重新计算 FSRS
- 未来优化参数

---

# 32. 新词 Session

每日新词：

```text
Settings.dailyNewWords
```

例如：

```text
10
```

查询：

当前词书中：

```text
尚未存在 Card
```

的前 10 个单词。

按照：

```text
word_book_words.order_index
```

排序。

---

# 33. 新词短期强化

第一次看到新词：

用户作答。

如果：

```text
认识
```

正常进入 FSRS。

如果：

```text
模糊
或
不认识
```

除 FSRS 正常记录之外：

在当前 Study Session 中再次出现一次。

规则：

```text
不认识
→ 至少隔 3 个其他单词再次出现

模糊
→ 至少隔 5 个其他单词再次出现
```

如果本组剩余单词不足：

放到队列末尾。

同一词当前 Session 最多重复：

```text
3 次
```

避免无限循环。

FSRS 的长期调度仍然是最终依据。

当前 Session 的重新出现只是短期强化。

---

# 34. Study Session 完成

完成后显示：

```text
今日学习完成

新词    10

认识     6
模糊     3
不认识   1


[返回首页]
```

完成后：

自动签到。

---

# 35. Review Queue

查询：

```sql
due_at <= now
AND suspended = 0
```

得到今日待复习 Card。

---

# 36. Review 排序

加载每张 Card 后：

调用：

```ts
scheduler.get_retrievability(
  card,
  new Date(),
  false
)
```

优先：

```text
retrievability 越低
越先复习
```

也就是最可能已经忘记的词优先。

如果 retrievability 相同：

按：

```text
due_at ASC
```

排序。

---

# 37. Review 页面

未作答：

```text
12 / 26



        pourtant



认识        模糊        不认识
```

点击后：

```text
pourtant

adv.

然而；不过


Il est fatigué,
pourtant il continue.

他很累，不过仍然继续。


[继续]
```

---

# 38. Review 更新

用户点击反馈后：

调用：

```ts
scheduler.next(
  card,
  now,
  Rating.xxx
)
```

获取：

```text
result.card
result.log
```

事务内执行：

```text
更新 cards
+
插入 review_logs
```

必须使用 SQLite transaction。

任何一个失败：

全部回滚。

---

# 39. Review Session 完成

显示：

```text
今日复习完成

共复习 26 个单词

认识     18
模糊      6
不认识    2


[返回首页]
```

同时自动签到。

---

# 40. SQLite 初始化

App root：

使用：

```text
SQLiteProvider
```

Database：

```text
french_words.db
```

初始化：

```text
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
```

创建 migration 机制。

不要在每次启动直接 DROP TABLE。

---

# 41. Schema Version

使用：

```text
PRAGMA user_version
```

例如：

```text
version 1
```

创建：

```text
src/db/migrations.ts
```

未来版本通过 migration 升级。

不能覆盖用户学习记录。

---

# 42. SQLite Schema

## words

```sql
CREATE TABLE IF NOT EXISTS words (
  id TEXT PRIMARY KEY NOT NULL,

  lemma TEXT NOT NULL,
  normalized_lemma TEXT NOT NULL,

  display_form TEXT,

  part_of_speech TEXT,
  gender TEXT,

  primary_meaning_zh TEXT NOT NULL,

  cefr_level TEXT,

  source TEXT NOT NULL DEFAULT 'local',
  source_ref TEXT,

  created_at TEXT NOT NULL
);
```

索引：

```sql
CREATE INDEX IF NOT EXISTS idx_words_lemma
ON words(normalized_lemma);
```

---

# 43. meanings

支持一个词多个释义。

```sql
CREATE TABLE IF NOT EXISTS meanings (
  id TEXT PRIMARY KEY NOT NULL,

  word_id TEXT NOT NULL,

  meaning_zh TEXT NOT NULL,

  order_index INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY(word_id)
    REFERENCES words(id)
    ON DELETE CASCADE
);
```

---

# 44. examples

```sql
CREATE TABLE IF NOT EXISTS examples (
  id TEXT PRIMARY KEY NOT NULL,

  word_id TEXT NOT NULL,

  french TEXT NOT NULL,
  chinese TEXT NOT NULL,

  source TEXT NOT NULL DEFAULT 'local',

  order_index INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY(word_id)
    REFERENCES words(id)
    ON DELETE CASCADE
);
```

---

# 45. word_books

```sql
CREATE TABLE IF NOT EXISTS word_books (
  id TEXT PRIMARY KEY NOT NULL,

  name TEXT NOT NULL,

  level TEXT,

  description TEXT,

  built_in INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL
);
```

---

# 46. word_book_words

```sql
CREATE TABLE IF NOT EXISTS word_book_words (
  book_id TEXT NOT NULL,

  word_id TEXT NOT NULL,

  order_index INTEGER NOT NULL,

  PRIMARY KEY(book_id, word_id),

  FOREIGN KEY(book_id)
    REFERENCES word_books(id)
    ON DELETE CASCADE,

  FOREIGN KEY(word_id)
    REFERENCES words(id)
    ON DELETE CASCADE
);
```

---

# 47. cards

```sql
CREATE TABLE IF NOT EXISTS cards (
  word_id TEXT PRIMARY KEY NOT NULL,

  fsrs_card_json TEXT NOT NULL,

  due_at TEXT NOT NULL,

  last_review_at TEXT,

  first_learned_at TEXT,

  origin TEXT NOT NULL,

  suspended INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL,

  FOREIGN KEY(word_id)
    REFERENCES words(id)
    ON DELETE CASCADE
);
```

索引：

```sql
CREATE INDEX IF NOT EXISTS idx_cards_due
ON cards(due_at);
```

---

# 48. review_logs

```sql
CREATE TABLE IF NOT EXISTS review_logs (
  id TEXT PRIMARY KEY NOT NULL,

  word_id TEXT NOT NULL,

  rating INTEGER NOT NULL,

  context TEXT NOT NULL,

  reviewed_at TEXT NOT NULL,

  fsrs_log_json TEXT NOT NULL,

  FOREIGN KEY(word_id)
    REFERENCES words(id)
    ON DELETE CASCADE
);
```

---

# 49. checkins

```sql
CREATE TABLE IF NOT EXISTS checkins (
  local_date TEXT PRIMARY KEY NOT NULL,

  created_at TEXT NOT NULL
);
```

local_date 格式：

```text
YYYY-MM-DD
```

---

# 50. settings

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
```

默认：

```text
current_book_id = a1-core

daily_new_words = 10
```

---

# 51. sessions

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,

  type TEXT NOT NULL,

  started_at TEXT NOT NULL,

  ended_at TEXT,

  total_count INTEGER NOT NULL DEFAULT 0,

  good_count INTEGER NOT NULL DEFAULT 0,

  hard_count INTEGER NOT NULL DEFAULT 0,

  again_count INTEGER NOT NULL DEFAULT 0
);
```

type：

```text
study
review
```

---

# 52. 搜索历史

```sql
CREATE TABLE IF NOT EXISTS search_history (
  id TEXT PRIMARY KEY NOT NULL,

  query TEXT NOT NULL,

  direction TEXT NOT NULL,

  searched_at TEXT NOT NULL
);
```

只保留最近：

```text
20 条
```

---

# 53. Repository 层

所有 SQL 不要散落在页面中。

创建：

```text
src/repositories/
```

包括：

```text
wordRepository.ts
wordBookRepository.ts
cardRepository.ts
reviewRepository.ts
checkinRepository.ts
settingsRepository.ts
sessionRepository.ts
searchRepository.ts
```

页面禁止直接写复杂 SQL。

---

# 54. Service 层

创建：

```text
src/services/
```

包括：

```text
studyService.ts
reviewService.ts
checkinService.ts
dictionaryService.ts
statsService.ts

fsrs/
  fsrs.ts
  serializeCard.ts

dictionary/
  DictionaryProvider.ts
  LocalDictionaryProvider.ts
  RemoteDictionaryProvider.ts
```

---

# 55. 推荐目录结构

```text
french-words/

app/
  _layout.tsx

  index.tsx

  study.tsx
  review.tsx

  word/
    [id].tsx

  books/
    index.tsx
    [id].tsx

  settings.tsx
  stats.tsx


src/

  components/

    common/
      AppButton.tsx
      ProgressBar.tsx
      Screen.tsx

    home/
      HomeHero.tsx
      Checkin.tsx
      DailyActions.tsx
      BookProgress.tsx
      DictionarySearch.tsx

    word/
      WordPrompt.tsx
      WordAnswer.tsx
      RatingButtons.tsx
      ExampleSentence.tsx

  db/
    database.ts
    migrations.ts

  repositories/

  services/

  types/

    word.ts
    dictionary.ts
    fsrs.ts
    settings.ts
    session.ts

  theme/

    colors.ts
    spacing.ts
    typography.ts

  utils/

    normalizeFrench.ts
    date.ts
    id.ts


assets/

  backgrounds/


content/

  wordbooks/
    a1.sample.json


scripts/

  import-wordbook.ts


server/

  src/
    index.ts
    dictionary/
      pons.ts
      ai.ts
```

---

# 56. UI 色彩

不要固定成蓝白红法国国旗主题。

主页面依赖背景图片。

基础内容页面使用：

```text
Background:
#F6F5F2

Primary text:
#1C1C1C

Secondary text:
#77736D

Surface:
#FFFFFF

Border:
rgba(0,0,0,0.08)

Success:
#367A4A

Warning:
#A27227

Error:
#A94A44
```

Rating Button：

```text
认识
→ 非鲜艳绿色

模糊
→ 非鲜艳琥珀色

不认识
→ 非鲜艳红色
```

避免高饱和游戏 UI。

---

# 57. 字体

使用系统字体。

法语单词：

```text
fontSize: 34～42
fontWeight: 500
```

释义：

```text
20～24
```

例句：

```text
18
lineHeight: 28
```

中文译文：

```text
15～16
```

必须正确显示：

```text
à
â
ç
é
è
ê
ë
î
ï
ô
ù
û
ü
ÿ
œ
```

---

# 58. Rating Buttons

学习/复习页面底部固定按钮：

```text
认识
模糊
不认识
```

保证：

- 单手可点击
- 高度至少 50
- 三个按钮宽度一致
- 不使用小图标替代文字

用户点击一个 Rating 后：

Rating Buttons 消失。

显示：

```text
继续
```

避免重复评分。

---

# 59. 页面状态

Study / Review 页面必须明确支持：

```text
loading
prompt
answer
completed
error
```

不要通过大量 boolean 拼状态。

建议：

```ts
type SessionViewState =
  | "loading"
  | "prompt"
  | "answer"
  | "completed"
  | "error";
```

---

# 60. 防止误操作

用户作答以后：

不能再次修改本次 Rating。

V1 不做 Undo。

以后可以增加。

---

# 61. 离开 Session

用户中途返回首页：

已经完成的 review 立即保存。

未作答当前单词不产生任何记录。

Session 可以结束。

不要求恢复到上次第几词。

---

# 62. 学习统计

Settings 内：

```text
学习记录
```

进入：

```text
/stats
```

只显示简单数据：

```text
累计学习单词
238

今日学习
10

今日复习
26

连续学习
7 天

累计复习
634 次
```

不要做复杂图表。

---

# 63. 设置页面

只包含：

```text
当前词书

每日新词数

学习记录

关于
```

开发环境可以增加：

```text
重置测试数据
```

生产环境必须增加二次确认。

---

# 64. 关于页面

可以放：

```text
French Words

A lightweight French vocabulary app.
```

如果启用 PONS：

加入：

```text
Dictionary powered by PONS
```

并保留相应 attribution。

---

# 65. 性能要求

首页启动后：

不要一次把整个单词数据库读入内存。

所有词书查询使用 SQL。

学习页面：

一次只读取当前 Session 需要的词。

Review：

一次可以加载今日 due cards。

如果 due cards 超过：

```text
500
```

可以先处理前 500。

---

# 66. SQL 安全

所有用户输入：

必须使用 parameterized query。

不要：

```ts
db.execAsync(
  `SELECT * FROM words WHERE lemma='${query}'`
)
```

使用：

```ts
db.getAllAsync(
  "SELECT * FROM words WHERE normalized_lemma = ?",
  normalizedQuery
)
```

---

# 67. 网络状态

查词过程中显示：

```text
正在查询…
```

如果网络不可用：

仍然执行本地搜索。

外部 Provider 失败以后：

不要影响学习和复习功能。

整个学习核心必须完全离线可运行。

---

# 68. 不进行外部搜索的功能

以下功能完全本地：

```text
签到
学习
复习
词书
生词本
FSRS
学习统计
设置
```

只有：

```text
查询本地没有的单词
```

需要联网。

---

# 69. V1 Seed Data

创建：

```text
content/wordbooks/a1.sample.json
```

提供大约：

```text
60～100 个 A1 示例词
```

至少覆盖：

```text
问候
数字
人物
家庭
学校
食物
城市
交通
时间
常见动词
常见形容词
```

要求数据质量：

每个词至少：

```text
lemma
partOfSpeech
一个中文释义
```

名词尽量：

```text
gender
displayForm
```

至少一半提供例句。

这只是开发测试数据。

文件中明确注明：

```text
sample dataset
not final production vocabulary
```

---

# 70. 不要把 Seed Data 写进组件

正确：

```text
JSON
↓
import script
↓
SQLite
↓
Repository
↓
UI
```

错误：

```tsx
const words = [
  ...
]
```

直接写在页面组件。

---

# 71. 首次启动

首次启动：

1. 初始化 DB。
2. 执行 migrations。
3. 检测词书是否已经导入。
4. 如果没有：
   导入 A1 Sample。
5. 创建“我的生词本”。
6. 写入默认 Settings。
7. 打开首页。

第二次启动：

不要重复导入。

---

# 72. 日期处理

数据库时间：

统一保存：

```text
UTC ISO8601
```

例如：

```text
2026-09-19T10:00:00.000Z
```

签到：

单独使用设备 Local Date：

```text
2026-09-19
```

不要使用：

```text
24小时
```

代替自然日。

---

# 73. 错误处理

创建：

```text
src/utils/logger.ts
```

开发环境：

允许 console error。

用户界面只显示：

```text
加载失败，请重试
```

不要向用户暴露：

```text
SQLite error
HTTP 403
JSON parse error
API key invalid
```

---

# 74. 第一阶段开发任务

先只完成基础架构。

实现：

1. Expo 项目。
2. Expo Router。
3. SQLiteProvider。
4. migrations。
5. 数据类型。
6. Repository 层。
7. A1 Sample 导入。
8. 首页静态 UI。
9. 首页真实显示：
   - 当前日期
   - 当前词书
   - 词书进度
   - 今日新词数量
   - 今日待复习数量
   - 签到状态

此阶段不要实现 Study / Review 业务。

验收：

```text
npx expo start
```

无 TypeScript error。

App 可以启动。

关闭重开数据不丢失。

---

# 75. 第二阶段开发任务

实现 Study。

包括：

1. 获取今日新词。
2. Study Session。
3. Word Prompt。
4. 三个 Rating。
5. Word Answer。
6. FSRS createEmptyCard。
7. scheduler.next。
8. Card 持久化。
9. Review Log。
10. Session Summary。
11. 自动签到。
12. 短期强化队列。

验收：

新用户能够连续学习 10 个单词。

学习完返回首页：

```text
词书进度 +10
```

---

# 76. 第三阶段开发任务

实现 Review。

包括：

1. 查询 due cards。
2. 计算 retrievability。
3. 排序。
4. 认识 / 模糊 / 不认识。
5. 更新 FSRS Card。
6. 保存 Review Log。
7. Summary。
8. 首页待复习数字实时更新。

验收：

可以手动修改开发测试数据中的：

```text
due_at
```

使卡片到期。

然后 Review 页面正确出现。

---

# 77. 第四阶段开发任务

实现首页 Search。

先完成：

```text
LocalDictionaryProvider
```

包括：

```text
法语查中文
中文查法语
最近搜索
单词详情
加入生词本
```

此阶段即使没有外部 API：

App 也必须正常运行。

---

# 78. 第五阶段开发任务

实现远程 Dictionary Provider。

包括：

```text
RemoteDictionaryProvider
server /lookup
PONS adapter
AI fallback adapter
```

不要让网络 Provider 和 UI 强耦合。

以后更换词典时：

只替换 Provider。

---

# 79. 测试

至少对以下逻辑增加单元测试：

```text
normalizeFrench()

checkin streak

daily new word selection

FSRS serialization / deserialization

rating mapping

review queue sorting

duplicate word prevention
```

Rating mapping 测试：

```text
不认识 → Again
模糊 → Hard
认识 → Good
```

---

# 80. 必须测试的用户流程

## Flow A：第一次使用

```text
安装
↓
首页
↓
签到
↓
学习
↓
10个新词
↓
学习完成
↓
返回首页
```

首页：

```text
今日已签到
学习进度正确
```

---

## Flow B：关闭 App

```text
关闭
↓
重新打开
```

要求：

```text
签到存在
学习进度存在
Card存在
FSRS状态存在
```

---

## Flow C：复习

使一个 Card 到期。

首页：

```text
复习 1
```

点击：

```text
复习
```

评分：

```text
认识
```

完成。

返回首页：

```text
复习 0
```

Card：

```text
due_at
```

已经更新。

---

## Flow D：查词

首页向下滚动。

输入：

```text
voiture
```

本地找到：

```text
une voiture
汽车
```

点击：

```text
加入生词本
```

进入：

```text
我的生词本
```

可以看到该词。

---

## Flow E：重复加入

再次搜索：

```text
voiture
```

按钮显示：

```text
已加入生词本
```

不能创建第二个 Card。

---

# 81. 编码原则

优先顺序：

```text
正确
简单
稳定
容易维护
视觉干净
```

不要为了所谓企业级架构过度设计。

禁止：

- 巨型 Component
- 巨型 Service
- 任意 any
- UI 中直接 SQL
- UI 中直接调用 PONS
- API Key 放客户端
- 将所有数据载入内存
- 自己实现间隔重复数学算法
- 重复创建同一个 Card

---

# 82. Codex 工作方式

不要一次实现全部需求。

严格按照：

```text
Phase 1
↓
Phase 2
↓
Phase 3
↓
Phase 4
↓
Phase 5
```

执行。

每完成一个 Phase：

1. 运行 TypeScript 检查。
2. 运行已有测试。
3. 启动 Expo。
4. 修复运行错误。
5. 总结本 Phase 创建和修改的文件。
6. 再进入下一 Phase。

---

# 83. 当前立即执行的任务

现在只执行：

```text
Phase 1
```

即：

### 初始化工程

- Expo
- React Native
- TypeScript
- Expo Router
- expo-sqlite
- ts-fsrs

### 创建目录

按照本规格推荐目录结构创建。

### SQLite

实现：

- SQLiteProvider
- database initialization
- WAL
- foreign keys
- migration version 1

### Schema

创建：

- words
- meanings
- examples
- word_books
- word_book_words
- cards
- review_logs
- checkins
- settings
- sessions
- search_history

### 数据

创建：

```text
A1 Sample
```

至少 60 个词。

实现首次启动自动导入。

### 首页

完成真实可运行首页：

- 背景
- 日期
- 签到
- 连续天数
- 学习按钮
- 今日新词数量
- 复习按钮
- 今日待复习数量
- 当前词书
- 当前进度
- 向下滚动后的查词 UI

查词此阶段只需要本地搜索。

### 页面占位

创建但暂不实现完整业务：

```text
study
review
books
settings
stats
word/[id]
```

点击可以进入页面，不允许报错。

---

# 84. Phase 1 完成条件

只有满足以下条件才算 Phase 1 完成：

```text
npx expo start
```

可以正常启动。

无 TypeScript error。

无启动 crash。

数据库创建成功。

A1 Sample 只导入一次。

首页数据来自 SQLite，而不是写死。

签到可以使用。

关闭 App 后签到仍存在。

当前词书能够读取。

首页学习数字正确。

首页复习数字来自 cards 查询。

首页可以向下滚动到查词。

输入本地已有单词可以返回结果。

不要继续实现 Phase 2。

完成后向我报告：

1. 项目目录结构。
2. 安装的依赖。
3. SQLite schema。
4. 已实现页面。
5. 已知问题。
6. 如何运行项目。
7. 下一阶段建议修改的文件。

然后停止。