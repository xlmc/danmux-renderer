/** Complete optional Web renderer. Existing schedulers should use ./paint.js.
 * Default material follows wire fill/stroke semantics; the Bilibili look is an
 * explicit preset. Both paths share the same Canvas painter.
 */

import { clamp01, parseWireComments } from './gradient-effect.js';
import { DEFAULT_LAYOUT, planFrame } from './danmux-layout.js';

/** 材质参数。默认值 = demo 定稿值,不要随意改动比例,否则偏离校准结果。 */
export { DEFAULT_MATERIAL } from './material.js';
import { DEFAULT_MATERIAL, mergeMaterial } from './material.js';
import { drawDanmuxComment } from './canvas-painter.js';


function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

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

    this.ownsCanvas = !canvas;
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
    if (material) { this.material = mergeMaterial({ ...this.material, ...material }); this.viewport = null; }
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
    if (this.ownsCanvas) this.canvas.remove();
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
  #drawItem({ item, x, y, metrics }) {
    return drawDanmuxComment(this.context, item.raw, {
      x, y, fontSize: this.viewport.fontSize, font: this.viewport.font,
      width: metrics.width, height: metrics.height,
      opacity: clamp01(this.material.opacity), material: this.material,
      useEffects: this.useEffects, fallback: 'draw',
    }).enhanced;
  }
}
