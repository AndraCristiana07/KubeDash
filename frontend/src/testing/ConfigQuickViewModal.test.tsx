import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfigQuickViewModal from "../ConfigQuickViewModal";

const defaultProps = {
  quickViewConfig: {
    name: "api-gateway-props",
    type: "configmap",
    namespace: "staging",
  },
  setQuickViewConfig: jest.fn(),
  isLoadingQuickView: false,
  quickViewData: {
    UPSTREAM_URL: "http://upstream.mesh",
    TIMEOUT_MS: "5000",
  },
};

describe("ConfigQuickViewModal Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns null and renders nothing if quickViewConfig is unpopulated", () => {
    const { container } = render(
      <ConfigQuickViewModal {...defaultProps} quickViewConfig={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("displays loader text string when active network lookups run", () => {
    render(
      <ConfigQuickViewModal {...defaultProps} isLoadingQuickView={true} />,
    );

    expect(
      screen.getByText("Querying cluster configurations..."),
    ).toBeInTheDocument();
    // key mappings shouldn't render while loading
    expect(screen.queryByText("UPSTREAM_URL:")).toBeNull();
  });

  test("falls back onto error indicator warnings when data maps return unpopulated", () => {
    render(<ConfigQuickViewModal {...defaultProps} quickViewData={null} />);

    expect(
      screen.getByText("No data found or mapping dropped."),
    ).toBeInTheDocument();
  });

  test("renders plain-text key-value mapping records cleanly for standard ConfigMaps", () => {
    render(<ConfigQuickViewModal {...defaultProps} />);

    expect(
      screen.getByText("Resource Quick-Peek (staging)"),
    ).toBeInTheDocument();
    expect(screen.getByText("⚙️")).toBeInTheDocument();
    expect(screen.getByText("api-gateway-props")).toBeInTheDocument();

    // verify key fields and their corresponding value mappings
    expect(screen.getByText("UPSTREAM_URL:")).toBeInTheDocument();
    expect(screen.getByText("http://upstream.mesh")).toBeInTheDocument();
    expect(screen.getByText("TIMEOUT_MS:")).toBeInTheDocument();
    expect(screen.getByText("5000")).toBeInTheDocument();
  });

  test("masks resource property fields securely if the resource block type targets Secrets", () => {
    const secretConfig = {
      name: "vault-token-props",
      type: "secret",
      namespace: "secure-ingress",
    };

    render(
      <ConfigQuickViewModal
        {...defaultProps}
        quickViewConfig={secretConfig}
        quickViewData={{ JWT_SECRET: "super-hidden-signing-key" }}
      />,
    );

    expect(screen.getByText("🔒")).toBeInTheDocument();
    expect(screen.getByText("vault-token-props")).toBeInTheDocument();

    // key field identifier should print out, but its value is encrypteed
    expect(screen.getByText("JWT_SECRET:")).toBeInTheDocument();
    expect(screen.getByText("•••••••• (Encrypted Secret)")).toBeInTheDocument();
    expect(screen.queryByText("super-hidden-signing-key")).toBeNull();
  });
  test("invokes clean dismiss actions when any close interaction path is clicked", async () => {
    const user = userEvent.setup();
    render(<ConfigQuickViewModal {...defaultProps} />);

    // click the close x button
    const exitCrossBtn = screen.getByText("✕");
    await user.click(exitCrossBtn);

    // click the close button
    const closePanelBtn = screen.getByRole("button", { name: "Close Panel" });
    await user.click(closePanelBtn);

    expect(defaultProps.setQuickViewConfig).toHaveBeenCalledTimes(2);
    expect(defaultProps.setQuickViewConfig).toHaveBeenLastCalledWith(null);
  });
});
