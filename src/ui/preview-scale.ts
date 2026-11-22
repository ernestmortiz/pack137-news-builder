/** Pure sizing for the preview frames: shrink to fit the space, never grow past real size. */
export function fitScale(frameWidth: number, available: number): number {
  if (!(frameWidth > 0) || !(available > 0)) return 1;
  const s = Math.min(1, available / frameWidth);
  // Round down to 3 places so the scaled box never overshoots the space by a fraction of a pixel.
  return Math.floor(s * 1000) / 1000;
}
