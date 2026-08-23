// ===== plane-new.mjs · 新位面脚手架生成器 =====
// 用法：node tools/plane-new.mjs <id> <中文名> <codex号>
//   例：node tools/plane-new.mjs xiuluo 修罗界 13
//
// 产出（可插拔位面的全部骨架）：
//   1. planes.js 数据行 + planeModules.js 三张表行（打印待粘贴片段）
//   2. 资产生成 prompt 清单（.tmp/plane-<id>/prompts.txt）——逐条喂给 generate 管线
//   3. 完整性自检提示：跑 npm test 看 tests/planeModules.test.mjs 是否全绿

import fs from 'node:fs';
import path from 'node:path';

const [id, cnName, codexRaw] = process.argv.slice(2);
if (!id || !cnName || !codexRaw) {
  console.error('用法: node tools/plane-new.mjs <id> <中文名> <codex号>');
  console.error('例: node tools/plane-new.mjs xiuluo 修罗界 13');
  process.exit(1);
}
const codex = String(Number(codexRaw)).padStart(2, '0');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');

console.log(`\n=== 新位面骨架：${cnName} (${id}) · 图鉴编号 ${codex} ===\n`);

// —— 1. planes.js / planeModules.js 待粘贴片段 ——
console.log('【粘贴到 planes.js 的 PLANES 数组】');
console.log(`  { codex: ${Number(codexRaw)}, id: '${id}', name: '${cnName}', group: '？', routes: ['?'],`);
console.log(`    theme: '？（机制名）', boss: '？（Boss 名）', bossDesc: '？（机制一句话）',`);
console.log(`    poem: '？（开场诗一句）' },\n`);

console.log('【粘贴到 data/planeModules.js 三张表】');
console.log(`  MINION_SPRITE_BY_STAGE.${id}: [`);
for (let s = 1; s <= 5; s++) {
  const a = `${id}_s${s}a`, b2 = `${id}_s${s}b`;
  console.log(`    ['${a}', '${b2}']${s === 5 ? '' : ','}   // 阶段 ${s}`);
}
console.log('  ],');
console.log(`  BOSS_BY_PLANE.${id}: 'boss_${id}',\n`);

console.log('【粘贴到 PLANE_MECHANICS】');
console.log(`  ${id}: { type: '?', interval: 12 },              // 常驻规则\n`);
if (fs.existsSync(path.join(root, 'shizu-cocos/assets/scripts/data/crises.js'))) {
  console.log('【可选：CRISES_BY_PLANE.' + id + '】  // 危机子集（null=全部）\n');
}

// —— 2. 资产生成 prompt 清单 ——
const dir = path.join(root, '.tmp', `plane-${id}`);
fs.mkdirSync(dir, { recursive: true });
const prompts = [
  ['floor_*.png 256²', `pixel art seamless tile, dark themed dungeon floor for "${cnName}", muted colors, no center pattern, tileable edges`],
  [`plane_${codex}_${id}.png 270h`, `pixel art game background, "${cnName}" atmosphere, dark moody, no characters, no text`],
  ...[1, 2, 3, 4, 5].flatMap((s) => [
    [`${id}_s${s}a 全套(walk0-3/atk0-2/death/base) 34h`, `${PX_MINI()}, stage ${s} minion A of ${cnName}, distinct silhouette`],
    [`${id}_s${s}b 全套 34h`, `${PX_MINI()}, stage ${s} minion B of ${cnName}, ranged variant if designed`],
  ]),
  [`boss_${id} 全套 88h`, `${PX_MINI()}, BOSS of ${cnName}, large imposing silhouette`],
].map(([name, prompt]) => `[${name}]\n  ${prompt}\n`);
function PX_MINI() { return '16-bit pixel art sprite, single character centered, black outline, limited palette, crisp pixels, solid dark background'; }
fs.writeFileSync(path.join(dir, 'prompts.txt'), prompts.join('\n'));
console.log(`✓ 资产 prompt 清单 → .tmp/plane-${id}/prompts.txt (${prompts.length} 条)\n`);

// —— 3. 自检指引 ——
console.log('完成声明后自检：');
console.log('  npm test          # tests/planeModules.test.mjs 五项完整性校验');
console.log('  npm run audit:art # 资产在盘检查');
console.log('  npm run shots     # 视觉巡检\n');
