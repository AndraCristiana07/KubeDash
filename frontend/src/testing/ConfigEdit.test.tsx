import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InjectEnvMapsModal from "../ConfigEdit";

const mockConfigs = [
  {
    name: "db-secret-file",
    type: "secret",
    data: { DB_PASSWORD: "secure-string", MIN_POOL: "5" },
  },
];

const defaultProps = {
  configEditPod: { name: "api-worker-node", namespace: "default" },
  setConfigEditPod: jest.fn(),
  configs: mockConfigs,
  GO_API: "http://localhost:8080",
  fetchClusterPods: jest.fn(),
  editConfigName: "",
  setEditConfigName: jest.fn(),
  editConfigType: "",
  setEditConfigType: jest.fn(),
  editMappings: [{ sourceKey: "", envKey: "" }],
  setEditMappings: jest.fn(),
};

describe("InjectEnvMapsModal Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.alert = jest.fn();
    global.fetch = jest.fn();
  });

  test("renders empty if configEditPod is null", () => {
    const { container } = render(
      <InjectEnvMapsModal {...defaultProps} configEditPod={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("triggers parent updates when choosing a target from the main dropdown", async () => {
    const user = userEvent.setup();
    render(<InjectEnvMapsModal {...defaultProps} />);

    const targetDropdown = screen.getByRole("combobox");
    await user.selectOptions(targetDropdown, "secret:db-secret-file");

    expect(defaultProps.setEditConfigName).toHaveBeenCalledWith(
      "db-secret-file",
    );
    expect(defaultProps.setEditConfigType).toHaveBeenCalledWith("secret");
  });

  test("allows expanding variable rows when config items are attached", async () => {
    const user = userEvent.setup();
    render(
      <InjectEnvMapsModal
        {...defaultProps}
        editConfigName="db-secret-file"
        editConfigType="secret"
        editMappings={[{ sourceKey: "DB_PASSWORD", envKey: "DB_PASSWORD" }]}
      />,
    );

    // isolatesecondary key dropdown by grabbing all select controls
    const selectBoxes = screen.getAllByRole("combobox");
    expect(selectBoxes[1]).toBeInTheDocument();
    expect(screen.getByText("DB_PASSWORD")).toBeInTheDocument();

    const addRowBtn = screen.getByRole("button", { name: /\+ Add Key Row/i });
    await user.click(addRowBtn);

    expect(defaultProps.setEditMappings).toHaveBeenCalledWith([
      { sourceKey: "DB_PASSWORD", envKey: "DB_PASSWORD" },
      { sourceKey: "", envKey: "" },
    ]);
  });

  test("submits mappings successfully and updates cluster state", async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
    });

    render(
      <InjectEnvMapsModal
        {...defaultProps}
        editConfigName="db-secret-file"
        editConfigType="secret"
        editMappings={[{ sourceKey: "DB_PASSWORD", envKey: "DB_PASSWORD" }]}
      />,
    );

    const applyBtn = screen.getByRole("button", {
      name: /Apply & Recycle Pod/i,
    });
    await user.click(applyBtn);

    // assert fetch hit the accurate endpoint pattern
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/cluster/pods/update-config",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("api-worker-node"),
      }),
    );

    // wait out state transitions to cleanly clear the test run context
    await waitFor(() => {
      expect(defaultProps.setConfigEditPod).toHaveBeenCalledWith(null);
      expect(defaultProps.fetchClusterPods).toHaveBeenCalled();
    });
  });
});
