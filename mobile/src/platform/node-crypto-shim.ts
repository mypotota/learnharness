/**
 * Browser shim for the one Node builtin the desktop core reaches through its
 * barrel export: src/core/coverage.ts hashes transcript fingerprints with
 * node:crypto. The mobile app never runs extraction, so this module only has
 * to exist for the bundle's module graph; calling it is a programming error.
 */

export function createHash(_algorithm: string): never {
	throw new Error("node:crypto is not available in the mobile app");
}
