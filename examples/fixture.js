/**
 * 合成样例数据 —— 全部为虚构弹幕,不含任何真实平台数据。
 * 用途:在没有 Danmu API 的环境下验证渲染器(渐变 / fallback / 静态轨道 /
 * 非法 effect 容错)。真实链路验证请使用 Danmu API 的 /api/v2/comment。
 */

/** B 站默认渐变皮肤定稿色,与 GRADIENT_COLORS=default 对齐。 */
export const FIXTURE_STOPS = [
  { position: 0, color: '#FB7299' },
  { position: 1, color: '#33B8FF' },
];

const PHRASES = [
  '合成样例弹幕', '这是一条虚构弹幕', '渐变描边 + 白色字芯', '两色各占一半',
  '中间平滑过渡', '不透明度 67%', '轨道避让中', '长长长长长长长长长长长长长长弹幕测试文本',
  '底部静态弹幕', '顶部静态弹幕', 'p 单色 fallback', '总结性一句虚构台词',
];

/** 生成 60 秒、约 150 条的确定性样例。 */
export function buildFixtureComments(duration = 60) {
  const comments = [];
  for (let second = 0; second < duration; second += 1) {
    for (let slot = 0; slot < 2 + (second % 2); slot += 1) {
      const time = Number((second + slot * 0.45).toFixed(2));
      const index = comments.length;
      const phrase = PHRASES[index % PHRASES.length];
      const text = `${phrase} ${String(index).padStart(3, '0')}`;
      const kind = index % 10;
      if (kind <= 5) {
        // 渐变弹幕:linear、angle 0(左→右)、两个 stops。
        comments.push({
          p: `${time},1,16777215,${index}`,
          m: text,
          danmux: {
            extensionVersion: 1,
            effects: [{
              type: 'gradient', origin: 'generated', target: 'fill',
              source: { type: 'linear', angle: 0, stops: FIXTURE_STOPS.map((stop) => ({ ...stop })) },
            }],
          },
        });
      } else if (kind === 6) {
        // 非法 effect:stops 颜色不合法,渲染器必须整体忽略并回退 p 单色。
        comments.push({
          p: `${time},1,65280,${index}`,
          m: `${text}(非法 effect → p fallback)`,
          danmux: {
            extensionVersion: 1,
            effects: [{
              type: 'gradient', target: 'fill',
              source: { type: 'linear', angle: 0, stops: [{ position: 0, color: 'oops' }, { position: 1, color: '#33B8FF' }] },
            }],
          },
        });
      } else if (kind === 7) {
        // 纯 dandanplay 评论:没有任何 danmux 字段。
        comments.push({ p: `${time},1,16711680,${index}`, m: `${text}(纯 p)` });
      } else if (kind === 8) {
        // 底部静态弹幕(mode 4),渐变。
        comments.push({
          p: `${time},4,16777215,${index}`,
          m: `${text}(底部渐变)`,
          danmux: {
            extensionVersion: 1,
            effects: [{
              type: 'gradient', origin: 'generated', target: 'fill',
              source: { type: 'linear', angle: 0, stops: FIXTURE_STOPS.map((stop) => ({ ...stop })) },
            }],
          },
        });
      } else {
        // 顶部静态弹幕(mode 5),单色。
        comments.push({ p: `${time},5,16760576,${index}`, m: `${text}(顶部单色)` });
      }
    }
  }
  return { format: 'danmux', schemaVersion: 1, comments };
}
