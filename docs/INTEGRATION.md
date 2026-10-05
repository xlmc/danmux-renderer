# 渐变绘制实现参考

完整播放器接入指南、请求、字段与降级约定维护在 [danmu_api 播放器渐变接入指南](https://github.com/xlmc/danmu_api/blob/main/docs/player-gradient-integration.md)。

| 需要参考的实现 | 代码 |
| --- | --- |
| 效果读取与校验 | [gradient-effect.js](../src/gradient-effect.js) |
| 单条 Canvas 绘制、渐变方向与端点 | [canvas-painter.js](../src/canvas-painter.js) |
| 白芯、描边、透明度和高光等视觉参数 | [material.js](../src/material.js) |
| 在宿主画布上调用、原绘制兜底 | [轻量示例](../examples/existing-canvas.html) |
| 可选的完整调度与生命周期 | [danmux-canvas-renderer.js](../src/danmux-canvas-renderer.js) |

Canvas 示例传文字框左侧 x 与中线 y，沿用宿主字体、缩放和透明度。其他绘制栈需转换自己的字形基线，并对应文字度量、渐变创建和填充/描边 API。轻量绘制没有额外时钟、网络请求或自有画布资源。

测试样例展示效果与降级，完整 video 示例展示时间同步。这些代码提供实现参考；具体播放器需要在自身构建中检查接口解码、播放操作与画面。接入检查项见 [API 指南](https://github.com/xlmc/danmu_api/blob/main/docs/player-gradient-integration.md#6-接入检查)。
