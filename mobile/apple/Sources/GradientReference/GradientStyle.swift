import Foundation
import CoreFoundation

public struct GradientStop: Hashable {
    public let position: Double
    public let rgb: UInt32
    public let alpha: Double
}

public struct GradientFill: Hashable {
    public let angle: Double
    public let stops: [GradientStop]
}

public enum GradientStyle {
    /// Load-time parsing only. nil keeps the host's original text and p colour.
    public static func readFillJSON(_ json: String?) -> GradientFill? {
        guard let data = json?.data(using: .utf8),
              let value = try? JSONSerialization.jsonObject(with: data),
              let extensionValue = value as? [String: Any] else { return nil }
        return readFill(extensionValue)
    }

    public static func readFill(_ extensionValue: [String: Any]?) -> GradientFill? {
        guard let value = extensionValue, number(value["extensionVersion"]) == 1,
              let effects = value["effects"] as? [Any], effects.count <= 8 else { return nil }
        for case let effect as [String: Any] in effects {
            if let fill = readEffect(effect) { return fill }
        }
        return nil
    }

    private static func readEffect(_ effect: [String: Any]) -> GradientFill? {
        guard hasOnly(effect, ["type", "target", "origin", "source"]),
              effect["type"] as? String == "gradient", effect["target"] as? String == "fill" else { return nil }
        if effect.keys.contains("origin") {
            guard let origin = effect["origin"] as? String, ["native", "generated"].contains(origin) else { return nil }
        }
        guard let source = effect["source"] as? [String: Any], hasOnly(source, ["type", "angle", "stops"]),
              source["type"] as? String == "linear", let angle = number(source["angle"]), (-360...360).contains(angle),
              let rawStops = source["stops"] as? [Any], (2...16).contains(rawStops.count) else { return nil }
        var stops: [GradientStop] = []
        for raw in rawStops {
            guard let stop = raw as? [String: Any], hasOnly(stop, ["position", "color", "alpha"]),
                  let position = number(stop["position"]), (0...1).contains(position),
                  let color = stop["color"] as? String, color.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil,
                  let rgb = UInt32(color.dropFirst(), radix: 16) else { return nil }
            let alpha: Double
            if stop.keys.contains("alpha") {
                guard let parsed = number(stop["alpha"]), (0...1).contains(parsed) else { return nil }
                alpha = parsed
            } else { alpha = 1 }
            stops.append(GradientStop(position: position, rgb: rgb, alpha: alpha))
        }
        let sorted = stops.enumerated().sorted {
            $0.element.position == $1.element.position ? $0.offset < $1.offset : $0.element.position < $1.element.position
        }.map { $0.element }
        let normalized = ((angle.truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360))
        return GradientFill(angle: normalized, stops: sorted)
    }

    private static func number(_ value: Any?) -> Double? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue.isFinite else { return nil }
        return number.doubleValue
    }
    private static func hasOnly(_ value: [String: Any], _ allowed: Set<String>) -> Bool {
        Set(value.keys).isSubset(of: allowed)
    }
}
