// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "GradientReference",
    platforms: [.iOS(.v13), .macOS(.v11)],
    products: [.library(name: "GradientReference", targets: ["GradientReference"])],
    targets: [
        .target(name: "GradientReference"),
        .testTarget(name: "GradientReferenceTests", dependencies: ["GradientReference"], resources: [.process("Fixtures")])
    ]
)
