# 日期调试功能删除验收

2026-09-23 已执行源码删除；未发布 App Store/安装包，未进行 iPhone 真机验收。

- [x] 删除 DebugDateDialog.tsx、debugDateService.ts、clockCore.ts。
- [x] 删除首页日期点击、模拟提示、弹窗和时钟订阅；日期只读。
- [x] appNow() 直接返回设备时间，启动不再恢复日期偏移。
- [x] SQLite v5 只清理 dev_date_offset_days，保留 Card、Review Log、轮次、签到和其他设置；升级测试验证保存前后记录一致。
- [x] 日期测试改为真实时钟、跨日、闰年和夏令时业务回归；测试依赖注入不对用户暴露修改时钟能力。
- [x] TypeScript 和自动测试通过，iOS/Android 生产 JS/Hermes 包导出通过。
- [x] 包中不存在日期调试模块、偏移 API 和日期编辑文案。旧键 dev_date_offset_days 仅保留在迁移的 DELETE 语句，用于清理用户遗留设置。
- [x] README 与开发约束已更新。
- [ ] iPhone：首页日期不可修改；退出后台重开仍使用真实日期。
- [ ] iPhone：学习、复习、签到在自然日切换后正确刷新。

没有删除或重排因历史模拟日期已经写入的学习数据。系统会按它们原有的 due 时间处理。
