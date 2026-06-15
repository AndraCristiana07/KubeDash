import React from "react";
import { render, screen } from "@testing-library/react";
import ClusterMetricsSummaryGrid from "../ClusterMetricsSummary";

describe("ClusterMetricsGrid Component", () => {
  const baseSummary = {
    cpu: 2500,
    mem: 512,
    activeGPUs: 2,
  };

  test("renders text blocks and standard configurations cleanly", () => {
    render(
      <ClusterMetricsSummaryGrid
        totalPodsCount={14}
        globalSummary={baseSummary}
        avgGpuLoad={45}
      />,
    );

    expect(screen.getByText("Managed Pods")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();

    // CPU calc  check
    expect(screen.getByText("2,500")).toBeInTheDocument();
    expect(screen.getByText("2.50")).toBeInTheDocument(); // 2500 / 1000

    // RAM configuration falling back to MB check
    expect(screen.getByText("512")).toBeInTheDocument();
    expect(screen.getByText("MB")).toBeInTheDocument();

    // GPU metrics check
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // active cluses loaded count
  });

  test("scales memory allocations into gigabytes (GB) dynamically above thresholds", () => {
    const highMemorySummary = {
      cpu: 800,
      mem: 4096, // 4096 / 1024 = 4 GB
      activeGPUs: 4,
    };

    render(
      <ClusterMetricsSummaryGrid
        totalPodsCount={8}
        globalSummary={highMemorySummary}
        avgGpuLoad="82"
      />,
    );

    // RAM -> GB calculation mode check
    expect(screen.getByText("4.00")).toBeInTheDocument();
    expect(screen.getByText("GB")).toBeInTheDocument();
    expect(screen.queryByText("MB")).toBeNull();
  });

  test("forces fallback displays when active pods count drops to 0", () => {
    const deadGpuSummary = {
      cpu: 1200,
      mem: 256,
      activeGPUs: 0,
    };

    // even if avgGpuLoad is high, it should fallback if units are 0
    render(
      <ClusterMetricsSummaryGrid
        totalPodsCount={3}
        globalSummary={deadGpuSummary}
        avgGpuLoad={95}
      />,
    );

    // no active pods -> should ignore avgGpuLoad and display 0%
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
