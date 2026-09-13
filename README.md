# danmux-renderer —— DanmuX 渐变弹幕播放器渲染层参考实现

从 `danmux-player-demo`(2026-09-07 对照 B 站官方截图逐项校准后定稿)提炼出的**可复用渲染层**:任何播放器按同一套契约渲染 DanmuX 渐变弹幕。零依赖、纯 ES Module,不绑定任何播放器框架。

上游仓库的分工保持不变:**API 只负责输出颜色与 DanmuX 数据;「看起来像 B 站」的全部视觉语义都属本渲染层**。

```text
Danmu API(format=danmux)→ 播放器本渲染层 → Canvas 渐变弹幕
   弹幕获取/转换/效果数据      轨道调度 + 材质绘制      p/m 单色兜底
```

## 快速开始

```powershell
node serve.mjs     # 打开 http://127.0.0.1:4174
```

示例页功能:

- **加载合成样例**:纯虚构弹幕,无任何外部依赖,直接看渐变效果;
- **从 Danmu API 获取**:启动 [danmu_api](https://github.com/xlmc/danmu_api) 后走真实弹幕链路(`format=danmux`);
- **本地视频**:内置 60 秒测试视频(自动播放演示),也可选择任意本地视频文件;
- 视频不可用时自动切换为 `tick()` 虚拟时钟模式,演示「播放器不暴露 video 元素」的接入路径。

原生 video 三行接入:

```js
import { DanmuxCanvasRenderer } from './src/index.js';

const renderer = new DanmuxCanvasRenderer({
  container: document.getElementById('stage'), // 视频+弹幕层共同父容器
  video: document.getElementById('video'),     // 时间源(也可用 getTime)
});
const stats = renderer.load(payload);          // { total, withGradient }
```

## 渐变弹幕实现说明

### 1. B 站原生渐变到底是什么

对照 B 站分段弹幕协议(`DmSegMobileReply`/`DanmakuElem`,参考 bilibili-API-collect):

- 每条弹幕带 `colorful = 60001`(`VipGradualColor`),标识该条是会员渐变弹幕;
- 真正的样式资源在分片响应**根级** `colorfulSrc: DmColorful { type, src }`,实测包含两个资源:
  - `fill_color`:**白色填充纹理**
  - `stroke_color`:**粉→蓝渐变描边纹理**

所以 B 站原生渐变观感的本质是「**白色字芯 + 彩色渐变描边 + 轻阴影/高光**」,而不是把渐变颜色填满整个字。

> 踩坑记录:早期实现把 `#FB7299 → #33B8FF` 整块填充文字,结果颜色发暗、字形发粗,怎么调都不像。后来直接采样官方 `stroke_color` 纹理像素才定位到:渐变只出现在描边上,字芯永远是白的(彩边实测约 `#F2509E → #308BCD`,比接口下发的端点色更浓)。

### 2. 三层链路与职责边界

```text
┌─ 数据层(B站/其它来源)──────────────────────────────┐
│ 原生 colorful=60001 + colorfulSrc 纹理                │
├─ 转换层(danmu_api,format=danmux)──────────────────┤
│ 折叠为 gradient-linear-v1 effect + 保留 p/m 兼容字段   │
├─ 渲染层(本仓库)──────────────────────────────────┤
│ effect.stops → 渐变描边;白芯/阴影/高光/透明度由播放器 │
│ 按 B 站材质确定性复现;不认识 effect 的播放器走 p 单色  │
└──────────────────────────────────────────────────────┘
```

wire 上只传**几何与颜色信息**(类型/方向/色标),不传「白芯、描边厚度、透明度」这类视觉语义——这些是各渲染端对本材质的**确定性复现**,约定俗成,因此不同播放器能得到一致的观感。

### 3. effect 契约(gradient-linear-v1)

只识别一种 effect,字段校验从严,其余形态一律回退、不做部分降级:

```json
{
  "type": "gradient", "target": "fill", "origin": "generated",
  "source": {
    "type": "linear", "angle": 0,
    "stops": [ { "position": 0, "color": "#FB7299" }, { "position": 1, "color": "#33B8FF" } ]
  }
}
```

- `angle=0` 表示文字框从左到右;两色各占一半、中间平滑过渡,**不注入第三色**;
- 单条评论的 effect 非法(缺字段/stops 不足/颜色格式错)→ 整体视为不支持,回退 `p` 第三字段单色,**绝不能影响整批渲染**;
- 普通弹弹play 播放器(不认识 `danmux` 字段)天然只看到 `p/m`,行为与今天完全一致——这就是「dandanplay 兼容 + 可选增强」的分层。

### 4. Canvas 渲染管线(材质复现)

渐变弹幕每帧按固定顺序绘制四层(见 `src/danmux-canvas-renderer.js` 的 `#drawItem`):

```js
// 1) 轻阴影 + 暗色外圈(halo):给字一个柔和的深色底衬
context.shadowColor = 'rgba(0, 0, 0, 0.18)';
context.lineWidth = gradientStrokeWidth + haloExtra;
context.strokeStyle = 'rgba(9, 12, 20, 0.34)';
context.strokeText(text, x, y);

// 2) 渐变描边:严格使用 effect.source.stops(向白混 3% 柔化端点)
context.strokeStyle = createLinearGradient(effect.source);
context.strokeText(text, x, y);

// 3) 白色字芯:fill 盖住描边内半侧,留下柔和的渐变边缘
context.fillStyle = 'rgba(255, 255, 255, 1)';
context.fillText(text, x, y);

// 4) source-atop 叠加极淡的顶部高光,避免暗色视频上白芯显得平板
context.globalCompositeOperation = 'source-atop';
context.fillStyle = glossGradient;   // 白 0.70 → 0.20 → 0
context.fillText(text, x, y);
```

整层以 `globalAlpha = 0.67` 合成(对应 B 站官方播放器默认 67% 不透明度)。普通弹幕走 fallback:`p` 第三字段单色 + 黑描边。

**定稿参数表**(默认值即校准值,调整比例会偏离 B 站观感):

| 参数 | 值 | 说明 |
| --- | --- | --- |
| 整层不透明度 `opacity` | 0.67 | 对齐官方播放器设置 |
| 基准字号 | `width*0.034`,夹在 [18, 42] | 随画布宽度缩放,全屏按官方比例放大 |
| 渐变描边宽 | `fontSize*0.105`(最小 2.7) | 粉蓝过渡区的宽度主体 |
| 暗色外圈 | 描边宽再 + `fontSize*0.025` | `rgba(9,12,20,0.34)` |
| 描边混白 `whiteMix` | 0.03 | 柔化两端饱和色 |
| 高光 `alphaScale` | 0.07(白 0.70→0.20→0) | source-atop,不改几何 |
| 阴影 | alpha 0.18 / blur `fontSize*0.030` / offsetY `fontSize*0.010` | 仅渐变弹幕 |
| fallback 描边 | `fontSize*0.08`,alpha 0.68 | 普通单色弹幕 |
| 滚动寿命 / 静态寿命 | 5.8s / 4.2s | 决定滚动速度 |
| 轨道 | 滚动 8 条 / 静态 3 条,单帧上限 24 | 间距 18px |

### 5. 调度实现(与视觉解耦)

`src/danmux-layout.js` 是纯函数层(零 DOM),对齐成熟弹幕播放器(DPlayer/ArtPlayer danmuku)的调度方式:

1. **时间窗**:按 `p` 第一字段的秒数建升序列表,二分查找 `[now-5.9, now+5.8]` 内的活动弹幕,超出单帧上限丢弃最旧;
2. **轨道分配**:滚动/顶部/底部独立轨道,按文字实际宽度(`measureText` + 内边距)做碰撞检测,从偏好轨道开始找第一条无冲突轨道,全冲突时落冲突最少的轨道(拥挤时弹幕不消失);
3. **速度**:滚动弹幕恒速穿越 `width + 文字宽`,静态弹幕原地驻留 4.2s;
4. 调度输出 `{x, y}` 与轨道号,**任何 2D 绘制栈**(Canvas 2D / Skia / QPainter / OpenGL)都能直接消费。

两条不变式:渲染端**不重新抽概率、不重新选颜色**——渐变与否、颜色端点全部来自 API 的 effect;`angle` 与 stops 之外不发明任何新配色。

## 结构

```text
src/
├── gradient-effect.js       效果契约:解析/校验/颜色工具(纯函数,可移植)
├── danmux-layout.js         调度:时间窗选取 + 轨道避让(纯函数,无 DOM,可移植)
├── danmux-canvas-renderer.js Canvas 2D 材质渲染器(Web 参考实现)
└── index.js                 统一导出
examples/
├── native-video.html        原生 <video> 完整示例(可直接运行,含时钟模式)
├── artplayer.html           ArtPlayer 接入模板
├── dplayer.html             DPlayer 接入模板
├── fixture.js               合成样例数据(纯虚构,验证 fallback 与容错)
└── media/test-video.mp4     本地演示视频(ffmpeg testsrc2 生成,可再生成)
serve.mjs                    本地静态服务器(127.0.0.1:4174,支持 Range)
```

演示视频的再生成命令(imageio-ffmpeg 自带的 ffmpeg 即可):

```powershell
ffmpeg -f lavfi -i "testsrc2=duration=60:size=1280x720:rate=24" `
  -f lavfi -i "sine=frequency=330:duration=60" -shortest `
  -c:v libx264 -pix_fmt yuv420p -crf 28 -c:a aac -movflags +faststart examples/media/test-video.mp4
```

## API

### `new DanmuxCanvasRenderer(options)`

| 选项 | 说明 |
| --- | --- |
| `container` | 必填。视频与弹幕层的共同父容器;为 static 定位时自动改为 relative |
| `video` | 时间源 A:`<video>` 元素,自动监听 play/pause/seeked/timeupdate/ended 并用 rAF 驱动 |
| `getTime` | 时间源 B:`() => 秒`。与 `video` 二选一;调用方用 `tick(now)` 自行驱动 |
| `canvas` | 复用已有 canvas;缺省自建并 `appendChild` 到 container(absolute、不拦截事件) |
| `layout` | 调度参数子集,见 `DEFAULT_LAYOUT` |
| `material` | 材质参数子集,见 `DEFAULT_MATERIAL`(上表全部可覆盖) |
| `useEffects` | 默认 true;关闭后全部走 `p` fallback(调试对比用) |
| `gradientOnly` | 默认 false;true 时只渲染带渐变 effect 的弹幕 |
| `zIndex` | 自建 canvas 的 z-index,默认 2 |
| `onFrame` | 每帧回调 `({ effects, fallback })`,可做 UI 统计 |

### 方法

- `load(payload | array)` → `{ total, withGradient }`
- `setOptions({ useEffects, gradientOnly, layout, material })` 部分更新并立即重绘
- `tick(nowSeconds)` 手动渲染一帧(自定义时钟模式)
- `clear()` / `stop()` / `destroy()`

## 接入其他播放器

任何能拿到「内部 `<video>` 元素 + 一个可定位的父容器」的播放器都能接入(见 `examples/artplayer.html`、`examples/dplayer.html`):

1. 渲染器挂到播放器外壳(与视频同一坐标系);canvas 不拦截事件,不影响控制条;
2. 时间源用 `shell.querySelector('video')`;播放器不暴露 video 元素时改用 `getTime()` + `tick()`;
3. **全屏必须对包含视频与弹幕层的共同父容器请求**,不要用视频原生全屏,否则弹幕层会留在页面里;
4. 关闭播放器自带弹幕,避免叠加;
5. z-index 按播放器层级微调。

## 移植到 iOS / Android(如 Emby 移动端)

调度与契约全部在纯函数层,**移植 = 重写度量 + 绘制两端**:

1. 移植 `gradient-effect.js`(纯解析,直接照抄)与 `danmux-layout.js`(纯几何,`planFrame()` 输出每条弹幕的 `{x, y}` 与轨道);
2. 文字度量换成平台 API(Skia `measureText` / `Paint.measureText`),基准字号同为 `width * 0.034`(夹在 18..42);
3. 绘制映射(Canvas 2D → Skia):
   - `createLinearGradient(stops)` → `SkGradientShader.MakeLinear`(或 Android `LinearGradient`);
   - `strokeText` → `Style.STROKE` 的 `drawText`,字宽 `max(2.7, fontSize*0.105)`,外圈再加 `max(0.9, fontSize*0.025)`;
   - 白芯 → `Style.FILL` 白色 `drawText`;
   - 高光/阴影可先省略,先对齐「白芯 + 渐变描边 + 0.67 透明度」;
4. 时间调度:每帧按播放时间调 `planFrame(now)`;全屏/尺寸变化时重建字号缓存;
5. 数据入口不变:请求 Danmu API `format=danmux`,解析 `p/m` + `danmux.effects`。

定稿参数请通过配置透传,不要散落硬编码。

## 与上游的关系

- 本仓库是播放器侧参考实现,**不属于上游 PR #461([huangxd-/danmu_api](https://github.com/huangxd-/danmu_api))的提交内容**;
- 示例不解析、不代理 Bilibili 播放地址;浏览器唯一数据入口是 Danmu API 的 `/api/v2/comment`;
- `examples/fixture.js` 与 `examples/media/test-video.mp4` 均为程序生成的合成数据,仅用于无 API 环境的本地验证;真实链路验证请使用真实 API 与真实数据。

## 相关仓库

**DanmuX** 弹幕效果数据模型与转换库(npm 包 [`danmux`](https://www.npmjs.com/package/danmux)):https://github.com/xlmc/danmux

