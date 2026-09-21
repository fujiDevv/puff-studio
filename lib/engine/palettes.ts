import type { Palette } from "./types";

/**
 * The field palettes.
 *
 * Previously each of these also carried a mark gradient (`fg`/`fg2`) and an
 * outline colour, because every icon was drawn as vector geometry that this app
 * could paint. With the marks gone and your own artwork in their place, none of
 * those three can be used: an `<image>` paints itself and ignores a fill, and a
 * bitmap has no path to stroke. They were removed rather than left in the table,
 * because a colour that reaches the swatch row but nothing in the render is a
 * control that lies about what it does.
 *
 * What remains is what the plate actually reads: two field colours, plus the
 * mode that arranges them. The pairs are kept saturated and opaque so the rim
 * and the haze above them keep their contrast.
 */
export interface NamedPalette {
  id: string;
  label: string;
  palette: Palette;
}

export const PALETTES: NamedPalette[] = [
  {
    id: "electric-blue",
    label: "Electric blue",
    palette: { bg: "#2B63F6", bg2: "#1B3FC0", bgMode: "radial" },
  },
  {
    id: "lime-acid",
    label: "Lime acid",
    palette: { bg: "#B6F04A", bg2: "#63B01E", bgMode: "glow" },
  },
  {
    id: "hot-coral",
    label: "Hot coral",
    palette: { bg: "#FF5A5F", bg2: "#C81E3C", bgMode: "linear" },
  },
  {
    id: "violet-dusk",
    label: "Violet dusk",
    palette: { bg: "#7B5CFF", bg2: "#4521B8", bgMode: "radial" },
  },
  {
    id: "midnight-ink",
    label: "Midnight ink",
    palette: { bg: "#141821", bg2: "#05070B", bgMode: "linear" },
  },
  {
    id: "cream",
    label: "Cream",
    palette: { bg: "#FDF3E3", bg2: "#EFD9B4", bgMode: "glow" },
  },
  {
    id: "forest",
    label: "Forest",
    palette: { bg: "#0E7A57", bg2: "#054A34", bgMode: "radial" },
  },
  {
    id: "sunset",
    label: "Sunset",
    palette: { bg: "#FF7A1A", bg2: "#D1275B", bgMode: "linear" },
  },
  {
    id: "turquoise",
    label: "Turquoise",
    palette: { bg: "#16C8C8", bg2: "#0B7C86", bgMode: "radial" },
  },
  {
    id: "magenta",
    label: "Magenta",
    palette: { bg: "#FF3FA4", bg2: "#A81B62", bgMode: "linear" },
  },
  {
    id: "gold",
    label: "Gold",
    palette: { bg: "#FFC53D", bg2: "#C07A00", bgMode: "glow" },
  },
  {
    id: "steel",
    label: "Steel",
    palette: { bg: "#5C6B7A", bg2: "#2C3844", bgMode: "linear" },
  },
];

export function paletteById(id: string): Palette {
  // Copied rather than handed out by reference: two documents that pick the same
  // palette must not share one object, or editing a colour on one would edit it
  // on the other and the change would outlive a reset of either.
  const found = PALETTES.find((p) => p.id === id) ?? PALETTES[0];
  return { ...found.palette };
}
