# Soqaro Lite

<p align="center">
  <b>极简点对点高保真多人同步听歌独立应用</b><br>
  完整继承 Soqaro 全套前端视听与协同界面，基于 WebRTC RTP 与本地 SQLite 实现去中心化、零后端服务器的跨平台同步收听。
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-24292e?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/Platforms-Windows%20%7C%20macOS%20%7C%20Android%20%7C%20Linux-24292e?style=flat-square" alt="Platforms">
  <img src="https://img.shields.io/badge/Database-SQLite-24292e?style=flat-square" alt="SQLite">
  <img src="https://img.shields.io/badge/Engine-WebRTC%20RTP%20Opus-24292e?style=flat-square" alt="WebRTC">
</p>

---

## 核心特性

- **完整迁移 Soqaro 核心前端视听系统**：
  - **声学舞台（Stage）**：包含黑胶唱臂（Vinyl Tonearm）、动态光晕（Vinyl Aura）与同心几何声波曲线。
  - **全能播放底栏（Bottom Player）**：高频进度自驱动控制条、队列抽屉（Queue Drawer）与极简折叠控制器。
  - **沉浸式歌词视效（Immersive Lyrics）**：支持标准 LRC 滚动歌词与 YRC 逐字精准高亮，内置罗马音音译与桌面独立悬浮置顶歌词窗口。
  - **多主题与精细色彩**：内置 Dark、Obsidian、Sage、Midnight、Paper 五大低饱和度工程主题，遵循 Radix UI Colors 色彩规范与 0.5px 精细轮廓。
- **本地原生 SQLite 存储**：
  - 彻底摆脱对云端 PostgreSQL 与 Redis 的依赖。
  - 基于 Tauri 原生 SQLite 插件（`tauri-plugin-sql`），曲目元数据、歌单、播放历史与个性化偏好完全持久化在设备本地 SQLite 数据库中。
- **纯点对点（P2P）零后端运行**：
  - 无需自建任何 Node.js/Go 后端服务器，无音频上传与存储成本。
  - 房主本地音频通过 Web Audio API 硬件级压限防护（Limiter）后，直接经由 WebRTC RTP Opus（48kHz 256kbps 立体声）流式直推给听众端。
- **全平台原生覆盖（Desktop & Mobile）**：
  - **Windows**：NSIS 便携/安装包（`.exe`）与 WiX 安装包（`.msi`），支持 SMTC 系统全局多媒体快捷键与锁屏控件。
  - **macOS**：Universal 原生镜像（`.dmg`），原生适配 Apple Silicon (M 系列) 与 Intel 架构。
  - **Android**：Capacitor 7 原生 Android 客户端（`.apk`），支持前台常驻播放保活、MediaSession 与系统锁屏通知栏播控。
  - **Linux**：免安装通用包（`.AppImage`）与 Debian 安装包（`.deb`）。

---

## 架构模型

```text
[ 本地音乐 (MP3 / FLAC / WAV / OGG / M4A) ]
                   │
                   ▼
     [ 本地 SQLite (soqaro-lite.db) ] (曲库索引 / 歌单 / 偏好持久化)
                   │
                   ▼
          [ Web Audio 总线 ]
                   │
     ┌─────────────┴─────────────┐
     ▼                           ▼
[ 房主本地扬声器输出 ]    [ WebRTC RTP Opus 音频流 (48kHz 256kbps) ]
                                 │
                                 ▼ (P2P 直连)
                      [ 好友/听众端原生播放器 ]
```

---

## 快速开始

### 环境准备

- Node.js 22.x
- pnpm 10.x
- Rust 1.80+ (桌面端打包)
- JDK 21 (安卓端打包)

### 本地开发

```bash
# 1. 安装项目依赖
pnpm install

# 2. 编译共享模型
pnpm --filter @soqaro/shared build

# 3. 启动桌面端开发窗口
pnpm desktop:dev
```

### 本地编译

```bash
# 编译全栈 Web 与静态资源
pnpm --filter @soqaro/web build

# 编译桌面端安装程序 (Windows .exe, macOS .dmg, Linux .AppImage)
pnpm desktop:build
```

---

## GitHub Actions 自动化发布

仓库已集成 `.github/workflows/release-desktop.yml` CI/CD 矩阵发布流水线：
- **触发方式**：推送 Git Tag（如 `git tag v1.0.0 && git push origin v1.0.0`），或在 GitHub Actions 页面点击 **Run workflow**。
- **构建矩阵**：并发构建 Windows、macOS Universal、Linux 与 Android 安装包，并自动发布到 GitHub Releases。

---

## 开源协议

本项目基于 [MIT License](./LICENSE) 开源。
