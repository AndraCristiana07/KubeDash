/// <reference types="@testing-library/jest-dom" />
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import ClusterPodsTable, {
  PodEntry,
  ClusterPodsTableProps,
} from "../PodsManagement";
import { jest } from "@jest/globals";

// mock MUI icon components
jest.mock(
  "@mui/icons-material/Search",
  () => () => React.createElement("span", { "data-testid": "search-icon" }),
);
jest.mock(
  "@mui/icons-material/Warning",
  () => () => React.createElement("span", { "data-testid": "warning-icon" }),
);
jest.mock(
  "@mui/icons-material/Lock",
  () => () => React.createElement("span", { "data-testid": "lock-icon" }),
);
jest.mock(
  "@mui/icons-material/Settings",
  () => () => React.createElement("span", { "data-testid": "settings-icon" }),
);
jest.mock(
  "@mui/icons-material/KeyboardArrowLeft",
  () => () => React.createElement("span", { "data-testid": "arrow-left-icon" }),
);
jest.mock(
  "@mui/icons-material/KeyboardArrowRight",
  () => () =>
    React.createElement("span", { "data-testid": "arrow-right-icon" }),
);

const mockPods: PodEntry[] = [
  {
    name: "web-pod",
    namespace: "production",
    status: "Running",
    image: "nginx:alpine",
    restart_count: 0,
    age_seconds: 3600,
    linked_configs: ["cm:app-properties", "secret:api-token"],
    message: "",
    last_term_state: "OOMKilled",
  },
  {
    name: "kubedash-backend-pod",
    namespace: "kube",
    image: "postgres",
    status: "Running",
    restart_count: 0,
    age_seconds: 1800,
    linked_configs: ["secret:db_password"],
    message: "",
  },
];

const defaultProps: ClusterPodsTableProps = {
  clusterPods: mockPods,
  targetNamespace: "production",
  isRestarting: null,
  deletingPod: null,
  setIsModalOpen: jest.fn(),
  setLogPod: jest.fn(),
  setSshPod: jest.fn(),
  handleDeletePod: jest.fn(),
  handleManualRefresh: jest.fn(),
  onTriggerRestartClick: jest.fn(),
  handleConfigBadgeClick: jest.fn(),
  setConfigEditPod: jest.fn(),
  setEditConfigName: jest.fn(),
  setEditConfigType: jest.fn(),
  setEditMappings: jest.fn(),
  formatPodAge: (secs: number) => `${secs / 60}m ago`,
  toast: {},
  GO_API: "http://localhost:8080",
};

describe("PodsManagement layout component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders base metrics layout details", () => {
    render(<ClusterPodsTable {...defaultProps} />);

    expect(screen.getByText(/active cluster pods/i)).toBeInTheDocument();
    expect(screen.getByText("Context Scope: production")).toBeInTheDocument();
    // search for active pod
    expect(screen.getByText("web-pod")).toBeInTheDocument();

    // core engine badge should be present
    expect(screen.getByText("Core")).toBeInTheDocument();

    // production namespace should be present
    expect(screen.getByText("production")).toBeInTheDocument();

    // last crash message for web-pod
    expect(screen.getByText("Last Crash Cause: OOMKilled")).toBeInTheDocument();
  });

  test("filters pods based on search input and status pills", async () => {
    const user = userEvent.setup();
    render(<ClusterPodsTable {...defaultProps} />);

    // verify both pods are initially there
    expect(screen.getByText("web-pod")).toBeInTheDocument();
    expect(screen.getByText("kubedash-backend-pod")).toBeInTheDocument();

    // typing kubedash into the search bar
    const searchInput = screen.getByPlaceholderText(/Search by pod name/i);
    await user.type(searchInput, "kubedash");

    // kubedash-backend-pod should remain on screen, "web-pod" should disappear
    expect(screen.getByText("kubedash-backend-pod")).toBeInTheDocument();
    expect(screen.queryByText("web-pod")).not.toBeInTheDocument();

    // clear search by clicking x botton
    const clearButton = screen.getByText("✕");
    await user.click(clearButton);
    expect(screen.getByText("web-pod")).toBeInTheDocument();

    // test status filters (clicking Failed button)
    const failedPill = screen.getByRole("button", { name: /Failed/i });
    await user.click(failedPill);

    // both pods are Running -> table should be empty
    expect(screen.getByText(/No active pods found/i)).toBeInTheDocument();
  });

  test("triggers when action buttons are clicked", async () => {
    const user = userEvent.setup();
    render(<ClusterPodsTable {...defaultProps} />);

    // Logs buttons, click the first one (for web-pod)
    const logsButtons = screen.getAllByRole("button", { name: "Logs" });
    await user.click(logsButtons[0]);
    expect(defaultProps.setLogPod).toHaveBeenCalledWith(mockPods[1]);

    // terminal button
    const termButtons = screen.getAllByRole("button", { name: "Term" });
    await user.click(termButtons[0]);
    expect(defaultProps.setSshPod).toHaveBeenCalledWith(mockPods[1]);

    // delete button
    const delButtons = screen.getAllByRole("button", { name: "Del" });
    await user.click(delButtons[1]);
    expect(defaultProps.handleDeletePod).toHaveBeenCalledWith(
      mockPods[0].namespace,
      mockPods[0].name,
    );
  });

  test("triggers config badge action when sub-badges are clicked", async () => {
    const user = userEvent.setup();
    render(<ClusterPodsTable {...defaultProps} />);

    // strip text
    const configBadge = screen.getByRole("button", { name: /app-properties/i });
    await user.click(configBadge);

    expect(defaultProps.handleConfigBadgeClick).toHaveBeenCalledWith(
      "configmap",
      "app-properties",
      "production",
    );
  });

  test("manages selection and allows staging bulk actions", async () => {
    const user = userEvent.setup();
    render(<ClusterPodsTable {...defaultProps} />);

    const bulkPanel = screen.getByTestId("bulk-ops-bar");

    // verify the panel starts visually hidden
    expect(bulkPanel).toHaveClass("opacity-0");
    expect(bulkPanel).toHaveClass("pointer-events-none");

    // find row checkboxes
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]); // check a pod

    // verify the panel is now active/visible
    expect(bulkPanel).toHaveClass("opacity-100");
    expect(bulkPanel).not.toHaveClass("opacity-0");

    // check the counter badge within the wrapper
    const badge = bulkPanel.querySelector(".animate-pulse");
    expect(badge).toHaveTextContent("1");

    // click Cancel on the bulk actions floating card to reset selection
    const cancelBulkBtn = screen.getByRole("button", { name: /Cancel/i });
    await user.click(cancelBulkBtn);

    // verify indicator transitions back to hidden
    expect(bulkPanel).toHaveClass("opacity-0");
  });
});
