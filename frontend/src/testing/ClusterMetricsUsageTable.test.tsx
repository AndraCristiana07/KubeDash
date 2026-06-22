import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PodUsageTable, { MetricRow } from "../ClusterMetricsUsageTable";

const mockMetricRows: MetricRow[] = [
  {
    namespace: "kube-system",
    pod_name: "kubedash-agent-xyz",
    cpu_usage: 500,
    mem_usage: 1024,
    gpu_usage: 0,
  },
  {
    namespace: "production-workloads",
    pod_name: "payment-api-pod",
    cpu_usage: 1600,
    mem_usage: 2048,
    gpu_usage: 85,
  },
];

describe("PodUsageTable Component", () => {
  const mockHandleSortRequest = jest.fn();
  const mockRenderSortIndicator = jest.fn((field) => `[Indicator:${field}]`);
  const mockRenderProgressBar = jest.fn((current, max, type) => (
    <div data-testid={`progress-${type}`}>{`${current}/${max}`}</div>
  ));

  const defaultProps = {
    activeSubTab: "usage",
    currentMetricRows: mockMetricRows,
    handleSortRequest: mockHandleSortRequest,
    renderSortIndicator: mockRenderSortIndicator,
    renderProgressBar: mockRenderProgressBar,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders nothing if activeSubTab is not 'usage'", () => {
    const { container } = render(
      <PodUsageTable {...defaultProps} activeSubTab="trends" />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("renders headers and uses sort handlers on column clicks", async () => {
    const user = userEvent.setup();
    render(<PodUsageTable {...defaultProps} />);

    // confirm headers are parsing indicators
    expect(
      screen.getByText(/Namespace \[Indicator:namespace\]/i),
    ).toBeInTheDocument();

    // click on the Target Infrastructure Pod header
    const podHeader = screen.getByText(/Target Infrastructure Pod/i);
    await user.click(podHeader);

    expect(mockHandleSortRequest).toHaveBeenCalledWith("pod_name");
  });

  test("applies correct highlight style indicators for system core workloads", () => {
    render(<PodUsageTable {...defaultProps} />);

    const tableRows = screen.getAllByRole("row");
    // row 0 - headers, row 1 - kube-system (core)
    expect(tableRows[1]).toHaveClass("bg-amber-500/10", "border-l-amber-500");
    // row 2 - standard custom apps space
    expect(tableRows[2]).not.toHaveClass("bg-amber-500/10");
  });

  test("passes proper tracking metrics down to child progress bars", () => {
    render(<PodUsageTable {...defaultProps} />);

    // check custom progress bars values
    const cpuBars = screen.getAllByTestId("progress-cpu");
    const memBars = screen.getAllByTestId("progress-mem");

    expect(cpuBars[0]).toHaveTextContent("500/2000");
    expect(memBars[0]).toHaveTextContent("1024/4096");
  });

  test("renders alternative fallback indicator row when GPU usage is zero", () => {
    render(<PodUsageTable {...defaultProps} />);

    // row 1 - 0 gpu load -> fallback em-dash spacer string
    expect(screen.getByText("—")).toBeInTheDocument();

    // row 2 - 85% gpu load -> progress bar active render
    expect(screen.getByTestId("progress-gpu")).toHaveTextContent("85/100");
  });

  test("displays notice banner row when metric datasets array is empty", () => {
    render(<PodUsageTable {...defaultProps} currentMetricRows={[]} />);
    expect(
      screen.getByText("No matching resource rows found."),
    ).toBeInTheDocument();
  });
});
