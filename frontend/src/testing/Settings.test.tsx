import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPanel } from "../SettingsPanel";

// mock MUI incons
jest.mock("@mui/icons-material/Folder", () => () => (
  <span data-testid="folder-icon" />
));

const defaultProps = {
  GO_API: "http://localhost:8080",
  targetNamespace: "default",
  setTargetNamespace: jest.fn(),
  refreshInterval: 4000,
  setRefreshInterval: jest.fn(),
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    loading: jest.fn(() => "mock-toast-id"),
    dismiss: jest.fn(),
  },
};

// mock configs
const mockConfigs = [
  {
    name: "app-configmap",
    type: "configmap",
    bound_pods: ["api-pod-xyz"],
    data: { DB_HOST: "postgres-svc", RETRIES: "3" },
  },
  {
    name: "db-secret",
    type: "secret",
    bound_pods: [],
    data: { DB_PASSWORD: "super-secure-pass" },
  },
];

describe("SettingsPanel Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.confirm = jest.fn(() => true);

    // default fetch response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockConfigs,
    });
  });

  test("routes refresh frequency selection updates straight to context controllers", async () => {
    render(<SettingsPanel {...defaultProps} />);
    await screen.findByText("db-secret");

    const selectDropdown = screen.getByRole("combobox");
    expect(selectDropdown).toHaveValue("4000");

    await userEvent.selectOptions(selectDropdown, "30000");
    expect(defaultProps.setRefreshInterval).toHaveBeenCalledWith(30000);
  });

  test("renders target namespace input row conditional checks accurately when parent state is set to all", async () => {
    const { rerender } = render(
      <SettingsPanel {...defaultProps} targetNamespace="default" />,
    );

    // wait for the fetch loop to finish
    await screen.findByText("db-secret");

    // open config creation wizard panel
    const wizardBtn = screen.getByRole("button", { name: /\+ New Block/i });
    await userEvent.click(wizardBtn);

    // namespace default -> target namespace input shouldn't be rendered
    expect(screen.queryByPlaceholderText("default (if blank)")).toBeNull();

    // rerender with targetNamespace set to "all"
    rerender(<SettingsPanel {...defaultProps} targetNamespace="all" />);

    // wait for the fetch loop to finish
    await waitFor(() => {
      expect(
        screen.queryByText("Waiting for cluster configurations..."),
      ).not.toBeInTheDocument();
    });

    expect(
      screen.getByPlaceholderText("default (if blank)"),
    ).toBeInTheDocument();
  });

  test("handles drag and drop file drops over the .env textarea layout frame", async () => {
    render(<SettingsPanel {...defaultProps} />);

    await screen.findByText("db-secret");

    // open the creation wizard panel
    await userEvent.click(
      screen.getByRole("button", { name: /\+ New Block/i }),
    );

    // toggle bulk document mode injection link layout
    const modeToggle = screen.getByText(/Paste Entire \.env Document Block/i);
    await userEvent.click(modeToggle);

    // look for the default 'configmap' placeholder text style
    const rawTextArea = screen.getByPlaceholderText(/DB_HOST/i);
    expect(rawTextArea).toBeInTheDocument();

    // mock the local file payload and FileReader
    const fakeEnvFile = new File(["APP_DEBUG=true\nLOG_LEVEL=info"], ".env", {
      type: "text/plain",
    });

    const mockReaderInstance = {
      readAsText: jest.fn(function (this: any) {
        if (this.onload) {
          this.onload({ target: { result: "APP_DEBUG=true\nLOG_LEVEL=info" } });
        }
      }),
    };
    global.FileReader = jest
      .fn()
      .mockImplementation(() => mockReaderInstance) as any;

    const dragContainer = rawTextArea.closest("div");
    expect(dragContainer).toBeTruthy();

    // simulate HTML5 drop onto the zone
    fireEvent.drop(dragContainer!, {
      dataTransfer: { files: [fakeEnvFile] },
    });

    expect(rawTextArea).toHaveValue("APP_DEBUG=true\nLOG_LEVEL=info");
  });

  test("selects a configuration card, allows modification toggles", async () => {
    render(<SettingsPanel {...defaultProps} />);

    const secretCardBlock = await screen.findByText("db-secret");
    await userEvent.click(secretCardBlock);

    // look up the active display password cell input
    const dbPasswordInput = screen.getByDisplayValue("super-secure-pass");
    expect(dbPasswordInput).toHaveAttribute("type", "password");

    const visibilityBtn = screen.getByRole("button", { name: /Show/i });
    await userEvent.click(visibilityBtn);
    expect(dbPasswordInput).toHaveAttribute("type", "text");

    // modify properties
    await userEvent.clear(dbPasswordInput);
    await userEvent.type(dbPasswordInput, "mutated-password-99");

    // mock a success response for update and the auto-refresh call
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "synchronized" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfigs,
      });

    const syncBtn = screen.getByRole("button", {
      name: /Save & Sync Properties/i,
    });
    await userEvent.click(syncBtn);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/cluster/config/update"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("mutated-password-99"),
      }),
    );
  });

  test("triggers cascade block removal fetch queries", async () => {
    render(<SettingsPanel {...defaultProps} />);

    const deleteButtons = await screen.findAllByTitle("Delete Resource Map");

    // reset fetch history
    (global.fetch as jest.Mock).mockClear();

    // mock success for the delete query
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "deleted" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfigs,
      });

    await userEvent.click(deleteButtons[0]);

    // confirm intercept logic triggers network drop operations
    expect(global.confirm).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/cluster/config/delete"),
      expect.objectContaining({
        method: "DELETE",
      }),
    );
  });
});
