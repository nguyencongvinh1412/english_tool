import Foundation
import Vision
import AppKit

// usage: visionocr [--boxes] <image> ...
// prints the recognized text of each image, lines in reading order; with --boxes, one tab-separated line per text run:
// top, left, bottom, right (fractions of the page, 0 at the top left) and the text
var args = Array(CommandLine.arguments.dropFirst())
let boxes = args.first == "--boxes"
if boxes { args.removeFirst() }
for path in args {
    guard let image = NSImage(contentsOfFile: path), let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print("## \(path): cannot read"); continue }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["en-US"]
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    try? handler.perform([request])
    let obs = (request.results ?? []).sorted { a, b in
        if abs(a.boundingBox.midY - b.boundingBox.midY) > 0.008 { return a.boundingBox.midY > b.boundingBox.midY }
        return a.boundingBox.minX < b.boundingBox.minX
    }
    print("## \(path)")
    if boxes {
        for o in obs {
            guard let t = o.topCandidates(1).first?.string else { continue }
            let b = o.boundingBox
            print(String(format: "%.4f\t%.4f\t%.4f\t%.4f\t%@", 1 - b.maxY, b.minX, 1 - b.minY, b.maxX, t))
        }
        continue
    }
    var lastY: CGFloat = -1
    var line = ""
    for o in obs {
        guard let t = o.topCandidates(1).first?.string else { continue }
        if lastY >= 0 && abs(o.boundingBox.midY - lastY) > 0.008 { print(line); line = "" }
        line += (line.isEmpty ? "" : "  ") + t
        lastY = o.boundingBox.midY
    }
    if !line.isEmpty { print(line) }
}
