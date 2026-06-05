import React, { useState } from "react";

export default function App() {
  const [status, setStatus] = useState<"Healthy" | "Degraded">("Healthy");

  return (
    <div style={styles.container}>
      <h1 style={styles.title}> KubeDash Workspace</h1>
      <p style={styles.text}>Responsive engine</p>

      <div
        style={{
          ...styles.badge,
          backgroundColor: status === "Healthy" ? "#10b981" : "#ef4444",
        }}
      >
        Cluster Status: {status}
      </div>

      <button
        style={styles.button}
        onClick={() =>
          setStatus((prev) => (prev === "Healthy" ? "Degraded" : "Healthy"))
        }
      >
        Simulate Cluster Event
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "sans-serif",
    color: "#f8fafc",
    padding: "32px",
    textAlign: "center",
  },
  title: { color: "#38bdf8", marginBottom: "8px" },
  text: { color: "#94a3b8", marginBottom: "24px" },
  badge: {
    display: "inline-block",
    padding: "8px 16px",
    borderRadius: "20px",
    fontWeight: "bold",
    marginBottom: "24px",
    transition: "0.3s",
  },
  button: {
    display: "block",
    margin: "0 auto",
    padding: "10px 20px",
    backgroundColor: "#1e293b",
    color: "#f1f5f9",
    border: "1px solid #475569",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "bold",
  },
};
