/**
 * Shared visual language for the brand portal (KEWL-2331).
 *
 * Matches the Tripdar house style set by the marketing surface: Cormorant Garamond
 * on a warm dark ground, gold as the single accent, generous line-height. Kept as a
 * plain string because this app has no global stylesheet — pages carry their own
 * scoped `<style>` blocks.
 */

export const portalTheme = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&display=swap');

  :root {
    --portal-serif: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
    --portal-sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --portal-gold: #d4a574;
    --portal-cream: #e8d5c0;
    --portal-muted: #8b7355;
    --portal-soft: #b8a68f;
    --portal-faint: #5f5347;
    --portal-ink: #0d0a08;
    --portal-panel: rgba(255, 248, 240, 0.026);
    --portal-line: rgba(212, 165, 116, 0.16);
    --portal-line-soft: rgba(212, 165, 116, 0.09);
  }

  * { box-sizing: border-box; }

  .portal-eyebrow {
    font-family: var(--portal-sans);
    font-size: 10px;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: var(--portal-muted);
    margin: 0 0 10px;
  }

  .portal-button {
    display: inline-block;
    font-family: var(--portal-sans);
    font-size: 12px;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    background: var(--portal-gold);
    color: var(--portal-ink);
    border: none;
    padding: 15px 30px;
    border-radius: 2px;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.2s ease, transform 0.2s ease;
  }
  .portal-button:hover:not(:disabled) { background: #e0b98a; }
  .portal-button:disabled { opacity: 0.45; cursor: not-allowed; }
`;
