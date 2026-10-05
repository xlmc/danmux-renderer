// Generate native-reader expectations from the existing JS contract, not a second oracle.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readCommentStyle } from '../src/gradient-effect.js';

const cases = JSON.parse(readFileSync(new URL('../vendor/danmux/fixtures/client-linear-v1.json', import.meta.url)));
const base = cases.find(c => c.name === 'linear-fill').comment;
function add(name, mutate) {
  const comment = structuredClone(base);
  mutate(comment);
  cases.push({ name, comment });
}
add('version-string', c => { c.danmux.extensionVersion = '1'; });
add('version-bool', c => { c.danmux.extensionVersion = true; });
add('angle-bool', c => { c.danmux.effects[0].source.angle = false; });
add('alpha-bool', c => { c.danmux.effects[0].source.stops[0].alpha = true; });
add('missing-effects', c => { delete c.danmux.effects; });
add('effects-object', c => { c.danmux.effects = {}; });
add('too-many-effects', c => { c.danmux.effects = Array(9).fill(c.danmux.effects[0]); });
add('null-before-valid', c => { c.danmux.effects.unshift(null); });
add('bad-origin', c => { c.danmux.effects[0].origin = 'other'; });
add('extra-effect-field', c => { c.danmux.effects[0].extra = true; });
add('extra-source-field', c => { c.danmux.effects[0].source.extra = true; });
add('extra-stop-field', c => { c.danmux.effects[0].source.stops[0].extra = true; });
for (const angle of [-360, -90, 45, 90, 180, 270, 360, 361, '0', null]) {
  add(`angle-${angle}`, c => { c.danmux.effects[0].source.angle = angle; });
}
for (const [key, value] of [['position', -0.1], ['position', '0'], ['color', '#fff'], ['color', null], ['alpha', null], ['alpha', '1'], ['alpha', 1.1]]) {
  add(`bad-${key}-${value}`, c => { c.danmux.effects[0].source.stops[0][key] = value; });
}
add('default-alpha-and-sort', c => {
  const stops = c.danmux.effects[0].source.stops;
  delete stops[0].alpha;
  stops.reverse();
});
add('equal-position-stable', c => { c.danmux.effects[0].source.stops[1].position = 0; });
add('invalid-before-valid', c => { c.danmux.effects.unshift({ ...c.danmux.effects[0], origin: 'bad' }); });
add('duplicate-first-wins', c => { c.danmux.effects.push({ ...c.danmux.effects[0], source: { ...c.danmux.effects[0].source, angle: 90 } }); });
add('17-stops', c => { c.danmux.effects[0].source.stops = Array(17).fill(c.danmux.effects[0].source.stops[0]); });
add('16-stops', c => { c.danmux.effects[0].source.stops = Array.from({ length: 16 }, (_, i) => ({ position: i / 15, color: '#abcdef' })); });
const output = cases.map(({ name, comment }) => ({ name, comment, expectedFill: readCommentStyle(comment).fill }));
const directory = resolve(process.argv[2] ?? 'mobile/android/build/generated/contract');
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, 'android-contract.json'), JSON.stringify(output, null, 2) + '\n');
console.log(`Native contract: ${output.length} cases from shared fixtures and JS validator`);
