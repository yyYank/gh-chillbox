import { describe, it, expect } from "vitest";
import { extractSwiftTestCases } from "./test-cases-swift";

function extract(content: string) {
  return extractSwiftTestCases([{ path: "Tests/ATests.swift", content }]);
}

function summary(content: string) {
  const [file] = extract(content);
  return file.cases.map((c) => [c.kind, c.names.join(" > "), c.modifiers]);
}

describe("extractSwiftTestCases", () => {
  it("XCTestCase を継承したクラスの、test で始まる引数なしの関数を取り出す", () => {
    const src = `import XCTest
@testable import App

final class LoginTests: XCTestCase {
    override func setUp() {}
    func testSuccess() throws {
        XCTAssertTrue(true)
    }
    func testFailure() async {}
    func helper() {}
    func testWith(value: Int) {}
}
`;
    const [file] = extract(src);
    expect(file.framework).toBe("xctest");
    expect(summary(src)).toEqual([
      ["describe", "LoginTests", []],
      ["test", "LoginTests > testSuccess", []],
      ["test", "LoginTests > testFailure", []],
    ]);
  });

  it("XCUIApplication を使うファイルは XCUITest とみなす", () => {
    const src = `import XCTest

final class AppUITests: XCTestCase {
    func testLaunch() {
        let app = XCUIApplication()
        app.launch()
    }
}
`;
    const [file] = extract(src);
    expect(file.framework).toBe("xcuitest");
    expect(file.cases.map((c) => c.names.join(" > "))).toEqual(["AppUITests", "AppUITests > testLaunch"]);
  });

  it("Swift Testing の @Suite と @Test を、表示名があれば表示名で取り出す", () => {
    const src = `import Testing

@Suite("ログイン")
struct LoginTests {
    @Test("正しいパスワード") func success() {
        #expect(true)
    }

    @Test
    func failure() async throws {}

    @Suite struct Lock {
        @Test func lockAfterFiveFailures() {}
    }
}
`;
    const [file] = extract(src);
    expect(file.framework).toBe("swift-testing");
    expect(summary(src)).toEqual([
      ["describe", "ログイン", []],
      ["test", "ログイン > 正しいパスワード", []],
      ["test", "ログイン > failure", []],
      ["describe", "ログイン > Lock", []],
      ["test", "ログイン > Lock > lockAfterFiveFailures", []],
    ]);
  });

  it("@Suite を付けていない型の中の @Test も、その型の名前つきで取り出す", () => {
    const src = `import Testing

@Test func topLevel() {}

struct Calc {
    @Test(arguments: [1, 2, 3])
    func add(n: Int) {}
}
`;
    expect(summary(src)).toEqual([
      ["test", "topLevel", []],
      ["describe", "Calc", []],
      ["test", "Calc > add", []],
    ]);
  });

  it(".disabled が付いた @Test と @Suite には skip の印を付ける", () => {
    const src = `import Testing

@Suite(.disabled("あとで直す"))
struct Flaky {
    @Test("遅い", .disabled())
    func slow() {}
}
`;
    expect(summary(src)).toEqual([
      ["describe", "Flaky", ["skip"]],
      ["test", "Flaky > 遅い", ["skip"]],
    ]);
  });

  it("コメントや文字列の中の波かっこやテストらしい記述は無視する", () => {
    const src = `import XCTest

final class ATests: XCTestCase {
    // func testCommented() {}
    /*
    func testInBlock() {}
    */
    func testA() {
        let s = "}"
        let t = """
        }
        func testInString() {}
        """
    }
    func testB() {}
}

func testOutside() {}
`;
    expect(summary(src)).toEqual([
      ["describe", "ATests", []],
      ["test", "ATests > testA", []],
      ["test", "ATests > testB", []],
    ]);
  });

  it("XCTest も Testing も import していないファイルは返さない", () => {
    expect(extract("struct A {\n    func testA() {}\n}\n")).toEqual([]);
  });
});
