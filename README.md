# danmux-renderer

本仓库提供 danmu_api 渐变弹幕的技术方案、iOS/macOS Swift、Android/Kotlin 与 Canvas 2D 参考代码，以及 PC 绘制 API 映射，供播放器作者复用现有文字绘制入口。

**播放器接入从 [danmu_api 渐变接入指南](https://github.com/xlmc/danmu_api/blob/main/docs/player-gradient-integration.md) 开始。** 请求、开关、响应字段及降级约定在该指南维护；这里说明具体怎样绘制。

## iOS / Android / PC 通用接入

[通用原生绘制参考](docs/NATIVE_INTEGRATION.md) 展示同一套字段保留、文字准备和原填充步骤。[Kotlin](mobile/android/README.md) 与 [Swift](mobile/apple/README.md) 提供可复制文件；[PC 接入](docs/DESKTOP_INTEGRATION.md) 给出 Avalonia、Direct2D 和 Qt 片段。按宿主现有绘制栈选择入口，沿用原模型、字体、透明度、缓存和调度，无需 JS 运行时或统一播放器 SDK。

构建与共享契约、原生图形测试方法见对应 README。PC / Flutter 片段需在宿主构建中验证；此参考不表示已在 Sen/Hills 或其他播放器完成实际接入。

## 绘制实现

### 在现有文字绘制入口调用

读取评论数据后，复用播放器提供的 Canvas 上下文和文字位置：

```js
import { drawDanmuxComment } from 'danmux-renderer/paint';

// 在现有单条弹幕绘制入口调用，位置/字体/时间都由原播放器决定。
const result = drawDanmuxComment(ctx, comment, {
  x, y, fontSize, font: ctx.font,
  opacity: ctx.globalAlpha,
});
if (!result.handled) {
  originalDrawComment(ctx, comment, x, y); // 原有单色逻辑保持不变
}
```

- 坐标约定：`x` 为文字框左侧，`y` 为文字中线；宿主若用字形基线，需先转换。尺寸与坐标使用当前 Canvas 坐标单位，DPR/缩放由宿主负责。
- 组件不创建 canvas、不注册事件、不启动时钟、不请求网络、不重新抽概率、不管理轨道。
- 绘制保存/恢复 Canvas 状态；返回 `handled=false` 时不绘制、不修改上下文，由宿主兜底。不要在 `handled=true` 后再次绘制同一条弹幕。
- `fallback:'draw'` 可选择组件的基础绘制；默认 `fallback:'host'` 保留原播放器样式。
- 支持 `font`、`fontSize`、`width`、`height`、`opacity`、`strokeWidth`、`useEffects`、`material`。默认透明度继承 `ctx.globalAlpha`；调用方可提供文字框宽高以复用现有度量。
- 无组件自有资源，因此轻量入口不需要 destroy。宿主继续按自己的生命周期清理 Canvas、字体缓存和事件。

运行 `npm run demo`，打开 [轻量接入示例](http://127.0.0.1:4174/examples/existing-canvas.html)。示例复用同一块宿主画布，展示开关、非法效果和未知版本的原绘制兜底。

### 完整调度演示

```js
import { DanmuxCanvasRenderer } from 'danmux-renderer';
const renderer = new DanmuxCanvasRenderer({ container, video });
renderer.load(payload); // { total, withGradient }
// 播放器销毁时
renderer.destroy();
```

`load` 接受普通 `{comments:[...]}` 或评论数组，也兼容原有增强输出。完整入口提供轨道与时钟；只有采用整套替换方案时才关闭播放器原弹幕，避免重复。

| 选项 | 说明 |
| --- | --- |
| container | 视频和弹幕共同父容器，必填 |
| video | 可选 HTMLVideoElement，自动跟随播放/暂停/拖动 |
| getTime | 可选秒数回调，无 video 时通过 `tick(now)` 驱动 |
| canvas | 可选宿主画布；destroy 不移除宿主传入的画布 |
| useEffects / gradientOnly | 默认 true / false |
| layout | scrollLifetime/staticLifetime、轨道数量、密度等，见 DEFAULT_LAYOUT |
| material | 字号、透明度、材质预设等，见 DEFAULT_MATERIAL |
| zIndex | 自建画布层级，默认 2 |
| onFrame | 回调 `{effects,fallback}` |

方法：`load`、`setOptions`、`tick`、`clear`、`stop`、`destroy`。视频倍速使用媒体 currentTime，不自建速度乘数。全屏应进入包含视频与弹幕的共同容器；视频原生全屏不保证包含网页弹幕层。

示例：`native-video.html`（本地视频/虚拟时钟）、`artplayer.html`、`dplayer.html`。后两者是模板，不代表完成第三方版本兼容验收。

## 视觉实现与预设

`material.profile:'wire'` 是默认实现：将读取到的填充和描边效果分别交给 Canvas 的 `fillText` 和 `strokeText`。渐变几何见 [canvas-painter.js](src/canvas-painter.js) 的 `createLinearGradient`：按文字框尺寸计算方向和端点，再添加服务端提供的色标。

`material.profile:'bilibili'` 是显式视觉预设，采用白色字芯、柔化的渐变描边和高光，沿用旧 demo 参数。可用 `material:{profile:'bilibili'}` 选择；完整旧示例使用此预设。具体参数见 [material.js](src/material.js)。

按播放器自己的绘制栈实现时，替换文字度量、线性渐变创建和文字填充/描边调用即可；已有弹幕系统继续提供位置、字体与时间。参考代码中的服务端字段读取规则以 [API 接入指南](https://github.com/xlmc/danmu_api/blob/main/docs/player-gradient-integration.md#3-最小字段约定) 为准。

## 安装与验证

尚未发布 npm 包；可从 GitHub 安装源码版本（生产建议锁定已验证 commit）：

```sh
npm install github:xlmc/danmux-renderer
```

仓库维护验证：

```sh
git clone https://github.com/xlmc/danmux-renderer.git
cd danmux-renderer
npm ci --ignore-scripts
npm run check
npm run check:contract
npm run check:package
npm run typecheck
```

零运行时依赖，ES Module；类型检查使用 TypeScript 开发依赖。静态页面可直接相对导入 `../src/paint.js`，不依赖 bundler。

JS 验证器直接来自 DanmuX 的可移植源码，随包附 MIT 许可证、commit 和按 LF 规范化的 SHA-256 清单。共享样例在 DanmuX `fixtures/client-linear-v1.json`，此包携带相同副本。Kotlin / Swift 是独立的最小线性填充移植，通过共享样例和从 JS 验证器生成的边界样例对照测试约束行为；不宣称整个 DanmuX 协议等价。

维护者用 `node scripts/sync-contract.mjs <danmux目录>` 同步，再运行 `npm run check:contract -- <danmux目录>`、全部测试和打包检查。CI 检查清单哈希及共享行为，更新必须显式评审，不自动追踪上游 main。

维护者可执行 `node scripts/check-api.mjs <danmu_api目录>`，用实际服务端转换/普通 JSON 输出验证开关、零概率和偏移后效果可被 renderer 读取（本地合成输入，不访问上游平台）。

播放器接入检查统一见 [API 接入指南](https://github.com/xlmc/danmu_api/blob/main/docs/player-gradient-integration.md#6-接入检查)；绘制代码索引见 [实现参考](docs/INTEGRATION.md)。
