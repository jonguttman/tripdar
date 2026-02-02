"use client";

import { useState, useEffect } from "react";

// Strain data from Tripdar
const STRAIN_DATA = [
  { id: "golden-teacher", name: "Golden Teacher", potency: "Moderate", stability: "High", beginner: "Yes", visual: "Medium", vibe: ["teacher-like", "calm", "insightful"], confidence: 85, description: "One of the most iconic baseline cubensis varieties—widely seen as a steady, beginner-friendly reference point with a calm, introspective tone." },
  { id: "penis-envy", name: "Penis Envy", potency: "High-Very High", stability: "Medium", beginner: "No", visual: "High", vibe: ["deep", "visionary", "introspective"], confidence: 80, description: "Widely framed as a premium, historically influential cubensis line associated with a higher-potency reputation and a deeper, more immersive inner space experience." },
  { id: "albino-penis-envy", name: "Albino Penis Envy", potency: "Very High", stability: "Medium", beginner: "No", visual: "High", vibe: ["intense", "ceremonial", "deep"], confidence: 78, description: "Visually distinctive, high-potency PE offshoot with the strongest consensus being: PE-like depth, with extra punch." },
  { id: "b-plus", name: "B+", potency: "Moderate", stability: "High", beginner: "Yes", visual: "Medium", vibe: ["balanced", "dependable"], confidence: 75, description: "One of the classic workhorse cube names—popular, widely distributed, and often used as a base for newer crosses." },
  { id: "cambodian", name: "Cambodian", potency: "Moderate", stability: "High", beginner: "Yes", visual: "Medium", vibe: ["clean", "uplifting"], confidence: 70, description: "Southeast Asian cubensis line, frequently attributed to being isolated from wild Cambodian material in the 1990s." },
  { id: "hillbilly", name: "Hillbilly", potency: "Low-Moderate", stability: "High", beginner: "Yes", visual: "Low-Medium", vibe: ["giggly", "warm", "friendly"], confidence: 72, description: "Modern classic tied to Southern US lore—a strain people associate with giggly, friendly arcs rather than existential intensity." },
  { id: "blue-meanie", name: "Blue Meanie", potency: "Moderate", stability: "Medium", beginner: "Maybe", visual: "Medium", vibe: ["euphoric", "playful"], confidence: 65, description: "A naming-confusion case: the cubensis strain borrowed the nickname of Panaeolus cyanescens, which are a different species." },
  { id: "pink-buffalo", name: "Pink Buffalo", potency: "Moderate", stability: "High", beginner: "Yes", visual: "Medium", vibe: ["uplifting", "social", "warm"], confidence: 70, description: "Thai-associated cubensis line with a strong folklore identity (pink buffalo as a lucky sighting)." },
  { id: "koh-samui-super-strain", name: "Koh Samui Super Strain", potency: "Moderate-High", stability: "Medium", beginner: "Maybe", visual: "Medium-High", vibe: ["energetic", "trickster onset"], confidence: 68, description: "An isolation of Koh Samui Classic (Thai origin), with a reputation for sudden it hits! transitions." },
  { id: "ice", name: "Ice", potency: "Moderate-High", stability: "Medium", beginner: "Maybe", visual: "Medium-High", vibe: ["clear-headed", "crisp", "refined"], confidence: 70, description: "An albino isolation of Thai Lipa Yai (ATLY), with a crisp and clear-headed experience." },
  { id: "avalanche", name: "Avalanche", potency: "High", stability: "Medium", beginner: "No", visual: "High", vibe: ["clean intensity", "deep"], confidence: 67, description: "A hybrid cross of Yeti × Melmac, placing it in the TAT/PE genetic constellation." },
  { id: "tidal-wave", name: "Tidal Wave", potency: "Very High", stability: "Medium", beginner: "No", visual: "High", vibe: ["wave-like", "powerful"], confidence: 80, description: "A PE × B+ hybrid credited to Magic Myco, famous in potency narratives tied to psilocybin cup reporting." },
  { id: "enigma", name: "Enigma", potency: "Very High", stability: "Variable", beginner: "No", visual: "Very High", vibe: ["dreamy", "immersive"], confidence: 75, description: "A stabilized blob/brain-like mutation descended from Tidal Wave. Notable for being sporeless." },
  { id: "full-moon-party", name: "Full Moon Party", potency: "Moderate-High", stability: "Medium", beginner: "Maybe", visual: "Medium", vibe: ["energetic", "festival-bright"], confidence: 57, description: "An isolated precursor connected to a Thai Elephant Dung wild collection—uplifting and socially bright." },
  { id: "trinity", name: "Trinity", potency: "Very High", stability: "Medium", beginner: "No", visual: "Very High", vibe: ["big medicine", "profound"], confidence: 62, description: "A stacked hybrid in the PE/Tidal Wave world—powerful, visionary, and best handled with strong respect and intention." },
  { id: "bluey-vuitton", name: "Bluey Vuitton", potency: "High", stability: "Medium", beginner: "No", visual: "High", vibe: ["luxury", "visual", "warm"], confidence: 68, description: "A Panama × Melmac PE hybrid—potent, visually rich, and emotionally warm when the setting supports it." },
  { id: "makilla-gorilla", name: "Makilla Gorilla", potency: "High-Very High", stability: "Medium", beginner: "No", visual: "High", vibe: ["uplifting", "deep"], confidence: 70, description: "APE × DC Melmac cross—strong visuals, strong uplift, and a deep inner arc." },
  { id: "ghost", name: "Ghost", potency: "High", stability: "High", beginner: "Maybe", visual: "Medium", vibe: ["lucid", "reflective"], confidence: 74, description: "True Albino Teacher isolate—calm, crystalline, and quietly powerful for thoughtful journeys." },
  { id: "jedi-mind-fuck", name: "Jedi Mind Fuck", potency: "Moderate-High", stability: "Medium", beginner: "Maybe", visual: "Medium-High", vibe: ["energetic", "adventurous"], confidence: 66, description: "A high-energy arc that feels like a bright, strange adventure with cosmic humor." },
  { id: "tosohatchee", name: "Tosohatchee", potency: "Variable", stability: "Variable", beginner: "Maybe", visual: "Medium", vibe: ["grounded", "earthy"], confidence: 58, description: "Wild Florida cubensis collection—earthy, immersive, and feels like it belongs outdoors." },
  { id: "chodewave", name: "ChodeWave", potency: "Very High", stability: "Medium", beginner: "No", visual: "High", vibe: ["intense", "waves"], confidence: 60, description: "A Tidal Wave phenotype selection—potent with pronounced wave-like intensity patterns." },
  { id: "khmer-kong", name: "Khmer Kong", potency: "Moderate-High", stability: "Medium", beginner: "Maybe", visual: "Medium", vibe: ["strong", "grounded"], confidence: 55, description: "Cambodian derivative with enhanced characteristics—solid and dependable with moderate-high potency." },
  { id: "jack-frost", name: "Jack Frost", potency: "High", stability: "Medium", beginner: "No", visual: "High", vibe: ["crisp", "bright", "visual"], confidence: 72, description: "TAT × APE cross known for striking white appearance and bright, visual-forward experiences." },
  { id: "melmac", name: "Melmac", potency: "High-Very High", stability: "Medium", beginner: "No", visual: "High", vibe: ["alien", "strange", "deep"], confidence: 70, description: "Original Penis Envy genetics—a cornerstone variety in the PE lineage with deep, strange character." },
  { id: "a-train", name: "A-Train", potency: "Moderate-High", stability: "Medium", beginner: "Maybe", visual: "Medium-High", vibe: ["fast onset", "rolling"], confidence: 58, description: "Known for rapid onset and rolling waves of experience—a smooth but decisive ride." },
];

interface BlobImage {
  url: string;
  pathname: string;
  strainName: string;
  filename: string;
}

interface Strain {
  id: string;
  name: string;
  potency: string;
  stability: string;
  beginner: string;
  visual: string;
  vibe: string[];
  confidence: number;
  description: string;
  image?: string;
}

export function StrainExplorer() {
  const [strains, setStrains] = useState<Strain[]>(STRAIN_DATA);
  const [selectedStrain, setSelectedStrain] = useState<Strain | null>(null);
  const [filters, setFilters] = useState({ potency: "All", beginner: "All", search: "" });
  const [view, setView] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);

  // Normalize name for matching (handle B+ vs B plus, censored names, etc.)
  const normalizeName = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[_-]/g, " ")
      .replace(/\+/g, " plus")
      .replace(/\*/g, "")  // Remove censoring asterisks
      .replace(/\s+/g, " ")
      .trim();
  };

  // Fetch images from Vercel Blob on mount
  useEffect(() => {
    async function fetchImages() {
      try {
        const res = await fetch("/api/strain-images");
        const data = await res.json();

        if (data.success && data.images) {
          // Match images to strains by name
          const strainsWithImages = STRAIN_DATA.map((strain) => {
            const normalizedStrainName = normalizeName(strain.name);

            const matchingImage = data.images.find((img: BlobImage) => {
              if (!img.strainName) return false;
              const normalizedImgName = normalizeName(img.strainName);

              // Exact match
              if (normalizedImgName === normalizedStrainName) return true;

              // Partial matches (Thai Pink Buffalo → Pink Buffalo)
              if (normalizedImgName.includes(normalizedStrainName)) return true;
              if (normalizedStrainName.includes(normalizedImgName)) return true;

              // Word-based matching for cases like "Ghost TAT" matching "Ghost"
              const imgWords = normalizedImgName.split(" ");
              const strainWords = normalizedStrainName.split(" ");
              const matchingWords = strainWords.filter(w => imgWords.includes(w));
              if (matchingWords.length >= 1 && matchingWords.length === strainWords.length) return true;

              return false;
            });
            return {
              ...strain,
              image: matchingImage?.url,
            };
          });
          setStrains(strainsWithImages);
        }
      } catch (error) {
        console.error("Failed to fetch strain images:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchImages();
  }, []);

  const filtered = strains.filter((s) => {
    if (filters.search && !s.name.toLowerCase().includes(filters.search.toLowerCase()))
      return false;
    if (filters.potency !== "All" && !s.potency.includes(filters.potency)) return false;
    if (filters.beginner !== "All" && s.beginner !== filters.beginner) return false;
    return true;
  });

  if (selectedStrain) {
    return <StrainDetail strain={selectedStrain} onBack={() => setSelectedStrain(null)} />;
  }

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(to bottom, #0f172a, #1e1b4b, #0f172a)" }}>
      {/* Header */}
      <header style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(168,85,247,0.2)" }}>
        <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "1.5rem 1rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h1 style={{ fontSize: "1.875rem", fontWeight: "bold", color: "white", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "2.25rem" }}>🍄</span>
                Strain Explorer
              </h1>
              <p style={{ color: "#c4b5fd", marginTop: "0.25rem" }}>
                Tripdar • {loading ? "Loading..." : `${filtered.length} strains`}
              </p>
            </div>
            <div style={{ display: "flex", background: "rgba(88,28,135,0.5)", borderRadius: "0.5rem", padding: "0.25rem" }}>
              <button
                onClick={() => setView("grid")}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  background: view === "grid" ? "#9333ea" : "transparent",
                  color: view === "grid" ? "white" : "#c4b5fd",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Grid
              </button>
              <button
                onClick={() => setView("list")}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  background: view === "list" ? "#9333ea" : "transparent",
                  color: view === "list" ? "white" : "#c4b5fd",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                List
              </button>
            </div>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "2rem 1rem" }}>
        {/* Filters */}
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            backdropFilter: "blur(10px)",
            borderRadius: "1rem",
            padding: "1.5rem",
            marginBottom: "2rem",
            border: "1px solid rgba(168,85,247,0.2)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: "200px" }}>
              <label style={{ display: "block", color: "#c4b5fd", fontSize: "0.875rem", marginBottom: "0.5rem" }}>Search</label>
              <input
                type="text"
                placeholder="Search strains..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                style={{
                  width: "100%",
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(168,85,247,0.3)",
                  borderRadius: "0.75rem",
                  padding: "0.75rem 1rem",
                  color: "white",
                  outline: "none",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", color: "#c4b5fd", fontSize: "0.875rem", marginBottom: "0.5rem" }}>Potency</label>
              <select
                value={filters.potency}
                onChange={(e) => setFilters({ ...filters, potency: e.target.value })}
                style={{
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(168,85,247,0.3)",
                  borderRadius: "0.75rem",
                  padding: "0.75rem 1rem",
                  color: "white",
                  outline: "none",
                }}
              >
                <option value="All">All Potencies</option>
                <option value="Moderate">Moderate</option>
                <option value="High">High</option>
                <option value="Very High">Very High</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", color: "#c4b5fd", fontSize: "0.875rem", marginBottom: "0.5rem" }}>Beginner Friendly</label>
              <select
                value={filters.beginner}
                onChange={(e) => setFilters({ ...filters, beginner: e.target.value })}
                style={{
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(168,85,247,0.3)",
                  borderRadius: "0.75rem",
                  padding: "0.75rem 1rem",
                  color: "white",
                  outline: "none",
                }}
              >
                <option value="All">All Levels</option>
                <option value="Yes">Yes</option>
                <option value="Maybe">Maybe</option>
                <option value="No">No</option>
              </select>
            </div>
            <button
              onClick={() => setFilters({ potency: "All", beginner: "All", search: "" })}
              style={{ padding: "0.75rem 1rem", color: "#a78bfa", background: "transparent", border: "none", cursor: "pointer" }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Grid/List */}
        <div
          style={{
            display: view === "grid" ? "grid" : "flex",
            gridTemplateColumns: view === "grid" ? "repeat(auto-fill, minmax(280px, 1fr))" : undefined,
            flexDirection: view === "list" ? "column" : undefined,
            gap: "1.25rem",
          }}
        >
          {filtered.map((strain) => (
            <StrainCard key={strain.id} strain={strain} view={view} onClick={() => setSelectedStrain(strain)} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "4rem 0" }}>
            <div style={{ fontSize: "3.75rem", marginBottom: "1rem" }}>🔍</div>
            <p style={{ color: "#a78bfa", fontSize: "1.125rem" }}>No strains match your filters</p>
            <button
              onClick={() => setFilters({ potency: "All", beginner: "All", search: "" })}
              style={{ marginTop: "1rem", color: "#c4b5fd", textDecoration: "underline", background: "transparent", border: "none", cursor: "pointer" }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StrainCard({ strain, view, onClick }: { strain: Strain; view: "grid" | "list"; onClick: () => void }) {
  if (view === "list") {
    return (
      <div
        onClick={onClick}
        style={{
          background: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(10px)",
          borderRadius: "0.75rem",
          padding: "1rem",
          border: "1px solid rgba(168,85,247,0.2)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "1.25rem",
        }}
      >
        <div
          style={{
            width: "4rem",
            height: "4rem",
            background: "linear-gradient(to bottom right, #7c3aed, #581c87)",
            borderRadius: "0.75rem",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {strain.image ? (
            <img src={strain.image} alt={strain.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.875rem" }}>🍄</div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: "1.125rem", fontWeight: "600", color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{strain.name}</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginTop: "0.25rem" }}>
            {strain.vibe.slice(0, 2).map((v) => (
              <span key={v} style={{ padding: "0.125rem 0.5rem", background: "rgba(88,28,135,0.5)", borderRadius: "9999px", color: "#c4b5fd", fontSize: "0.75rem" }}>
                {v}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", fontSize: "0.875rem", flexShrink: 0 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#a78bfa", fontSize: "0.75rem" }}>Beginner</div>
            <div style={{ marginTop: "0.25rem", fontWeight: "500", color: strain.beginner === "Yes" ? "#4ade80" : strain.beginner === "Maybe" ? "#facc15" : "#f87171" }}>
              {strain.beginner === "Yes" ? "✓" : strain.beginner === "Maybe" ? "~" : "✗"}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#a78bfa", fontSize: "0.75rem" }}>Score</div>
            <div style={{ color: "white", marginTop: "0.25rem", fontWeight: "500" }}>{strain.confidence}%</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      style={{
        background: "rgba(255,255,255,0.05)",
        backdropFilter: "blur(10px)",
        borderRadius: "1rem",
        overflow: "hidden",
        border: "1px solid rgba(168,85,247,0.2)",
        cursor: "pointer",
        transition: "transform 0.2s",
      }}
    >
      {/* Image */}
      <div style={{ height: "11rem", background: "linear-gradient(to bottom right, #7c3aed, #581c87)", position: "relative", overflow: "hidden" }}>
        {strain.image ? (
          <img src={strain.image} alt={strain.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "4.5rem", opacity: 0.7 }}>🍄</div>
        )}
        {strain.beginner === "Yes" && (
          <div style={{ position: "absolute", top: "0.75rem", left: "0.75rem", background: "rgba(34,197,94,0.9)", color: "white", fontSize: "0.75rem", padding: "0.25rem 0.5rem", borderRadius: "9999px", fontWeight: "500" }}>
            Beginner ✓
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
          <h3 style={{ fontSize: "1.125rem", fontWeight: "600", color: "white", lineHeight: 1.25 }}>{strain.name}</h3>
          <div style={{ color: "#a78bfa", fontSize: "0.875rem", fontWeight: "500", flexShrink: 0 }}>{strain.confidence}%</div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginTop: "0.75rem" }}>
          {strain.vibe.slice(0, 3).map((v) => (
            <span key={v} style={{ padding: "0.25rem 0.5rem", background: "rgba(88,28,135,0.5)", borderRadius: "9999px", color: "#c4b5fd", fontSize: "0.75rem" }}>
              {v}
            </span>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid rgba(168,85,247,0.2)", textAlign: "center" }}>
          <div>
            <div style={{ color: "#a78bfa", fontSize: "0.75rem" }}>Potency</div>
            <div style={{ color: "white", fontSize: "0.75rem", marginTop: "0.125rem", fontWeight: "500" }}>{strain.potency}</div>
          </div>
          <div>
            <div style={{ color: "#a78bfa", fontSize: "0.75rem" }}>Stability</div>
            <div style={{ color: "white", fontSize: "0.75rem", marginTop: "0.125rem", fontWeight: "500" }}>{strain.stability}</div>
          </div>
          <div>
            <div style={{ color: "#a78bfa", fontSize: "0.75rem" }}>Visuals</div>
            <div style={{ color: "white", fontSize: "0.75rem", marginTop: "0.125rem", fontWeight: "500" }}>{strain.visual}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StrainDetail({ strain, onBack }: { strain: Strain; onBack: () => void }) {
  const [tab, setTab] = useState<"overview" | "experience" | "feedback">("overview");

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(to bottom, #0f172a, #1e1b4b, #0f172a)" }}>
      <div style={{ maxWidth: "64rem", margin: "0 auto", padding: "1.5rem 1rem 0" }}>
        <button
          onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#a78bfa", background: "transparent", border: "none", cursor: "pointer" }}
        >
          <span>←</span> Back to Explorer
        </button>
      </div>

      {/* Hero */}
      <div style={{ maxWidth: "64rem", margin: "0 auto", padding: "2rem 1rem" }}>
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            backdropFilter: "blur(10px)",
            borderRadius: "1.5rem",
            overflow: "hidden",
            border: "1px solid rgba(168,85,247,0.2)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                height: "14rem",
                background: "linear-gradient(to bottom right, #7c3aed, #581c87)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {strain.image ? (
                <img src={strain.image} alt={strain.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: "6rem" }}>🍄</span>
              )}
            </div>
            <div style={{ padding: "2rem" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <h1 style={{ fontSize: "2rem", fontWeight: "bold", color: "white" }}>{strain.name}</h1>
                  <p style={{ color: "#c4b5fd", marginTop: "0.25rem" }}>Psilocybe cubensis</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "1.875rem", fontWeight: "bold", color: "#a78bfa" }}>{strain.confidence}%</div>
                  <div style={{ color: "#7c3aed", fontSize: "0.875rem" }}>confidence</div>
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1.5rem" }}>
                {strain.vibe.map((v) => (
                  <span key={v} style={{ padding: "0.5rem 1rem", background: "rgba(147,51,234,0.3)", borderRadius: "9999px", color: "#e9d5ff", fontSize: "0.875rem", fontWeight: "500" }}>
                    {v}
                  </span>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginTop: "2rem" }}>
                {[
                  { label: "Potency", value: strain.potency },
                  { label: "Stability", value: strain.stability },
                  { label: "Visuals", value: strain.visual },
                  { label: "Beginner", value: strain.beginner, color: strain.beginner === "Yes" ? "#4ade80" : strain.beginner === "No" ? "#f87171" : "#facc15" },
                ].map((stat) => (
                  <div key={stat.label} style={{ background: "rgba(0,0,0,0.2)", borderRadius: "0.75rem", padding: "0.75rem", textAlign: "center" }}>
                    <div style={{ color: "#a78bfa", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{stat.label}</div>
                    <div style={{ fontSize: "0.875rem", fontWeight: "600", marginTop: "0.25rem", color: stat.color || "white" }}>{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: "64rem", margin: "0 auto", padding: "0 1rem" }}>
        <div style={{ display: "flex", gap: "0.25rem", background: "rgba(255,255,255,0.05)", backdropFilter: "blur(10px)", borderRadius: "0.75rem", padding: "0.25rem", width: "fit-content" }}>
          {(["overview", "experience", "feedback"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "0.625rem 1.25rem",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
                fontWeight: "500",
                textTransform: "capitalize",
                background: tab === t ? "#9333ea" : "transparent",
                color: tab === t ? "white" : "#a78bfa",
                border: "none",
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ marginTop: "1.5rem", paddingBottom: "4rem" }}>
          {tab === "overview" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1.5rem" }}>
              <div
                style={{
                  background: "rgba(255,255,255,0.05)",
                  backdropFilter: "blur(10px)",
                  borderRadius: "1rem",
                  padding: "1.5rem",
                  border: "1px solid rgba(168,85,247,0.2)",
                }}
              >
                <h3 style={{ fontSize: "1.125rem", fontWeight: "600", color: "white", marginBottom: "1rem" }}>Description</h3>
                <p style={{ color: "#e9d5ff", lineHeight: 1.625 }}>{strain.description}</p>
              </div>
              <div
                style={{
                  background: "rgba(255,255,255,0.05)",
                  backdropFilter: "blur(10px)",
                  borderRadius: "1rem",
                  padding: "1.5rem",
                  border: "1px solid rgba(168,85,247,0.2)",
                }}
              >
                <h3 style={{ fontSize: "1.125rem", fontWeight: "600", color: "white", marginBottom: "1rem" }}>Dose Sensitivity</h3>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <div style={{ flex: 1, height: "0.75rem", background: "rgba(88,28,135,0.5)", borderRadius: "9999px", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        borderRadius: "9999px",
                        background: strain.potency.includes("Very High")
                          ? "linear-gradient(to right, #ef4444, #f87171)"
                          : strain.potency.includes("High")
                          ? "linear-gradient(to right, #f97316, #fb923c)"
                          : "linear-gradient(to right, #22c55e, #4ade80)",
                        width: strain.potency.includes("Very High") ? "83%" : strain.potency.includes("High") ? "66%" : "33%",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontWeight: "500",
                      color: strain.potency.includes("Very High") ? "#f87171" : strain.potency.includes("High") ? "#fb923c" : "#4ade80",
                    }}
                  >
                    {strain.potency.includes("Very High") ? "Steep" : strain.potency.includes("High") ? "Medium" : "Gentle"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {tab === "experience" && (
            <div
              style={{
                background: "rgba(255,255,255,0.05)",
                backdropFilter: "blur(10px)",
                borderRadius: "1rem",
                padding: "1.5rem",
                border: "1px solid rgba(168,85,247,0.2)",
              }}
            >
              <h3 style={{ fontSize: "1.125rem", fontWeight: "600", color: "white", marginBottom: "1rem" }}>What It Feels Like</h3>
              <p style={{ color: "#e9d5ff", lineHeight: 1.625, fontSize: "1.125rem", fontStyle: "italic", marginBottom: "1rem" }}>"{strain.description}"</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" }}>
                {strain.vibe.map((v) => (
                  <span key={v} style={{ padding: "0.5rem 1rem", background: "rgba(88,28,135,0.5)", borderRadius: "9999px", color: "#e9d5ff" }}>
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}

          {tab === "feedback" && (
            <div
              style={{
                background: "rgba(255,255,255,0.05)",
                backdropFilter: "blur(10px)",
                borderRadius: "1rem",
                padding: "1.5rem",
                border: "1px solid rgba(168,85,247,0.2)",
              }}
            >
              <h3 style={{ fontSize: "1.125rem", fontWeight: "600", color: "white", marginBottom: "1rem" }}>Share Your Experience</h3>
              <p style={{ color: "#c4b5fd", marginBottom: "1.5rem" }}>Help improve Tripdar's predictions by sharing whether this profile matched your experience.</p>
              <button
                style={{
                  padding: "0.75rem 1.5rem",
                  background: "#9333ea",
                  color: "white",
                  borderRadius: "0.75rem",
                  fontWeight: "500",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Submit Feedback
              </button>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem", marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid rgba(168,85,247,0.2)", textAlign: "center" }}>
                <div>
                  <div style={{ fontSize: "1.875rem", fontWeight: "bold", color: "#c4b5fd" }}>--</div>
                  <div style={{ color: "#7c3aed", fontSize: "0.875rem", marginTop: "0.25rem" }}>Reports</div>
                </div>
                <div>
                  <div style={{ fontSize: "1.875rem", fontWeight: "bold", color: "#4ade80" }}>--%</div>
                  <div style={{ color: "#7c3aed", fontSize: "0.875rem", marginTop: "0.25rem" }}>Match Rate</div>
                </div>
                <div>
                  <div style={{ fontSize: "1.875rem", fontWeight: "bold", color: "#c4b5fd" }}>--</div>
                  <div style={{ color: "#7c3aed", fontSize: "0.875rem", marginTop: "0.25rem" }}>Avg Intensity</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
