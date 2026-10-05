# Android 渐变填充参考

这两个 Kotlin 文件可复制进现有 Android 工程并调整 package，也可将本目录作为本地 Android library 使用。运行时只依赖 Android SDK 与 Kotlin 标准库；没有新增网络、播放器或渲染引擎依赖。完整接入说明见 [danmu_api 移动端指南](https://github.com/xlmc/danmu_api/blob/main/docs/mobile-gradient-integration.md)。

- [GradientStyle.kt](src/main/kotlin/io/github/xlmc/danmu/gradient/GradientStyle.kt)：读取可选扩展，校验线性填充，稳定排序色标和计算端点。
- [GradientPainter.kt](src/main/kotlin/io/github/xlmc/danmu/gradient/GradientPainter.kt)：准备 shader，在宿主绘制期间应用并恢复。

## 加载及准备

普通 `Canvas.drawText` 路径只需：加载时保存一个可选样式，在原文字准备时创建 prepared，在原填充入口调用 `GradientPainter.drawText`。没有合法效果时自动执行原 `Canvas.drawText`，接入者无需另写降级分支。

沿用现有 `p/m` 解析。在评论转换为内部模型时保留一个可选样式属性：

```kotlin
val gradientFill = GradientStyle.readFill(rawComment.optJSONObject("danmux"))
// 将 gradientFill 附在宿主的单条评论上，不改 time/text/mode/color。
```

若宿主用 JSON 字符串跨语言或从磁盘读回可选扩展，可用 `GradientStyle.readFillJson(extensionJson)`。字段缺失、旧缓存或非法字符串返回 null。只传递 JSON 或样式数据，不序列化 prepared 或 shader。

使用宿主现有的填充画笔准备一次：

```kotlin
val prepared = GradientPainter.prepareText(gradientFill, fillPaint, text)
```

prepared 放进宿主已有的单条渲染对象或缓存。文字、字体、字号、粗细、实际文字框尺寸或渐变样式变化时重新准备；不要在每帧重新解析 JSON 或重新抽取渐变概率。普通弹幕没有 prepared，也不创建 shader。

如果宿主使用布局引擎、复杂文字或合并计数，应沿用其实际文字度量及绘制方法，可用 `PreparedGradient.prepare(gradientFill, width, height)` 传入原文字框。此参考处理 `target=fill`；描边、纹理等不支持的效果仍由基础绘制兜底。

## 在现有填充入口使用

原来调用 `canvas.drawText(text, x, baselineY, fillPaint)` 的普通文本路径，替换为：

```kotlin
GradientPainter.drawText(canvas, fillPaint, text, x, baselineY, prepared)
```

该入口自动使用原基线、字体、文字对齐与透明度；prepared 为空时自动按原画笔绘制。播放器已有本地效果开关可用最后一个 `useEffects` 参数，没有本地开关时沿用默认值，无需增加设置项。

有自定义文字布局或绘制回调时，使用底层入口：

```kotlin
// 下例为左对齐文字：x 是文字框左侧，baselineY 是原基线。
// 字体和透明度已经设置在 fillPaint 上。
val top = baselineY + fillPaint.fontMetrics.ascent
val handled = prepared?.drawFill(canvas, fillPaint, x, top, useEffects) { c, p ->
    c.drawText(text, 0f, baselineY - top, p)
} ?: false
if (!handled) {
    canvas.drawText(text, x, baselineY, fillPaint)
}
```

宿主原有阴影或描边可在填充前照常绘制；这个回调只画填充，传入填充专用 `Paint`。文字颜色使用收到的 `p` 中的颜色，不能在降级时强制改白。若原绘制是 `StaticLayout` 等，应在回调中使用它的本地坐标绘制入口，并确认其实际文字画笔能接收 shader。

drawFill 临时平移 Canvas、设置 Paint.shader，并在正常返回或异常时恢复这两个改动。它不更改 Paint 的字体、颜色或 alpha。回调自身修改的其他 Paint 属性由宿主负责恢复。每个 prepared 由宿主渲染线程使用；跨线程缓存或原生资源生命周期沿用宿主规则。

色标 alpha 转成 Android 8 位 alpha，随后与 Paint.alpha 相乘。文字框坐标使用宿主当前 Canvas 单位，已有缩放继续生效，不要再次乘设备像素比。效果属于文字框，随文字移动，不固定在屏幕上。

## 校验及测试

读取入口支持 v1 的合法线性填充、2..16 色标、最多 8 效果；使用第一个合法支持的填充。逐效果降级，不请求纹理。角度、色标、origin 和附加字段的校验与现有 JS 参考对齐。

在本仓库源码中构建需要 JDK 17 或 21、Gradle 8.13、Android SDK 35 和 Node.js 18+（npm 安装包只携带参考源码和说明，不包含 Gradle 测试工程）：

```sh
gradle -p mobile/android testDebugUnitTest assembleDebug
```

Gradle 使用 `scripts/android-contract.mjs` 从共享 fixtures 和现有 JS 验证器生成测试期预期数据，Kotlin 测试比较接受/降级结果及规范化角度、色标。补充 JSON 缓存/偏移传递测试和 Robolectric API 34 native graphics 测试，覆盖方向、透明度、共享画笔恢复和实际文字填充。可用 `-PartifactDir=/absolute/output/path` 导出文字预览 PNG；默认不输出图片。

这是参考库测试，不是 Sen/Hills 或任何实际播放器的播放、拖动、合并、低端设备性能验收。接入后按 API 指南在宿主构建中检查。
