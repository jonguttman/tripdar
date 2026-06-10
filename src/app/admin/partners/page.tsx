"use client";

import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
} from "@/components/admin";

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
    } catch {
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
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-8">
        <Card className="mx-auto w-full max-w-md">
          <h1 className="font-display text-2xl text-bark-800">Partner Admin</h1>
          <p className="mb-6 mt-1 text-sm text-bark-400">
            Enter your admin secret to continue
          </p>

          <Input
            type="password"
            placeholder="Admin Secret"
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            className="mb-4"
            onKeyDown={(e) => e.key === "Enter" && authenticate()}
          />

          <Button
            onClick={authenticate}
            disabled={loading || !adminSecret}
            full
          >
            {loading ? "Authenticating..." : "Login"}
          </Button>

          {error && (
            <Alert tone="error" className="mt-4">
              {error}
            </Alert>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <PageHeader title="Partner Admin" />

      {/* New API Key Display */}
      {newApiKey && (
        <Card className="mb-8 border-moss-300 bg-moss-50">
          <h3 className="text-base font-semibold text-moss-800">
            New API Key Created!
          </h3>
          <p className="mb-3 mt-1 text-sm text-moss-700">
            Copy this now - it won&apos;t be shown again:
          </p>
          <code className="mb-3 block break-all rounded-lg bg-moss-100 p-3 font-mono text-xs text-moss-900">
            {newApiKey}
          </code>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              navigator.clipboard.writeText(newApiKey);
              alert("Copied to clipboard!");
            }}
          >
            <Icon name="copy" size={16} />
            Copy to Clipboard
          </Button>
        </Card>
      )}

      {/* Create New Partner */}
      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold text-bark-700">
          Create New Partner
        </h2>
        <Card className="flex flex-col gap-4">
          <Field label="Partner Name">
            <Input
              type="text"
              value={newPartner.name}
              onChange={(e) =>
                setNewPartner({ ...newPartner, name: e.target.value })
              }
            />
          </Field>

          <Field label="Allowed Domains (comma-separated)">
            <Input
              type="text"
              value={newPartner.allowedDomains}
              onChange={(e) =>
                setNewPartner({ ...newPartner, allowedDomains: e.target.value })
              }
              placeholder="example.com, *.example.com"
            />
          </Field>

          <Field label="Rate Limit (requests/minute)">
            <Input
              type="number"
              value={newPartner.rateLimit}
              onChange={(e) =>
                setNewPartner({
                  ...newPartner,
                  rateLimit: parseInt(e.target.value) || 60,
                })
              }
            />
          </Field>

          <Button onClick={createPartner} disabled={loading} full>
            {loading ? "Creating..." : "Create Partner & Generate API Key"}
          </Button>
        </Card>
      </section>

      {error && (
        <Alert tone="error" className="mb-8">
          {error}
        </Alert>
      )}

      {/* Existing Partners */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-bark-700">
          Existing Partners
        </h2>

        {partners.length === 0 ? (
          <EmptyState icon="users" title="No partners yet" />
        ) : (
          <Card padded={false} className="divide-y divide-bone-200 overflow-hidden">
            {partners.map((partner) => (
              <div key={partner.id} className="px-4 py-3">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <strong className="text-sm font-semibold text-bark-800">
                    {partner.name}
                  </strong>
                  <Badge tone={partner.active ? "success" : "danger"}>
                    {partner.active ? "Active" : "Revoked"}
                  </Badge>
                </div>
                <div className="flex flex-col gap-1 text-xs text-bark-500">
                  <span className="break-all">
                    Domains: {partner.allowedDomains.join(", ")}
                  </span>
                  <span>Rate Limit: {partner.rateLimit}/min</span>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
