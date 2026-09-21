"use client";

import { create } from "zustand";

import { paletteById } from "./engine/palettes";
import { clampOffset, type ExportTarget } from "./engine/targets";
import { MAX_RADIUS, type BgMode, type Direction, type Finish, type MarkArtwork, type MarkOffset, type Palette } from "./engine/types";
import { TEMPLATES, templateById } from "./templates";

/**
 * The editing document.
 *
 * A `Direction` is the whole document — the same object the renderer consumes and
 * the exporter writes files from. A look and a hand edit differ only in how the
 * object was produced, so there is no separate "template instance" type to keep
 * in sync.
 *
 * Deliberately *not* persisted: the render is deterministic, and a document
 * hydrated during module evaluation would run on the server-rendered pass, where
 * the markup would depend on state the server cannot see. The one part worth
 * keeping — your artwork, and which look you were working from — is restored in
 * an effect instead, by `MarkRestore`.
 */
/**
 * How the plate is shown. `square` is the plate as the platform masters are
 * exported — nothing clipped, so the artwork reaches every edge; `rounded` is the
 * same plate wearing the radius you set, which is the shape a home screen will
 * give it.
 */
export type PreviewShape = "square" | "rounded";

/**
 * The palette's editable colours. Only two, because only two are used: with the
 * artwork arriving as a bitmap, there is no mark gradient to tint and no outline
 * to stroke.
 */
export type PaletteColorRole = "bg" | "bg2";

/** The order the pickers are shown in, following the layer stack. */
export const PALETTE_ROLES: { role: PaletteColorRole; label: string; hint: string }[] = [
  { role: "bg", label: "Field", hint: "The plate's base colour" },
  {
    role: "bg2",
    label: "Field 2",
    hint: "The second field colour, used by gradient, radial, and glow modes",
  },
];

interface StudioState {
  templateId: string;
  direction: Direction;
  /** Platform whose safe area is drawn over the preview and fitted on export. */
  guide: ExportTarget["id"] | null;
  /** Gallery search text. */
  query: string;
  previewShape: PreviewShape;

  setTemplate: (id: string) => void;
  setQuery: (query: string) => void;
  setPreviewShape: (shape: PreviewShape) => void;
  /** Replace the artwork, or `null` to put the plate back to empty. */
  setArtwork: (mark: MarkArtwork | null) => void;
  /**
   * Move the artwork on the plate. Ignored on an empty plate, and clamped to what
   * the canvas allows — see `MARK_TRAVEL`.
   */
  setArtworkOffset: (offset: MarkOffset) => void;
  setPaletteColor: (role: PaletteColorRole, hex: string) => void;
  /** Load a different look at random. */
  shuffle: () => void;
  setPalette: (palette: Palette) => void;
  setPaletteId: (id: string) => void;
  setBgMode: (mode: BgMode) => void;
  setFinish: (patch: Partial<Finish>) => void;
  /** Plate corner radius, clamped to what the plate can be. */
  setRadius: (radius: number) => void;
  setGuide: (guide: ExportTarget["id"] | null) => void;
  reset: () => void;
}

const FIRST = TEMPLATES[0];

const INITIAL = {
  templateId: FIRST.id,
  direction: FIRST.direction,
  guide: null as ExportTarget["id"] | null,
  query: "",
  // `square` by default. The preview used to be corner-clipped, which hid the
  // four corners of whatever was being designed — an odd thing for a studio whose
  // whole claim is that you can see what you are exporting.
  previewShape: "square" as PreviewShape,
};

export const useStudio = create<StudioState>()((set) => ({
  ...INITIAL,

  // Picking a look replaces the plate outright. It is a starting point, not a
  // constraint, which is what keeps "start from a look" simple.
  //
  // The artwork is the one thing carried across, because it is not part of any
  // look: it sits *on* the plate, so a look picking a different surface under it
  // must not throw it away. That is the same promise the Remove button makes in
  // reverse — and it means a link from the landing page's wall cannot silently
  // delete a logo.
  setTemplate: (id) =>
    set((s) => {
      const next = templateById(id).direction;
      return {
        templateId: id,
        direction: s.direction.artwork
          ? { ...next, artwork: s.direction.artwork }
          : next,
      };
    }),

  setQuery: (query) => set({ query }),
  setPreviewShape: (previewShape) => set({ previewShape }),

  // Removed rather than set to `undefined`, so a document that never had artwork
  // and one that had it cleared look identical to every consumer — including the
  // JSON comparison that decides whether "Reset" is offered.
  setArtwork: (mark) =>
    set((s) => {
      const { artwork: _dropped, ...rest } = s.direction;
      return { direction: mark ? { ...rest, artwork: mark } : rest };
    }),

  // A no-op on an empty plate: there is nothing to move, and writing an offset
  // onto a document with no artwork would invent state that cannot be rendered.
  setArtworkOffset: (offset) =>
    set((s) =>
      s.direction.artwork
        ? {
            direction: {
              ...s.direction,
              artwork: { ...s.direction.artwork, offset: clampOffset(offset) },
            },
          }
        : {},
    ),

  setPalette: (palette) => set((s) => ({ direction: { ...s.direction, palette } })),
  setPaletteId: (id) =>
    set((s) => ({ direction: { ...s.direction, palette: paletteById(id) } })),
  setBgMode: (bgMode) =>
    set((s) => ({
      direction: { ...s.direction, palette: { ...s.direction.palette, bgMode } },
    })),
  setFinish: (patch) =>
    set((s) => ({
      direction: { ...s.direction, finish: { ...s.direction.finish, ...patch } },
    })),
  setRadius: (radius) =>
    set((s) => ({
      direction: {
        ...s.direction,
        radius: Math.max(0, Math.min(Math.round(radius * 100) / 100, MAX_RADIUS)),
      },
    })),

  // One role at a time, so the other survives. Editing either makes the palette
  // custom whether or not it started as one, which is what the swatch row reports
  // by simply failing to match a named palette.
  setPaletteColor: (role, hex) =>
    set((s) => ({
      direction: {
        ...s.direction,
        palette: { ...s.direction.palette, [role]: hex },
      },
    })),

  setGuide: (guide) => set({ guide }),

  // Deliberately never returns the current look: a shuffle that can land where it
  // started reads as a broken button rather than an unlucky one.
  shuffle: () =>
    set((s) => {
      const allowed = TEMPLATES.filter((t) => t.id !== s.templateId);
      const pick = allowed[Math.floor(Math.random() * allowed.length)];
      return {
        templateId: pick.id,
        direction: s.direction.artwork
          ? { ...pick.direction, artwork: s.direction.artwork }
          : pick.direction,
      };
    }),

  // Reset means reset, which is why it is the one action that does *not* carry
  // the artwork across: picking a look is a change of surface while you work,
  // whereas a reset is a request to be back at the starting point.
  reset: () => set({ templateId: INITIAL.templateId, direction: INITIAL.direction }),
}));
