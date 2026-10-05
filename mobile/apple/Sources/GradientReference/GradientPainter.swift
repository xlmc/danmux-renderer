import CoreGraphics
import Foundation

public enum GradientYAxis: Equatable { case down, up }

/// Host-local text box; no font, clock, track, network or global cache ownership.
public final class PreparedGradient {
    private let gradient: CGGradient
    private let startDown: CGPoint
    private let endDown: CGPoint
    public let size: CGSize

    public static func prepare(_ fill: GradientFill?, size: CGSize) -> PreparedGradient? {
        guard let fill, size.width.isFinite, size.height.isFinite, size.width > 0, size.height > 0 else { return nil }
        let components = fill.stops.flatMap { stop -> [CGFloat] in
            [CGFloat((stop.rgb >> 16) & 255) / 255, CGFloat((stop.rgb >> 8) & 255) / 255,
             CGFloat(stop.rgb & 255) / 255, CGFloat(stop.alpha)]
        }
        let locations = fill.stops.map { CGFloat($0.position) }
        guard let gradient = CGGradient(colorSpace: CGColorSpaceCreateDeviceRGB(), colorComponents: components,
                                        locations: locations, count: locations.count) else { return nil }
        let radians = fill.angle * .pi / 180
        let dx = CGFloat(cos(radians)), dy = CGFloat(sin(radians))
        let extent = (size.width * abs(dx) + size.height * abs(dy)) / 2
        return PreparedGradient(gradient: gradient, size: size,
            start: CGPoint(x: size.width / 2 - dx * extent, y: size.height / 2 - dy * extent),
            end: CGPoint(x: size.width / 2 + dx * extent, y: size.height / 2 + dy * extent))
    }

    private init(gradient: CGGradient, size: CGSize, start: CGPoint, end: CGPoint) {
        self.gradient = gradient; self.size = size; startDown = start; endDown = end
    }

    /// mask is a regular alpha-bearing CGImage of text fill only, in host image orientation.
    /// yAxis describes current host coordinates, not the operating system.
    @discardableResult
    public func drawFill(in context: CGContext, rect: CGRect, mask: CGImage?,
                         yAxis: GradientYAxis = .up, useEffects: Bool = true) -> Bool {
        guard useEffects, let mask, !mask.isMask,
              [.premultipliedFirst, .premultipliedLast, .first, .last, .alphaOnly].contains(mask.alphaInfo),
              rect.origin.x.isFinite, rect.origin.y.isFinite, rect.size == size else { return false }
        func point(_ value: CGPoint) -> CGPoint {
            CGPoint(x: rect.minX + value.x, y: rect.minY + (yAxis == .down ? value.y : size.height - value.y))
        }
        context.saveGState()
        defer { context.restoreGState() }
        context.clip(to: rect, mask: mask)
        context.drawLinearGradient(gradient, start: point(startDown), end: point(endDown),
                                   options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        return true
    }
}

public enum GradientPainter {
    /// Use the exact existing single-colour draw when preparation/mask/effects are unavailable.
    public static func draw(in context: CGContext, rect: CGRect, mask: CGImage?, prepared: PreparedGradient?,
                            yAxis: GradientYAxis = .up, useEffects: Bool = true, drawBase: () -> Void) {
        if prepared?.drawFill(in: context, rect: rect, mask: mask, yAxis: yAxis, useEffects: useEffects) != true {
            drawBase()
        }
    }
}
