import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuditLogView from "../AuditLogs";

// mock MUI icons
jest.mock("@mui/icons-material/Search", () => () => (
  <span data-testid="search-icon" />
));

const mockAuditLogs = {
  logs: [
    {
      id: 101,
      pod_name: "kubedash-backend-7f85",
      namespace: "kube-system",
      message:
        "Core engine horizontal micro-scale container initialized cleanly",
      level: "Normal",
      created_at: "2026-06-15T08:30:00Z",
    },
    {
      id: 102,
      pod_name: "payment-gateway-pod",
      namespace: "production",
      message:
        "Database driver connection handshake timeout warning encountered",
      level: "Warning",
      created_at: "2026-06-15T08:35:12Z",
    },
  ],
  total_items: 2,
  current_page: 1,
};

const defaultProps = {
  goApiUrl: "http://localhost:9000",
  activeNamespace: "all",
};

describe("AuditLogView Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  test("mounts and automatically queries initial log parameters via network fetch", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockAuditLogs,
    });

    render(<AuditLogView {...defaultProps} />);

    // validate that the initial fetch parameters are structured ok
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "http://localhost:9000/api/logs?namespace=&level=&search=&limit=50&page=1",
      ),
    );

    // eait for async rows to come into view
    const firstLogMsg = await screen.findByText(
      /Core engine horizontal micro-scale/i,
    );
    expect(firstLogMsg).toBeInTheDocument();
    expect(screen.getByText("payment-gateway-pod")).toBeInTheDocument();
  });

  test("applies highlighted alert accent borders to core-system workloads", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockAuditLogs,
    });

    render(<AuditLogView {...defaultProps} />);

    // wait for the mock items to mount
    await screen.findByText(/Core engine horizontal micro-scale/i);

    // wrap row assessment inside a waitFor wrapper block
    await waitFor(() => {
      const tableRows = screen.getAllByRole("row");

      // row0 is the table header row (thead)
      // row1 is core kubedash log entry row
      expect(tableRows[1]).toHaveClass(
        "bg-amber-500/10",
        "border-l-4",
        "border-l-amber-500",
      );
      // row2 is standard custom user space log tracking
      expect(tableRows[2]).toHaveClass("border-l-transparent");
    });
  });

  test("re-fetches log records immediately when dropdown filters are changed", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockAuditLogs,
    });

    render(<AuditLogView {...defaultProps} />);
    await screen.findByText("payment-gateway-pod");

    // find the Severity dropdown
    const severityDropdown = screen
      .getByText("Warnings Only")
      .closest("select");
    expect(severityDropdown).toBeInTheDocument();
    await user.selectOptions(severityDropdown!, "Warning");

    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining("level=Warning"),
    );

    // find the row limit dropdown by targeting its unique "10 per page" option value
    const limitDropdown = screen.getByText("10 per page").closest("select");
    expect(limitDropdown).toBeInTheDocument();
    await user.selectOptions(limitDropdown!, "10");

    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining("limit=10"),
    );
  });
});
