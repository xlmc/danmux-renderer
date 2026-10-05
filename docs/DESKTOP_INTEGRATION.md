# PC 文字填充接入参考

先按 [danmu_api 通用客户端指南](https://github.com/xlmc/danmu_api/blob/main/docs/client-gradient-integration.md) 保留可选样式，并在宿主原文字准备和绘制入口使用它。桌面端与移动端使用同一份响应字段、方向和降级规则；下面是按绘制栈映射的片段，不是完整播放器工程，也未宣称完成特定框架版本的接入测试。

## Windows / 跨平台 Avalonia

Avalonia 的 [渐变画刷](https://docs.avaloniaui.net/docs/graphics-animation/gradients/) 可以作为文字前景。已有 DrawGlyphRun/FormattedText 路径只需将原单色 brush 替换为准备好的渐变 brush，继续使用原字形和绘制位置。

```csharp
// fill 是加载时校验过的线性填充，start/end 是文字框内的逻辑坐标。
var brush = new LinearGradientBrush {
    StartPoint = new RelativePoint(start.X, start.Y, RelativeUnit.Absolute),
    EndPoint = new RelativePoint(end.X, end.Y, RelativeUnit.Absolute)
};
foreach (var stop in fill.Stops) {
    brush.GradientStops.Add(new GradientStop(
        Color.FromArgb((byte)Math.Round(stop.Alpha * 255), stop.R, stop.G, stop.B), stop.Position));
}
// 在宿主已有的文字框平移作用域内画，不能将端点固定在整个视频框。
context.DrawGlyphRun(brush, existingGlyphRun);
```

复用原 DrawingContext 的 opacity，避免再次把同一透明度写进色标。无支持效果直接使用原 brush。缓存继续由宿主管理，将规范化样式加进原 key。已有 TextBlock 可使用渐变 Foreground，但需要确认其边界就是目标文字框；不要求把 Canvas/字形绘制改成 TextBlock。

## Windows Direct2D / DirectWrite

Direct2D 的 [文字绘制](https://learn.microsoft.com/en-us/windows/win32/direct2d/direct2d-and-directwrite) 支持任意 brush，包括线性渐变。准备阶段用色标创建 gradient stop collection 和 ID2D1LinearGradientBrush，替换原 DrawTextLayout/DrawGlyphRun 的 brush 参数即可：

```cpp
// 示意：保留已有 DirectWrite 排版，不重新构造文字或改播放时钟。
ID2D1Brush* fillBrush = originalBrush;
if (gradientBrush) fillBrush = gradientBrush;
renderTarget->DrawTextLayout(textOrigin, existingLayout, fillBrush);
```

gradientBrush 端点必须跟随文字：可在原局部绘制坐标下使用文字框端点，或在绘前同步平移端点。设备丢失后的 brush 重建、原 opacity 和资源释放沿用宿主。宿主布局有自己的 drawing effect 时应只替换目标文本段的填充 brush，保留其他段样式。

## Windows / Linux / macOS Qt

Qt 的 [QPainterPath](https://doc.qt.io/qt-6/qpainterpath.html) 可使用渐变 brush。原引擎已有文字 path 时直接复用；普通文字可以在原准备阶段一次生成 path，不在每帧反复取字形轮廓。

```cpp
// 准备阶段，使用原字体和本地基线；start/end 从文字框计算。
QPainterPath textPath;
textPath.addText(localBaseline, originalFont, text);
QLinearGradient gradient(start, end);
for (const auto &stop : fill.stops) {
    QColor color(stop.r, stop.g, stop.b);
    color.setAlphaF(stop.alpha);
    gradient.setColorAt(stop.position, color);
}
QBrush fillBrush(gradient);

// 原单条绘制入口；painter 已包含原 opacity 和坐标缩放。
painter.save();
painter.translate(textBoxOrigin);
painter.fillPath(textPath, fillBrush);
painter.restore();
```

文字 path 可能不保留彩色 emoji 的原外观，复杂文字应复用宿主排版出的 glyph runs 或原文字 alpha 图片，避免强制改变原排版。无支持效果照常调用原绘制。

原生 brush 无法表达某个合法色标组合时，应按能力降级。例如宿主的 setColorAt 会覆盖同位置色标，就不能直接用它表达两个同位置色标的硬边界；应采用宿主已有的可表达路径，或降级该效果，不能静默改写收到的渐变。

## macOS / Core Graphics 与图片缓存

macOS 可以复用 [Apple Swift 参考](../mobile/apple/README.md)，与 iOS 使用相同解析器和 Core Graphics 填充代码。mask 准备仍使用原 AppKit/Core Text 字体与布局，按宿主实际的 y 轴与图像方向绘制。

宿主已经缓存文字图片或使用 GPU 图集时，在原光栅化/图片生成阶段应用渐变，继续移动原图片。渐变只应用于文字填充 alpha，阴影、描边、合并计数和保留原色的片段单独处理。不要建立第二套图集或让每帧重新生成图片。

仅将弹幕转成 XML/ASS 再交给 mpv/libass 的入口，不会自动消费可选 JSON 渐变。需要宿主提供能处理渐变的原文字/图片绘制入口；没有该入口时保持单色，不声称仅换 API 地址就能出现渐变。
