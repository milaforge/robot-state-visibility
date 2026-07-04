import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RobotView from "./RobotView";

describe("RobotView", () => {
  it("keeps the observed robot centered and offsets commanded position", () => {
    render(
      <RobotView
        robotState={{
          mode: "idle",
          commandedPose: {
            x: 1,
            y: 0,
            heading: 0,
          },
          actualPose: {
            x: 0.5,
            y: 0,
            heading: 0,
          },
        }}
      />,
    );

    expect(screen.getByTestId("observed-robot")).toHaveAttribute("cx", "50");

    expect(screen.getByTestId("commanded-robot")).toHaveAttribute("cx", "56");
  });

  it("visualizes commanded and observed heading separately", () => {
    render(
      <RobotView
        robotState={{
          mode: "idle",
          commandedPose: {
            x: 1,
            y: 1,
            heading: 0,
          },
          actualPose: {
            x: 0.5,
            y: 0.5,
            heading: 0,
          },
        }}
      />,
    );

    expect(screen.getByTestId("commanded-robot")).toHaveAttribute("cy", "15");

    expect(screen.getByTestId("commanded-heading")).toHaveStyle({
      transform: "rotate(90deg)",
    });

    expect(screen.getByTestId("observed-heading")).toHaveStyle({
      transform: "rotate(45deg)",
    });
  });
});
