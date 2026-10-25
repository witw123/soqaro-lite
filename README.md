# Soqaro Lite

极简点对点高保真多人同步听歌工具。无需部署任何后端服务器，基于 WebRTC RTP 与 Web Audio API 实现纯前端、去中心化的低延迟音频协同收听。

---

## 核心特性

- **纯前端零后端架构**：无需自建或运行任何后端服务与数据库，开箱即用，支持静态网页托管或打包为桌面应用。
- **WebRTC RTP Opus 高保真推流**：音频源端直接通过 Web Audio API 路由至 WebRTC RTP Opus 媒体轨道（48kHz 256kbps 立体声），毫秒级低延迟传输。
- **本地声学保护与动态防爆音**：集成 DynamicsCompressor 硬件级压限器（Limiter），有效规避音量突变、削波与切歌爆音。
- **数据通道状态时钟同步**：通过 WebRTC DataChannel 实时广播播放状态、曲目名称、精准进度条与时间戳。
- **本地隐私安全**：音频文件仅在本地浏览器中解析与流式分发，没有任何音频文件上传或持久化到云端服务器。
- **收敛克制视觉交互**：遵循 Radix UI Colors 色彩规范与 0.5px 精细轮廓，内置几何动态频谱，杜绝过度渐变与噪点。

---

## 架构原理

```text
[ 房主本地音频文件 (MP3 / FLAC / WAV / OGG / M4A) ]
                      │
                      ▼
             [ Web Audio API ]
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
[ DynamicsCompressor ]     [ AnalyserNode 动态频谱 ]
   (削波与爆音压限保护)
        │
        ├───────────────────────────┐
        ▼                           ▼
[ GainNode 本地监听音量 ]    [ MediaStreamDestination ]
        │                           │
        ▼                           ▼
[ 房主本地扬声器输出 ]        [ WebRTC RTP Opus 音频流 ]
                                    │ (P2P 直连传输)
                                    ▼
                         [ 听众端 HTMLAudioElement ]
```

---

## 快速上手

### 环境要求

- Node.js 20+
- pnpm 9+

### 本地运行

```bash
# 1. 安装依赖
pnpm install

# 2. 启动本地开发服务
pnpm dev
```

启动后在浏览器打开 `http://localhost:5173` 即可。

### 生产构建

```bash
# 构建静态产物
pnpm build

# 预览生产构建
pnpm preview
```

构建生成的 `dist` 目录为纯静态网页，可直接托管于 GitHub Pages、Vercel、Cloudflare Pages，或嵌入 Tauri 打包为跨平台独立桌面程序。

---

## 使用方式

1. **房主发起**：点击「创建同听房间」，系统将生成专属房间口令；点击右上角复制分享链接发送给好友。
2. **导入音乐**：拖拽本地音频文件（或点击添加本地歌曲）进入播放器。
3. **好友收听**：好友打开链接（或输入房间号）即可自动连接并同步收听，双方均可独立调节本地音量。

---

## 开源协议

本项目基于 [MIT License](./LICENSE) 开源。
