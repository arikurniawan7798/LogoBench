/**
 * Canned model answers for the demo data set (`npm run seed:demo`). The brands are invented for the demo; the text is
 * written to read like a careful review so the seeded app looks realistic. Every answer is validated by the same zod
 * schemas the real provider output goes through (FakeProvider -> schema.safeParse).
 */
import type { AdvancedReview, ReviewResult } from "../../src/review/schema.js";

export type DemoColor = { hex: string; name: string };
export type DemoBrand = {
  /** Project name shown in the app. */
  name: string;
  /** Logo files under scripts/demo/logos, oldest first: every entry after the first is uploaded as a new version. */
  logos: string[];
  brief: string;
  review: ReviewResult;
  advanced?: Omit<AdvancedReview, keyof ReviewResult>;
  /** The designed colors; extracted swatches are named after the nearest one. */
  colors: DemoColor[];
  /** Names for generated neutrals: [dark, light]. */
  neutralNames: [string, string];
  /** The designed main color (hex), proposed to the color service as the main brand color. */
  main: string;
  paletteSummary: string;
  type: { heading: string; body: string; accent?: string };
};

const d = (score: number, reason: string) => ({ score, reason });

export const HALDEN: DemoBrand = {
  name: "Halden Roasters",
  logos: ["halden-roasters-v1.svg", "halden-roasters.svg"],
  brief:
    "Halden Roasters is a small-batch coffee roaster opening its first cafe and selling beans online. Audience: neighbourhood regulars and specialty-coffee subscribers aged 25-45. It should feel warm, crafted and a little nostalgic without looking old-fashioned, and must work on cup sleeves, bag labels and a 32 px favicon.",
  review: {
    scores: {
      readability: d(8, "The sun-over-horizon silhouette reads at a glance, and the three cream bars stay distinct down to roughly 48 px before the lowest one starts to merge."),
      originality: d(6, "Sunrise and steam are familiar coffee cues. Horizon bars that double as a cup base add a twist, but the overall idea stays close to category conventions."),
      balance: d(8, "Weight is centred and the tapering bars anchor the half-disc well; the steam curls sit a touch left of the optical centre."),
      scalability: d(7, "Solid as a disc on stickers and sleeves. The thin steam strokes fade below 32 px, so a simplified small-size variant is advisable."),
      misinterpretation: d(9, "Very low risk: the shapes read as a sunrise or a steaming cup, both on-brief, and no stray letterforms appear when reduced or rotated."),
    },
    personality: {
      presence: "Confident",
      attitude: "Welcoming",
      formality: "Relaxed",
      style: "Retro-modern",
      tone: "Warm",
      positioning: "Premium craft",
    },
    summary:
      "A warm, well-balanced emblem that tells the morning-ritual story in two quick shapes. The espresso disc gives it a solid footprint on packaging and the terracotta sun adds energy without shouting. The fine steam strokes at small sizes and an idea that leans on familiar coffee imagery are the main things to address: a reduced favicon variant and one ownable detail would lift it.",
  },
  advanced: {
    fixes: [
      { issue: "Steam strokes disappear below 32 px.", fix: "Ship a small-size variant without the steam, and thicken the horizon bars to at least 14 units.", priority: "high" },
      { issue: "Terracotta and espresso are close in value, so the sun loses contrast in greyscale.", fix: "Lighten the sun toward #E07A4F, or add a thin cream keyline so the shapes separate in one-colour print.", priority: "high" },
      { issue: "The steam pair sits slightly off the sun's vertical axis.", fix: "Shift both curls about 3 units to the right so they centre on the sun.", priority: "medium" },
      { issue: "The rounded bar ends compete with the crisp half-disc.", fix: "Try square ends on the bars, or round the sun's baseline corners to match.", priority: "low" },
      { issue: "The sunrise idea is shared by many cafes.", fix: "Add one ownable detail, for example a bean-shaped notch cut into the sun.", priority: "low" },
    ],
    checklist: [
      { item: "Works on both light and dark backgrounds", done: true },
      { item: "Palette limited to three colours", done: true },
      { item: "Symmetric construction around a clear centre axis", done: true },
      { item: "Holds up in a single colour", done: false },
      { item: "Recognisable at 32 px", done: false },
      { item: "No hairline details in the primary lockup", done: false },
    ],
    presentationIdeas: [
      "Show the mark debossed on a kraft coffee bag next to the full-colour cup sleeve.",
      "Animate the sun rising behind the horizon bars as the website's loading state.",
      "Present the one-colour version stamped on a receipt and a loyalty card.",
      "Pair the emblem with a morning-light product photo to sell the first-cup story.",
    ],
  },
  colors: [
    { hex: "#D9643A", name: "Roast Ember" },
    { hex: "#3B2418", name: "Espresso" },
    { hex: "#F3E3C3", name: "Oat Milk" },
  ],
  neutralNames: ["Dark Roast", "Steamed Milk"],
  main: "#D9643A",
  paletteSummary:
    "Earthy and warm: a deep espresso anchor, an ember accent for energy and a soft oat neutral that keeps the packaging feeling handmade.",
  type: { heading: "DM Serif Display", body: "Work Sans", accent: "Caveat" },
};

export const HALDEN_BEAN: DemoBrand = {
  name: "Halden Roasters (concept B)",
  logos: ["halden-bean.svg"],
  brief: HALDEN.brief,
  review: {
    scores: {
      readability: d(9, "A single tilted bean with one contrasting seam is about as legible as a coffee mark gets, even at 16 px."),
      originality: d(4, "The coffee bean is the category's default symbol; nothing in the drawing makes it specific to Halden."),
      balance: d(7, "The tilt adds movement, but the seam's lower curve carries more weight than the upper one."),
      scalability: d(9, "Two flat shapes with no fine detail: it scales from favicon to storefront without a dedicated variant."),
      misinterpretation: d(7, "Out of context the rotated oval with a central curve can read as a seed or a stylised eye."),
    },
    personality: {
      presence: "Understated",
      attitude: "Straightforward",
      formality: "Casual",
      style: "Minimal",
      tone: "Earthy",
      positioning: "Everyday",
    },
    summary:
      "Clear, robust and very easy to reproduce, but generic: it says coffee rather than Halden. A strong fallback icon, a weaker primary mark.",
  },
  colors: [
    { hex: "#3B2418", name: "Espresso" },
    { hex: "#E9B872", name: "Crema" },
  ],
  neutralNames: ["Dark Roast", "Paper Cup"],
  main: "#3B2418",
  paletteSummary: "A two-colour coffee palette: espresso brown with a golden crema accent.",
  type: { heading: "Bitter", body: "Lato" },
};

export const KITEPOINT: DemoBrand = {
  name: "Kitepoint",
  logos: ["kitepoint.svg"],
  brief:
    "Kitepoint is a budgeting app for freelancers that splits every payment into tax, savings and spending pots. It should feel optimistic, trustworthy and modern, and has to work as an iOS and Android app icon.",
  review: {
    scores: {
      readability: d(9, "Four flat facets form an instantly recognisable kite; the silhouette survives heavy blurring and reads at app-icon size."),
      originality: d(7, "A kite is unusual in fintech, and the colour-split facets nod to the money-pots idea. The faceted-diamond style itself is common, so the colour logic carries most of the originality."),
      balance: d(8, "The wider upper half sits correctly for a kite and the coral facet adds a deliberate asymmetry; the tail pulls the weight slightly down and left."),
      scalability: d(8, "Flat fills scale cleanly. The tail becomes a hairline below 24 px and should be dropped at the smallest sizes."),
      misinterpretation: d(7, "Without the tail the diamond can read as a gem or a road sign, so keep the tail in primary placements."),
    },
    personality: {
      presence: "Lively",
      attitude: "Optimistic",
      formality: "Semi-formal",
      style: "Geometric",
      tone: "Friendly",
      positioning: "Accessible",
    },
    summary:
      "A crisp geometric mark that turns the product idea, money split into parts, into one memorable image. The four facets give it energy and a built-in colour system, and it is ready for an app icon. Watch the tail at small sizes and the gem-like reading when the tail is missing.",
  },
  advanced: {
    fixes: [
      { issue: "The tail turns into a hairline below 24 px.", fix: "Provide an icon variant without the tail and enlarge the kite to fill the safe area.", priority: "high" },
      { issue: "Indigo and deep-indigo facets are hard to tell apart on dim screens.", fix: "Increase the lightness gap between the two dark facets by about 10%.", priority: "medium" },
      { issue: "The coral facet sits on the left, so the icon leans when placed in a grid.", fix: "Test a version with the coral facet bottom-right to see which feels steadier.", priority: "low" },
    ],
    checklist: [
      { item: "Fits the iOS app-icon safe area", done: true },
      { item: "Recognisable as a silhouette", done: true },
      { item: "Accessible contrast against white", done: true },
      { item: "Dark-mode icon variant prepared", done: false },
    ],
    presentationIdeas: [
      "Show the icon on a phone home screen among common finance apps.",
      "Animate the four facets filling in one by one, mirroring the money pots.",
      "Use each facet colour to label one pot in the in-app charts.",
    ],
  },
  colors: [
    { hex: "#1E2A6B", name: "Midnight Indigo" },
    { hex: "#4CC3E0", name: "Open Sky" },
    { hex: "#FF7A59", name: "Coral Lift" },
  ],
  neutralNames: ["Ink", "Cloud"],
  main: "#1E2A6B",
  paletteSummary:
    "A confident indigo base for trust, lifted by sky blue and a warm coral that makes the brand feel human rather than bank-like.",
  type: { heading: "Space Grotesk", body: "Inter" },
};

export const MOSSGROVE: DemoBrand = {
  name: "Mossgrove Studio",
  logos: ["mossgrove.svg"],
  brief:
    "Mossgrove Studio designs small urban gardens, courtyards and balconies. Clients are homeowners and architects. The identity should feel calm, natural and professional rather than rustic.",
  review: {
    scores: {
      readability: d(8, "The leaf on a rounded tile is legible immediately, and the veins are thick enough to survive reduction to about 40 px."),
      originality: d(5, "A leaf in a rounded square is one of the most common marks in garden and wellness brands; the small sun dot helps, but the core idea is not yet distinctive."),
      balance: d(9, "Leaf and tile share a clear vertical axis, and the sun in the upper right counters the leaf's downward taper."),
      scalability: d(8, "Solid shapes and generous spacing hold up well; the vein gaps close at favicon size, which is fine because the leaf silhouette remains."),
      misinterpretation: d(8, "Reads as a leaf or a plant. At a glance the veined shape can suggest a feather, which still fits the natural theme."),
    },
    personality: {
      presence: "Calm",
      attitude: "Grounded",
      formality: "Approachable",
      style: "Organic",
      tone: "Fresh",
      positioning: "Boutique",
    },
    summary:
      "A calm, tidy mark with excellent balance and a palette that feels like a garden at noon. It is professional and easy to apply, but leaf-in-a-tile is a well-trodden route; an ownable detail, such as a stem that hints at an M, would help the studio stand apart.",
  },
  colors: [
    { hex: "#2F5D50", name: "Fern Shade" },
    { hex: "#9BC87A", name: "New Growth" },
    { hex: "#5A8861", name: "Moss" },
    { hex: "#E8C547", name: "Noon Sun" },
  ],
  neutralNames: ["Bark", "Linen"],
  main: "#2F5D50",
  paletteSummary: "Shaded fern green with fresh leaf green and a small dose of sunlight yellow: calm, natural and quietly upbeat.",
  type: { heading: "Lora", body: "Nunito" },
};

export const TIDEWELL: DemoBrand = {
  name: "Tidewell Labs",
  logos: ["tidewell-labs.svg"],
  brief:
    "Tidewell Labs builds water-quality sensors for municipal utilities and research teams. The brand should feel precise, credible and calm, and will appear on hardware, dashboards and research reports.",
  review: {
    scores: {
      readability: d(7, "The layered waves read clearly at medium sizes, but the two upper wave tones are close in value and blend on low-quality screens."),
      originality: d(6, "Waves in a circle are common for water brands; the small light dot, read as a sensor reading or the moon, adds a hint of story."),
      balance: d(8, "The waves sit low and stable in the disc, and the dot in the upper right keeps the empty sky from feeling unused."),
      scalability: d(6, "The wave crests rely on fine curvature that flattens below 32 px; a simplified single-wave variant is recommended."),
      misinterpretation: d(9, "Unambiguously water; nothing in the shapes suggests an unintended meaning."),
    },
    personality: {
      presence: "Composed",
      attitude: "Precise",
      formality: "Formal",
      style: "Technical",
      tone: "Cool",
      positioning: "Expert",
    },
    summary:
      "A composed, credible mark that suits a scientific audience. The deep navy disc and the teal wave give it a strong colour signature, but it is more generic than it needs to be and the layered waves lose definition at small sizes.",
  },
  colors: [
    { hex: "#0B2545", name: "Deep Water" },
    { hex: "#13C4A3", name: "Sensor Teal" },
    { hex: "#8DA9C4", name: "Mist" },
    { hex: "#276A78", name: "Lagoon" },
    { hex: "#EEF4FA", name: "Foam" },
  ],
  neutralNames: ["Abyss", "Foam"],
  main: "#13C4A3",
  paletteSummary: "Deep navy and a clear sensor teal, softened by misty blue-grey: technical and trustworthy without feeling cold.",
  type: { heading: "Manrope", body: "Source Sans 3", accent: "IBM Plex Mono" },
};

/** Seed (creation) order. The Logos page lists newest first, so Halden Roasters, created last, comes first there. */
export const BRANDS: DemoBrand[] = [HALDEN_BEAN, TIDEWELL, MOSSGROVE, KITEPOINT, HALDEN];

/** One client questionnaire, filled in for Halden Roasters. */
export const FORM_TEMPLATE = {
  title: "Logo brief questionnaire",
  questions: [
    { text: "What does the business do?", type: "text" as const },
    { text: "Who is the main audience?", type: "longtext" as const },
    { text: "Three words the logo should evoke", type: "text" as const },
    { text: "Preferred style", type: "choice" as const, options: ["Modern", "Classic", "Playful", "Minimal"] },
    { text: "Where will the logo be used most?", type: "longtext" as const },
  ],
};
export const FORM_ANSWERS = [
  "Small-batch coffee roaster with one cafe and an online bean shop.",
  "Neighbourhood regulars and specialty-coffee subscribers, 25-45.",
  "Warm, crafted, morning",
  "Classic",
  "Cup sleeves, coffee bags, the shop window and a website favicon.",
];

/** Compare: Halden Roasters (A) vs concept B (B). */
export const COMPARE = {
  scores: { A: HALDEN.review.scores, B: HALDEN_BEAN.review.scores },
  winner: "A",
  reason:
    "Concept A tells Halden's morning-ritual story and has more room to become ownable, while concept B is clearer at tiny sizes but could belong to any coffee shop. Keep B's simplicity in mind for A's favicon variant.",
  notes: [
    "A scores higher on originality (6 vs 4); B is stronger on scalability (9 vs 7).",
    "B's bean shape would make a good secondary icon or pattern element next to A.",
    "Both use the same espresso brown, so they could share one palette.",
  ],
};
