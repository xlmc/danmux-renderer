# 通用原生绘制参考：iOS、Android、PC

完整接入步骤与字段约定见 [danmu_api 通用客户端指南](https://github.com/xlmc/danmu_api/blob/main/docs/client-gradient-integration.md)。这里说明如何把同一份线性填充交给宿主绘制 API。LinPlayer、NipaPlay 用于理解常见数据链路，不要求复制它们的播放器实现。

## 接入者需要增加什么

1. 原单条评论保留可选样式，转换、缓存或跨语言时带着它传递。
2. 原文字准备时读取一次样式，以原文字框准备渐变；普通弹幕仍用原路径。
3. 原填充入口使用准备好的渐变，没有支持效果时仍画原单色。

时间、轨道、暂停/拖动、文字度量、字体和图片缓存继续由宿主提供。参考代码只增加样式解析与填充，不需要新时钟或常驻请求。

| 宿主绘制栈 | 准备阶段 | 原绘制入口 | 代码/片段 |
| --- | --- | --- | --- |
| Android Canvas | 读取样式并创建 shader | 替换原填充 drawText 调用；保留原基线、对齐和 Paint.alpha | [Kotlin](../mobile/android/README.md) |
| iOS / macOS Core Graphics | 读取样式并准备渐变、原文字填充 alpha 图像 | 在原文字框 clip 到 alpha，再画渐变；失败调用原填充 | [Swift](../mobile/apple/README.md) |
| Windows Direct2D / DirectWrite | 准备 ID2D1LinearGradientBrush | 原 DrawTextLayout/DrawGlyphRun 换 brush | [PC](DESKTOP_INTEGRATION.md) |
| Windows / Linux / macOS Avalonia 或 Qt | 准备 LinearGradientBrush / QBrush | 原 glyph/path 填充换 brush | [PC](DESKTOP_INTEGRATION.md) |
| Flutter 文本 / Canvas | 原文字框创建 `Gradient.createShader` | 原文字前景 Paint，或原图片生成阶段 | 下方 Flutter 片段 |
| 已有 GPU 文字图片 / 图集 | 在原文字光栅化阶段填充渐变 | 原图片移动与图集绘制继续使用 | [PC 图片缓存说明](DESKTOP_INTEGRATION.md#macos--core-graphics-与图片缓存) |

选择依据是现有绘制栈，不是操作系统。Kotlin / Swift 是可复制源文件，不要求所有平台安装同一 SDK。PC / Flutter 片段展示映射方法，需按实际宿主 API 与版本构建验证。

## Flutter 文字前景入口

[TextStyle.foreground](https://api.flutter.dev/flutter/painting/TextStyle/foreground.html) 接受 Paint；使用它时不要同时设置 color。先根据宿主文字框创建 `ui.Gradient.linear(start, end, colors, positions)`，将其设置到 foreground Paint，再交给原 TextPainter/Paragraph。在宿主已有样式构造处选择 `color:baseColor` 或 `foreground:gradientPaint` 两个互斥分支；`copyWith(color:null)` 可能保留旧 color，不能用它保证清空旧颜色。

既有 Paragraph/图集路径应在原文本段构造处应用 foreground，仅渐变正文，独立计数、阴影或原色 emoji 继续沿用原样式。这里提供绘制 API 映射，不包含 Dart 校验器或完整 Flutter 播放器接入。

## 所有平台保持相同的三个约定

- 数据：复用原 `p/m`，扩展缺失、非法或不支持时基础评论仍存在。只需先支持 v1 线性填充。
- 几何：使用宿主文字框，按 [共同端点公式](https://github.com/xlmc/danmu_api/blob/main/docs/client-gradient-integration.md#所有平台相同的渐变几何) 计算，再映射实际 y 轴、位置与缩放；不要用整个视频框。
- 生命周期：按样式、文字和度量结果准备一次，使用宿主已有缓存；样式或尺寸变化时重建，绘后恢复图形状态。

Kotlin 和 Swift 校验使用同一组由 `scripts/native-contract.mjs` 从共享 fixtures / JS 验证器生成的输入和预期。其他语言可用这些样例校验最小读取规则；不用为接入完整的网络协议、调度或字体系统另写一套实现。

宿主播放、字体/基线、缓存变化和设备性能仍须实际验收。参考库构建或图形测试不能证明 Sen/Hills 或其他客户端已经适配。
