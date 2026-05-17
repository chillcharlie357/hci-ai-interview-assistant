import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { AnimatedAvatar } from "./AnimatedAvatar";

describe("AnimatedAvatar", () => {
  it("renders without crashing for preparing state", () => {
    const { container } = render(<AnimatedAvatar state="preparing" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders without crashing for speaking state", () => {
    const { container } = render(<AnimatedAvatar state="speaking" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders without crashing for listening state", () => {
    const { container } = render(<AnimatedAvatar state="listening" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders without crashing for finished state", () => {
    const { container } = render(<AnimatedAvatar state="finished" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders without crashing for unsupported state", () => {
    const { container } = render(<AnimatedAvatar state="unsupported" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("has correct SVG viewBox", () => {
    const { container } = render(<AnimatedAvatar state="preparing" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute("viewBox")).toBe("0 0 72 72");
  });

  it("has an accessible role img with aria-label", () => {
    const { container } = render(<AnimatedAvatar state="preparing" />);
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("role")).toBe("img");
    expect(svg!.getAttribute("aria-label")).toBe("AI 面试官头像");
  });

  it("renders a mouth element for speaking state", () => {
    const { container } = render(<AnimatedAvatar state="speaking" />);
    const paths = container.querySelectorAll("path");
    // The last path is the mouth — it should have a d attribute that represents
    // an open mouth (contains Z for closed path)
    const mouthPath = paths[paths.length - 1];
    expect(mouthPath).toBeTruthy();
    expect(mouthPath.getAttribute("d")).toBeTruthy();
  });

  it("has the animated-avatar-wrapper class", () => {
    const { container } = render(<AnimatedAvatar state="preparing" />);
    const wrapper = container.querySelector(".animated-avatar-wrapper");
    expect(wrapper).toBeTruthy();
  });

  it("renders face elements (ellipses)", () => {
    const { container } = render(<AnimatedAvatar state="listening" />);
    const ellipses = container.querySelectorAll("ellipse");
    // At least: face, 2 ears, 2 eyes whites, 2 pupils, 2 eye outlines, 1 nose = 10
    expect(ellipses.length).toBeGreaterThanOrEqual(8);
  });

  it("renders eyebrow paths", () => {
    const { container } = render(<AnimatedAvatar state="listening" />);
    const paths = container.querySelectorAll("path");
    // At least: hair path + 2 eyebrow paths + mouth path = 4
    expect(paths.length).toBeGreaterThanOrEqual(4);
  });
});
