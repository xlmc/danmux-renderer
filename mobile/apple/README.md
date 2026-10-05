# iOS / macOS 渐变填充参考

[GradientStyle.swift](Sources/GradientReference/GradientStyle.swift) 和 [GradientPainter.swift](Sources/GradientReference/GradientPainter.swift) 可复制进已有 Swift 工程；也可从仓库源码使用本地 Swift Package。只依赖 Foundation / Core Graphics，iOS 和 macOS 共用这两个文件。字段与完整接入步骤见 [danmu_api 通用客户端指南](https://github.com/xlmc/danmu_api/blob/main/docs/client-gradient-integration.md)。

## 三个接入动作

```swift
// 1. 在原 JSON 评论转换处读取并保存可选样式。
let fill = GradientStyle.readFill(rawComment["danmux"] as? [String: Any])

// 2. 原文字准备处：沿用宿主文字框和纯文字填充的 alpha 图像。
let prepared = PreparedGradient.prepare(fill, size: textBoxSize)

// 3. 在原绘制位置调用；nil、禁用或没有合适 mask 时自动执行原绘制。
GradientPainter.draw(in: context, rect: textRect, mask: fillMask,
    prepared: prepared, yAxis: .down) {
    originalDrawFill()
}
```

prepared 和 fillMask 存在原单条渲染对象或已有缓存中，文字/字体/字号/框尺寸改变才重建。普通弹幕不需要创建渐变或 mask。跨语言或磁盘 JSON 字符串可用 `GradientStyle.readFillJSON(extensionJSON)`，缺失或非法时为 nil。不序列化 CGGradient、CGImage 或 CGContext。

## 怎样取得 fillMask

优先复用已有的文字图片准备入口，但 mask 只含要渐变的文字填充。阴影、描边、白色合并计数和保留原色的 emoji 仍单独按宿主方式绘制。使用有 alpha 通道的普通 CGImage，透明背景、文字 alpha 为 1；不要提供反相的 image mask。原播放器如果只有实时文字绘制，需要在它的文字准备阶段生成一次这样的图片。

下面是 UIKit 的普通文字准备示例，使用宿主的 font、scale 与已度量 size：

```swift
import UIKit

func makeFillMask(text: String, font: UIFont, size: CGSize, scale: CGFloat) -> CGImage? {
    guard size.width > 0, size.height > 0 else { return nil }
    let format = UIGraphicsImageRendererFormat()
    format.opaque = false
    format.scale = scale
    return UIGraphicsImageRenderer(size: size, format: format).image { _ in
        (text as NSString).draw(at: .zero, withAttributes: [
            .font: font, .foregroundColor: UIColor.white
        ])
    }.cgImage
}
```

此示例适用于左上原点的普通单色文字。宿主若用 Core Text、复杂 attributed text 或字形布局，应在同样的图片准备入口绘制已有布局，保留它的对齐、基线、字距和多段样式，不另做排版。mask 在目标 CGContext 中必须与原文字方向一致；复用原 CGImage 绘制时的翻转约定。UIKit 的 UIImage/NSAttributedString 绘制不能一概视为支持 CGContext 的文字裁剪模式，因此参考入口使用显式 alpha 图像。

## 坐标、透明度和恢复

- `textRect` 是文字框位置与逻辑尺寸，不是视频框。它的 size 与 prepared.size 相同；尺寸变动后重新准备。
- yAxis 指当前上下文：UIKit 左上坐标一般用 `.down`，未翻转 Core Graphics 上下文用 `.up`；AppKit 或宿主已翻转的上下文应按实际坐标选择。
- 绘前沿用宿主已有的 `context.setAlpha(opacity)`。色标 alpha 与它相乘；不要在 mask 中预先乘同一透明度，否则会重复衰减。
- 图像像素密度由宿主选择，渐变端点与 rect 使用逻辑单位，避免再次乘 scale。
- 绘制保存/恢复 CGContext 图形状态；正常或降级只走一个填充分支。只有填充成功时跳过原填充，阴影/描边不受此分支接管。

当前参考只支持 v1 线性填充，无支持效果保持原单色，基础色取收到的 `p`。没有新的播放时钟、调度、缓存容量、网络请求或播放器依赖。

## 构建与验证

在 macOS / Xcode 环境，从仓库根目录运行：

```sh
node scripts/native-contract.mjs mobile/apple/Tests/GradientReferenceTests/Fixtures
swift test --package-path mobile/apple
cd mobile/apple
xcodebuild -scheme GradientReference -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

测试从现有 JS 校验器生成共享输入与预期，覆盖接受/降级、色标与角度、JSON 传递，以及 Core Graphics 透明度/裁剪恢复、上下文 y 轴和实际 Core Text 文字 mask。iOS 构建与 macOS 图形测试不代表特定播放器已接入，也不代替宿主的基线、图片方向、播放操作和设备性能验收。
