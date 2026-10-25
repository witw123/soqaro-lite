# Soqaro Lite

跨平台点对点（P2P）音频同步收听工具。

无需部署中心化服务端，房主播放本地音频，听众通过点对点直连实时收听，数据与配置保存在本地设备。

## 功能

- **点对点同步**：房主直接将音频流同步给听众，无中心服务器中转。
- **本地存储**：基于本地 SQLite 存储曲库、歌单与播放历史，无需联网鉴权与云端数据库。
- **界面与交互**：支持播放控制、播放队列、封面黑胶展示与主题切换。
- **歌词显示**：支持滚动歌词、逐字高亮与桌面悬浮歌词窗口。
- **全平台支持**：支持 Windows、macOS、Linux 与 Android。

## 安装包下载

各平台安装包可在 [Releases](https://github.com/witw123/soqaro-lite/releases) 页面获取：

| 平台 | 安装包格式 | 说明 |
| :--- | :--- | :--- |
| **Windows** | `.exe` (安装程序) / `.msi` | 适用于 Windows 10 及更高版本，支持多媒体按键与系统播控 |
| **macOS** | `.dmg` (Universal) | 适用于 macOS 11 及更高版本，支持 Apple Silicon 与 Intel 芯片 |
| **Linux** | `.AppImage` / `.deb` | 适用于主流 Linux 发行版 |
| **Android** | `.apk` | 适用于 Android 8.0 及更高版本，支持后台常驻播放与锁屏通知栏 |

## 使用方式

1. **房主**：打开应用，导入本地音频文件并创建房间，将连接代码或邀请链接分享给好友。
2. **听众**：打开应用，输入房间代码加入，即可实时同步收听房主当前播放的音频。

## 本地开发

### 环境要求

- Node.js 22+
- pnpm 10+
- Rust 1.80+（构建桌面端）
- JDK 21（构建 Android 端）

### 常用命令

```bash
# 安装依赖
pnpm install

# 编译共享库
pnpm --filter @soqaro/shared build

# 启动桌面端开发预览
pnpm desktop:dev

# 打包全栈静态资源
pnpm --filter @soqaro/web build

# 打包桌面端应用程序
pnpm desktop:build
```

## 协议

本项目基于 [MIT](LICENSE) 协议开源。
