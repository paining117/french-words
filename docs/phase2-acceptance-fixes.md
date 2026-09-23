# Phase 2 真机反馈修复

> 2026-09-20 后续变更：曾选“不认识”的词需要“认识 → 再强化 → 认识”才计入掌握；不限次数，允许短间隔及单词立即重复。本文是首次修复记录，有关该类词的旧完成条件由 [强化规则更新](study-reinforcement-rules.md) 覆盖。

## 修复内容

1. **背景**：抽出 `HomeBackground`，主页继续使用原绿色渐变。学习与复习通过 `LearningScreen` 复用该背景，叠加原生 BlurView 和浅色阅读层。模糊层只覆盖背景，文字和按钮保持清晰；背景延伸到透明导航栏下，正文根据真实导航栏高度避让。
2. **返回文案**：Stack 显式设置 `headerBackTitle: '返回'`，不再使用上一页路由名 index。
3. **掌握进度**：顶部显示 `本轮已掌握数 / 本轮新词数`。只有评分“认识”提交成功才计入，首次认识及强化后认识都有效；“模糊”“不认识”、失败、连点均不增加。每词去重，失败重试遵循已保存的原评分。首次评分计数仍用于配额及原有统计，不再用作掌握进度。
4. **今日累计**：原完成页标题叫“今日学习完成”，但绑定的是本轮 Session.total_count。现改为“本轮学习完成”，其中“今日已学新词”从 SQLite 的本地自然日累计重新查询，包含中途退出的其他轮次；另列本轮掌握和本轮首次评分统计。先学 4 个、重启后学 6 个，应显示今日 10、本轮 6。

“今日已学新词”沿用新词配额口径，即完成首次评分的唯一新词，页面明确说明；“本轮已掌握”要求成功选择认识。队尾间隔不足或到达三次上限时，未掌握词仍交给 FSRS，掌握数不会被强制补满。

## 修改文件

- `app/_layout.tsx`、`app/study.tsx`、`app/review.tsx`
- `src/components/home/HomeHero.tsx`
- 新增 `src/components/common/HomeBackground.tsx`、`LearningScreen.tsx`
- `src/components/word/StudySummary.tsx`
- `src/services/studyService.ts`
- `tests/phase2.test.ts`
- `package.json`、`package-lock.json`：通过 Expo install 新增匹配 SDK 57 的 `expo-blur ~57.0.3`
- README、交付报告入口和验收清单

没有数据库迁移，不重置学习记录；没有实现正式 Review 业务。模糊 API 按 [Expo 57 官方文档](https://docs.expo.dev/versions/v57.0.0/sdk/blur-view/) 接入，Android 传入 BlurTargetView，iOS 使用原生模糊。

## 验证

- `npm run typecheck`：通过。
- `npm test`：29/29 通过，包含原有 Phase 1 回归。
- `expo export --platform android --platform ios`：两端通过；产物位于 `.verification/phase2-acceptance-export/`。
- 现有 8081 开发服务：iOS manifest 与完整开发 bundle 返回 HTTP 200，bundle 包含新掌握进度及模糊组件。
- 真实文件 SQLite 关闭重开测试：先学 4 个、重开学 6 个，完成快照今日累计为 10，本轮为 6。
- 强化由模糊 → 不认识 → 认识才计入掌握；全部不认识始终为 0；短队尾跳过强化也不计为掌握。
- 保存回滚、提交响应丢失、重复点击均验证进度不重复增加。
- 跨午夜测试：本轮 10 个中，昨天首次评分 4 个、今天 6 个，今日累计正确为 6。

自动编译不能替代 iPhone 视觉与触摸验收。手机复验步骤见 device-checklist.md 末尾；本轮未操作用户 iPhone。
