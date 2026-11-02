// Measures the tests share: a fingerprint of drawn output, and how much a
// dithered picture stripes. Plain functions — the runner loads only *.test.ts
// files as suites, and the tests have no node:crypto to hash with.

/**
 * A 32-bit FNV-1a hash of `text`'s UTF-16 code units, as 8 hex digits: a
 * fingerprint of a drawn grid (its JSON), so a test can pin exact output in
 * one line, and any changed pixel fails it.
 */
export const fnv1a = (text: string): string => {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * How much a dithered picture stripes: of the pixels that differ from their
 * right neighbour, the share that match the one below — 1 when every column
 * of a pattern repeats down the rows, about 0.2 for a fine 4 × 4 Bayer checker.
 */
export const striping = (grid: ReadonlyArray<ReadonlyArray<number | undefined>>): number => {
  let mixed = 0
  let striped = 0
  for (let y = 0; y + 1 < grid.length; y++) {
    for (let x = 0; x + 1 < (grid[y]?.length ?? 0); x++) {
      if (grid[y]?.[x] === grid[y]?.[x + 1]) continue
      mixed++
      if (grid[y]?.[x] === grid[y + 1]?.[x]) striped++
    }
  }
  return striped / Math.max(1, mixed)
}
