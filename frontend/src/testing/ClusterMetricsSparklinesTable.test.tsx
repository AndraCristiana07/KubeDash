import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PodHistoricalTrendTable, {
  HistoryBucket,
  PodMetricRow,
} from "../ClusterMetricsSparklinesTable";

const mockMetricRows: PodMetricRow[] = [
  {
    namespace: "kube-system",
    pod_name: "kubedash-collector",
    cpu_usage: 120,
    mem_usage: 256,
    gpu_usage: 0,
  },
  {
    namespace: "ai-layer",
    pod_name: "gpu-inference-0",
    cpu_usage: 850,
    mem_usage: 1024,
    gpu_usage: 40,
  },
];

const mockTrends: Record<string, HistoryBucket> = {
  "kube-system/kubedash-collector": {
    cpu: [10, 20, 30],
    mem: [256, 256, 256],
    gpu: [0, 0, 0],
  },
  "ai-layer/gpu-inference-0": {
    cpu: [100, 500, 850],
    mem: [512, 1024, 1024],
    gpu: [10, 20, 40],
  },
};

describe("PodHistoricalTrendTable Component", () => {
  const mockHandleSortRequest = jest.fn();
  const mockRenderLibraryTrendLine = jest.fn(
    (data: number[], color: string) => (
      <div data-testid="sparkline-mock" data-color={color}>
        {data.join(",")}
      </div>
    ),
  );

  const defaultProps = {
    activeSubTab: "trends" as const,
    currentMetricRows: mockMetricRows,
    historicalTrends: mockTrends,
    handleSortRequest: mockHandleSortRequest,
    renderSortIndicator: (field: string) => `[Indicator:${field}]`,
    renderLibraryTrendLine: mockRenderLibraryTrendLine,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("triggers parent sort handler when column headers are clicked", async () => {
    const user = userEvent.setup();
    render(<PodHistoricalTrendTable {...defaultProps} />);

    const podHeader = screen.getByText(/Target Workspace Pod/i);
    await user.click(podHeader);

    expect(mockHandleSortRequest).toHaveBeenCalledWith("pod_name");
  });

  test("injects metrics accurately into rendering trend functions", () => {
    render(<PodHistoricalTrendTable {...defaultProps} />);

    // capture mock sparklines on page
    const sparklines = screen.getAllByTestId("sparkline-mock");

    // core check on CPU color mapping array data
    expect(sparklines[0]).toHaveAttribute("data-color", "#306D29");
    expect(sparklines[0]).toHaveTextContent("10,20,30");
  });

  test("renders an empty indicator when a pod has 0 GPU stress data", () => {
    render(<PodHistoricalTrendTable {...defaultProps} />);

    // row 1 has 0% GPU stress and all zeros in trend lines
    expect(screen.getByText("— No Device Load")).toBeInTheDocument();
  });

  test("renders fallback notices when resource grids have zero active metrics rows", () => {
    render(
      <PodHistoricalTrendTable {...defaultProps} currentMetricRows={[]} />,
    );
    expect(
      screen.getByText("No matching historical logs found."),
    ).toBeInTheDocument();
  });
});
