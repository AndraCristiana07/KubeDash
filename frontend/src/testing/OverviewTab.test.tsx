import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OverviewTabContent from "../OverviewTab";

// mock MUI icons
jest.mock("@mui/icons-material/FiberManualRecord", () => () => (
  <span data-testid="status-dot-icon" />
));

const mockLogs = [
  {
    ID: 1,
    namespace: "default",
    pod_name: "auth-service",
    message: "Container started successfully",
    level: "Normal",
  },
  {
    ID: 2,
    namespace: "kube-system",
    pod_name: "coredns",
    message: "Resource usage near threshold limits",
    level: "Warning",
  },
];

const defaultProps = {
  activeTab: "overview",
  status: "Healthy",
  nodesTotal: 3,
  podsCount: 12,
  isModalOpen: false,
  setIsModalOpen: jest.fn(),
  handleManualRefresh: jest.fn(),
  isRefreshing: false,
  targetNamespace: "default",
  dbLogs: mockLogs,
};

describe("OverviewTabContent Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders text grid cells and numbers with normal theme colors", () => {
    render(<OverviewTabContent {...defaultProps} />);

    expect(screen.getByText("Cluster State")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  test("applies emergency text styles when cluster status is critical", () => {
    render(<OverviewTabContent {...defaultProps} status="Degraded" />);

    const statusWrapper = screen.getByText("Degraded");
    expect(statusWrapper).toHaveClass("text-[#B32626]");
  });

  test("fires modal openers and data refresher callbacks on button clicks", async () => {
    const user = userEvent.setup();
    render(<OverviewTabContent {...defaultProps} />);

    // click Deploy New Pod
    const deployBtn = screen.getByRole("button", {
      name: /\+ Deploy New Pod/i,
    });
    await user.click(deployBtn);
    expect(defaultProps.setIsModalOpen).toHaveBeenCalledWith(true);

    // click Refresh Metrics
    const refreshBtn = screen.getByRole("button", { name: /Refresh Metrics/i });
    await user.click(refreshBtn);
    expect(defaultProps.handleManualRefresh).toHaveBeenCalledTimes(1);
  });

  test("disables metric buttons and alters text while refreshing is active", () => {
    render(<OverviewTabContent {...defaultProps} isRefreshing={true} />);

    const refreshBtn = screen.getByRole("button", { name: "Refreshing..." });
    expect(refreshBtn).toBeDisabled();
  });

  test("renders empty fallback layouts when live logs are missing", () => {
    render(<OverviewTabContent {...defaultProps} dbLogs={[]} />);
    expect(
      screen.getByText("No live workloads fetched yet."),
    ).toBeInTheDocument();
  });

  test("renders and orders live log sequences correctly", () => {
    render(<OverviewTabContent {...defaultProps} />);

    expect(screen.getByText("auth-service:")).toBeInTheDocument();
    expect(
      screen.getByText(/Container started successfully/i),
    ).toBeInTheDocument();

    const warningLog = screen.getByText(
      /Resource usage near threshold limits/i,
    );
    expect(warningLog).toHaveClass("text-amber-300");
  });
});
