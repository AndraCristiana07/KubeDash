import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DeployWorkloadModal from "../DeployModal";

const mockConfigs = [
  {
    name: "api-env-props",
    type: "configmap",
    data: { DB_HOST: "postgres-svc", APP_DEBUG: "true" },
  },
];

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  onSwitchToYaml: jest.fn(),
  targetNamespace: "production",
  configs: mockConfigs,
  isDeploying: false,
  handleDeployPod: jest.fn((e) => e.preventDefault()),
  newPodName: "web-app",
  setNewPodName: jest.fn(),
  newPodImage: "nginx:latest",
  setNewPodImage: jest.fn(),
  attachConfigName: "",
  setAttachConfigName: jest.fn(),
  setAttachConfigType: jest.fn(),
  envMappings: [{ sourceKey: "", envKey: "" }],
  setEnvMappings: jest.fn(),
};

describe("DeployWorkloadModal Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders completely empty/null if isOpen is false", () => {
    const { container } = render(
      <DeployWorkloadModal {...defaultProps} isOpen={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("triggers parent updates on input changes and handles text sanitization", async () => {
    render(<DeployWorkloadModal {...defaultProps} />);

    // target the pod name text box
    const nameInput = screen.getByPlaceholderText("e.g., custom-web-server");
    expect(nameInput).toHaveValue("web-app");

    // clear and type uppercase + characters that aren't allowed
    fireEvent.change(nameInput, { target: { value: "INVALID_Name#99" } });

    // it should be called with the cleaned string
    expect(defaultProps.setNewPodName).toHaveBeenCalledWith("invalid-name99");

    // target the Container Image text box
    const imageInput = screen.getByPlaceholderText(
      "e.g., nginx:alpine or redis",
    );
    fireEvent.change(imageInput, { target: { value: "redis:alpine" } });

    expect(defaultProps.setNewPodImage).toHaveBeenCalledWith("redis:alpine");
  });

  test("renders link variable maps when configuration items are attached", async () => {
    const user = userEvent.setup();

    render(
      <DeployWorkloadModal
        {...defaultProps}
        attachConfigName="api-env-props"
        envMappings={[{ sourceKey: "DB_HOST", envKey: "DB_HOST" }]}
      />,
    );

    expect(
      screen.getByText("Map Resource Keys to Container"),
    ).toBeInTheDocument();

    // find all select boxes on the screen and pick the second one which maps cluster keys
    const comboboxes = screen.getAllByRole("combobox");
    const clusterKeySelect = comboboxes[1];

    expect(clusterKeySelect).toBeInTheDocument();
    expect(screen.getByText("DB_HOST")).toBeInTheDocument();
    expect(screen.getByText("APP_DEBUG")).toBeInTheDocument();

    // click the dynamic variable generator button row
    const addMappingBtn = screen.getByRole("button", {
      name: /\+ Add Variable Mapping/i,
    });
    await user.click(addMappingBtn);

    expect(defaultProps.setEnvMappings).toHaveBeenCalledWith([
      { sourceKey: "DB_HOST", envKey: "DB_HOST" },
      { sourceKey: "", envKey: "" },
    ]);
  });

  test("forwards standard execution payload actions to handleDeployPod on submit", async () => {
    const user = userEvent.setup();
    render(<DeployWorkloadModal {...defaultProps} />);

    const launchBtn = screen.getByRole("button", { name: "Launch" });
    await user.click(launchBtn);

    // form submission triggers parent's fetch function
    expect(defaultProps.handleDeployPod).toHaveBeenCalledTimes(1);
  });

  test("disables execution triggers and alters text indicators while deploying is active", () => {
    render(<DeployWorkloadModal {...defaultProps} isDeploying={true} />);

    const launchBtn = screen.getByRole("button", { name: "Deploying..." });
    expect(launchBtn).toBeDisabled();
  });
});
