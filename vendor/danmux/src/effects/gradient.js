import { diagnostic, fail, ok } from '../diagnostics.js';
import { MAX_EFFECTS, MAX_VENDOR_DATA_BYTES } from '../constants.js';
import { byteLength, isFiniteNumber, isPlainObject } from '../utils.js';

const TARGETS = new Set(['fill', 'stroke']);
const SOURCE_TYPES = new Set(['texture', 'linear']);

function validateTexture(source, path) {
  const errors = [];
  for (const key of Object.keys(source)) if (!['type', 'uri', 'assetId', 'sha256', 'mime'].includes(key)) errors.push(diagnostic('additional_property', `unregistered texture field ${key}`, `${path}.${key}`));
  if (typeof source.uri !== 'string' || !source.uri.trim()) {
    errors.push(diagnostic('texture_uri_required', 'texture.uri must be a non-empty string', `${path}.uri`));
  } else {
    try {
      const url = new URL(source.uri);
      if (url.protocol !== 'https:') {
        errors.push(diagnostic('texture_uri_scheme', 'texture.uri must use https', `${path}.uri`));
      }
    } catch {
      errors.push(diagnostic('texture_uri_invalid', 'texture.uri must be a valid URL', `${path}.uri`));
    }
  }
  for (const [key, max] of [['assetId', 128], ['sha256', 64], ['mime', 64]]) {
    if (source[key] !== undefined && (typeof source[key] !== 'string' || source[key].length > max)) {
      errors.push(diagnostic('texture_field_invalid', `${key} is invalid`, `${path}.${key}`));
    }
  }
  if (source.sha256 !== undefined && !/^[a-f0-9]{64}$/u.test(source.sha256)) {
    errors.push(diagnostic('texture_hash_invalid', 'sha256 must be a lowercase SHA-256 hex digest', `${path}.sha256`));
  }
  return errors;
}

function validateLinear(source, path) {
  const errors = [];
  for (const key of Object.keys(source)) if (!['type', 'angle', 'stops'].includes(key)) errors.push(diagnostic('additional_property', `unregistered linear field ${key}`, `${path}.${key}`));
  if (!isFiniteNumber(source.angle) || source.angle < -360 || source.angle > 360) {
    errors.push(diagnostic('gradient_angle_invalid', 'angle must be finite and between -360 and 360 degrees', `${path}.angle`));
  }
  if (!Array.isArray(source.stops) || source.stops.length < 2 || source.stops.length > 16) {
    errors.push(diagnostic('gradient_stops_count', 'linear gradient requires 2 to 16 stops', `${path}.stops`));
    return errors;
  }
  source.stops.forEach((stop, index) => {
    const stopPath = `${path}.stops[${index}]`;
    if (!isPlainObject(stop)) {
      errors.push(diagnostic('gradient_stop_invalid', 'stop must be an object', stopPath));
      return;
    }
    for (const key of Object.keys(stop)) if (!['position', 'color', 'alpha'].includes(key)) errors.push(diagnostic('additional_property', `unregistered stop field ${key}`, `${stopPath}.${key}`));
    if (typeof stop.position !== 'number' || !Number.isFinite(stop.position) || stop.position < 0 || stop.position > 1) {
      errors.push(diagnostic('gradient_stop_position', 'position must be finite and within 0..1', `${stopPath}.position`));
    }
    if (typeof stop.color !== 'string' || !/^#[0-9a-f]{6}$/iu.test(stop.color)) {
      errors.push(diagnostic('gradient_stop_color', 'color must be a #RRGGBB string', `${stopPath}.color`));
    }
    if (stop.alpha !== undefined && (typeof stop.alpha !== 'number' || !Number.isFinite(stop.alpha) || stop.alpha < 0 || stop.alpha > 1)) {
      errors.push(diagnostic('gradient_stop_alpha', 'alpha must be within 0..1', `${stopPath}.alpha`));
    }
  });
  return errors;
}

export function validateGradientEffect(effect, path = 'effects[0]') {
  const errors = [];
  if (!isPlainObject(effect) || effect.type !== 'gradient') {
    return fail([diagnostic('gradient_type', 'effect.type must be gradient', `${path}.type`)]);
  }
  for (const key of Object.keys(effect)) if (!['type', 'target', 'origin', 'source'].includes(key)) errors.push(diagnostic('additional_property', `unregistered gradient field ${key}`, `${path}.${key}`));
  if (!TARGETS.has(effect.target)) errors.push(diagnostic('gradient_target', 'target must be fill or stroke', `${path}.target`));
  if (!isPlainObject(effect.source) || !SOURCE_TYPES.has(effect.source?.type)) {
    errors.push(diagnostic('gradient_source_type', 'source.type must be texture or linear', `${path}.source.type`));
  } else if (effect.source.type === 'texture') {
    errors.push(...validateTexture(effect.source, `${path}.source`));
  } else {
    errors.push(...validateLinear(effect.source, `${path}.source`));
  }
  if (effect.origin !== undefined && !['native', 'generated'].includes(effect.origin)) {
    errors.push(diagnostic('gradient_origin', 'origin must be native or generated', `${path}.origin`));
  }
  return errors.length ? fail(errors) : ok(effect);
}

export function canonicalizeGradientEffect(effect) {
  const result = structuredClone(effect);
  if (result.source.type === 'linear') {
    result.source.angle = ((result.source.angle % 360) + 360) % 360;
    result.source.stops = result.source.stops
      .map((stop, index) => ({ ...stop, color: stop.color.toUpperCase(), alpha: stop.alpha ?? 1, __index: index }))
      .sort((a, b) => a.position - b.position || a.__index - b.__index)
      .map(({ __index, ...stop }) => stop);
  }
  return result;
}

export function validateEffects(effects) {
  if (effects === undefined) return [];
  if (!Array.isArray(effects) || effects.length < 1 || effects.length > MAX_EFFECTS) {
    return [diagnostic('effects_shape', `effects must contain 1 to ${MAX_EFFECTS} items`, 'effects')];
  }
  const errors = [];
  const gradientTargets = new Set();
  effects.forEach((effect, index) => {
    if (effect?.type === 'gradient') {
      errors.push(...validateGradientEffect(effect, `effects[${index}]`).diagnostics);
      if (TARGETS.has(effect.target)) {
        if (gradientTargets.has(effect.target)) errors.push(diagnostic('gradient_duplicate_target', `only one gradient is allowed for target=${effect.target}`, `effects[${index}]`));
        gradientTargets.add(effect.target);
      }
    } else if (effect?.type === 'vendor') {
      if (!isPlainObject(effect) || typeof effect.vendor !== 'string' || typeof effect.name !== 'string' || effect.vendor.length < 1 || effect.name.length < 1 || effect.vendor.length > 64 || effect.name.length > 128 || !Object.hasOwn(effect, 'data')) {
        errors.push(diagnostic('vendor_effect_invalid', 'vendor effect requires bounded vendor and name strings', `effects[${index}]`));
      }
      for (const key of Object.keys(effect ?? {})) if (!['type', 'vendor', 'name', 'data'].includes(key)) errors.push(diagnostic('additional_property', `unregistered vendor field ${key}`, `effects[${index}].${key}`));
      try {
        if (Object.hasOwn(effect ?? {}, 'data') && byteLength(effect.data) > MAX_VENDOR_DATA_BYTES) errors.push(diagnostic('vendor_data_too_large', `vendor data exceeds ${MAX_VENDOR_DATA_BYTES} bytes`, `effects[${index}].data`));
      } catch {
        errors.push(diagnostic('vendor_data_invalid', 'vendor data must be JSON serializable', `effects[${index}].data`));
      }
    } else {
      errors.push(diagnostic('unknown_effect_type', 'writers may only emit registered effect types', `effects[${index}].type`));
    }
  });
  return errors;
}

export function isNativeGradient(effect) {
  return effect?.type === 'gradient' && effect.origin === 'native';
}
