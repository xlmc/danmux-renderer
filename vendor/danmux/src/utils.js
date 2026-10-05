export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function deepClone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function byteLength(value) {
  const json = JSON.stringify(value);
  if (typeof json !== 'string') throw new TypeError('value must be JSON serializable');
  return new TextEncoder().encode(json).byteLength;
}

export function normalizeString(value) {
  return typeof value === 'string' ? value.normalize('NFC') : value;
}

export function hasDisallowedControlCharacters(value) {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value);
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
