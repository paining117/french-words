# 安装包交付（2026-09-24）

版本：1.0.0。无需上架 App Store 或安卓应用商店。

## 文件与下载

| 平台 | 文件 | 大小 | 使用方式 |
| --- | --- | --- | --- |
| Android | French-Words-android.apk | 106,913,602 字节（101.96 MiB） | 下载到安卓手机后直接安装 |
| iOS | French-Words-ios-unsigned.ipa | 13,635,183 字节（13.00 MiB） | 用电脑侧载工具和自己的 Apple ID 签名后安装 |

- [全部安装包与说明（GitHub Release）](https://github.com/paining117/french-words/releases/tag/v1.0.0)
- [安卓 APK 下载](https://github.com/paining117/french-words/releases/download/v1.0.0/French-Words-android.apk)
- [iOS IPA 下载](https://github.com/paining117/french-words/releases/download/v1.0.0/French-Words-ios-unsigned.ipa)
- [安装说明下载](https://github.com/paining117/french-words/releases/download/v1.0.0/INSTALL.md)
- [SHA-256 校验文件](https://github.com/paining117/french-words/releases/download/v1.0.0/SHA256SUMS.txt)
- [安卓构建记录](https://expo.dev/accounts/paining/projects/french-words/builds/78a26718-1e34-447d-90f0-00fab26a9371)
- [iOS 构建记录](https://github.com/paining117/french-words/actions/runs/35884521509)：Actions 临时产物保留 30 天；上方 Release 中的安装包不使用该临时下载入口。
- 本机完整文件：`D:\同济大学\french-words-installers`，含两个安装包、安装说明和 SHA256SUMS.txt。

## iPhone 免费侧载

1. Windows 从 [Sideloadly 官网](https://sideloadly.io/) 安装工具，按官方指引准备 Apple 设备连接组件。
2. iPhone 用 USB 连接电脑，解锁并信任电脑。
3. 把 `French-Words-ios-unsigned.ipa` 拖进 Sideloadly，选择 iPhone。
4. 在工具中输入自己的 Apple ID，点击 Start，按提示完成验证。无需向开发助手提供密码或验证码。
5. 手机如有提示，在「设置 → 通用 → VPN 与设备管理」信任开发者，在「设置 → 隐私与安全性」启用开发者模式并重启。
6. 打开 French Words。运行不需要 Expo Go 或开发服务器。免费签名通常每 7 天需刷新一次，保持同一账号、同一应用标识，不要卸载来续签。

IPA 支持 iOS 16.4 及以上的 arm64 真机。文件未签名，不能在手机浏览器里直接点击安装；上述侧载步骤会完成签名。

## 安卓安装

手机浏览器下载 APK，打开文件，根据系统提示允许此来源安装，然后确认安装。安装后独立运行，不需要 Expo Go 或电脑。以后更新保持 `com.paining.frenchwords` 包名与同一签名密钥，密钥由 Expo 账号管理。

## 验证范围

- EAS Android 原生构建成功，GitHub macOS/Xcode iOS Release 原生构建成功。
- 两个压缩包 CRC 完整性检查通过。
- 安卓包包含 AndroidManifest.xml、内置 JS、原生库及 APK 签名块。
- iOS 包含 iPhoneOS Info.plist、arm64 可执行文件和 main.jsbundle；下载内容与 GitHub 构建端的 SHA-256 一致。
- 尚未在用户手机安装；IPA 签名、设备信任、启动、触摸／键盘及离线运行仍需真机验收。
- 没有商店上传或审核。iOS 免费 Apple ID 侧载需定期续签。

## 校验值

```text
7174c4663f637d8e3b340cf908ce616a283d41eed719c722d377928e985f5c02  French-Words-android.apk
19347b01cc0fd22f4e43c1a21266f9b4ad4c9fc544e66a2ee8a791852873a231  French-Words-ios-unsigned.ipa
```

## 个人进度

Expo Go 和独立 App 的本地数据空间不同，已有学习记录不会自动转移。不要卸载 Expo Go 或清除其数据；当前还没有用户进度导出／导入界面。
