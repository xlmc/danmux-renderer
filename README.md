# danmux-renderer

给需要适配 DanmuX 的播放器提供效果实现、可复用绘制入口和接入示例。不是视频播放器，也不要求已有播放器替换弹幕调度。

三个项目分工：
- [danmu_api](https://github.com/xlmc/danmu_api)：按服务器开关/概率输出最终弹幕数据。
- [DanmuX](https://github.com/xlmc/danmux)：定义数据契约、效果校验及降级规则。
- 本仓库：把效果画出来，并提供播放器接入方式。

当前交付是 **Web Canvas 2D 实现**。Sen/Hills 的原生适配未完成，需要取得客户端响应模型及绘制接口；不能把 Web 示例、合成数据或可移植说明视为原生客户端验收。

## 接入路径 A：已有弹幕系统（优先推荐）

无需更换请求 URL，也无需开启 `format=danmux`。服务端普通 JSON 的每条评论保留 `p/m`，可选附加 `danmux`。

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

## 接入路径 B：需要完整弹幕层

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

## 协议与材质分离

默认 `material.profile:'wire'`：
- linear fill → 渐变填充；linear stroke → 渐变描边，字芯保持 Base 颜色。
- angle 0° 向右、顺时针；严格使用服务端 stops 与 alpha。
- extensionVersion 必须为 1；未知版本、纹理、非法效果降级。每个效果独立隔离；不下载远程纹理。

`material.profile:'bilibili'` 是 **显式的视觉预设**：把线性填充效果用于白芯＋渐变描边、柔化、高光，沿用旧 demo 参数。它不是 `target:fill` 的通用协议含义，也不代表还原所有 B 站原生纹理。完整旧示例明确选择此预设，通用接入不自动选择。

迁移旧代码：如要保留原观感，构造时加 `material:{profile:'bilibili'}`；旧无版本合成数据需补 `danmux.extensionVersion:1`。不要自动把缺失版本当 v1，否则无法保证版本隔离。

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

验证器直接来自 DanmuX 的可移植源码，随包附 MIT 许可证、commit 和按 LF 规范化的 SHA-256 清单，避免独立手写两套协议。共享样例在 DanmuX `fixtures/client-linear-v1.json`，此包携带相同副本。

维护者用 `node scripts/sync-contract.mjs <danmux目录>` 同步，再运行 `npm run check:contract -- <danmux目录>`、全部测试和打包检查。CI 检查清单哈希及共享行为，更新必须显式评审，不自动追踪上游 main。

维护者可执行 `node scripts/check-api.mjs <danmu_api目录>`，用实际服务端转换/普通 JSON 输出验证开关、零概率和偏移后效果可被 renderer 读取（本地合成输入，不访问上游平台）。

详见 [接入验收清单](docs/INTEGRATION.md)。
