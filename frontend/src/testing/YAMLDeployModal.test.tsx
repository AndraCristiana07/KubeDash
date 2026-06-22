import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import YamlDeployModal from "../YAMLDeployModal";

// mock  MUI icons
jest.mock("@mui/icons-material/Code", () => () => (
  <span data-testid="code-icon" />
));
jest.mock("@mui/icons-material/Folder", () => () => (
  <span data-testid="folder-icon" />
));

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  targetNamespace: "staging",
  handleManualRefresh: jest.fn(),
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    loading: jest.fn(() => "mock-loading-id"),
    dismiss: jest.fn(),
    remove: jest.fn(),
  },
  GO_API: "http://localhost:8080",
};

describe("YamlDeployModal Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  test("returns null and stays hidden when isOpen is false", () => {
    const { container } = render(
      <YamlDeployModal {...defaultProps} isOpen={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("reads uploaded local system manifests using FileReader", async () => {
    const fakeFile = new File(["apiVersion: v1\nkind: Pod"], "pod.yaml", {
      type: "text/yaml",
    });

    // mmock FileReader interface
    const mockFileReaderInstance = {
      readAsText: jest.fn(function (this: any) {
        // trigger the component's internal onload hook
        if (this.onload) {
          this.onload({ target: { result: "apiVersion: v1\nkind: Pod" } });
        }
      }),
    };

    global.FileReader = jest
      .fn()
      .mockImplementation(() => mockFileReaderInstance) as any;

    render(<YamlDeployModal {...defaultProps} />);

    // locate drag-and-drop zone
    const dropZone = screen.getByText(/Drag & Drop YAML File Here/i);
    const dropContainer = dropZone.closest("div");
    expect(dropContainer).toBeTruthy();

    // HTML5 mock drop event
    fireEvent.drop(dropContainer!, {
      dataTransfer: {
        files: [fakeFile],
      },
    });

    // verify that the file content was put into the textarea
    const textEditor = screen.getByRole("textbox");
    expect(textEditor).toHaveValue("apiVersion: v1\nkind: Pod");

    // check that success toast was triggered
    expect(defaultProps.toast.success).toHaveBeenCalled();
  });

  test("submits manifest payload strings and manual refresh loops", async () => {
    const user = userEvent.setup();

    // fake JSON responses
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ applied: ["nginx-web-server-pod"] }),
    });

    render(<YamlDeployModal {...defaultProps} />);

    // populate data input manually
    const textEditor = screen.getByRole("textbox");
    await user.type(textEditor, "kind: Deployment");

    // click form application execution targets
    const submitBtn = screen.getByRole("button", { name: /Execute Apply/i });
    await user.click(submitBtn);

    // validate request parameters passed to fetch hooks
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/cluster/manifests/apply",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          yaml_string: "kind: Deployment",
          namespace: "staging",
        }),
      }),
    );

    await waitFor(() => {
      expect(defaultProps.handleManualRefresh).toHaveBeenCalled();
      expect(defaultProps.onClose).toHaveBeenCalled();
      expect(textEditor).toHaveValue(""); // content should clear
    });
  });

  test("intercepts error responses and fires error indicator alerts", async () => {
    const user = userEvent.setup();

    // simulate error responses coming from backend
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: "Admission webhooks rejected validation rules.",
      }),
    });

    render(<YamlDeployModal {...defaultProps} />);

    const textEditor = screen.getByRole("textbox");
    await user.type(textEditor, "invalid-yaml-schema");

    const submitBtn = screen.getByRole("button", { name: /Execute Apply/i });
    await user.click(submitBtn);

    // ensure error message text -> into toast
    await waitFor(() => {
      expect(defaultProps.toast.error).toHaveBeenCalledWith(
        "Admission webhooks rejected validation rules.",
        expect.objectContaining({ id: "mock-loading-id" }),
      );

      // ensure interaction blocks dissapears
      expect(submitBtn).not.toBeDisabled();
    });
  });
});
