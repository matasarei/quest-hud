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
