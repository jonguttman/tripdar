"use client";

import { useState } from "react";

interface Partner {
  id: string;
  name: string;
  allowedDomains: string[];
  rateLimit: number;
  active: boolean;
  createdAt: string;
}

interface NewPartnerResponse {
  partner: Partner;
  apiKey: string;
}

export default function PartnersAdminPage() {
  const [adminSecret, setAdminSecret] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // New partner form
  const [newPartner, setNewPartner] = useState({
    name: "The Mushroom Top",
    allowedDomains: "themushroomtop.com, *.themushroomtop.com",
    rateLimit: 120,
  });

  const authenticate = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/partners", {
        headers: {
          Authorization: `Bearer ${adminSecret}`,
        },
      });

      const data = await res.json();

      if (data.success) {
        setIsAuthenticated(true);
        setPartners(data.data.partners);
      } else {
        setError(data.error?.message || "Authentication failed");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const createPartner = async () => {
    setLoading(true);
    setError(null);
    setNewApiKey(null);

    try {
      const res = await fetch("/api/admin/partners", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newPartner.name,
          allowedDomains: newPartner.allowedDomains
            .split(",")
            .map((d) => d.trim()),
          rateLimit: newPartner.rateLimit,
        }),
      });

      const data = await res.json();

      if (data.success) {
        const response = data.data as NewPartnerResponse;
        setNewApiKey(response.apiKey);
        setPartners([...partners, response.partner]);
      } else {
        setError(data.error?.message || "Failed to create partner");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Partner Admin</h1>
          <p style={styles.subtitle}>Enter your admin secret to continue</p>

          <input
            type="password"
            placeholder="Admin Secret"
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            style={styles.input}
            onKeyDown={(e) => e.key === "Enter" && authenticate()}
          />

          <button
            onClick={authenticate}
            disabled={loading || !adminSecret}
            style={styles.button}
          >
            {loading ? "Authenticating..." : "Login"}
          </button>

          {error && <p style={styles.error}>{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Partner Admin</h1>

        {/* New API Key Display */}
        {newApiKey && (
          <div style={styles.apiKeyBox}>
            <h3 style={styles.apiKeyTitle}>New API Key Created!</h3>
            <p style={styles.apiKeyWarning}>
              Copy this now - it won't be shown again:
            </p>
            <code style={styles.apiKeyCode}>{newApiKey}</code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(newApiKey);
                alert("Copied to clipboard!");
              }}
              style={styles.copyButton}
            >
              Copy to Clipboard
            </button>
          </div>
        )}

        {/* Create New Partner */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Create New Partner</h2>

          <div style={styles.formGroup}>
            <label style={styles.label}>Partner Name</label>
            <input
              type="text"
              value={newPartner.name}
              onChange={(e) =>
                setNewPartner({ ...newPartner, name: e.target.value })
              }
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Allowed Domains (comma-separated)</label>
            <input
              type="text"
              value={newPartner.allowedDomains}
              onChange={(e) =>
                setNewPartner({ ...newPartner, allowedDomains: e.target.value })
              }
              style={styles.input}
              placeholder="example.com, *.example.com"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Rate Limit (requests/minute)</label>
            <input
              type="number"
              value={newPartner.rateLimit}
              onChange={(e) =>
                setNewPartner({
                  ...newPartner,
                  rateLimit: parseInt(e.target.value) || 60,
                })
              }
              style={styles.input}
            />
          </div>

          <button
            onClick={createPartner}
            disabled={loading}
            style={styles.button}
          >
            {loading ? "Creating..." : "Create Partner & Generate API Key"}
          </button>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        {/* Existing Partners */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Existing Partners</h2>

          {partners.length === 0 ? (
            <p style={styles.empty}>No partners yet</p>
          ) : (
            <div style={styles.partnerList}>
              {partners.map((partner) => (
                <div key={partner.id} style={styles.partnerCard}>
                  <div style={styles.partnerHeader}>
                    <strong>{partner.name}</strong>
                    <span
                      style={{
                        ...styles.badge,
                        backgroundColor: partner.active ? "#22c55e" : "#ef4444",
                      }}
                    >
                      {partner.active ? "Active" : "Revoked"}
                    </span>
                  </div>
                  <div style={styles.partnerMeta}>
                    <span>Domains: {partner.allowedDomains.join(", ")}</span>
                    <span>Rate Limit: {partner.rateLimit}/min</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#f5f5f5",
    padding: "40px 20px",
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    maxWidth: "600px",
    margin: "0 auto",
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "32px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  },
  title: {
    margin: "0 0 8px",
    fontSize: "24px",
    fontWeight: "600",
  },
  subtitle: {
    margin: "0 0 24px",
    color: "#666",
  },
  input: {
    width: "100%",
    padding: "12px",
    fontSize: "16px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    marginBottom: "16px",
    boxSizing: "border-box",
  },
  button: {
    width: "100%",
    padding: "12px",
    fontSize: "16px",
    fontWeight: "600",
    backgroundColor: "#8b5cf6",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  error: {
    color: "#ef4444",
    marginTop: "16px",
    textAlign: "center",
  },
  section: {
    marginTop: "32px",
    paddingTop: "32px",
    borderTop: "1px solid #eee",
  },
  sectionTitle: {
    margin: "0 0 16px",
    fontSize: "18px",
    fontWeight: "600",
  },
  formGroup: {
    marginBottom: "16px",
  },
  label: {
    display: "block",
    marginBottom: "6px",
    fontSize: "14px",
    fontWeight: "500",
    color: "#333",
  },
  apiKeyBox: {
    backgroundColor: "#f0fdf4",
    border: "2px solid #22c55e",
    borderRadius: "8px",
    padding: "20px",
    marginBottom: "24px",
  },
  apiKeyTitle: {
    margin: "0 0 8px",
    color: "#166534",
  },
  apiKeyWarning: {
    margin: "0 0 12px",
    fontSize: "14px",
    color: "#166534",
  },
  apiKeyCode: {
    display: "block",
    padding: "12px",
    backgroundColor: "#dcfce7",
    borderRadius: "4px",
    fontFamily: "monospace",
    fontSize: "12px",
    wordBreak: "break-all",
    marginBottom: "12px",
  },
  copyButton: {
    padding: "8px 16px",
    fontSize: "14px",
    backgroundColor: "#22c55e",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  partnerList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  partnerCard: {
    padding: "16px",
    backgroundColor: "#f9fafb",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
  },
  partnerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  badge: {
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: "600",
    color: "white",
  },
  partnerMeta: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    fontSize: "13px",
    color: "#666",
  },
  empty: {
    color: "#999",
    textAlign: "center",
    padding: "20px",
  },
};
