/** TikTok batches likes. Show an immediate, short burst without multiplying damage. */
export function likeBurst(count: number, damagePerLike: number) {
  const likes = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
  const shots = Math.min(12, likes);
  return Array.from({ length: shots }, (_, i) => ({ delay: i * 0.045, damage: likes * damagePerLike / shots }));
}
