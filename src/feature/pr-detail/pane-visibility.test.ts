import { describe, it, expect } from "vitest";
import { toggleLeft, toggleRight, gridColumns } from "./pane-visibility";

describe("toggleLeft", () => {
  it("両方表示中なら左だけ非表示になる", () => {
    expect(toggleLeft({ left: true, right: true })).toEqual({ left: false, right: true });
  });

  it("左だけ表示中に左を隠すと、全部消えないよう右が表示される", () => {
    expect(toggleLeft({ left: true, right: false })).toEqual({ left: false, right: true });
  });

  it("左が非表示なら表示に戻る", () => {
    expect(toggleLeft({ left: false, right: true })).toEqual({ left: true, right: true });
  });
});

describe("toggleRight", () => {
  it("両方表示中なら右だけ非表示になる", () => {
    expect(toggleRight({ left: true, right: true })).toEqual({ left: true, right: false });
  });

  it("右だけ表示中に右を隠すと、全部消えないよう左が表示される", () => {
    expect(toggleRight({ left: false, right: true })).toEqual({ left: true, right: false });
  });

  it("右が非表示なら表示になる", () => {
    expect(toggleRight({ left: true, right: false })).toEqual({ left: true, right: true });
  });
});

describe("gridColumns", () => {
  it("両方表示なら分割比率つきの3列になる", () => {
    expect(gridColumns({ left: true, right: true }, 40)).toBe("40% 6px 1fr");
  });

  it("片方だけ表示なら1列になる", () => {
    expect(gridColumns({ left: false, right: true }, 40)).toBe("1fr");
    expect(gridColumns({ left: true, right: false }, 40)).toBe("1fr");
  });
});
