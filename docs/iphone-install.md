# iPhone 安装与运行

截至本次整理，项目是源代码，尚无签名 IPA、TestFlight 邀请链接或 App Store 下载页面。上传 GitHub 不会自动生成这些内容。

## 现在就能使用：Expo Go

无需 Apple Developer 付费会员。

1. iPhone 打开 App Store，安装／更新 Expo Go。项目要求它支持 Expo SDK 57。
2. 电脑打开 `french-words` 文件夹，双击 `启动法语背单词.cmd`。首次使用另一台电脑时先安装 Node.js 24 LTS。
3. 电脑与手机连同一个 Wi-Fi，等待启动窗口出现二维码。
4. 用 iPhone 系统相机扫码，点击「在 Expo Go 中打开」；如询问本地网络权限，允许访问。
5. 等待首次词库准备完成，即可开始使用。以后仍使用这个启动文件，不需重新下载源码。

不要在 iPhone 上下载 GitHub ZIP 后尝试安装：ZIP 是代码，不是 App。开发扫码方式依赖电脑服务，不能作为稳定的脱离电脑安装方式。手机和电脑同一局域网即可连接，但首次安装依赖仍需互联网。

若扫不开，先核对两端 Wi-Fi、Expo Go 版本、本地网络权限，以及电脑防火墙是否允许 Node 的专用网络访问。不要清除 Expo Go 数据来排查，以免丢失本地学习记录。

## 独立 App：完成签名后安装

要让桌面出现独立 French Words 图标、关闭电脑仍能学习，需要构建包含代码和词库的 iOS App。Windows 可用 Expo EAS 的云端 iOS 构建；此流程需要 Expo 账号和有效的 Apple Developer 付费会员。是否开通由你决定，本次未购买会员或提交付费构建。

个人设备测试可选 EAS 内部分发：

1. 开通会员后，在电脑登录 Expo，连接你自己的项目。
2. 注册要安装的 iPhone；用手机打开注册链接，按官方提示完成设备登记。
3. 为本项目确定唯一的 iOS Bundle Identifier，并生成签名。不要更换已有正式 App 的标识来更新它。
4. 使用仓库的 `preview` 配置构建。
5. 构建成功后在已登记的 iPhone Safari 中打开 EAS 安装链接，点击 Install。按 iOS 提示完成信任／开发者模式设置（如要求）。

供后续实际打包时使用的命令如下；当前没有会员，不必现在执行：

```powershell
cd D:\同济大学\french-words
npx.cmd eas-cli@latest login
npx.cmd eas-cli@latest build:configure
npx.cmd eas-cli@latest device:create
npx.cmd eas-cli@latest build --platform ios --profile preview
```

`eas.json` 只提供打包方式。Expo 项目关联、Apple 登录和签名需由账号本人完成，不要把密码、证书或令牌写进仓库。内部分发只允许签名中登记的设备安装，证书／描述文件过期后需重新签名；不是永久免维护安装。[Expo 内部分发说明](https://docs.expo.dev/build/internal-distribution/)

若希望通过 TestFlight 安装：使用 `production` 构建并提交 App Store Connect，再邀请测试者；手机安装 TestFlight、接受邀请、点击安装。TestFlight 构建有有效期，外部测试还涉及 Apple 审核；这不是直接上架 App Store。[Expo iOS 提交说明](https://docs.expo.dev/submit/ios/)

## 没有会员的其他途径

拥有 Mac 时可以通过 Xcode 的免费个人签名在自己的 iPhone 上做开发测试，受设备、能力及签名有效期限制，通常需要每 7 天重新签名。Windows 本身没有 Xcode，当前项目也没有预制的已签名安装包。[Apple 开发者账户说明](https://developer.apple.com/help/account/basics/about-your-developer-account)

对当前 Windows 环境，继续 Expo Go 是现成可用的方式；需要独立安装时再准备开发者会员与 EAS 构建。

## 学习记录

本 App 的学习记录在手机本地 SQLite，GitHub 不备份个人学习数据。Expo Go 和独立 App 使用不同的应用存储空间，现有记录不会自动迁移。当前没有导出／导入个人进度的界面；要保留已积累记录，应先规划迁移，再更换安装方式或卸载 Expo Go。
