import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LogStreamModal from "../LogStream";

// helper for WebSocket mock instance
type MockWebSocketInstance = {
  onmessage: (event: { data: string }) => void;
  onclose: () => void;
  close: jest.Mock;
};

const defaultProps = {
  podName: "web-pod",
  namespace: "production",
  onClose: jest.fn(),
};

describe("LogStreamModal Component", () => {
  let mockWsInstance: MockWebSocketInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    (global.WebSocket as unknown as jest.Mock).mockImplementation(() => {
      mockWsInstance = {
        onmessage: jest.fn(),
        onclose: jest.fn(),
        close: jest.fn(),
      };
      return mockWsInstance;
    });
  });

  // helper to mimic pushing an incoming log line down the pipeline
  const emitLogLine = (text: string) => {
    act(() => {
      mockWsInstance.onmessage({ data: text });
    });
  };

  test("subscribes to correct WS URL and renders incoming lines", () => {
    render(<LogStreamModal {...defaultProps} />);

    // verify connection parameters passed onto WebSocket initialization
    expect(global.WebSocket as unknown as jest.Mock).toHaveBeenCalledWith(
      "ws://localhost:8080/api/cluster/logs/stream?namespace=production&name=web-pod",
    );

    // initial state placeholder message
    expect(
      screen.getByText(/Waiting for incoming live infrastructure stream/i),
    ).toBeInTheDocument();

    // rmit custom system messages and confirm they are written to the document
    emitLogLine("Starting nginx server...");
    emitLogLine("Listening on port 80");

    expect(screen.getByText("Starting nginx server...")).toBeInTheDocument();
    expect(screen.getByText("Listening on port 80")).toBeInTheDocument();
    expect(screen.getByText("2 loaded")).toBeInTheDocument(); // counter test
  });

  test("applies error and warning themes to matches", () => {
    render(<LogStreamModal {...defaultProps} />);

    emitLogLine("Something went wrong: [ERROR] database disconnected");
    emitLogLine("[WARN] High memory consumption detected");

    const errorLine = screen.getByText(/database disconnected/i).parentElement;
    const warnLine = screen.getByText(/High memory consumption/i).parentElement;

    // check style configuration keywords
    expect(errorLine).toHaveClass("text-red-300", "bg-red-950/40");
    expect(warnLine).toHaveClass("text-amber-200", "bg-amber-950/30");
  });

  test("filters logs, highlights keywords, and clears console state buffers", async () => {
    const user = userEvent.setup();
    render(<LogStreamModal {...defaultProps} />);

    emitLogLine("User login transaction successful");
    emitLogLine("Failed connection sequence initiated");

    // type filter phrase
    const filterInput = screen.getByPlaceholderText(/Filter output logs.../i);
    await user.type(filterInput, "failed");

    // function matcher to combine text across split inner tags
    expect(
      screen.getByText((content, element) => {
        const hasText =
          element?.textContent
            ?.toLowerCase()
            .includes("failed connection sequence") ?? false;

        // check if any child elements also match
        // if yes -> skip this parent node
        const childrenDontMatch = Array.from(element?.children || []).every(
          (child) =>
            !child.textContent
              ?.toLowerCase()
              .includes("failed connection sequence"),
        );

        return hasText && childrenDontMatch;
      }),
    ).toBeInTheDocument();

    // verify the not matched row disappears
    expect(
      screen.queryByText("User login transaction successful"),
    ).not.toBeInTheDocument();

    // verify match gets nested within a <mark> element (highlight)
    const highlightedMatch = screen.getByText("Failed");
    expect(highlightedMatch.tagName).toBe("MARK");

    // click Clear Output
    const clearBtn = screen.getByRole("button", { name: /Clear Output/i });
    await user.click(clearBtn);

    expect(
      screen.queryByText(/Failed connection sequence/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText("0 loaded")).toBeInTheDocument();
  });

  test("skips updating buffer logs while stream is paused", async () => {
    const user = userEvent.setup();
    render(<LogStreamModal {...defaultProps} />);

    emitLogLine("Log line 1");

    // click pause button toggler
    const toggleBtn = screen.getByRole("button", { name: "Pause" });
    await user.click(toggleBtn);
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();

    // emit a new chunk while strean is paused
    emitLogLine("Log line 2 (sent during pause)");

    // line 1 should stay, Line 2 should not be printed
    expect(screen.getByText("Log line 1")).toBeInTheDocument();
    expect(
      screen.queryByText("Log line 2 (sent during pause)"),
    ).not.toBeInTheDocument();
  });

  test("disposes web socket links gracefully on unmount or termination", () => {
    const { unmount } = render(<LogStreamModal {...defaultProps} />);

    // unmounting should close the socket link
    unmount();
    expect(mockWsInstance.close).toHaveBeenCalled();

    // simulating a backend disconnect should attach an indicator string
    render(<LogStreamModal {...defaultProps} />);
    act(() => {
      mockWsInstance.onclose();
    });
    expect(
      screen.getByText("[Stream disconnected safely]"),
    ).toBeInTheDocument();
  });
});
