import CoreGraphics
import Foundation
// No args: print window ID of the frontmost Safari window (front-to-back order).
// --all:   print one line per Safari window: "windowID<TAB>title"
let listAll = CommandLine.arguments.contains("--all")
let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let windowList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else { exit(1) }
var found = false
for window in windowList {
    guard let owner = window[kCGWindowOwnerName as String] as? String,
          owner == "Safari",
          let layer = window[kCGWindowLayer as String] as? Int,
          layer == 0,
          let wid = window[kCGWindowNumber as String] as? Int else { continue }
    if listAll {
        let title = window[kCGWindowName as String] as? String ?? ""
        print("\(wid)\t\(title)")
        found = true
    } else {
        print(wid)
        exit(0)
    }
}
exit(found ? 0 : 1)
