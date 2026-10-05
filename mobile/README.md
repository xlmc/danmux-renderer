# 移动端渐变实现参考

接入字段、开关和降级规则以 [danmu_api 移动端接入说明](https://github.com/xlmc/danmu_api/blob/main/docs/mobile-gradient-integration.md) 为准。本目录提供独立于播放器的绘制参考，不创建播放器、轨道、网络客户端或缓存系统。

## 两个可替换的入口

```text
加载评论 → 读取可选样式 → 使用宿主文字尺寸准备渐变
每帧绘制 → 使用准备好的渐变填充 → 原绘制负责位置和时间
```

解析结果只描述颜色、色标和方向。文字、单色、字号、轨道、时间偏移、屏蔽、合并和透明度仍使用宿主已有逻辑。无合法支持效果时返回空样式，保留宿主的单色分支。

| 绘制栈 | 准备阶段 | 绘制阶段 |
| --- | --- | --- |
| Android Canvas | 使用文字框尺寸创建 `LinearGradient` | 在原填充 `Paint` 上临时设置 shader，绘后恢复 |
| Flutter 文本/Canvas | 使用已度量文字框创建 `Gradient.createShader` | 将 shader 用于文字前景 Paint；已有图片/图集路径在生成文字图像时应用 |
| iOS Core Graphics | 使用色标创建 `CGGradient`，计算文字框内端点 | 利用原文字绘制生成文字裁剪/蒙版，再绘制渐变；宿主管理基线和图形状态 |

当前可构建代码是 [Android/Kotlin 参考](android/README.md)。Flutter/iOS 行是 API 映射方向，不代表提供了可运行移植或客户端兼容验证。实现图片缓存的播放器可在原光栅化阶段应用渐变，继续使用自己的图片移动、图集和淘汰机制。

## 参考来源与适用边界

LinPlayer 的 [接口解析](https://github.com/zzzwannasleep/linplayer/blob/78af5215aaa7b9e3f81014b090d8d55cbabf11c0/core/danmaku/client.go)、[内部传递](https://github.com/zzzwannasleep/linplayer/blob/78af5215aaa7b9e3f81014b090d8d55cbabf11c0/core/player/danmaku_feed.go) 和 [Canvas 绘制](https://github.com/zzzwannasleep/linplayer/blob/78af5215aaa7b9e3f81014b090d8d55cbabf11c0/apps/android/app/src/main/kotlin/xyz/linplayer/app/ui/player/DanmakuLayer.kt) 展示了播放器如何把 API 返回值转换成内部模型，再送到绘制层。这提示接入时需要检查整个数据通路，而不仅是最后的画笔。

NipaPlay 的 [评论转换](https://github.com/AimesSoft/NipaPlay-Reload/blob/c0d563422faa27ac4d8c23aa29d185f59bc34088/lib/services/dandanplay_service_io.dart) 和 [图集绘制](https://github.com/AimesSoft/NipaPlay-Reload/blob/c0d563422faa27ac4d8c23aa29d185f59bc34088/lib/danmaku_next/danmaku_atlas_painter.dart) 提供了转换后缓存、文字预生成的另一种实例。

这些项目用于理解常见接入步骤。本目录不包含它们的专用补丁，也不复制其调度或布局代码。Sen/Hills 等客户端使用什么渲染栈，以及是否能使用上述入口，需由相应客户端构建验证。
