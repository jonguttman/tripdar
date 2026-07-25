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
  // Dose experience descriptions (6-element array, one per dose level)
  doseExperiences?: string[];
}

/**
 * Canonical strain data
 * In production, this would come from a database
 */
export const STRAIN_DATA: InternalStrain[] = [
  // ===== WILD TYPES (Generation 0) =====
  {
    id: "golden-teacher", name: "Golden Teacher", potency: "Moderate", stability: "Medium", beginner: "Yes", visual: "Medium",
    vibe: ["reflective", "warm", "grounded", "clear", "social", "nature-friendly"], confidence: 85,
    description: "Balanced classic with warm introspection and medium visuals; a steady \u2018home base\u2019 strain.",
    generation: 0, parentStrains: [], lineageNotes: "Classic wild-type cubensis, origins debated",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Balanced",
    emotionalCharacter: ["Insightful", "Calm", "Appreciative"], comeUpIntensity: "Gradual", peakCharacter: "Sustained plateau",
    doseExperiences: ["Gentle clarity, quiet warmth", "Soft glow; mood lifts, colors hum", "Warm visuals bloom, insights flow freely", "Deep reflection, kaleidoscopic warmth", "Boundaries soften into golden light", "Surrender to the teacher within"]
  },
  {
    id: "penis-envy", name: "Penis Envy", potency: "High-Very High", stability: "High", beginner: "No", visual: "High",
    vibe: ["intense", "inward", "mystical", "reality-bending", "emotional", "profound"], confidence: 80,
    description: "Legendary heavy-hitter family; deep headspace and bold visuals; experienced users only.",
    generation: 0, parentStrains: [], lineageNotes: "Legendary cultivar attributed to Terence McKenna lineage",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-dominant",
    emotionalCharacter: ["Powerful", "Cathartic", "Sometimes challenging", "Awe"], comeUpIntensity: "Intense", peakCharacter: "Rolling waves",
    doseExperiences: ["Subtle but potent mental sharpening", "Mood deepens; edges start to shimmer", "Bold headspace; visuals push inward", "Reality bends, profound inner journey", "Ego dissolving, mystical depths open", "Total reality override \u2014 deep reverence"]
  },
  {
    id: "b-plus", name: "B+", potency: "Moderate", stability: "Variable", beginner: "Yes", visual: "Medium",
    vibe: ["easygoing", "bright", "social", "whimsical", "classic"], confidence: 75,
    description: "Classic all-around cube; friendly vibe with notable batch variability.",
    generation: 0, parentStrains: [], lineageNotes: "Classic cultivar, widely distributed baseline",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Balanced",
    emotionalCharacter: ["Upbeat", "Playful", "Cheerful"], comeUpIntensity: "Gradual", peakCharacter: "Rolling waves",
    doseExperiences: ["Easy mental lift, bright mood", "Playful buzz; world looks brighter", "Friendly visuals roll in gently", "Whimsical depth, warm social glow", "Boundaries blur in bright waves", "The classic trip takes the wheel"]
  },
  {
    id: "cambodian", name: "Cambodian", potency: "Moderate", stability: "Medium", beginner: "Yes", visual: "Low-Medium",
    vibe: ["bright", "simple", "outdoorsy", "buoyant", "clear"], confidence: 70,
    description: "Straightforward classic; typically clean and approachable with modest visuals.",
    generation: 0, parentStrains: [], lineageNotes: "Wild Southeast Asian isolation, 1990s",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Balanced",
    emotionalCharacter: ["Light", "Open", "Cheerful"], comeUpIntensity: "Gentle", peakCharacter: "Sustained plateau",
    doseExperiences: ["Clean mental reset, quiet energy", "Simple brightness, easy smile", "Clear-headed warmth, gentle visuals", "Buoyant journey through simple beauty", "Clean intensity, grounded and open", "Simplicity becomes the whole world"]
  },
  {
    id: "hillbilly", name: "Hillbilly", potency: "Low-Moderate", stability: "Medium", beginner: "Yes", visual: "Low-Medium",
    vibe: ["cozy", "grounded", "giggly", "gentle", "social"], confidence: 72,
    description: "Gentle-to-moderate lane with warm mood lift and grounded feel.",
    generation: 0, parentStrains: [], lineageNotes: "Attributed to Arkansas/Southern US wild collection",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Balanced→Body-forward",
    emotionalCharacter: ["Playful", "Comforting", "Steady"], comeUpIntensity: "Gentle", peakCharacter: "Rolling waves",
    doseExperiences: ["Easy warmth, gentle mood boost", "Giggly glow; the world feels cozy", "Grounded waves of comfort and color", "Deep belly warmth, soft visual drift", "Body hum deepens, mind opens wide", "Full surrender into earthy warmth"]
  },
  {
    id: "blue-meanie", name: "Blue Meanie", potency: "Moderate", stability: "Variable", beginner: "Maybe", visual: "Medium-High",
    vibe: ["zippy", "electric", "playful", "bright visuals", "social"], confidence: 65,
    description: "Energetic, visual-leaning; naming confusion and batch variance are common.",
    generation: 0, parentStrains: [], lineageNotes: "Cubensis cultivar (not Pan. cyanescens)",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-dominant",
    emotionalCharacter: ["Euphoric", "Energized", "Occasionally edgy"], comeUpIntensity: "Moderate", peakCharacter: "Rolling waves",
    doseExperiences: ["Zippy mental spark, subtle buzz", "Electric edges; colors start popping", "Bright visuals crackle with energy", "Electric playground of color and sound", "Lightning storm of dissolving edges", "Full voltage \u2014 nothing held back"]
  },
  {
    id: "pink-buffalo", name: "Pink Buffalo", potency: "Moderate", stability: "Medium", beginner: "Yes", visual: "Medium-High",
    vibe: ["bright", "clear", "playful", "social", "lightly spiritual"], confidence: 70,
    description: "Thai-lore classic: clear-headed, upbeat, with visual sparkle.",
    generation: 0, parentStrains: [], lineageNotes: "Thai wild collection, named after local folklore",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Balanced",
    emotionalCharacter: ["Euphoric", "Clear", "Happy", "Curious"], comeUpIntensity: "Gradual", peakCharacter: "Rolling waves",
    doseExperiences: ["Clear uplift, gentle sparkle", "Bright mood; playful visual hints", "Sparkling clarity, joyful visuals rise", "Crystal-clear depth, spiritual shimmer", "Radiant dissolving into bright joy", "Pure light speaks in colors"]
  },
  {
    id: "melmac", name: "Melmac", potency: "High-Very High", stability: "High", beginner: "No", visual: "High",
    vibe: ["heavy", "profound", "inward", "cinematic", "mystical"], confidence: 70,
    description: "PE-family intensity: dense, serious peak and strong visuals.",
    generation: 0, parentStrains: [], lineageNotes: "Original PE genetics, preserved homestead cultivar",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-dominant",
    emotionalCharacter: ["Reverent", "Intense", "Sometimes challenging"], comeUpIntensity: "Intense", peakCharacter: "Sustained plateau",
    doseExperiences: ["Dense mental focus, quiet weight", "Gravity deepens; headspace thickens", "Heavy cinema of the mind unfolds", "Profound inward descent, dense visuals", "Ancient gravity pulls consciousness deep", "The original code reveals itself"]
  },
  {
    id: "tosohatchee", name: "Tosohatchee", potency: "Variable", stability: "Variable", beginner: "Maybe", visual: "Medium",
    vibe: ["earthy", "outdoorsy", "raw", "curious", "rustic"], confidence: 58,
    description: "Wild-Florida lore; classic effects with higher unpredictability.",
    generation: 0, parentStrains: [], lineageNotes: "Wild Florida collection from Tosohatchee WMA",
    onsetTime: "15-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Balanced",
    emotionalCharacter: ["Curious", "Grounding", "Unpredictable"], comeUpIntensity: "Variable", peakCharacter: "Variable",
    doseExperiences: ["Raw earth energy, gentle stir", "Wild-feeling warmth starts to creep", "Untamed visuals, primal and raw", "Florida wild lore comes alive", "Unpredictable depths, raw and real", "Nature speaks in its own tongue"]
  },

  // ===== GENERATION 1 (Direct derivatives) =====
  {
    id: "albino-penis-envy", name: "Albino Penis Envy", potency: "Very High", stability: "High", beginner: "No", visual: "Very High",
    vibe: ["intense", "cosmic", "transformative", "emotionally deep", "mystical"], confidence: 78,
    description: "Top-tier intensity with big visuals; experienced users only.",
    generation: 1, parentStrains: ["penis-envy"], lineageNotes: "Albino mutation of Penis Envy",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-dominant",
    emotionalCharacter: ["Powerful", "Cathartic", "Potentially challenging"], comeUpIntensity: "Intense", peakCharacter: "Sharp peak → sustained plateau",
    doseExperiences: ["Cosmic whisper, potent mental edge", "Deep space stirs; intensity builds", "Cosmic visuals ignite, ego thins", "Transcendent descent into white light", "Total transformation, cosmic depths", "The universe folds in on itself"]
  },
  {
    id: "ghost", name: "Ghost", potency: "High", stability: "High", beginner: "Maybe", visual: "High",
    vibe: ["lucid", "contemplative", "airy", "refined", "emotionally lifting"], confidence: 74,
    description: "Lucid, head-forward intensity with crisp visuals; often tied to TAT lineage.",
    generation: 1, parentStrains: ["golden-teacher"], lineageNotes: "True Albino Teacher (TAT) isolation",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-dominant",
    emotionalCharacter: ["Lucid", "Uplifting", "Introspective"], comeUpIntensity: "Moderate", peakCharacter: "Sustained plateau",
    doseExperiences: ["Airy lucidity, thoughts crystallize", "Ethereal clarity begins to float", "Lucid visions drift like smoke", "Ghostly beauty, time suspends", "Translucent reality, ego fades softly", "Become the ghost \u2014 formless and free"]
  },
  {
    id: "tidal-wave", name: "Tidal Wave", potency: "Very High", stability: "Variable", beginner: "No", visual: "Very High",
    vibe: ["tidal", "explosive", "euphoric", "visionary", "immersive"], confidence: 80,
    description: "Modern hybrid legend; very high visuals; multiple isolates under one umbrella name.",
    generation: 1, parentStrains: ["penis-envy", "b-plus"], lineageNotes: "PE \u00d7 B+ cross by Magic Myco",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-dominant",
    emotionalCharacter: ["Euphoric", "Awe", "Sometimes overwhelming"], comeUpIntensity: "Intense", peakCharacter: "Rolling waves",
    doseExperiences: ["Undercurrent of energy and focus", "First waves of euphoria roll in", "Crashing waves of color and emotion", "Immersive tidal visuals, time drowns", "Tsunami of dissolving boundaries", "Total submersion \u2014 no coming up for air"]
  },
  {
    id: "koh-samui-super-strain", name: "Koh Samui Super Strain", potency: "Moderate-High", stability: "Medium", beginner: "Maybe", visual: "Medium-High",
    vibe: ["tropical", "playful", "social", "lively", "colorful"], confidence: 68,
    description: "Thai-icon vibe: lively mood with bright visuals; name evolution acknowledged.",
    generation: 1, parentStrains: [], lineageNotes: "Isolation from Koh Samui Classic (Thai)",
    onsetTime: "15-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Balanced",
    emotionalCharacter: ["Upbeat", "Playful", "Energized"], comeUpIntensity: "Gradual", peakCharacter: "Rolling waves",
    doseExperiences: ["Tropical lift, easy brightness", "Island warmth; colors turn vivid", "Lively visuals, playful island energy", "Tropical immersion, time melts warm", "Full island storm of color and joy", "Swallowed whole by paradise"]
  },
  {
    id: "ice", name: "Ice", potency: "Moderate-High", stability: "Variable", beginner: "Maybe", visual: "Medium-High",
    vibe: ["crisp", "clean", "dreamy", "quiet", "luminous"], confidence: 70,
    description: "Modern \u2018ice\u2019 branding with thinner public lineage documentation; treat as variable.",
    generation: 1, parentStrains: [], lineageNotes: "Albino Thai Lipa Yai (ATLY) isolation",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-dominant",
    emotionalCharacter: ["Calm", "Lucid", "Introspective"], comeUpIntensity: "Moderate", peakCharacter: "Sustained plateau",
    doseExperiences: ["Cool mental clarity, quiet glow", "Dreamy frost; edges turn luminous", "Clean lucid waves, ice-bright visuals", "Frozen dreamscape, deep and still", "Glacial depths of quiet intensity", "The still point of frozen eternity"]
  },
  {
    id: "khmer-kong", name: "Khmer Kong", potency: "Moderate-High", stability: "Medium", beginner: "Maybe", visual: "Medium-High",
    vibe: ["bold", "warm", "embodied", "adventurous", "energized"], confidence: 55,
    description: "Bold modern cross claim with adventurous energy and active visuals.",
    generation: 1, parentStrains: ["cambodian"], lineageNotes: "Enhanced Cambodian isolation",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Balanced→Head-leaning",
    emotionalCharacter: ["Euphoric", "Adventurous", "Sensory-forward"], comeUpIntensity: "Moderate", peakCharacter: "Rolling waves",
    doseExperiences: ["Bold warmth, subtle body hum", "Adventurous energy stirs awake", "Warm, bold visuals with body pull", "Embodied adventure, senses amplified", "Primal warmth overtakes the mind", "The jungle king awakens fully"]
  },
  {
    id: "bluey-vuitton", name: "Bluey Vuitton", potency: "High", stability: "High", beginner: "No", visual: "High",
    vibe: ["euphoric", "luxurious", "visual", "confident", "creative", "social-glow"], confidence: 68,
    description: "Designer hybrid (Panama x Melmac PE) with luxe visuals and strong headspace.",
    generation: 1, parentStrains: ["melmac"], lineageNotes: "Panama \u00d7 Melmac PE hybrid",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-dominant",
    emotionalCharacter: ["Inspired", "Loving", "Energized"], comeUpIntensity: "Moderate", peakCharacter: "Sustained plateau",
    doseExperiences: ["Designer focus, refined mental edge", "Luxe mood lift; colors deepen", "Rich visuals drip with euphoria", "Opulent headspace, velvet visions", "Luxury dissolves into pure feeling", "Nothing left but golden ecstasy"]
  },
  {
    id: "full-moon-party", name: "Full Moon Party", potency: "Moderate-High", stability: "Variable", beginner: "Maybe", visual: "Medium-High",
    vibe: ["social", "celebratory", "playful", "music-friendly", "colorful"], confidence: 57,
    description: "Festival Thai archetype; playful visuals and social mood; lineage mostly lore-based.",
    generation: 1, parentStrains: [], lineageNotes: "Thai Elephant Dung derivative",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Balanced",
    emotionalCharacter: ["Euphoric", "Playful", "Loving", "Energized"], comeUpIntensity: "Moderate", peakCharacter: "Rolling waves",
    doseExperiences: ["Festive spark, social warmth rises", "Party glow; everything feels alive", "Celebratory visuals dance and shimmer", "Full festival of the senses", "The party becomes the universe", "Midnight surrender under infinite moons"]
  },
  {
    id: "jedi-mind-fuck", name: "Jedi Mind Fuck", potency: "Moderate-High", stability: "Variable", beginner: "Maybe", visual: "Medium-High",
    vibe: ["trippy", "heady", "playful", "immersive", "cinematic"], confidence: 66,
    description: "Heady, visual lane with thin origin documentation; treat as variable.",
    generation: 1, parentStrains: [], lineageNotes: "Origin unclear, possibly Z-strain derivative",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-dominant",
    emotionalCharacter: ["Playful", "Surprised", "Expansive"], comeUpIntensity: "Moderate", peakCharacter: "Rolling waves",
    doseExperiences: ["The Force stirs quietly within", "Mind tricks begin; perception shifts", "The Force flows strong; visuals go cinematic", "Full mind trick; reality rewrites itself", "The dark side and light merge as one", "There is no spoon \u2014 only the Force"]
  },
  {
    id: "a-train", name: "A-Train", potency: "Moderate-High", stability: "Variable", beginner: "Maybe", visual: "Medium-High",
    vibe: ["energizing", "forward", "social", "euphoric", "kinetic"], confidence: 58,
    description: "Momentum lane with limited open lineage documentation; treat as variable.",
    generation: 1, parentStrains: [], lineageNotes: "Possibly derived from Albino A+",
    onsetTime: "15-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-dominant",
    emotionalCharacter: ["Energized", "Euphoric", "Excited"], comeUpIntensity: "Moderate", peakCharacter: "Rolling waves",
    doseExperiences: ["Forward momentum, sharp mental lift", "Kinetic buzz; energy starts rolling", "Full speed visuals, euphoric rush", "Express ride through time and color", "No stops \u2014 momentum takes over", "The rails dissolve into pure speed"]
  },

  // ===== GENERATION 2 (Second-level derivatives) =====
  {
    id: "enigma", name: "Enigma", potency: "Very High", stability: "High", beginner: "No", visual: "Very High",
    vibe: ["alien", "mystical", "reality-melting", "deep", "transformative"], confidence: 75,
    description: "Sporeless/mutation culture icon: very high intensity and big visuals.",
    generation: 2, parentStrains: ["tidal-wave"], lineageNotes: "Blob mutation of Tidal Wave, sporeless",
    onsetTime: "15-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-dominant",
    emotionalCharacter: ["Mystical", "Cathartic", "Awe", "Potentially challenging"], comeUpIntensity: "Intense", peakCharacter: "Sustained plateau",
    doseExperiences: ["Alien whisper at the edge of thought", "Strange beauty stirs; reality bends", "Reality melts into alien geometry", "Deep enigma; nothing is familiar", "Complete reality meltdown, mystical void", "The riddle answers itself"]
  },
  {
    id: "chodewave", name: "ChodeWave", potency: "Very High", stability: "High", beginner: "No", visual: "Very High",
    vibe: ["heavy", "loud", "euphoric", "boundary-dissolving", "intense"], confidence: 60,
    description: "Modern powerhouse cross (TW x APE) with very high visuals and intensity.",
    generation: 2, parentStrains: ["tidal-wave"], lineageNotes: "Tidal Wave phenotype selection",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-dominant",
    emotionalCharacter: ["Euphoric", "Cathartic", "Sometimes overwhelming"], comeUpIntensity: "Intense", peakCharacter: "Rolling waves",
    doseExperiences: ["Potent undercurrent, heavy clarity", "Heavy euphoria starts to pound", "Loud waves crash through perception", "Euphoric overload, heavy immersion", "Boundary-dissolving thunder rolls in", "Total annihilation \u2014 pure euphoria"]
  },
  {
    id: "avalanche", name: "Avalanche", potency: "High", stability: "High", beginner: "No", visual: "High",
    vibe: ["crisp", "powerful", "luminous", "introspective", "cinematic"], confidence: 67,
    description: "Bright-storm lane: Yeti x Melmac lineage claim; high visuals and strong headspace.",
    generation: 2, parentStrains: ["melmac"], lineageNotes: "Yeti \u00d7 Melmac (Yeti = TAT \u00d7 PE derivative)",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-dominant",
    emotionalCharacter: ["Euphoric", "Contemplative", "Deep"], comeUpIntensity: "Moderate", peakCharacter: "Sustained plateau",
    doseExperiences: ["Bright-storm clarity, quiet power", "Luminous energy begins to build", "Crisp visuals cascade like snow", "Bright avalanche of contemplation", "Unstoppable luminous force descends", "Buried in brilliance, ego vanishes"]
  },
  {
    id: "jack-frost", name: "Jack Frost", potency: "High", stability: "High", beginner: "No", visual: "High",
    vibe: ["crystalline", "expansive", "mystical", "elegant", "emotionally deep"], confidence: 72,
    description: "TAT x APE modern classic credited to Dave Wombat; refined visuals and deep headspace.",
    generation: 2, parentStrains: ["ghost", "albino-penis-envy"], lineageNotes: "True Albino Teacher \u00d7 Albino Penis Envy",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-dominant",
    emotionalCharacter: ["Awe", "Loving", "Mystical", "Introspective"], comeUpIntensity: "Moderate", peakCharacter: "Sustained plateau",
    doseExperiences: ["Crisp mental clarity, light sparkle", "Colors brighten; cool euphoria lifts", "Frost-white visuals, clean euphoric waves", "Crystalline visions; time shimmers", "Frozen in awe; ego dissolves like ice", "Complete whiteout of the senses"]
  },
  {
    id: "makilla-gorilla", name: "Makilla Gorilla", potency: "High-Very High", stability: "High", beginner: "No", visual: "High",
    vibe: ["powerful", "primal", "euphoric", "deep", "intense"], confidence: 70,
    description: "PE-family brawler hybrid (Melmac x APE neighborhood); heavy visuals and strong force.",
    generation: 2, parentStrains: ["albino-penis-envy", "melmac"], lineageNotes: "APE \u00d7 DC Melmac cross",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-dominant",
    emotionalCharacter: ["Euphoric", "Cathartic", "Bold", "Sometimes challenging"], comeUpIntensity: "Intense", peakCharacter: "Rolling waves",
    doseExperiences: ["Primal focus, raw mental power", "Bold energy surges; edges soften", "Raw euphoria and primal visuals", "Deep jungle of the mind opens", "Primal force overwhelms all structure", "Pure power \u2014 the gorilla roars"]
  },
  {
    id: "trinity", name: "Trinity", potency: "Very High", stability: "High", beginner: "No", visual: "Very High",
    vibe: ["visionary", "euphoric", "mythic", "immersive", "spiritual"], confidence: 62,
    description: "Mythic three-parent lane (PE x Tidal Wave x Aztec God claim); very high visuals and depth.",
    generation: 2, parentStrains: ["tidal-wave"], lineageNotes: "PE/Tidal Wave lineage stacked hybrid",
    onsetTime: "30-45 min", typicalDuration: "4-6 hours", bodyHeadBalance: "Head-dominant",
    emotionalCharacter: ["Mystical", "Euphoric", "Cathartic", "Profound"], comeUpIntensity: "Intense", peakCharacter: "Multiple peaks",
    doseExperiences: ["Mythic stirring, visionary spark", "Three-fold energy begins to weave", "Mythic visuals bloom in layers", "Visionary depths, profound euphoria", "The trinity of self dissolves", "All three become one \u2014 total unity"]
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

function slugifyStrainValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeStrainSlug(
  value: string,
  catalog: ReadonlyArray<Pick<InternalStrain, "id" | "name">> = STRAIN_DATA
): string | null {
  const slug = slugifyStrainValue(value);
  if (!slug) return null;

  const strain = catalog.find(s => s.id === slug || slugifyStrainValue(s.name) === slug);
  return strain?.id ?? null;
}

export function isValidStrainSlug(value: string): boolean {
  return normalizeStrainSlug(value) !== null;
}

/**
 * Get strain by slug (URL-safe name)
 */
export function getStrainBySlug(slug: string): InternalStrain | undefined {
  const normalized = normalizeStrainSlug(slug);
  if (!normalized) return undefined;
  return getStrainById(normalized);
}

/**
 * Get total count
 */
export function getStrainCount(): number {
  return STRAIN_DATA.length;
}
