const MAX_LEVEL = 100_000;

function xpForLevel(level) {
  if (!Number.isInteger(level) || level < 0 || level > MAX_LEVEL + 1) {
    throw new RangeError(`Seviye 0 ile ${MAX_LEVEL + 1} arasında bir tam sayı olmalı.`);
  }
  const previous = level - 1;
  return 300 * level + 100 * (level * previous / 2)
    + 25 * (previous * level * (2 * level - 1) / 6);
}

const MAX_XP = xpForLevel(MAX_LEVEL + 1) - 1;

function progressForXp(totalXp = 0) {
  const xp = Math.min(MAX_XP, Math.max(0, Math.floor(Number(totalXp) || 0)));
  let low = 0;
  let high = MAX_LEVEL;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (xpForLevel(middle) <= xp) low = middle;
    else high = middle - 1;
  }
  const currentXp = xp - xpForLevel(low);
  const requiredXp = xpForLevel(low + 1) - xpForLevel(low);
  return { level: low, totalXp: xp, currentXp, requiredXp, progress: currentXp / requiredXp };
}

module.exports = { MAX_LEVEL, MAX_XP, xpForLevel, progressForXp };
