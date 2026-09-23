# iPhone 安装与运行

本项目不要求上架应用商店：安卓使用可直接安装的 APK，iOS 使用个人 Apple ID 签名后的 IPA。构建文件与手机真机安装是两个步骤。

## 现在就能使用：Expo Go

无需 Apple Developer 付费会员。

1. iPhone 打开 App Store，安装／更新 Expo Go。项目要求它支持 Expo SDK 57。
2. 电脑打开 `french-words` 文件夹，双击 `启动法语背单词.cmd`。首次使用另一台电脑时先安装 Node.js 24 LTS。
3. 电脑与手机连同一个 Wi-Fi，等待启动窗口出现二维码。
4. 用 iPhone 系统相机扫码，点击「在 Expo Go 中打开」；如询问本地网络权限，允许访问。
5. 等待首次词库准备完成，即可开始使用。以后仍使用这个启动文件，不需重新下载源码。

不要在 iPhone 上下载 GitHub ZIP 后尝试安装：ZIP 是代码，不是 App。开发扫码方式依赖电脑服务，不能作为稳定的脱离电脑安装方式。手机和电脑同一局域网即可连接，但首次安装依赖仍需互联网。

若扫不开，先核对两端 Wi-Fi、Expo Go 版本、本地网络权限，以及电脑防火墙是否允许 Node 的专用网络访问。不要清除 Expo Go 数据来排查，以免丢失本地学习记录。

## 独立 App：免费 Apple ID 侧载（当前选择）

不上架也能安装。当前选择生成 **未签名的 iPhone 真机 IPA**，再由侧载工具用你自己的 Apple ID 签名并安装。它不是模拟器文件，但也不能在 Safari 中点一下就直接装。

1. 在 Windows 从 [Sideloadly 官方网站](https://sideloadly.io/) 下载并安装工具，按其官方指引准备 Apple 设备连接组件。
2. 用 USB 将 iPhone 连接电脑，解锁手机并选择「信任此电脑」。
3. 下载本项目的 `French-Words-ios-unsigned.ipa`，拖入 Sideloadly。
4. 选择自己的 iPhone，输入自己的 Apple ID，点击 Start，按提示完成账号验证。密码与验证码只在你选择的工具中输入，不要发到聊天或上传 GitHub。
5. 根据手机提示，在「设置 → 通用 → VPN 与设备管理」信任自己的开发者；如要求，在「设置 → 隐私与安全性」开启开发者模式并重启。
6. 打开桌面上的 French Words。运行时无需 Expo Go，也无需保持开发服务器运行。
7. 免费签名通常 7 天有效，需在到期前使用同一 Apple ID 和相同应用标识重新签名／刷新。可配置工具的自动刷新，但仍应留意续签是否成功。不要通过删除 App 来续签，以免丢失进度。

Sideloadly 是第三方工具；官方说明支持 Windows、免费 Apple ID 和 IPA 侧载。[工具说明](https://sideloadly.io/) Apple 的个人开发签名存在 7 天有效期和 App 数量限制。[Apple 账户说明](https://developer.apple.com/help/account/basics/about-your-developer-account)

iOS IPA 由 GitHub Actions 的 macOS/Xcode 环境编译，工作流为 **Build iOS IPA for sideloading**。它只在手动触发时运行，产物保留 30 天，不读取 Apple 账号或签名凭据。签名与真机安装由用户完成后，才算完整 iPhone 安装验收。

## 可选：会员内部分发

以后如开通 Apple Developer 付费会员，可使用 EAS `preview` 配置生成已签名 IPA，登记 iPhone 后从构建链接安装，不需要 App Store 或 TestFlight。未登记的设备不能安装，签名也有有效期。[Expo 内部分发说明](https://docs.expo.dev/build/internal-distribution/)

```powershell
npx.cmd eas-cli@latest login
npx.cmd eas-cli@latest device:create
npx.cmd eas-cli@latest build --platform ios --profile preview
```

本项目已关联 Expo 的 `@paining/french-words`，应用标识为 `com.paining.frenchwords`。其他人 fork 项目时须关联自己的 Expo 项目，不要覆盖现有正式 App 的标识或签名。

## 安卓 APK

安卓构建使用 EAS `preview` 配置，生成包含代码与词库的 APK，不是仅供商店分发的 AAB。

```powershell
npx.cmd eas-cli@latest build --platform android --profile preview
```

下载 APK 到安卓手机，点击文件，按系统提示允许该下载来源安装应用，再确认安装。之后可独立打开，无需 Expo Go 或电脑。更新时保持同一包名和签名；安卓签名密钥由本次使用的 Expo 账号管理，不放入源码仓库。

## 学习记录

本 App 的学习记录在手机本地 SQLite，GitHub 不备份个人学习数据。Expo Go 和独立 App 使用不同的应用存储空间，现有记录不会自动迁移。当前没有导出／导入个人进度的界面；要保留已积累记录，应先规划迁移，再更换安装方式或卸载 Expo Go。
