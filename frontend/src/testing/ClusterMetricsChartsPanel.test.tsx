import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import ClusterTimelineChartsPanel from "../ClusterMetricsChartsPanel";

const mockHistoryData = [
  { timestamp: 1719100000, cpu_usage: 150, mem_usage: 800 },
  { timestamp: 1719100010, cpu_usage: 1200, mem_usage: 450 },
];

jest.mock("@mui/x-charts/LineChart", () => ({
  LineChart: jest.fn(({ xAxis, series, height }) => (
    <div data-testid="linechart-mock" data-height={height}>
      <div data-testid="chart-xaxis">{xAxis[0]?.data?.join(",")}</div>
      {series.map((s: any, idx: number) => (
        <div
          key={idx}
          data-testid={`chart-series-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
          data-color={s.color}
        >
          {s.data?.join(",")}
        </div>
      ))}
    </div>
  )),
}));

describe("ClusterTimelineChartsPanel Component", () => {
  const mockNetworkResponse = (
    responseObject: any,
    isOk = true,
    status = 200,
  ) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: isOk,
      status: status,
      json: async () => responseObject,
    } as Response);
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("renders initial loading state when cache data is unresolved", () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));

    render(<ClusterTimelineChartsPanel />);

    expect(
      screen.getByText(
        "Fetching historical matrix indexes from Redis cache vaults...",
      ),
    ).toBeInTheDocument();
  });

  test("renders dataset warmup view", async () => {
    mockNetworkResponse({ history: [mockHistoryData[0]] });

    render(<ClusterTimelineChartsPanel />);

    await waitFor(() => {
      expect(
        screen.getByText(
          /Dataset warm-up phase. Gathering historical metric data points/i,
        ),
      ).toBeInTheDocument();
    });
  });

  test("injects timeline data accurately", async () => {
    mockNetworkResponse({ history: mockHistoryData });

    render(<ClusterTimelineChartsPanel />);

    await waitFor(() => {
      expect(
        screen.getByText("Aggregate Cluster CPU Allocation (Millicores)"),
      ).toBeInTheDocument();
    });

    const charts = screen.getAllByTestId("linechart-mock");
    expect(charts).toHaveLength(2);

    const cpuSeries = screen.getByTestId("chart-series-total-cpu-(m)");
    expect(cpuSeries).toHaveAttribute("data-color", "#10b981");
    expect(cpuSeries).toHaveTextContent("150,1200");

    const memSeries = screen.getByTestId("chart-series-memory-(mib)");
    expect(memSeries).toHaveAttribute("data-color", "#2563eb");
    expect(memSeries).toHaveTextContent("800,450");
  });

  test("renders network failure panel if background cache api crashes", async () => {
    mockNetworkResponse(null, false, 502);

    render(<ClusterTimelineChartsPanel />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Error Aggregating Data Pipeline: HTTP network error: 502",
        ),
      ).toBeInTheDocument();
    });
  });

  test("schedules background refresh aligned with redis cache workers", async () => {
    mockNetworkResponse({ history: mockHistoryData });

    render(<ClusterTimelineChartsPanel />);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(10000);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
