import { paletteById } from "./engine/palettes";
import { DEFAULT_RADIUS, MAX_RADIUS, type Direction, type Finish } from "./engine/types";

/**
 * The library of *looks*.
 *
 * A template is a plate: a palette, a field mode, a finish, and a corner radius.
 * It carries no mark, because the studio has no marks to offer any more — the
 * artwork is yours, and a template is the surface it sits on. So the gallery
 * shows plates rather than characters, and picking one changes the ground under
 * your logo instead of replacing it.
 *
 * That is also what made the paid tier pointless: twelve "premium" templates
 * used to be twelve premium *shapes*, and with the shapes gone there is nothing
 * left to sell that is worth charging for. Every look is free.
 *
 * A template and a hand-edited document are the same kind of object, which is
 * what lets the studio edit one parametrically and reset to it exactly.
 */

export interface IconTemplate {
  id: string;
  name: string;
  /** One line for the gallery: what this surface is, not marketing. */
  blurb: string;
  tags: string[];
  direction: Direction;
}

/**
 * Finish recipes. A template picks one rather than carrying two loose numbers,
 * which is what lets the *studio* still expose the individual values: moving a
 * slider just moves the document away from its recipe.
 *
 * There are only two values here, and that is the whole of what a plate can do.
 * The passes that used to live alongside them — inflate, the specular cap, the
 * rim light, the outline — all read the mark's own silhouette, and a bitmap has
 * no silhouette to clip to or path to stroke.
 */
const FINISH = {
  flat: { shadow: 0, grain: 0.03 },
  light: { shadow: 0.15, grain: 0.04 },
  soft: { shadow: 0.35, grain: 0.06 },
  lifted: { shadow: 0.55, grain: 0.1 },
  heavy: { shadow: 0.8, grain: 0.16 },
} satisfies Record<string, Finish>;

type FinishName = keyof typeof FINISH;

/**
 * Corner recipes, in the 1024 user space.
 *
 * `reference` is the default and the one worth naming: 218.18 is the radius of
 * `docs/Frame.svg`, so a plate at that value is the reference's shape exactly.
 * The others bracket it — tight enough to read as a system utility, round enough
 * to read as a pill.
 */
const RADIUS = {
  tight: 150,
  crisp: 180,
  reference: DEFAULT_RADIUS,
  round: 270,
  pill: 300,
} satisfies Record<string, number>;

type RadiusName = keyof typeof RADIUS;

/**
 * The recipes, as data, for the studio's one-click chips.
 *
 * A look *is* a preset, which is why picking one replaces the plate outright;
 * these are the same numbers offered as individual moves, so a document can be
 * nudged toward a recipe without abandoning the rest of what you have set. Order
 * is loose-to-tight for the corners and flat-to-heavy for the finish, which is
 * the order they read in on screen.
 */
export const RADIUS_RECIPES: { id: RadiusName; label: string; value: number }[] = (
  ["tight", "crisp", "reference", "round", "pill"] as const
).map((id) => ({ id, label: id === "reference" ? "Reference" : id[0].toUpperCase() + id.slice(1), value: RADIUS[id] }));

export const FINISH_RECIPES: { id: FinishName; label: string; finish: Finish }[] = (
  ["flat", "light", "soft", "lifted", "heavy"] as const
).map((id) => ({
  id,
  label: id[0].toUpperCase() + id.slice(1),
  finish: { ...FINISH[id] },
}));

interface LookSpec {
  id: string;
  name: string;
  blurb: string;
  tags: string[];
  palette: string;
  finish: FinishName;
  radius: RadiusName;
}

const SPECS: LookSpec[] = [
  // ------------------------------------------------------- midnight ink
  {
    id: "slate",
    name: "Slate",
    blurb: "Near-black, quietly lifted. The default for dark products.",
    tags: ["dark", "calm", "utility"],
    palette: "midnight-ink",
    finish: "soft",
    radius: "reference",
  },
  {
    id: "ink",
    name: "Ink",
    blurb: "Flat near-black with tight corners. Reads as a system utility.",
    tags: ["dark", "flat", "utility"],
    palette: "midnight-ink",
    finish: "flat",
    radius: "tight",
  },
  {
    id: "basalt",
    name: "Basalt",
    blurb: "Ink with soft corners and a heavy shadow. Solid, not soft.",
    tags: ["dark", "bold"],
    palette: "midnight-ink",
    finish: "heavy",
    radius: "pill",
  },
  {
    id: "void",
    name: "Void",
    blurb: "No grain and no shadow: a pure plane for a bright logo.",
    tags: ["dark", "flat", "minimal"],
    palette: "midnight-ink",
    finish: "flat",
    radius: "crisp",
  },

  // ------------------------------------------------------------- cream
  {
    id: "paper",
    name: "Paper",
    blurb: "Warm off-white with a light lift. Sits beside photography.",
    tags: ["light", "warm", "calm"],
    palette: "cream",
    finish: "soft",
    radius: "reference",
  },
  {
    id: "bone",
    name: "Bone",
    blurb: "Flat cream, tight corners. Letterpress.",
    tags: ["light", "flat", "editorial"],
    palette: "cream",
    finish: "light",
    radius: "tight",
  },
  {
    id: "sand",
    name: "Sand",
    blurb: "Cream with soft corners and a warm grain.",
    tags: ["light", "warm", "soft"],
    palette: "cream",
    finish: "lifted",
    radius: "round",
  },
  {
    id: "linen",
    name: "Linen",
    blurb: "Cream, barely lifted. For logos that bring their own edges.",
    tags: ["light", "minimal"],
    palette: "cream",
    finish: "light",
    radius: "reference",
  },

  // ---------------------------------------------------------- hot coral
  {
    id: "candy",
    name: "Candy",
    blurb: "Hot coral with a soft lift. Friendly without a mascot.",
    tags: ["warm", "bold"],
    palette: "hot-coral",
    finish: "lifted",
    radius: "reference",
  },
  {
    id: "flare",
    name: "Flare",
    blurb: "Coral at full shadow and full grain. Loud on purpose.",
    tags: ["warm", "bold", "loud"],
    palette: "hot-coral",
    finish: "heavy",
    radius: "round",
  },
  {
    id: "rose",
    name: "Rose",
    blurb: "Coral pulled toward pink, tighter corners and a light touch.",
    tags: ["warm", "calm"],
    palette: "hot-coral",
    finish: "soft",
    radius: "crisp",
  },
  {
    id: "coral",
    name: "Coral",
    blurb: "Coral at an almost pill-like radius.",
    tags: ["warm", "soft"],
    palette: "hot-coral",
    finish: "lifted",
    radius: "pill",
  },

  // ------------------------------------------------------------- sunset
  {
    id: "ember",
    name: "Ember",
    blurb: "Orange into crimson, with a rich shadow under the logo.",
    tags: ["warm", "bold"],
    palette: "sunset",
    finish: "lifted",
    radius: "reference",
  },
  {
    id: "dusk",
    name: "Dusk",
    blurb: "The same gradient with crisp corners and almost no shadow.",
    tags: ["warm", "calm", "flat"],
    palette: "sunset",
    finish: "light",
    radius: "tight",
  },
  {
    id: "amber",
    name: "Amber",
    blurb: "Amber into deep red at soft corners.",
    tags: ["warm", "soft"],
    palette: "sunset",
    finish: "heavy",
    radius: "round",
  },

  // ---------------------------------------------------------- lime acid
  {
    id: "lime",
    name: "Lime",
    blurb: "Acid lime with a medium lift. Impossible to ignore.",
    tags: ["bright", "bold"],
    palette: "lime-acid",
    finish: "soft",
    radius: "reference",
  },
  {
    id: "sprout",
    name: "Sprout",
    blurb: "Lime with very round corners and a light touch.",
    tags: ["bright", "playful"],
    palette: "lime-acid",
    finish: "light",
    radius: "pill",
  },
  {
    id: "neon",
    name: "Neon",
    blurb: "Lime at full shadow and heavy grain. Screen-lit.",
    tags: ["bright", "loud"],
    palette: "lime-acid",
    finish: "heavy",
    radius: "round",
  },

  // ------------------------------------------------------ electric blue
  {
    id: "electric",
    name: "Electric",
    blurb: "The reference plate: saturated blue, medium lift, radius 218.",
    tags: ["cool", "bold", "reference"],
    palette: "electric-blue",
    finish: "lifted",
    radius: "reference",
  },
  {
    id: "sky",
    name: "Sky",
    blurb: "Blue with light corners and almost no shadow.",
    tags: ["cool", "calm", "flat"],
    palette: "electric-blue",
    finish: "light",
    radius: "crisp",
  },
  {
    id: "cobalt",
    name: "Cobalt",
    blurb: "Deeper blue at soft corners, with a heavier shadow.",
    tags: ["cool", "bold", "soft"],
    palette: "electric-blue",
    finish: "heavy",
    radius: "round",
  },
  {
    id: "marine",
    name: "Marine",
    blurb: "Blue at tight corners. Instrument-panel.",
    tags: ["cool", "utility"],
    palette: "electric-blue",
    finish: "soft",
    radius: "tight",
  },

  // -------------------------------------------------------- violet dusk
  {
    id: "violet",
    name: "Violet",
    blurb: "Violet into indigo, the reference radius.",
    tags: ["cool", "bold"],
    palette: "violet-dusk",
    finish: "lifted",
    radius: "reference",
  },
  {
    id: "orchid",
    name: "Orchid",
    blurb: "Violet at soft corners and full shadow.",
    tags: ["cool", "soft", "loud"],
    palette: "violet-dusk",
    finish: "heavy",
    radius: "round",
  },
  {
    id: "iris",
    name: "Iris",
    blurb: "Violet with crisp corners and a flat, even field.",
    tags: ["cool", "calm"],
    palette: "violet-dusk",
    finish: "light",
    radius: "crisp",
  },

  // -------------------------------------------------------------- forest
  {
    id: "forest",
    name: "Forest",
    blurb: "Deep green with a medium lift. Tools and utilities.",
    tags: ["cool", "calm", "utility"],
    palette: "forest",
    finish: "soft",
    radius: "reference",
  },
  {
    id: "moss",
    name: "Moss",
    blurb: "Green with tight corners and almost no shadow.",
    tags: ["cool", "flat", "minimal"],
    palette: "forest",
    finish: "flat",
    radius: "tight",
  },
  {
    id: "jade",
    name: "Jade",
    blurb: "Green, very round, with grain over the whole plate.",
    tags: ["cool", "soft"],
    palette: "forest",
    finish: "heavy",
    radius: "pill",
  },

  // ---------------------------------------------------------- turquoise
  {
    id: "lagoon",
    name: "Lagoon",
    blurb: "Cyan with a soft centre glow and the reference corners.",
    tags: ["cool", "bright", "calm"],
    palette: "turquoise",
    finish: "soft",
    radius: "reference",
  },
  {
    id: "tide",
    name: "Tide",
    blurb: "Flat cyan, crisp corners, no shadow. Clean at any size.",
    tags: ["cool", "flat", "minimal"],
    palette: "turquoise",
    finish: "flat",
    radius: "crisp",
  },
  {
    id: "reef",
    name: "Reef",
    blurb: "A lighter field with round corners and a little grain.",
    tags: ["cool", "soft"],
    palette: "turquoise",
    finish: "light",
    radius: "round",
  },
  {
    id: "atoll",
    name: "Atoll",
    blurb: "Cyan as a pill, with the heaviest shadow in the library.",
    tags: ["cool", "bold"],
    palette: "turquoise",
    finish: "heavy",
    radius: "pill",
  },

  // ------------------------------------------------------------ magenta
  {
    id: "bloom",
    name: "Bloom",
    blurb: "Hot pink, graded across the plate, reference corners.",
    tags: ["warm", "bold", "playful"],
    palette: "magenta",
    finish: "soft",
    radius: "reference",
  },
  {
    id: "flush",
    name: "Flush",
    blurb: "Pink with round corners and a light contact shadow.",
    tags: ["warm", "soft", "playful"],
    palette: "magenta",
    finish: "light",
    radius: "round",
  },
  {
    id: "mallow",
    name: "Mallow",
    blurb: "Deep pink, tight corners, heavy grain. Reads as a stamp.",
    tags: ["warm", "bold"],
    palette: "magenta",
    finish: "heavy",
    radius: "tight",
  },
  {
    id: "posy",
    name: "Posy",
    blurb: "Flat pink as a pill: the softest silhouette here.",
    tags: ["warm", "playful", "soft"],
    palette: "magenta",
    finish: "flat",
    radius: "pill",
  },

  // --------------------------------------------------------------- gold
  {
    id: "honey",
    name: "Honey",
    blurb: "Gold with a raised centre and a lifted shadow.",
    tags: ["warm", "bright"],
    palette: "gold",
    finish: "lifted",
    radius: "reference",
  },
  {
    id: "brass",
    name: "Brass",
    blurb: "Flat gold with tight corners. Metallic without a highlight.",
    tags: ["warm", "flat", "utility"],
    palette: "gold",
    finish: "flat",
    radius: "tight",
  },
  {
    id: "wheat",
    name: "Wheat",
    blurb: "Muted gold, round corners, very little grain.",
    tags: ["warm", "calm", "soft"],
    palette: "gold",
    finish: "light",
    radius: "round",
  },
  {
    id: "gild",
    name: "Gild",
    blurb: "Gold as a pill with grain over the whole plate.",
    tags: ["warm", "bold"],
    palette: "gold",
    finish: "heavy",
    radius: "pill",
  },

  // -------------------------------------------------------------- steel
  {
    id: "steel",
    name: "Steel",
    blurb: "Cool grey-blue, graded downward. The neutral that is not black.",
    tags: ["cool", "neutral", "utility"],
    palette: "steel",
    finish: "soft",
    radius: "reference",
  },
  {
    id: "flint",
    name: "Flint",
    blurb: "Flat steel with crisp corners and no shadow at all.",
    tags: ["cool", "neutral", "flat"],
    palette: "steel",
    finish: "flat",
    radius: "crisp",
  },
  {
    id: "iron",
    name: "Iron",
    blurb: "Square-cornered steel with the heaviest shadow in the set.",
    tags: ["cool", "neutral", "bold"],
    palette: "steel",
    finish: "heavy",
    radius: "tight",
  },
  {
    id: "zinc",
    name: "Zinc",
    blurb: "Round, light, and almost flat: a quiet surface for any mark.",
    tags: ["cool", "neutral", "minimal"],
    palette: "steel",
    finish: "light",
    radius: "round",
  },
];

export const TEMPLATES: IconTemplate[] = SPECS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  blurb: spec.blurb,
  tags: spec.tags,
  direction: {
    palette: paletteById(spec.palette),
    // A copy, not a reference: two looks that share a recipe must not share the
    // object, or moving a slider on one would move it on the other and the change
    // would outlive a reset of either.
    finish: { ...FINISH[spec.finish] },
    radius: RADIUS[spec.radius],
    title: `${spec.name}, ${spec.palette.replace(/-/g, " ")}`,
    seedHint: (spec.id.length * 977 + spec.name.length * 31) % 100000,
  },
}));

export function templateById(id: string): IconTemplate {
  const template = TEMPLATES.find((t) => t.id === id);
  if (!template) throw new Error(`Unknown template: ${id}`);
  return template;
}

/** The radius values the editor's readout has to stay inside. */
export const RADIUS_LIMITS = { min: 0, max: MAX_RADIUS, default: DEFAULT_RADIUS };
