/**
 * Shown when a brand link exists but is no longer usable (KEWL-2331).
 * Revocation is a normal operational act, so this reads as a next step rather
 * than an error page.
 */

import { portalTheme } from "./theme";

export default function InvalidLink({ reason }: { reason: "revoked" | "expired" }) {
  const headline = reason === "expired" ? "This link has expired" : "This link has been turned off";
  const body =
    reason === "expired"
      ? "Brand links are time-limited. Yours has run out — we'll gladly send a fresh one."
      : "This link was replaced or switched off. If you were expecting it to work, we'll send you a new one.";

  return (
    <main className="portal-invalid">
      <style>{portalTheme}</style>
      <style>{`
        .portal-invalid {
          min-height: 100dvh;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          text-align: center; padding: 40px 24px;
          background: radial-gradient(ellipse at 50% 30%, #1a1210 0%, #0d0a08 60%, #050303 100%);
        }
        .portal-invalid h1 {
          font-family: var(--portal-serif);
          font-size: 30px; font-weight: 400; color: var(--portal-cream);
          margin: 0 0 14px; letter-spacing: 0.5px;
        }
        .portal-invalid p {
          font-family: var(--portal-serif);
          font-size: 16px; line-height: 1.7; color: var(--portal-muted);
          margin: 0 0 28px; max-width: 30rem;
        }
      `}</style>
      <p className="portal-eyebrow">Tripdar</p>
      <h1>{headline}</h1>
      <p>{body}</p>
      <a className="portal-button" href="mailto:scottyclaw@gmail.com?subject=Brand%20link">
        Request a new link
      </a>
    </main>
  );
}
