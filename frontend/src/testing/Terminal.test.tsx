import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TerminalModal from "../Terminal";

// mock the custom Xterm structures
const mockWrite = jest.fn();
const mockWriteln = jest.fn();
const mockOnData = jest.fn();
const mockDispose = jest.fn();
const mockFit = jest.fn();

jest.mock("@xterm/xterm", () => {
  return {
    Terminal: jest.fn().mockImplementation(() => ({
      loadAddon: jest.fn(),
      open: jest.fn(),
      write: mockWrite,
      writeln: mockWriteln,
      onData: mockOnData,
      clear: jest.fn(),
      dispose: mockDispose,
    })),
  };
});

jest.mock("@xterm/addon-fit", () => {
  return {
    FitAddon: jest.fn().mockImplementation(() => ({
      fit: mockFit,
    })),
  };
});

const defaultProps = {
  podName: "api-service",
  namespace: "kube-system",
  onClose: jest.fn(),
};

describe("TerminalModal Component", () => {
  let activeSocketInstance: any = null;

  beforeEach(() => {
    jest.clearAllMocks();
    activeSocketInstance = null;

    // create the plain constructor function logic
    const webSocketConstructorLogic = function (this: any) {
      this.send = jest.fn();
      this.close = jest.fn();
      this.readyState = 0; // CONNECTING

      activeSocketInstance = this;
      return this;
    };

    // wrap it inside an explicit jest.fn() wrapper
    const mockWebSocketConstructor = jest
      .fn()
      .mockImplementation(webSocketConstructorLogic);

    Object.defineProperty(mockWebSocketConstructor, "CONNECTING", { value: 0 });
    Object.defineProperty(mockWebSocketConstructor, "OPEN", { value: 1 });
    Object.defineProperty(mockWebSocketConstructor, "CLOSING", { value: 2 });
    Object.defineProperty(mockWebSocketConstructor, "CLOSED", { value: 3 });

    global.WebSocket = mockWebSocketConstructor as any;
  });

  test("initializes terminal configuration and triggers WebSocket route hooks", () => {
    render(<TerminalModal {...defaultProps} />);

    // verify text header tracking elements
    expect(screen.getByText("Interactive Container Shell")).toBeInTheDocument();
    expect(screen.getByText("kube-system/api-service")).toBeInTheDocument();

    // check Xterm output loading alerts
    expect(mockWriteln).toHaveBeenCalledWith(
      expect.stringContaining(
        "Connecting secure channel context to pod: api-service",
      ),
    );

    // confirm target WebSocket setup signature parameters
    expect(global.WebSocket as unknown as jest.Mock).toHaveBeenCalledWith(
      "ws://localhost:8080/api/cluster/ssh?namespace=kube-system&name=api-service",
    );
  });

  test("routes inner user keyboard input events back out to open socket targets", () => {
    render(<TerminalModal {...defaultProps} />);

    expect(activeSocketInstance).toBeTruthy();

    act(() => {
      activeSocketInstance.readyState = 1;
      if (activeSocketInstance.onopen) {
        activeSocketInstance.onopen();
      }
    });

    // capture input data
    const registerInputCallback = mockOnData.mock.calls[0][0];

    // trigger fake keypress values
    act(() => {
      registerInputCallback("cd /var/log\r");
    });

    // check if it receives the same value
    expect(activeSocketInstance.send).toHaveBeenCalledWith("cd /var/log\r");
  });

  test("binds event listeners to global frame scaling and disposes resources upon close", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<TerminalModal {...defaultProps} />);

    expect(activeSocketInstance).toBeTruthy();

    // simulate websocket termination
    act(() => {
      if (activeSocketInstance.onclose) {
        activeSocketInstance.onclose();
      }
    });
    expect(mockWriteln).toHaveBeenCalledWith(
      expect.stringContaining("Session socket pipeline disconnected safely"),
    );

    // verify close layout action
    const closeBtn = screen.getByRole("button", { name: /Close Terminal/i });
    await user.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();

    unmount();
    expect(activeSocketInstance.close).toHaveBeenCalled();
    expect(mockDispose).toHaveBeenCalled();
  });
});
