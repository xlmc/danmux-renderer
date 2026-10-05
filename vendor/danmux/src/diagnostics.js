export function diagnostic(code, message, path = '') {
  return { code, message, ...(path ? { path } : {}) };
}

export function ok(value, diagnostics = []) {
  return { ok: diagnostics.length === 0, value, diagnostics };
}

export function fail(diagnostics) {
  return { ok: false, diagnostics };
}
