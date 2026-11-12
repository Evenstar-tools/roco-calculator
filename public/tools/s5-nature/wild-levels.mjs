export const MIN_WILD_LEVEL = 1;
export const MAX_WILD_LEVEL = 60;

export const isWildLevel = level => Number.isInteger(level)
  && level >= MIN_WILD_LEVEL && level <= MAX_WILD_LEVEL;
