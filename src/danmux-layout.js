/**
 * 纯布局调度层 —— 时间窗选取 + 轨道分配,零 DOM 零 Canvas。
 *
 * 这是对成熟弹幕播放器(DPlayer / ArtPlayer danmuku)调度方式的提炼:
 * 按播放时间取活动窗口,滚动/顶部/底部各用独立轨道,按文字实际宽度做
 * 碰撞避让。native 端(iOS/Android)可以原样移植本文件,只替换度量
 * (metricsFor)与绘制两端。
 *
 * 调度与视觉解耦:本层输出的 entry 已带 x/y,任何 2D 绘制栈
 * (Canvas 2D / Skia / QPainter / OpenGL)都能直接消费。
 */

/** 调度参数。数值为 danmux-player-demo 逐帧对照 B 站截图后定稿的值。 */
export const DEFAULT_LAYOUT = {
  /** 滚动弹幕在画面中停留的秒数(决定速度:width+lifetime)。 */
  scrollLifetime: 5.8,
  /** 底部/顶部静态弹幕停留秒数。 */
  staticLifetime: 4.2,
  /** 滚动轨道数。 */
  scrollLanes: 8,
  /** 静态(底部/顶部)轨道数。 */
  staticLanes: 3,
  /** 单帧最多绘制的弹幕数,超出丢弃最旧的。 */
  maxVisible: 24,
  /** 相邻弹幕之间的最小水平间隙(px,按 CSS 像素)。 */
  laneGap: 18,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** 第一个 time >= target 的下标(列表须按 time 升序)。 */
export function lowerBound(items, target) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (items[middle].time < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function commentLifetime(item, layout) {
  return item.mode === 4 || item.mode === 5 ? layout.staticLifetime : layout.scrollLifetime;
}

function boxesOverlap(left, right, other, gap) {
  return left < other.right + gap && right + gap > other.left;
}

/**
 * 从 preferred 轨道开始找第一条无碰撞的轨道;全部冲突时落到
 * 冲突最少的轨道(保证弹幕不会因为拥挤而消失)。
 */
function chooseLane(lanes, preferred, box, gap) {
  let bestLane = preferred;
  let bestConflicts = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < lanes.length; offset += 1) {
    const candidate = (preferred + offset) % lanes.length;
    const conflicts = lanes[candidate].filter((other) => boxesOverlap(box.left, box.right, other, gap)).length;
    if (conflicts === 0) {
      lanes[candidate].push(box);
      return candidate;
    }
    if (conflicts < bestConflicts) {
      bestConflicts = conflicts;
      bestLane = candidate;
    }
  }
  lanes[bestLane].push(box);
  return bestLane;
}

function textBaseline(item, lane, viewport) {
  const { height, fontSize } = viewport;
  if (item.mode !== 4 && item.mode !== 5) {
    return height * 0.08 + lane * height * 0.105 + fontSize * 0.56;
  }
  if (item.mode === 5) return height * 0.16 + lane * fontSize * 1.2 + fontSize * 0.56;
  return height * 0.84 - lane * fontSize * 1.2 - fontSize * 0.56;
}

/**
 * 计算某一时刻应绘制的弹幕及其位置。
 *
 * @param items    按 time 升序的内部评论数组(parseWireComments 输出,
 *                 已按需过滤,如"只显示渐变弹幕")。
 * @param now      当前播放时间(秒)。
 * @param viewport { width, height, fontSize } 绘制区尺寸与基准字号(CSS 像素)。
 * @param layout   调度参数(DEFAULT_LAYOUT 的子集)。
 * @param metricsFor (item, fontSize) => { width, height },文字度量,
 *                 实现方须自行缓存。
 * @returns [{ item, elapsed, lifetime, lane, x, y, metrics, isStatic }]
 */
export function planFrame(items, now, viewport, layout, metricsFor) {
  const { width } = viewport;
  const scrollLanes = Array.from({ length: layout.scrollLanes }, () => []);
  const staticLanes = Array.from({ length: layout.staticLanes }, () => []);
  const active = [];
  const start = lowerBound(items, Math.max(0, now - layout.scrollLifetime - 0.1));
  for (let index = start; index < items.length; index += 1) {
    const item = items[index];
    if (item.time > now + layout.scrollLifetime) break;
    const elapsed = now - item.time;
    const lifetime = commentLifetime(item, layout);
    if (elapsed >= 0 && elapsed <= lifetime) active.push({ item, elapsed, lifetime });
  }
  const visible = active.slice(-layout.maxVisible);
  for (const entry of visible) {
    const metrics = metricsFor(entry.item, viewport.fontSize);
    const isStatic = entry.item.mode === 4 || entry.item.mode === 5;
    const progress = clamp(entry.elapsed / entry.lifetime, 0, 1);
    const left = isStatic ? (width - metrics.width) / 2 : width - progress * (width + metrics.width);
    const box = { left, right: left + metrics.width };
    const lanes = isStatic ? staticLanes : scrollLanes;
    const preferred = Math.abs(entry.item.index) % lanes.length;
    entry.lane = chooseLane(lanes, preferred, box, layout.laneGap);
    entry.x = left;
    entry.y = textBaseline(entry.item, entry.lane, viewport);
    entry.metrics = metrics;
    entry.isStatic = isStatic;
  }
  return visible;
}
