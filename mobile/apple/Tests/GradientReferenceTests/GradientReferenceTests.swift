import XCTest
import Foundation
import CoreGraphics
import CoreText
@testable import GradientReference

final class GradientReferenceTests: XCTestCase {
    private func fill(angle: Double = 0, alpha: Double = 1) -> GradientFill {
        GradientFill(angle: angle, stops: [GradientStop(position: 0, rgb: 0xff0000, alpha: alpha),
                                           GradientStop(position: 1, rgb: 0x0000ff, alpha: alpha)])
    }
    private func bitmap(_ width: Int = 160, _ height: Int = 60) -> CGContext {
        CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                  space: CGColorSpaceCreateDeviceRGB(),
                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)!
    }
    private func pixel(_ context: CGContext, _ x: Int, _ y: Int) -> [UInt8] {
        let bytes = context.data!.assumingMemoryBound(to: UInt8.self)
        let offset = y * context.bytesPerRow + x * 4
        return Array(UnsafeBufferPointer(start: bytes + offset, count: 4))
    }
    private func solidMask() -> CGImage {
        let context = bitmap(100, 40)
        context.setFillColor(CGColor(gray: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: 100, height: 40))
        return context.makeImage()!
    }

    func testSharedContractMatchesJS() throws {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "android-contract", withExtension: "json"))
        let cases = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [[String: Any]])
        XCTAssertGreaterThanOrEqual(cases.count, 40)
        for item in cases {
            let name = item["name"] as! String
            let comment = item["comment"] as! [String: Any]
            let actual = GradientStyle.readFill(comment["danmux"] as? [String: Any])
            guard let expected = item["expectedFill"] as? [String: Any] else {
                XCTAssertNil(actual, name); continue
            }
            let parsed = try XCTUnwrap(actual, name)
            let source = expected["source"] as! [String: Any]
            XCTAssertEqual(parsed.angle, (source["angle"] as! NSNumber).doubleValue, accuracy: 0.000001, name)
            let stops = source["stops"] as! [[String: Any]]
            XCTAssertEqual(parsed.stops.count, stops.count, name)
            for (index, stop) in stops.enumerated() {
                XCTAssertEqual(parsed.stops[index].position, (stop["position"] as! NSNumber).doubleValue, accuracy: 0.000001, name)
                XCTAssertEqual(parsed.stops[index].rgb, UInt32((stop["color"] as! String).dropFirst(), radix: 16), name)
                XCTAssertEqual(parsed.stops[index].alpha, (stop["alpha"] as! NSNumber).doubleValue, accuracy: 0.000001, name)
            }
        }
    }

    func testJSONCarrierAndFallback() {
        let json = """
        {"extensionVersion":1,"effects":[{"type":"gradient","target":"fill","source":{"type":"linear","angle":0,"stops":[{"position":0,"color":"#ff0000"},{"position":1,"color":"#0000ff"}]}}]}
        """
        XCTAssertEqual(GradientStyle.readFillJSON(json), fill())
        XCTAssertNil(GradientStyle.readFillJSON(nil))
        XCTAssertNil(GradientStyle.readFillJSON("bad JSON"))
        XCTAssertNil(GradientStyle.readFillJSON("{}"))
        XCTAssertNil(PreparedGradient.prepare(fill(), size: .zero))
        let context = bitmap()
        let rect = CGRect(x: 0, y: 0, width: 100, height: 40)
        let prepared = PreparedGradient.prepare(fill(), size: rect.size)
        var baseCalls = 0
        GradientPainter.draw(in: context, rect: rect, mask: nil, prepared: prepared) { baseCalls += 1 }
        GradientPainter.draw(in: context, rect: rect, mask: solidMask(), prepared: prepared, useEffects: false) { baseCalls += 1 }
        GradientPainter.draw(in: context, rect: rect, mask: solidMask(), prepared: nil) { baseCalls += 1 }
        XCTAssertEqual(baseCalls, 3)
    }

    func testGradientAlphaAndClipState() throws {
        let context = bitmap()
        context.setAlpha(0.5)
        let rect = CGRect(x: 10, y: 10, width: 100, height: 40)
        let prepared = try XCTUnwrap(PreparedGradient.prepare(fill(alpha: 0.5), size: rect.size))
        XCTAssertTrue(prepared.drawFill(in: context, rect: rect, mask: solidMask()))
        let left = pixel(context, 12, 30), right = pixel(context, 107, 30)
        XCTAssertGreaterThan(left[0], left[2])
        XCTAssertGreaterThan(right[2], right[0])
        XCTAssertEqual(Double(left[3]), 64, accuracy: 1)
        // Gradient clip is gone; host alpha remains 0.5, so the next comment is unaffected.
        context.setFillColor(CGColor(gray: 1, alpha: 1))
        context.fill(CGRect(x: 140, y: 10, width: 10, height: 20))
        XCTAssertEqual(Double(pixel(context, 145, 20)[3]), 128, accuracy: 1)
        XCTAssertEqual(pixel(context, 0, 0)[3], 0)
    }

    func testVerticalDirectionForBothHostCoordinateSystems() throws {
        let rect = CGRect(x: 10, y: 10, width: 100, height: 40)
        let prepared = try XCTUnwrap(PreparedGradient.prepare(fill(angle: 90), size: rect.size))
        let up = bitmap(), down = bitmap()
        XCTAssertTrue(prepared.drawFill(in: up, rect: rect, mask: solidMask(), yAxis: .up))
        XCTAssertTrue(prepared.drawFill(in: down, rect: rect, mask: solidMask(), yAxis: .down))
        let upAtLowY = pixel(up, 60, 12), downAtLowY = pixel(down, 60, 12)
        // Same bitmap memory row, opposite declared host y-axis: colours must reverse.
        XCTAssertGreaterThan(upAtLowY[2], upAtLowY[0])
        XCTAssertGreaterThan(downAtLowY[0], downAtLowY[2])
    }

    func testActualCoreTextMaskKeepsBackgroundTransparent() throws {
        let maskContext = bitmap(160, 60)
        let font = CTFontCreateWithName("Helvetica" as CFString, 28, nil)
        let attributes: [NSAttributedString.Key: Any] = [
            NSAttributedString.Key(kCTFontAttributeName as String): font,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(gray: 1, alpha: 1)
        ]
        let text = NSAttributedString(string: "GRADIENT", attributes: attributes)
        maskContext.textPosition = CGPoint(x: 2, y: 18)
        CTLineDraw(CTLineCreateWithAttributedString(text as CFAttributedString), maskContext)
        let context = bitmap(160, 60)
        let rect = CGRect(x: 0, y: 0, width: 160, height: 60)
        let prepared = try XCTUnwrap(PreparedGradient.prepare(fill(), size: rect.size))
        XCTAssertTrue(prepared.drawFill(in: context, rect: rect, mask: maskContext.makeImage()))
        var red = 0, blue = 0
        for y in 0..<60 { for x in 0..<160 {
            let p = pixel(context, x, y)
            if p[3] > 128 { if p[0] > p[2] { red += 1 } else { blue += 1 } }
        } }
        XCTAssertGreaterThan(red, 20)
        XCTAssertGreaterThan(blue, 20)
        XCTAssertEqual(pixel(context, 0, 0)[3], 0)
    }
}
