import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: "2rem", maxWidth: 720 }}>
      <h1>Tripdar</h1>

      <p>
        Tripdar describes how psychedelic experiences are commonly reported,
        without ratings, recommendations, or outcomes.
      </p>

      <nav style={{ marginTop: "2rem", display: "grid", gap: "1rem" }}>
        <Link href="/learn">
          <button>Learn about experiences</button>
        </Link>

        <Link href="/share">
          <button>Share an experience</button>
        </Link>

        <Link href="/about">
          <button>I'm not sure yet</button>
        </Link>
      </nav>
    </main>
  );
}

