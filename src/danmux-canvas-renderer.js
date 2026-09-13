/**
 * DanmuxCanvasRenderer —— Web 端参考材质渲染器(Canvas 2D,零依赖 ES Module)。
 *
 * 材质定稿(danmux-player-demo 对照 B 站官方截图逐项校准):
 *   渐变弹幕 = 暗色外圈描边 → effect.stops 渐变描边 → 白色字芯 → 顶部高光,
 *   整层 67% 不透明度(对齐官方播放器的不透明度设置);
 *   普通弹幕 = 黑描边 + p 第三字段单色填充。
 *
 * 关键约束:effect 只承载 linear stops(gradient-linear-v1),"像不像 B 站"
 * 的全部视觉语义(白芯、描边、阴影、不透明度)都在本渲染层,且不替换、
 * 不新增任何 wire 之外的颜色。
 *
 * 时钟:默认绑定一个 <video>(读 currentTime + 播放事件驱动 rAF);
 * 播放器不暴露 HTMLVideoElement 时,传 getTime() 并自行调用 tick(now)。
 */

import { clamp01, findLinearGradientEffect, normalizeAngle, parseWireComments, rgbaColor } from './gradient-effect.js';
import { DEFAULT_LAYOUT, planFrame } from './danmux-layout.js';

/** 材质参数。默认值 = demo 定稿值,不要随意改动比例,否则偏离校准结果。 */
export const DEFAULT_MATERIAL = {
  /** 整层不透明度;67 对应官方播放器设置,是定稿值。 */
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

function mergeMaterial(partial) {
  const material = structuredClone(DEFAULT_MATERIAL);
  if (!partial) return material;
  for (const [key, value] of Object.entries(partial)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(material[key] ?? (material[key] = {}), value);
    } else {
      material[key] = value;
    }
  }
  return material;
}

export class DanmuxCanvasRenderer {
  /**
   * @param {object} options
   * @param {HTMLElement} options.container      视频与弹幕层的共同父容器
   *        (renderer 只要求能定位;不是 relative 时会自动改为 relative)。
   * @param {HTMLVideoElement} [options.video]   时间源 A:视频元素。
   * @param {() => number} [options.getTime]     时间源 B:自定义时钟(秒)。
   *        两者都缺省时为纯手动模式,由调用方驱动 tick(now)。
   * @param {HTMLCanvasElement} [options.canvas] 复用已有 canvas;缺省自建。
   * @param {object} [options.layout]    DEFAULT_LAYOUT 子集(轨道/时长/密度)。
   * @param {object} [options.material]  DEFAULT_MATERIAL 子集(材质)。
   * @param {boolean} [options.useEffects=true]   识别 danmux.effects(关闭则全部 p fallback)。
   * @param {boolean} [options.gradientOnly=false] 只渲染带渐变 effect 的弹幕。
   * @param {number} [options.zIndex=2]           弹幕 canvas 的 z-index。
   * @param {(stats: { frame: {effects:number, fallback:number} }) => void} [options.onFrame]
   */
  constructor({ container, video = null, getTime = null, canvas = null, layout = {}, material = {}, useEffects = true, gradientOnly = false, zIndex = 2, onFrame = null }) {
    if (!container || typeof container.appendChild !== 'function') {
      throw new Error('DanmuxCanvasRenderer 需要一个容器元素(container)。');
    }
    this.container = container;
    this.video = video ?? null;
    this.getTime = getTime ?? null;
    this.layout = { ...DEFAULT_LAYOUT, ...layout };
    this.material = mergeMaterial(material);
    this.useEffects = useEffects;
    this.gradientOnly = gradientOnly;
    this.onFrame = onFrame ?? null;

    this.canvas = canvas ?? document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    if (!canvas) {
      Object.assign(this.canvas.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: String(zIndex),
      });
      container.appendChild(this.canvas);
    }
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    this.context = this.canvas.getContext('2d');
    this.measureContext = document.createElement('canvas').getContext('2d');

    this.items = [];
    this.visibleItems = [];
    this.loaded = false;
    this.viewport = null;
    this.raf = 0;
    this.latestFrameStats = { effects: 0, fallback: 0 };

    if (this.video) {
      this.video.addEventListener('play', this.#syncFromVideo);
      this.video.addEventListener('pause', this.#syncFromVideo);
      this.video.addEventListener('seeked', this.#syncFromVideo);
      this.video.addEventListener('timeupdate', this.#syncFromVideo);
      this.video.addEventListener('ended', this.#onEnded);
    }
    window.addEventListener('resize', this.#handleResize);
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(this.#handleResize);
      this.resizeObserver.observe(container);
    }
    document.addEventListener('fullscreenchange', this.#handleResize);
    this.#handleResize();
  }

  /** 载入弹幕。接受 danmux v1 响应对象或评论数组;返回统计。 */
  load(payload) {
    this.items = parseWireComments(payload);
    this.#rebuildVisible();
    this.loaded = true;
    this.clear();
    this.#syncFromVideo();
    return { total: this.items.length, withGradient: this.items.filter((item) => item.hasGradient).length };
  }

  /** 更新视图选项(部分更新);改动会重建可见集合并立即重绘。 */
  setOptions({ useEffects, gradientOnly, layout, material } = {}) {
    if (useEffects !== undefined) this.useEffects = Boolean(useEffects);
    if (gradientOnly !== undefined) this.gradientOnly = Boolean(gradientOnly);
    if (layout) Object.assign(this.layout, layout);
    if (material) this.material = mergeMaterial({ ...this.material, ...material });
    if (gradientOnly !== undefined || material) {
      for (const item of this.items) item.metrics = null;
    }
    this.#rebuildVisible();
    this.#syncFromVideo();
  }

  /** 手动渲染一帧(自定义时钟模式下由调用方按播放时间驱动)。 */
  tick(nowSeconds) {
    this.#render(Number(nowSeconds) || 0);
  }

  clear() {
    if (!this.viewport) return;
    this.context.clearRect(0, 0, this.viewport.width, this.viewport.height);
    this.context.globalAlpha = 1;
    this.context.shadowBlur = 0;
  }

  destroy() {
    this.stop();
    if (this.video) {
      this.video.removeEventListener('play', this.#syncFromVideo);
      this.video.removeEventListener('pause', this.#syncFromVideo);
      this.video.removeEventListener('seeked', this.#syncFromVideo);
      this.video.removeEventListener('timeupdate', this.#syncFromVideo);
      this.video.removeEventListener('ended', this.#onEnded);
    }
    window.removeEventListener('resize', this.#handleResize);
    document.removeEventListener('fullscreenchange', this.#handleResize);
    this.resizeObserver?.disconnect();
    this.canvas.remove();
  }

  // ---- 内部实现 -----------------------------------------------------------

  #rebuildVisible() {
    this.visibleItems = this.gradientOnly
      ? this.items.filter((item) => item.hasGradient)
      : this.items.slice();
  }

  // 箭头函数字段:实例级稳定引用,可直接作为事件回调注册/解绑。
  #onEnded = () => this.clear();

  #syncFromVideo = () => {
    const now = this.video ? (this.video.currentTime || 0) : (this.getTime ? this.getTime() : 0);
    this.#render(now);
    if (this.video && !this.video.paused && !this.video.ended) this.#ensureLoop();
  };

  /** 播放中由 rAF 驱动;暂停后跑完最后一帧即停(demo 定稿行为)。 */
  #frame = () => {
    if (!this.video || this.video.paused || this.video.ended) {
      this.raf = 0;
      this.#syncFromVideo();
      return;
    }
    this.#syncFromVideo();
    this.raf = requestAnimationFrame(this.#frame);
  };

  #handleResize = () => {
    this.#resizeCanvas();
    this.#syncFromVideo();
  };

  #ensureLoop() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(this.#frame);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  #resizeCanvas() {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || this.container.clientWidth || 1));
    const height = Math.max(1, Math.round(rect.height || this.container.clientHeight || 1));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const previous = this.viewport;
    if (previous?.width === width && previous.height === height && previous.pixelRatio === pixelRatio) return;
    this.canvas.width = Math.round(width * pixelRatio);
    this.canvas.height = Math.round(height * pixelRatio);
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const { fontSizeRatio, minFontSize, maxFontSize, fontWeight, fontFamily } = this.material;
    const fontSize = clamp(width * fontSizeRatio, minFontSize, maxFontSize);
    this.viewport = {
      width,
      height,
      pixelRatio,
      fontSize,
      font: `${fontWeight} ${fontSize}px ${fontFamily}`,
    };
    for (const item of this.items) item.metrics = null;
  }

  #metricsFor(item, fontSize) {
    const viewport = this.viewport;
    const font = viewport.font;
    if (item.metrics?.font === font) return item.metrics;
    this.measureContext.font = font;
    const measured = this.measureContext.measureText(item.text || ' ');
    item.metrics = {
      font,
      width: Math.max(36, Math.ceil(measured.width + viewport.fontSize * 0.42)),
      height: Math.ceil(viewport.fontSize * 1.28),
    };
    return item.metrics;
  }

  #render(now) {
    if (!this.loaded) return;
    this.#resizeCanvas();
    this.clear();
    const planned = planFrame(this.visibleItems, now, this.viewport, this.layout, (item) => this.#metricsFor(item));
    let effects = 0;
    let fallback = 0;
    for (const entry of planned) {
      if (this.#drawItem(entry)) effects += 1;
      else fallback += 1;
    }
    this.latestFrameStats = { effects, fallback };
    if (this.onFrame) this.onFrame(this.latestFrameStats);
  }

  /**
   * 绘制单条弹幕。返回是否走了渐变 effect 通道。
   * 绘制顺序即材质:halo 阴影+外圈 → 渐变描边 → 白色字芯 → 高光。
   */
  #drawItem(entry) {
    const { item, x: left, y, metrics } = entry;
    const { fontSize, font } = this.viewport;
    const context = this.context;
    const effect = this.useEffects ? findLinearGradientEffect(item.effects) : null;
    const opacity = clamp01(this.material.opacity);
    context.save();
    context.font = font;
    context.textBaseline = 'middle';
    context.textAlign = 'left';
    context.lineJoin = 'round';
    if (effect) {
      // B 站原生 VIP 渐变资源是「白色填充纹理 + 彩色渐变描边纹理」。wire 的
      // effect 只携带 linear stops,这里确定性地复现该材质:stops 画描边,
      // 字芯保持白色。不替换 stops、不注入新配色。
      const { halo, gradientStroke, gloss } = this.material;
      context.shadowColor = `rgba(0, 0, 0, ${halo.shadow.alpha})`;
      context.shadowBlur = Math.max(0.5, fontSize * halo.shadow.blurRatio);
      context.shadowOffsetY = Math.max(0.25, fontSize * halo.shadow.offsetYRatio);
      context.globalAlpha = opacity;
      const gradientStrokeWidth = Math.max(gradientStroke.minWidth, fontSize * gradientStroke.widthRatio);
      context.lineWidth = gradientStrokeWidth + Math.max(halo.minExtra, fontSize * halo.extraWidthRatio);
      context.strokeStyle = `rgba(9, 12, 20, ${halo.strokeAlpha})`;
      context.strokeText(item.text, left, y);

      context.lineWidth = gradientStrokeWidth;
      context.strokeStyle = this.#createLinearGradient(effect.source, left, y, metrics.width, metrics.height);
      context.strokeText(item.text, left, y);

      // 白色填充盖住渐变描边的内半侧,留下柔和的渐变边缘。
      context.shadowColor = 'transparent';
      context.shadowBlur = 0;
      context.globalAlpha = opacity;
      context.fillStyle = 'rgba(255, 255, 255, 1)';
      context.fillText(item.text, left, y);

      // 极淡的顶部高光,避免暗色视频上白色字芯显得平板。
      if (gloss.enabled) {
        context.globalCompositeOperation = 'source-atop';
        context.globalAlpha = opacity * gloss.alphaScale;
        const glossGradient = context.createLinearGradient(left, y - metrics.height / 2, left, y + metrics.height / 2);
        for (const [position, color] of gloss.stops) glossGradient.addColorStop(position, color);
        context.fillStyle = glossGradient;
        context.fillText(item.text, left, y);
      }
    } else {
      const { fallback } = this.material;
      context.shadowColor = `rgba(0, 0, 0, ${fallback.shadow.alpha})`;
      context.shadowBlur = Math.max(0.7, fontSize * fallback.shadow.blurRatio);
      context.shadowOffsetY = Math.max(1, fontSize * fallback.shadow.offsetYRatio);
      context.globalAlpha = opacity;
      context.lineWidth = Math.max(fallback.minWidth, fontSize * fallback.widthRatio);
      context.strokeStyle = fallback.strokeColor;
      context.strokeText(item.text, left, y);
      context.fillStyle = item.color;
      context.fillText(item.text, left, y);
    }
    context.restore();
    return Boolean(effect);
  }

  /** 按 effect 的 angle/stops 建立跨文字框的 Canvas 线性渐变。 */
  #createLinearGradient(source, x, y, width, height) {
    const angle = normalizeAngle(source.angle) * Math.PI / 180;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const extent = (width * Math.abs(directionX) + height * Math.abs(directionY)) / 2;
    const centerX = x + width / 2;
    const centerY = y;
    const gradient = this.context.createLinearGradient(
      centerX - directionX * extent,
      centerY - directionY * extent,
      centerX + directionX * extent,
      centerY + directionY * extent,
    );
    const stops = [...source.stops].sort((a, b) => Number(a.position) - Number(b.position));
    for (const stop of stops) {
      const alpha = Number.isFinite(Number(stop.alpha)) ? clamp01(stop.alpha) : 1;
      gradient.addColorStop(clamp01(stop.position), rgbaColor(stop.color, alpha * 1, this.material.whiteMix));
    }
    return gradient;
  }
}
