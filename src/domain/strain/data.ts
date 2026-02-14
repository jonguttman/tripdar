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
  // Lineage
  parentStrains?: string[];
  lineageNotes?: string;
  generation?: number;
  // Experiential attributes
  onsetTime?: string;
  typicalDuration?: string;
  bodyHeadBalance?: string;
  emotionalCharacter?: string[];
  comeUpIntensity?: string;
  peakCharacter?: string;
}

/**
 * Canonical strain data
 * In production, this would come from a database
 */
export const STRAIN_DATA: InternalStrain[] = [
  // ===== WILD TYPES (Generation 0) =====
  {
    id: "golden-teacher", name: "Golden Teacher", potency: "Moderate", stability: "High", beginner: "Yes", visual: "Medium",
    vibe: ["teacher-like", "calm", "insightful"], confidence: 85,
    description: "One of the most iconic baseline cubensis varieties—widely seen as a steady, beginner-friendly reference point with a calm, introspective tone.",
    generation: 0, parentStrains: [], lineageNotes: "Classic wild-type cubensis, origins debated",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Balanced",
    emotionalCharacter: ["Contemplative", "Calming"], comeUpIntensity: "Gentle", peakCharacter: "Sustained plateau"
  },
  {
    id: "penis-envy", name: "Penis Envy", potency: "High-Very High", stability: "Medium", beginner: "No", visual: "High",
    vibe: ["deep", "visionary", "introspective"], confidence: 80,
    description: "Widely framed as a premium, historically influential cubensis line associated with a higher-potency reputation and a deeper, more immersive inner space experience.",
    generation: 0, parentStrains: [], lineageNotes: "Legendary cultivar attributed to Terence McKenna lineage",
    onsetTime: "30-45 min", typicalDuration: "6-8 hours", bodyHeadBalance: "Head-heavy",
    emotionalCharacter: ["Mystical", "Contemplative"], comeUpIntensity: "Intense", peakCharacter: "Sustained plateau"
  },
  {
    id: "b-plus", name: "B+", potency: "Moderate", stability: "High", beginner: "Yes", visual: "Medium",
    vibe: ["balanced", "dependable"], confidence: 75,
    description: "One of the classic workhorse cube names—popular, widely distributed, and often used as a base for newer crosses.",
    generation: 0, parentStrains: [], lineageNotes: "Classic cultivar, widely distributed baseline",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Balanced",
    emotionalCharacter: ["Euphoric", "Grounding"], comeUpIntensity: "Gradual", peakCharacter: "Sustained plateau"
  },
  {
    id: "cambodian", name: "Cambodian", potency: "Moderate", stability: "High", beginner: "Yes", visual: "Medium",
    vibe: ["clean", "uplifting"], confidence: 70,
    description: "Southeast Asian cubensis line, frequently attributed to being isolated from wild Cambodian material in the 1990s.",
    generation: 0, parentStrains: [], lineageNotes: "Wild Southeast Asian isolation, 1990s",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-leaning",
    emotionalCharacter: ["Energizing", "Euphoric"], comeUpIntensity: "Moderate", peakCharacter: "Sustained plateau"
  },
  {
    id: "hillbilly", name: "Hillbilly", potency: "Low-Moderate", stability: "High", beginner: "Yes", visual: "Low-Medium",
    vibe: ["giggly", "warm", "friendly"], confidence: 72,
    description: "Modern classic tied to Southern US lore—a strain people associate with giggly, friendly arcs rather than existential intensity.",
    generation: 0, parentStrains: [], lineageNotes: "Attributed to Arkansas/Southern US wild collection",
    onsetTime: "30-45 min", typicalDuration: "3-4 hours", bodyHeadBalance: "Body-leaning",
    emotionalCharacter: ["Playful", "Loving"], comeUpIntensity: "Gentle", peakCharacter: "Rolling waves"
  },
  {
    id: "blue-meanie", name: "Blue Meanie", potency: "Moderate", stability: "Medium", beginner: "Maybe", visual: "Medium",
    vibe: ["euphoric", "playful"], confidence: 65,
    description: "A naming-confusion case: the cubensis strain borrowed the nickname of Panaeolus cyanescens, which are a different species.",
    generation: 0, parentStrains: [], lineageNotes: "Cubensis cultivar (not Pan. cyanescens)",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Balanced",
    emotionalCharacter: ["Euphoric", "Playful"], comeUpIntensity: "Moderate", peakCharacter: "Rolling waves"
  },
  {
    id: "pink-buffalo", name: "Pink Buffalo", potency: "Moderate", stability: "High", beginner: "Yes", visual: "Medium",
    vibe: ["uplifting", "social", "warm"], confidence: 70,
    description: "Thai-associated cubensis line with a strong folklore identity (pink buffalo as a lucky sighting).",
    generation: 0, parentStrains: [], lineageNotes: "Thai wild collection, named after local folklore",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Balanced",
    emotionalCharacter: ["Loving", "Euphoric"], comeUpIntensity: "Gradual", peakCharacter: "Sustained plateau"
  },
  {
    id: "melmac", name: "Melmac", potency: "High-Very High", stability: "Medium", beginner: "No", visual: "High",
    vibe: ["alien", "strange", "deep"], confidence: 70,
    description: "Original Penis Envy genetics—a cornerstone variety in the PE lineage with deep, strange character.",
    generation: 0, parentStrains: [], lineageNotes: "Original PE genetics, preserved homestead cultivar",
    onsetTime: "30-45 min", typicalDuration: "6-8 hours", bodyHeadBalance: "Head-heavy",
    emotionalCharacter: ["Mystical", "Challenging"], comeUpIntensity: "Intense", peakCharacter: "Multiple peaks"
  },
  {
    id: "tosohatchee", name: "Tosohatchee", potency: "Variable", stability: "Variable", beginner: "Maybe", visual: "Medium",
    vibe: ["grounded", "earthy"], confidence: 58,
    description: "Wild Florida cubensis collection—earthy, immersive, and feels like it belongs outdoors.",
    generation: 0, parentStrains: [], lineageNotes: "Wild Florida collection from Tosohatchee WMA",
    onsetTime: "Variable", typicalDuration: "4-6 hours", bodyHeadBalance: "Body-leaning",
    emotionalCharacter: ["Grounding", "Contemplative"], comeUpIntensity: "Variable", peakCharacter: "Variable"
  },

  // ===== GENERATION 1 (Direct derivatives) =====
  {
    id: "albino-penis-envy", name: "Albino Penis Envy", potency: "Very High", stability: "Medium", beginner: "No", visual: "High",
    vibe: ["intense", "ceremonial", "deep"], confidence: 78,
    description: "Visually distinctive, high-potency PE offshoot with the strongest consensus being: PE-like depth, with extra punch.",
    generation: 1, parentStrains: ["penis-envy"], lineageNotes: "Albino mutation of Penis Envy",
    onsetTime: "30-45 min", typicalDuration: "6-8 hours", bodyHeadBalance: "Head-heavy",
    emotionalCharacter: ["Mystical", "Cathartic"], comeUpIntensity: "Intense", peakCharacter: "Sustained plateau"
  },
  {
    id: "ghost", name: "Ghost", potency: "High", stability: "High", beginner: "Maybe", visual: "Medium",
    vibe: ["lucid", "reflective"], confidence: 74,
    description: "True Albino Teacher isolate—calm, crystalline, and quietly powerful for thoughtful journeys.",
    generation: 1, parentStrains: ["golden-teacher"], lineageNotes: "True Albino Teacher (TAT) isolation",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-leaning",
    emotionalCharacter: ["Contemplative", "Calming"], comeUpIntensity: "Gentle", peakCharacter: "Sustained plateau"
  },
  {
    id: "tidal-wave", name: "Tidal Wave", potency: "Very High", stability: "Medium", beginner: "No", visual: "High",
    vibe: ["wave-like", "powerful"], confidence: 80,
    description: "A PE × B+ hybrid credited to Magic Myco, famous in potency narratives tied to psilocybin cup reporting.",
    generation: 1, parentStrains: ["penis-envy", "b-plus"], lineageNotes: "PE × B+ cross by Magic Myco",
    onsetTime: "30-45 min", typicalDuration: "6-8 hours", bodyHeadBalance: "Head-heavy",
    emotionalCharacter: ["Euphoric", "Mystical"], comeUpIntensity: "Intense", peakCharacter: "Rolling waves"
  },
  {
    id: "koh-samui-super-strain", name: "Koh Samui Super Strain", potency: "Moderate-High", stability: "Medium", beginner: "Maybe", visual: "Medium-High",
    vibe: ["energetic", "trickster onset"], confidence: 68,
    description: "An isolation of Koh Samui Classic (Thai origin), with a reputation for sudden it hits! transitions.",
    generation: 1, parentStrains: [], lineageNotes: "Isolation from Koh Samui Classic (Thai)",
    onsetTime: "15-30 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-leaning",
    emotionalCharacter: ["Energizing", "Playful"], comeUpIntensity: "Intense", peakCharacter: "Sharp peak"
  },
  {
    id: "ice", name: "Ice", potency: "Moderate-High", stability: "Medium", beginner: "Maybe", visual: "Medium-High",
    vibe: ["clear-headed", "crisp", "refined"], confidence: 70,
    description: "An albino isolation of Thai Lipa Yai (ATLY), with a crisp and clear-headed experience.",
    generation: 1, parentStrains: [], lineageNotes: "Albino Thai Lipa Yai (ATLY) isolation",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-heavy",
    emotionalCharacter: ["Contemplative", "Energizing"], comeUpIntensity: "Moderate", peakCharacter: "Sustained plateau"
  },
  {
    id: "khmer-kong", name: "Khmer Kong", potency: "Moderate-High", stability: "Medium", beginner: "Maybe", visual: "Medium",
    vibe: ["strong", "grounded"], confidence: 55,
    description: "Cambodian derivative with enhanced characteristics—solid and dependable with moderate-high potency.",
    generation: 1, parentStrains: ["cambodian"], lineageNotes: "Enhanced Cambodian isolation",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Balanced",
    emotionalCharacter: ["Grounding", "Energizing"], comeUpIntensity: "Moderate", peakCharacter: "Sustained plateau"
  },
  {
    id: "bluey-vuitton", name: "Bluey Vuitton", potency: "High", stability: "Medium", beginner: "No", visual: "High",
    vibe: ["luxury", "visual", "warm"], confidence: 68,
    description: "A Panama × Melmac PE hybrid—potent, visually rich, and emotionally warm when the setting supports it.",
    generation: 1, parentStrains: ["melmac"], lineageNotes: "Panama × Melmac PE hybrid",
    onsetTime: "30-45 min", typicalDuration: "6-8 hours", bodyHeadBalance: "Balanced",
    emotionalCharacter: ["Loving", "Euphoric"], comeUpIntensity: "Moderate", peakCharacter: "Rolling waves"
  },
  {
    id: "full-moon-party", name: "Full Moon Party", potency: "Moderate-High", stability: "Medium", beginner: "Maybe", visual: "Medium",
    vibe: ["energetic", "festival-bright"], confidence: 57,
    description: "An isolated precursor connected to a Thai Elephant Dung wild collection—uplifting and socially bright.",
    generation: 1, parentStrains: [], lineageNotes: "Thai Elephant Dung derivative",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-leaning",
    emotionalCharacter: ["Euphoric", "Energizing"], comeUpIntensity: "Moderate", peakCharacter: "Rolling waves"
  },
  {
    id: "jedi-mind-fuck", name: "Jedi Mind Fuck", potency: "Moderate-High", stability: "Medium", beginner: "Maybe", visual: "Medium-High",
    vibe: ["energetic", "adventurous"], confidence: 66,
    description: "A high-energy arc that feels like a bright, strange adventure with cosmic humor.",
    generation: 1, parentStrains: [], lineageNotes: "Origin unclear, possibly Z-strain derivative",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-leaning",
    emotionalCharacter: ["Playful", "Energizing"], comeUpIntensity: "Moderate", peakCharacter: "Rolling waves"
  },
  {
    id: "a-train", name: "A-Train", potency: "Moderate-High", stability: "Medium", beginner: "Maybe", visual: "Medium-High",
    vibe: ["fast onset", "rolling"], confidence: 58,
    description: "Known for rapid onset and rolling waves of experience—a smooth but decisive ride.",
    generation: 1, parentStrains: [], lineageNotes: "Possibly derived from Albino A+",
    onsetTime: "15-30 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Balanced",
    emotionalCharacter: ["Euphoric", "Energizing"], comeUpIntensity: "Intense", peakCharacter: "Rolling waves"
  },

  // ===== GENERATION 2 (Second-level derivatives) =====
  {
    id: "enigma", name: "Enigma", potency: "Very High", stability: "Variable", beginner: "No", visual: "Very High",
    vibe: ["dreamy", "immersive"], confidence: 75,
    description: "A stabilized blob/brain-like mutation descended from Tidal Wave. Notable for being sporeless.",
    generation: 2, parentStrains: ["tidal-wave"], lineageNotes: "Blob mutation of Tidal Wave, sporeless",
    onsetTime: "45-60 min", typicalDuration: "6-8 hours", bodyHeadBalance: "Head-heavy",
    emotionalCharacter: ["Mystical", "Cathartic"], comeUpIntensity: "Gradual", peakCharacter: "Multiple peaks"
  },
  {
    id: "chodewave", name: "ChodeWave", potency: "Very High", stability: "Medium", beginner: "No", visual: "High",
    vibe: ["intense", "waves"], confidence: 60,
    description: "A Tidal Wave phenotype selection—potent with pronounced wave-like intensity patterns.",
    generation: 2, parentStrains: ["tidal-wave"], lineageNotes: "Tidal Wave phenotype selection",
    onsetTime: "30-45 min", typicalDuration: "6-8 hours", bodyHeadBalance: "Head-heavy",
    emotionalCharacter: ["Euphoric", "Mystical"], comeUpIntensity: "Intense", peakCharacter: "Rolling waves"
  },
  {
    id: "avalanche", name: "Avalanche", potency: "High", stability: "Medium", beginner: "No", visual: "High",
    vibe: ["clean intensity", "deep"], confidence: 67,
    description: "A hybrid cross of Yeti × Melmac, placing it in the TAT/PE genetic constellation.",
    generation: 2, parentStrains: ["melmac"], lineageNotes: "Yeti × Melmac (Yeti = TAT × PE derivative)",
    onsetTime: "30-45 min", typicalDuration: "6-8 hours", bodyHeadBalance: "Head-leaning",
    emotionalCharacter: ["Contemplative", "Mystical"], comeUpIntensity: "Moderate", peakCharacter: "Sustained plateau"
  },
  {
    id: "jack-frost", name: "Jack Frost", potency: "High", stability: "Medium", beginner: "No", visual: "High",
    vibe: ["crisp", "bright", "visual"], confidence: 72,
    description: "TAT × APE cross known for striking white appearance and bright, visual-forward experiences.",
    generation: 2, parentStrains: ["ghost", "albino-penis-envy"], lineageNotes: "True Albino Teacher × Albino Penis Envy",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-leaning",
    emotionalCharacter: ["Euphoric", "Playful"], comeUpIntensity: "Moderate", peakCharacter: "Sustained plateau"
  },
  {
    id: "makilla-gorilla", name: "Makilla Gorilla", potency: "High-Very High", stability: "Medium", beginner: "No", visual: "High",
    vibe: ["uplifting", "deep"], confidence: 70,
    description: "APE × DC Melmac cross—strong visuals, strong uplift, and a deep inner arc.",
    generation: 2, parentStrains: ["albino-penis-envy", "melmac"], lineageNotes: "APE × DC Melmac cross",
    onsetTime: "30-45 min", typicalDuration: "6-8 hours", bodyHeadBalance: "Head-heavy",
    emotionalCharacter: ["Euphoric", "Mystical"], comeUpIntensity: "Intense", peakCharacter: "Rolling waves"
  },
  {
    id: "trinity", name: "Trinity", potency: "Very High", stability: "Medium", beginner: "No", visual: "Very High",
    vibe: ["big medicine", "profound"], confidence: 62,
    description: "A stacked hybrid in the PE/Tidal Wave world—powerful, visionary, and best handled with strong respect and intention.",
    generation: 2, parentStrains: ["tidal-wave"], lineageNotes: "PE/Tidal Wave lineage stacked hybrid",
    onsetTime: "30-45 min", typicalDuration: "6-8 hours", bodyHeadBalance: "Head-heavy",
    emotionalCharacter: ["Mystical", "Cathartic"], comeUpIntensity: "Intense", peakCharacter: "Multiple peaks"
  },
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
