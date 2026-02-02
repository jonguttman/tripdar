/**
 * Strain Data Repository
 *
 * Internal strain records. This is Tripdar's canonical data source.
 * External access should ONLY go through the partner/publicView mapping layer.
 */

export interface InternalStrain {
  id: string;
  name: string;
  potency: string;
  stability: string;
  beginner: string;
  visual: string;
  vibe: string[];
  confidence: number;
  description: string;
}

/**
 * Canonical strain data
 * In production, this would come from a database
 */
export const STRAIN_DATA: InternalStrain[] = [
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

/**
 * Get all strains
 */
export function getAllStrains(): InternalStrain[] {
  return STRAIN_DATA;
}

/**
 * Get strain by ID
 */
export function getStrainById(id: string): InternalStrain | undefined {
  return STRAIN_DATA.find(s => s.id === id);
}

/**
 * Get strain by slug (URL-safe name)
 */
export function getStrainBySlug(slug: string): InternalStrain | undefined {
  return STRAIN_DATA.find(s => {
    const strainSlug = s.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return strainSlug === slug;
  });
}

/**
 * Get total count
 */
export function getStrainCount(): number {
  return STRAIN_DATA.length;
}
