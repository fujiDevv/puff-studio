/**
 * A single entry point for the unit tests. Vite bundles it into one file so the
 * tests can import the real engine modules without a dev server.
 *
 * Note what is *absent*: no director (this app has no Stage A), and no shape
 * families. The marks that used to live here were the only AI-shaped part of the
 * product and the only thing the paid tier had to sell; both are gone, and a test
 * that still imported them would be testing modules the app cannot build.
 */
export { renderSvg, svgDataUrl, mix, lighten, desaturate } from "../lib/engine/render";
export { roundRectPath, squarePath, rimBandPath, CANVAS_SIZE } from "../lib/engine/geometry";
export { BG_MODES, DEFAULT_RADIUS, MAX_RADIUS } from "../lib/engine/types";
export { PALETTES, paletteById } from "../lib/engine/palettes";
export {
  EXPORT_TARGETS,
  MARK_BOX,
  MARK_CIRCLE,
  MARK_TRAVEL,
  MAX_OFFSET_UNITS,
  PLATE_BOX,
  SHADOW_SPREAD,
  artworkExtent,
  clampOffset,
  fitFor,
  guideBox,
  guideCircle,
  targetById,
} from "../lib/engine/targets";
export { TEMPLATES, RADIUS_LIMITS, templateById, type IconTemplate } from "../lib/templates";
export { SAMPLE_MARKS, SAMPLE_SHOWCASE, sampleMarkById } from "../lib/sample-marks";
