export default function Home() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap');

        .coming-soon {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 40px 24px;
          background: radial-gradient(ellipse at 50% 30%, #1a1210 0%, #0d0a08 60%, #050303 100%);
          position: relative;
          overflow: hidden;
        }

        /* Subtle ambient glow */
        .coming-soon::before {
          content: '';
          position: absolute;
          top: 30%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(212,165,116,0.06) 0%, transparent 70%);
          pointer-events: none;
        }

        .logo-mark {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 64px;
          font-weight: 300;
          letter-spacing: 12px;
          text-transform: uppercase;
          color: #e8d5c0;
          margin-bottom: 8px;
          opacity: 0;
          animation: fade-in 1.2s ease-out 0.2s forwards;
        }

        .tagline {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 16px;
          font-weight: 300;
          font-style: italic;
          letter-spacing: 3px;
          color: #8b7355;
          margin-bottom: 48px;
          opacity: 0;
          animation: fade-in 1.2s ease-out 0.6s forwards;
        }

        .divider {
          width: 60px;
          height: 1px;
          background: linear-gradient(90deg, transparent, #d4a574, transparent);
          margin-bottom: 48px;
          opacity: 0;
          animation: fade-in 1.2s ease-out 0.8s forwards;
        }

        .status {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 22px;
          font-weight: 400;
          letter-spacing: 6px;
          text-transform: uppercase;
          color: #d4a574;
          margin-bottom: 16px;
          opacity: 0;
          animation: fade-in 1.2s ease-out 1.0s forwards;
        }

        .subtitle {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 15px;
          font-weight: 300;
          font-style: italic;
          color: #6b5c4a;
          max-width: 360px;
          line-height: 1.7;
          opacity: 0;
          animation: fade-in 1.2s ease-out 1.3s forwards;
        }

        @keyframes fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 480px) {
          .logo-mark { font-size: 44px; letter-spacing: 8px; }
          .status { font-size: 18px; letter-spacing: 4px; }
        }
      `}</style>
      <div className="coming-soon">
        <div className="logo-mark">Tripdar</div>
        <div className="tagline">Navigate the unknown</div>
        <div className="divider" />
        <div className="status">Coming Soon</div>
        <div className="subtitle">
          A new way to explore, understand, and respect
          the psychedelic experience.
        </div>
      </div>
    </>
  );
}
