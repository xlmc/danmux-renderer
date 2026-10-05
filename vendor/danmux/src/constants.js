export const DANMUX_STANDARD_VERSION = 1;
export const SCHEMA_VERSION = DANMUX_STANDARD_VERSION;
export const EXTENSION_VERSION = 1;

export const MODES = Object.freeze([
  'scroll',
  'top',
  'bottom',
  'reverse',
  'fixed',
  'advanced',
]);

export const DAN_DAN_PLAY_MODE = Object.freeze({
  scroll: 1,
  bottom: 4,
  top: 5,
  reverse: 6,
});

export const BILIBILI_MODE_TO_DANMUX = Object.freeze({
  1: 'scroll',
  2: 'scroll',
  3: 'scroll',
  4: 'bottom',
  5: 'top',
  6: 'reverse',
  7: 'advanced',
  8: 'advanced',
  9: 'advanced',
});

export const DANDANPLAY_WIRE_PROFILES = Object.freeze({
  JSON: 'ddplay-json',
  BILIBILI_XML: 'bilibili-xml',
});

export const MAX_TEXT_LENGTH = 1000;
export const MAX_ID_LENGTH = 256;
export const MAX_PLATFORM_LENGTH = 64;
export const MAX_EFFECTS = 8;
export const MAX_VENDOR_DATA_BYTES = 16 * 1024;
