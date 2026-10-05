import { validateGradientEffect, canonicalizeGradientEffect } from '../vendor/danmux/src/effects/gradient.js';
import { EXTENSION_VERSION, MAX_EFFECTS } from '../vendor/danmux/src/constants.js';
/**
 * DanmuX effect 契约层 —— 解析、校验、颜色工具。
 *
 * 线上契约(danmux v1):每条评论可选携带
 *   comment.danmux.effects[] = [{
 *     type: "gradient", target: "fill", origin: "generated"|"native",
 *     source: { type: "linear", angle: 0, stops: [{ position, color, alpha? }] }
 *   }]
 *
 * 本模块全部为纯函数、零 DOM 依赖:任何播放器(Web / iOS / Android)都可以
 * 直接复用或 1:1 移植。契约之外的任何 effect 形态都必须被视为"不支持",
 * 由调用方回退到 dandanplay `p` 字段的单色,绝不能让单条脏数据炸掉整批弹幕。
 */

/** 当前参考实现唯一识别的 effect 规格。 */
export const GRADIENT_LINEAR_V1 = 'gradient-linear-v1';

export function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** dandanplay `p` 第三字段:十进制 RGB888 或 #RRGGBB;非法值回落白色。 */
export function cssColor(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '#ffffff';
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  if (/^#[0-9a-f]{8}$/i.test(text)) return text.slice(0, 7);
  const number = Number(text);
  if (!Number.isFinite(number)) return '#ffffff';
  const int = Math.min(0xffffff, Math.max(0, Math.trunc(number)));
  return `#${int.toString(16).padStart(6, '0')}`;
}

export function normalizeAngle(value) {
  const angle = Number(value);
  if (!Number.isFinite(angle)) return 0;
  return ((angle % 360) + 360) % 360;
}

/**
 * 从 effects 数组中找出第一个可渲染的 gradient-linear-v1 effect。
 * 使用 DanmuX 上游验证器:stops 为 2..16 个、position 在 [0,1]、
 * color 必须是 #RRGGBB。任何字段不满足都整体判为不支持(不做部分降级),
 * 这样播放器实现之间不会出现"同一份数据两种渲染结果"。
 */
export function findLinearGradientEffect(effects, target = 'fill') {
  if (!Array.isArray(effects) || effects.length > MAX_EFFECTS) return null;
  const effect = effects.find(effect => effect?.target === target
    && effect?.source?.type === 'linear' && validateGradientEffect(effect).ok);
  return effect ? canonicalizeGradientEffect(effect) : null;
}

/** Version-gated optional style; unknown/invalid effects never replace Base. */
export function readCommentStyle(comment) {
  const diagnostics = [];
  const extension = comment?.danmux;
  if (!extension) return { fill: null, stroke: null, diagnostics };
  if (extension.extensionVersion !== EXTENSION_VERSION) {
    return { fill: null, stroke: null, diagnostics: [{ code: 'unsupported_extension_version' }] };
  }
  if (extension.effects === undefined) return { fill: null, stroke: null, diagnostics };
  if (!Array.isArray(extension.effects) || extension.effects.length > MAX_EFFECTS) {
    return { fill: null, stroke: null, diagnostics: [{ code: 'invalid_effects' }] };
  }
  const effects = [];
  const targets = new Set();
  for (const effect of extension.effects) {
    const result = validateGradientEffect(effect);
    if (!result.ok || effect?.source?.type !== 'linear') {
      diagnostics.push(...(result.ok ? [{ code: 'unsupported_effect' }] : result.diagnostics));
      continue;
    }
    if (targets.has(effect.target)) { diagnostics.push({ code: 'duplicate_target' }); continue; }
    targets.add(effect.target);
    effects.push(canonicalizeGradientEffect(effect));
  }
  return { fill: effects.find(e => e.target === 'fill') ?? null,
    stroke: effects.find(e => e.target === 'stroke') ?? null, diagnostics };
}

/**
 * 按 B 站材质微调的 rgba 串:whiteMix 向白混色(柔化饱和端点),
 * alpha 为整体不透明度。wire 里的颜色永远是权威来源,这里只做 Paint 微调。
 */
export function rgbaColor(value, alpha = 1, whiteMix = 0) {
  const hex = String(value ?? '').trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return `rgba(255, 255, 255, ${clamp01(alpha)})`;
  const tone = clamp01(whiteMix);
  const channel = (slice) => {
    const base = Number.parseInt(hex.slice(slice, slice + 2), 16);
    return Math.round(base + (255 - base) * tone);
  };
  return `rgba(${channel(0)}, ${channel(2)}, ${channel(4)}, ${clamp01(alpha)})`;
}

/** 把一条 wire 评论解析成渲染层内部形态;p 非法字段一律安全回落。 */
export function parseWireComment(comment, index) {
  const fields = String(comment?.p ?? '').split(',');
  const style = readCommentStyle(comment);
  const effects = [style.fill, style.stroke].filter(Boolean);
  const item = {
    index,
    time: Math.max(0, Number(fields[0]) || 0),
    mode: Number(fields[1]) || 1,
    color: cssColor(fields[2]),
    text: String(comment?.m ?? ''),
    effects,
    raw: comment,
    diagnostics: style.diagnostics,
  };
  item.hasGradient = effects.length > 0;
  return item;
}

/**
 * 解析整批评论。接受:
 *   - danmux v1 响应对象 { comments: [...] }
 *   - 或直接的评论数组
 * 返回按时间稳定排序后的内部数组。返回统计而不抛错:
 * 单条解析失败按空弹幕处理,不影响其余评论。
 */
export function parseWireComments(payload) {
  const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.comments) ? payload.comments : []);
  const items = list.map((comment, index) => {
    try {
      return parseWireComment(comment, index);
    } catch {
      return { index, time: Number.MAX_SAFE_INTEGER, mode: 1, color: '#ffffff', text: '', effects: [], raw: comment, hasGradient: false };
    }
  });
  items.sort((a, b) => a.time - b.time || a.index - b.index);
  return items;
}
