export function logError(error: unknown): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.error(error);
}
