import React from "react";
import { render, screen, within } from "@testing-library/react";
import ResourceHogsPanel from "../ResourceHogPanel";

// mock out the MUI icons
jest.mock("@mui/icons-material/Speed", () => () => (
  <span data-testid="speed-icon" />
));
jest.mock("@mui/icons-material/Memory", () => () => (
  <span data-testid="memory-icon" />
));

const mockMetricsPayload = {
  "default/web-pod": {
    pod_name: "web-pod",
    namespace: "default",
    cpu_usage: 150, // 3rd highest CPU
    mem_usage: 512, // highest Memory
    last_updated: Date.now(),
  },
  "kube/api-pod": {
    pod_name: "api-pod",
    namespace: "kube",
    cpu_usage: 500, // highest CPU
    mem_usage: 128, // 4th highest (should truncate out of Top 3)
    last_updated: Date.now(),
  },
  "default/db-pod": {
    pod_name: "db-pod",
    namespace: "default",
    cpu_usage: 300, // 2nd highest CPU
    mem_usage: 256, // 3rd highest Memory
    last_updated: Date.now(),
  },
  "production/worker-pod": {
    pod_name: "worker-pod",
    namespace: "production",
    cpu_usage: 50, // 4th highest (should truncate out of Top 3)
    mem_usage: 450, // 2nd highest Memory
    last_updated: Date.now(),
  },
};

describe("ResourceHogsPanel Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders placeholder message when metrics dictionary is empty", () => {
    render(<ResourceHogsPanel metrics={{}} />);

    // capture fallback messages
    const placeholders = screen.getAllByText(
      /Awaiting payload streams from notification socket channels/i,
    );

    // two fallbacks - CPU and Memory
    expect(placeholders).toHaveLength(2);
  });

  test("correctly extracts, sorts, and limits to top 3 resource consumers", () => {
    render(<ResourceHogsPanel metrics={mockMetricsPayload} />);

    // test CPU card
    const cpuHeader = screen.getByRole("heading", {
      name: /CPU Resource Dominators/i,
    });
    const cpuCardContainer = cpuHeader.closest("div")?.parentElement;
    expect(cpuCardContainer).toBeDefined();

    const cpuQueries = within(cpuCardContainer!);

    // check Top 3 order based on mock metrics
    const cpuRows = cpuQueries.getAllByText(/ns:/i);
    expect(cpuRows).toHaveLength(3); // verify it truncated the 4th (worker-pod)

    expect(cpuQueries.getByText("api-pod")).toBeInTheDocument(); // #1 (500m)
    expect(cpuQueries.getByText("db-pod")).toBeInTheDocument(); // #2 (300m)
    expect(cpuQueries.getByText("web-pod")).toBeInTheDocument(); // #3 (150m)
    expect(cpuQueries.queryByText("worker-pod")).not.toBeInTheDocument();

    // test Memory card
    const memHeader = screen.getByRole("heading", {
      name: /Memory Allocation Hogs/i,
    });
    const memCardContainer = memHeader.closest("div")?.parentElement;
    expect(memCardContainer).toBeDefined();

    const memQueries = within(memCardContainer!);

    const memRows = memQueries.getAllByText(/ns:/i);
    expect(memRows).toHaveLength(3); // verify it truncated the 4th (api-pod)

    expect(memQueries.getByText("web-pod")).toBeInTheDocument(); // #1 (512 MB)
    expect(memQueries.getByText("worker-pod")).toBeInTheDocument(); // #2 (450 MB)
    expect(memQueries.getByText("db-pod")).toBeInTheDocument(); // #3 (256 MB)
    expect(memQueries.queryByText("api-pod")).not.toBeInTheDocument();
  });
});
