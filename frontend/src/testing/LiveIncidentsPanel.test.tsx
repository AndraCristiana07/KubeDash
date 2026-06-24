import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import LiveIncidentStreamPanel from "../LiveIncidentsPanel";

const mockIncidentPage1 = Array.from({ length: 50 }, (_, i) => ({
  reason: "CrashLoopBackOff",
  namespace: "production",
  pod_name: `worker-pod-${i}`,
  message: "Back-off restarting failed container",
  type: "Warning",
  timestamp: 1719100000 + i,
}));

const mockIncidentPage2 = [
  {
    reason: "FailedScheduling",
    namespace: "production",
    pod_name: "heavy-gpu-pod",
    message: "0/1 nodes are available: 1 Insufficient gpu.",
    type: "Warning",
    timestamp: 1719105000,
  },
];

describe("LiveIncidentStreamPanel Component", () => {
  const defaultProps = {
    goApiUrl: "http://localhost:8080",
    activeNamespace: "all",
  };

  const mockNetworkResponse = (
    incidentsArray: any[],
    nextCursor: string | null = null,
    isOk = true,
  ) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: isOk,
      json: async () => ({
        incidents: incidentsArray,
        next_cursor: nextCursor,
      }),
    } as Response);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders initial loading text during stream hydration", () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    render(<LiveIncidentStreamPanel {...defaultProps} />);

    expect(screen.getByText("Hydrating stream records...")).toBeInTheDocument();
  });

  test("renders fallback notice when namespace view frame has zero active warnings", async () => {
    mockNetworkResponse([]);
    render(<LiveIncidentStreamPanel {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "No warnings detected inside this namespace view frame.",
        ),
      ).toBeInTheDocument();
    });
  });

  test("injects incident stream payload rows accurately into table grid", async () => {
    mockNetworkResponse([
      {
        reason: "OOMKilled",
        namespace: "kube-system",
        pod_name: "metrics-server-xyz",
        message: "Container api-server consumed too much memory",
        type: "Warning",
        timestamp: 1719100000,
      },
    ]);

    render(<LiveIncidentStreamPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("OOMKilled")).toBeInTheDocument();
    });

    expect(screen.getByText("kube-system")).toBeInTheDocument();
    expect(screen.getByText("metrics-server-xyz")).toBeInTheDocument();
    expect(
      screen.getByText("Container api-server consumed too much memory"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Showing latest snapshot timeline"),
    ).toBeInTheDocument();
  });

  test("handles forward and backward pagination transitions via cursor history state", async () => {
    const user = userEvent.setup();

    // load page 1 with 50 items
    mockNetworkResponse(mockIncidentPage1, "cursor-token-abc");
    const { rerender } = render(<LiveIncidentStreamPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("worker-pod-0")).toBeInTheDocument();
    });

    const nextButton = screen.getByRole("button", { name: /Next/i });
    const prevButton = screen.getByRole("button", { name: /Prev/i });

    expect(nextButton).not.toBeDisabled();
    expect(prevButton).toBeDisabled();

    // mock page 2's specific endpoint return values
    mockNetworkResponse(mockIncidentPage2, null);
    await user.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText("heavy-gpu-pod")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Viewing historical log layer: 2/i),
    ).toBeInTheDocument();
    expect(nextButton).toBeDisabled();
    expect(prevButton).not.toBeDisabled();

    // move backward
    mockNetworkResponse(mockIncidentPage1, "cursor-token-abc");
    await user.click(prevButton);

    await waitFor(() => {
      expect(screen.getByText("worker-pod-0")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Showing latest snapshot timeline/i),
    ).toBeInTheDocument();
  });

  test("resets cursor position parameters when activeNamespace parameter mutates", async () => {
    mockNetworkResponse(mockIncidentPage1, "cursor-token-abc");
    const { rerender } = render(<LiveIncidentStreamPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("worker-pod-0")).toBeInTheDocument();
    });

    // change namespace
    mockNetworkResponse(mockIncidentPage2, null);
    rerender(
      <LiveIncidentStreamPanel
        {...defaultProps}
        activeNamespace="production"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("heavy-gpu-pod")).toBeInTheDocument();
    });

    //expect cursor to move state back
    expect(
      screen.getByText("Showing latest snapshot timeline"),
    ).toBeInTheDocument();
  });
});
