import { clamp01, normalizeAngle, rgbaColor, parseWireComment } from './gradient-effect.js';
import { mergeMaterial } from './material.js';

/** Stateless Canvas paint hook. No canvas creation, scheduling, fetch or listeners.
 * Coordinates use left x and middle y, in the host context's current units.
 * Return handled=false to let the host draw its original fallback.
 */
export function drawDanmuxComment(context, comment, options = {}) {
  const { x: left = 0, y = 0, fontSize = 25, font = context.font,
    opacity = context.globalAlpha, strokeWidth = Math.max(1.6, fontSize * 0.08),
    useEffects = true, fallback = 'host' } = options;
  if (![left, y, fontSize, opacity, strokeWidth].every(Number.isFinite)
      || fontSize <= 0 || strokeWidth < 0) throw new TypeError('Invalid drawing geometry');
  const paintOpacity = clamp01(opacity);
  if (!['host', 'draw'].includes(fallback)) throw new TypeError('Invalid fallback mode');
  const material = mergeMaterial(options.material);
  if (!['wire', 'bilibili'].includes(material.profile)) throw new TypeError('Unknown material profile');
  const item = parseWireComment(comment, 0);
  const style = useEffects ? {
    fill: item.effects.find(e => e.target === 'fill') ?? null,
    stroke: item.effects.find(e => e.target === 'stroke') ?? null,
    diagnostics: item.diagnostics,
  } : { fill: null, stroke: null, diagnostics: [] };
  const effect = style.fill;
  const enhanced = Boolean(effect || style.stroke);
  if (!enhanced && fallback === 'host') return { handled: false, enhanced: false, diagnostics: style.diagnostics };
  context.save();
  let measured;
  try { context.font = font; measured = context.measureText(item.text); } finally { context.restore(); }
  const metrics = { width: options.width ?? measured.width,
    height: options.height ?? fontSize * 1.28 };
  if (![metrics.width, metrics.height].every(Number.isFinite) || metrics.width < 0 || metrics.height <= 0) {
    throw new TypeError('Invalid text bounds');
  }
  context.save();
  try {
    context.font = font;
    context.textBaseline = 'middle';
    context.textAlign = 'left';
    context.lineJoin = 'round';
    if (effect && material.profile === 'bilibili') {
      // Explicit legacy preset: white core and softened gradient outline.
      // This is a visual mapping, not the generic target=fill contract.
      const { halo, gradientStroke, gloss } = material;
      context.shadowColor = `rgba(0, 0, 0, ${halo.shadow.alpha})`;
      context.shadowBlur = Math.max(0.5, fontSize * halo.shadow.blurRatio);
      context.shadowOffsetY = Math.max(0.25, fontSize * halo.shadow.offsetYRatio);
      context.globalAlpha = paintOpacity;
      const gradientStrokeWidth = Math.max(gradientStroke.minWidth, fontSize * gradientStroke.widthRatio);
      context.lineWidth = gradientStrokeWidth + Math.max(halo.minExtra, fontSize * halo.extraWidthRatio);
      context.strokeStyle = `rgba(9, 12, 20, ${halo.strokeAlpha})`;
      context.strokeText(item.text, left, y);

      context.lineWidth = gradientStrokeWidth;
      context.strokeStyle = createLinearGradient(context, effect.source, left, y, metrics.width, metrics.height, material.whiteMix);
      context.strokeText(item.text, left, y);

      // 白色填充盖住渐变描边的内半侧,留下柔和的渐变边缘。
      context.shadowColor = 'transparent';
      context.shadowBlur = 0;
      context.globalAlpha = paintOpacity;
      context.fillStyle = 'rgba(255, 255, 255, 1)';
      context.fillText(item.text, left, y);

      // 极淡的顶部高光,避免暗色视频上白色字芯显得平板。
      if (gloss.enabled) {
        context.globalCompositeOperation = 'source-atop';
        context.globalAlpha = paintOpacity * gloss.alphaScale;
        const glossGradient = context.createLinearGradient(left, y - metrics.height / 2, left, y + metrics.height / 2);
        for (const [position, color] of gloss.stops) glossGradient.addColorStop(position, color);
        context.fillStyle = glossGradient;
        context.fillText(item.text, left, y);
      }
    } else if (effect || style.stroke) {
      context.globalAlpha = paintOpacity;
      context.shadowColor = 'transparent';
      context.shadowBlur = 0;
      if (style.stroke) {
        context.lineWidth = strokeWidth;
        context.strokeStyle = createLinearGradient(context, style.stroke.source, left, y, metrics.width, metrics.height);
        context.strokeText(item.text, left, y);
      }
      context.fillStyle = effect
        ? createLinearGradient(context, effect.source, left, y, metrics.width, metrics.height)
        : item.color;
      context.fillText(item.text, left, y);
    } else {
      const { fallback } = material;
      context.shadowColor = `rgba(0, 0, 0, ${fallback.shadow.alpha})`;
      context.shadowBlur = Math.max(0.7, fontSize * fallback.shadow.blurRatio);
      context.shadowOffsetY = Math.max(1, fontSize * fallback.shadow.offsetYRatio);
      context.globalAlpha = paintOpacity;
      context.lineWidth = Math.max(fallback.minWidth, fontSize * fallback.widthRatio);
      context.strokeStyle = fallback.strokeColor;
      context.strokeText(item.text, left, y);
      context.fillStyle = item.color;
      context.fillText(item.text, left, y);
    }
  } finally { context.restore(); }
  return { handled: true, enhanced, diagnostics: style.diagnostics };
}

export function createLinearGradient(context, source, x, y, width, height, whiteMix = 0) {
    const angle = normalizeAngle(source.angle) * Math.PI / 180;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const extent = (width * Math.abs(directionX) + height * Math.abs(directionY)) / 2;
    const centerX = x + width / 2;
    const centerY = y;
    const gradient = context.createLinearGradient(
      centerX - directionX * extent,
      centerY - directionY * extent,
      centerX + directionX * extent,
      centerY + directionY * extent,
    );
    const stops = [...source.stops].sort((a, b) => Number(a.position) - Number(b.position));
    for (const stop of stops) {
      const alpha = Number.isFinite(Number(stop.alpha)) ? clamp01(stop.alpha) : 1;
      gradient.addColorStop(clamp01(stop.position), rgbaColor(stop.color, alpha * 1, whiteMix));
    }
    return gradient;
  }
