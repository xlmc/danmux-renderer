export const DEFAULT_MATERIAL = {
  /** 整层不透明度;67 对应官方播放器设置,是定稿值。 */
  profile: 'wire',
  opacity: 0.67,
  fontWeight: 700,
  fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  /** 基准字号 = 画布宽 * fontSizeRatio,并夹在 [minFontSize, maxFontSize]。 */
  fontSizeRatio: 0.034,
  minFontSize: 18,
  maxFontSize: 42,
  /** 渐变描边向白混色的比例(柔化两端饱和色)。 */
  whiteMix: 0.03,
  /** 渐变弹幕暗色外圈(halo)。 */
  halo: {
    strokeAlpha: 0.34,
    strokeColor: 'rgb(9, 12, 20)',
    /** 外圈比渐变描边宽出的量:fontSize * extraWidthRatio,最小 minExtra。 */
    extraWidthRatio: 0.025,
    minExtra: 0.9,
    shadow: { alpha: 0.18, blurRatio: 0.030, offsetYRatio: 0.010 },
  },
  /** 渐变描边宽度:fontSize * widthRatio,最小 minWidth。 */
  gradientStroke: { widthRatio: 0.105, minWidth: 2.7 },
  /** 字芯上的顶部高光(source-atop 叠加,不改几何与颜色)。 */
  gloss: {
    enabled: true,
    alphaScale: 0.07,
    stops: [
      [0, 'rgba(255, 255, 255, 0.70)'],
      [0.55, 'rgba(255, 255, 255, 0.20)'],
      [1, 'rgba(255, 255, 255, 0)'],
    ],
  },
  /** p fallback 单色弹幕材质。 */
  fallback: {
    strokeColor: 'rgba(0, 0, 0, 0.68)',
    widthRatio: 0.08,
    minWidth: 1.6,
    shadow: { alpha: 0.38, blurRatio: 0.055, offsetYRatio: 0.025 },
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function mergeMaterial(partial) {
  function merge(base, values) {
    for (const [key, value] of Object.entries(values ?? {})) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        base[key] = merge(base[key] && typeof base[key] === 'object' ? base[key] : {}, value);
      } else if (value !== undefined) base[key] = value;
    }
    return base;
  }
  return merge(structuredClone(DEFAULT_MATERIAL), partial);
}
