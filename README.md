# French Words

面向中文母语法语学习者的离线背单词 App，使用 Expo SDK 57、React Native、TypeScript、SQLite 和 ts-fsrs。

## 在 iPhone 上使用

当前可用方式是 **Expo Go 扫码运行**。GitHub 保存源代码，不是 iPhone 安装包。

1. 电脑安装 Node.js 24 LTS；iPhone 在 App Store 安装支持 SDK 57 的 Expo Go。
2. 在电脑打开本项目文件夹，双击 **启动法语背单词.cmd**。首次启动会安装依赖，需联网。
3. 手机与电脑连接同一 Wi-Fi，用 iPhone 相机扫描二维码，选择在 Expo Go 打开。
4. 使用时保持电脑和启动窗口运行。启动器会自动选择端口，或复用已有服务。

想关闭电脑后独立使用，请阅读 [iPhone 安装说明](docs/iphone-install.md)。本仓库提供 EAS 安卓 APK 打包和 GitHub Actions iOS IPA 构建。iOS 采用免费 Apple ID 侧载，需要定期续签；均无需上架应用商店。

## 当前功能

- 首页签到、学习与复习计数、当前词书进度；日期使用设备真实时间。
- 新词依次完成「法语选四个中文意思 → 看中文判断 → 看法语判断」三步，点亮三颗星；失败重新练习。中途退出后恢复本轮进度。
- 每轮新词数在设置中修改，支持正的 5 倍数，从下一轮生效；每天可学习多轮。
- 新词按作答次数安排首次复习：3 次完成为 5 天后，4 次为 3 天后，5 次及以上为次日；首次答错一律次日。
- 全局 FSRS 复习每轮最多 20 词，首次四选一答对直接掌握，否则完成三步。同一词当天不再开启第二次正式复习，本轮练习不重复计入复习次数。
- 四选一答对标绿，700 毫秒后展示详情，也可点「继续」立即展示。答错时错误选项标红、正确选项标绿，法语紧随对应中文显示，点击继续查看详情。
- 「生」只加入生词本；「熟」显示详情后跳过，安排 30 天后复习，停留期间可点继续。生、熟互斥，均可在相应词书撤回；撤回熟词恢复此前安排，有后续真实学习记录时保留最新进度。
- 学习结束可查看总结或开始拼写。拼写支持英文键盘无重音、oe/ae 输入，错词改正后稍后再考，直接拼对才掌握；可确认退出。
- 首页任意位置下拉松手进入独立查词页，向右滑返回。支持法中自动识别、250 毫秒实时候选、重音与连字容错、最多 20 条结果及最近 20 条历史。
- 单词详情、例句及来源署名；名词的 le/la 仅在详情中显示。词书浏览、切换、我的生词本与我的熟词本。

加入生词本只写词书关系，不创建 Card 或复习日志；移除关系不删除单词或学习记录。切换词书只影响新词来源，不影响全局复习。

## 离线数据

内置数据版本以 [manifest](data/generated/manifest.json) 为准：10,767 个词条、14,956 条释义、2,445 个词的例句。正式分级为 A1 624、A2 251、B1 510、B2 906；保留历史示例关系后，App 的 A1 词书共 642 词。

运行时不使用远程词典、AI、账号、服务器或 API Key。首次启动导入内置词库，后续幂等检查。SQLite 自动迁移至 v6，保留原有词条、Cards、日志、签到、轮次和偏好；不要通过清除 App 数据来升级。

- [来源](docs/data-sources.md) · [许可与署名](docs/data-licenses.md) · [词库重建与导入](docs/data-import.md)
- 第三方数据的许可独立于应用代码的 MIT 许可，FLELex 分级数据含非商业条件。
- `data/raw/` 是本地构建输入，不上传 GitHub；内置生成词库随源码提交，因此首次克隆不必重新抓取数据。

## 开发与验证

推荐 Node.js 24 LTS（SQLite 自动测试使用 Node 内置 SQLite）。

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd start -- --go --lan --port 0
```

生产资源编译和完整词库导入验证：

```powershell
npx.cmd expo export --platform ios --platform android --output-dir .verification/native-export
npm.cmd run data:verify
```

没有配置独立 lint 命令。依赖精确版本见 `package-lock.json`。无需 `.env` 文件。

## 目录

| 目录 | 用途 |
| --- | --- |
| `app/` | Expo Router 页面 |
| `src/components/`、`src/hooks/` | 复用界面与交互 |
| `src/services/` | 学习、复习、拼写、查词与 FSRS |
| `src/repositories/`、`src/db/` | SQLite 数据操作、兼容迁移与导入 |
| `content/`、`data/generated/` | 保留的示例数据及内置完整词库 |
| `scripts/` | 一键启动与可重复执行的数据构建工具 |
| `tests/` | 业务与真实 SQLite 回归测试 |
| `docs/` | 当前安装说明、数据说明和历史验收记录 |

`node_modules/`、`.expo/`、`.verification/`、原始下载、个人数据库和签名凭据均不上传。

## 验收与历史

[本次整理报告](docs/cleanup-report.md) · [真机验收清单](docs/device-checklist.md) · [发布检查](docs/release-checklist.md)

本 README 描述当前行为。`docs/phase*-report.md`、原始 V1 规格以及按时间追加的旧验收条目仅保留开发历史；与当前行为冲突时以本 README 和后续更新为准。自动测试与资源编译不等于 iPhone 真机验收。
