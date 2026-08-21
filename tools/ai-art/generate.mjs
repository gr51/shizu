// ===== ai-art/generate.mjs · 12 位面资产生成器（AI + 像素化）=====
// 用法：
//   node tools/ai-art/generate.mjs --plane jiguan     # 单一位面试点
//   node tools/ai-art/generate.mjs --all              # 全部 12 位面
//
// 命名严格对齐渲染层（web/src/game/renderer.js + assets.js）：
//   units/player.png / player_f0..3.png
//   units/minion_{variant}_{plane}.png + _walk0 / _atk0/1/2 / _death
//   units/elite_{plane}.png / boss_{plane}.png
//   items/gene_orb.png
//   backgrounds/plane_0X_{id}.png（全场景背景）/ backgrounds/floor_{plane}.png（无缝地砖）
//
// 每个位面「2 种不同小怪 + 1 BOSS」（用户要求）：
//   walker = 物种 A 近战追击；spitter = 物种 B 远程吐射；charger = 物种 A 冲撞形态。
// 产物会同时写入 assets/art/（美术源）与 assets/resources/art/（Cocos 运行时）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { genAndWrite, writePng, artDir, runtimeArtDir, sleep } from './pipeline.mjs';
import { encodePng } from '../pixel/png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// 16-bit 像素风统一前缀（口径见 开发说明.md 5.4：黑色描边/有限色阶/复古）
const PX = '16-bit pixel art, retro game sprite, single sprite centered, black outline, limited color palette, crisp pixels, no dithering, side view facing right, solid dark gray background';

/** 每件资产的生成目标（渲染层 blitSprite 会按 targetH 缩放，源图高清度由这里定） */
const T = { player: 48, minion: 34, elite: 56, boss: 88, orb: 16, floor: 256, bg: 270 };

/** 12 位面完整设定（取自 data/planes.js 的 theme / boss / bossDesc + palette 强调色） */
export const PLANES = [
  {
    id: 'jiguan', codex: 1, name: '机关城', accent: 'warm brass and copper',
    minionA: 'small clockwork gear rat, brass and copper body, spinning gear wheel on back, red glowing eye, stubby gear legs',
    minionB: 'small clockwork steam turret, brass barrel, steam puff vents, red sensor eye, tripod gear legs',
    elite: 'clockwork gear guard, brass armor plates, large shoulder gear, red glowing eye, gear halberd weapon',
    boss: 'giant brass puppet colossus golem, huge humanoid of gears and plates, glowing amber core in chest, red menacing eyes, steam vents on shoulders, massive imposing',
    floor: 'worn dark iron and brass floor plating of a clockwork factory, dense small rivets, hairline scratches and oil stains, many tiny gear teeth etched into the metal, uniform allover industrial texture with no repeating focal shape, muted warm brown-gray',
    bg: 'giant clockwork fortress interior, huge gears and steam pipes, dark brass and teal tones, atmospheric, no characters',
  },
  {
    id: 'aofa', codex: 2, name: '奥法王国', accent: 'arcane purple and violet',
    minionA: 'floating arcane spark imp, purple rune body, glowing violet eyes, tiny crystal shard horns, hovering',
    minionB: 'arcane runestone golem, carved purple stone with glowing runes, floating rune ring around it, short squat body',
    elite: 'arcane elemental mentor, purple robe spirit, triple floating rune rings, glowing staff, hovering',
    boss: 'arcane archmage king, grand purple robe, glowing rune circles orbiting, starry aura, floating crown, menacing spellcaster',
    floor: 'seamless arcane rune stone floor, purple glowing rune tiles, magical circle patterns, top-down view',
    bg: 'floating wizard tower interior, purple runes and starry sky through windows, floating books, atmospheric, no characters',
  },
  {
    id: 'qiqiao', codex: 3, name: '奇巧迷宫', accent: 'mirror silver and neon green',
    minionA: 'mirror prism beast, faceted silver cube body, neon green eye, tiny mirror shard legs',
    minionB: 'laser prism sentry, triangular mirror crystal, glowing green laser lens eye, hovering tripod',
    elite: 'two-faced mirror puppet, mirrored silver body showing two faces, neon green laser eyes, spinning',
    boss: 'hundred-machine king, colossal mechanical puppet master, dozens of mirror panels, laser cannon arms, menacing',
    floor: 'seamless mirror maze floor, reflective silver tiles with green laser seams, top-down view',
    bg: 'mirror maze interior, endless reflective walls, green laser beams, dark silver tones, atmospheric, no characters',
  },
  {
    id: 'dujie', codex: 4, name: '渡劫之域', accent: 'thunder purple and lightning',
    minionA: 'thunder spirit wolf, purple electric fur, crackling lightning mane, glowing blue eyes, fierce',
    minionB: 'tribulation lightning wisp, floating electric orb with jagged lightning bolts, purple core',
    elite: 'thunder tribulation herald, armored lightning spirit, crackling electric wings, spear of lightning',
    boss: 'lightning tribulation god, towering thunder deity, storm clouds crown, lightning bolts in hands, purple robes, menacing',
    floor: 'seamless cracked stone floor with glowing purple lightning veins, scorched ground, top-down view',
    bg: 'xianxia thunder tribulation ruins, floating immortal mountains, purple lightning storm sky, atmospheric, no characters',
  },
  {
    id: 'gongde', codex: 5, name: '功德圣境', accent: 'buddhist gold and warm yellow',
    minionA: 'golden arhat monk minion, small golden statue body, lotus patterns, gentle glowing eyes',
    minionB: 'praying lotus spirit, floating lotus flower with tiny golden face, soft halo, floating petals',
    elite: 'golden vajra guardian, armored golden monk statue, glowing halo, golden staff weapon',
    boss: 'golden buddha giant, colossal golden buddha statue, radiant halo, calm menacing face, lotus throne, divine aura',
    floor: 'seamless golden temple floor, lotus tile patterns, warm golden glow, top-down view',
    bg: 'buddhist golden temple hall, lotus ponds, floating golden light, sacred atmosphere, no characters',
  },
  {
    id: 'shihai', codex: 6, name: '尸海末世', accent: 'rotten green and gray',
    minionA: 'shambling zombie, torn gray-green skin, one glowing eye, dragging arms, slow shambler',
    minionB: 'poison sac bloater, swollen green body with pustules, dripping toxic goo, tiny legs',
    elite: 'corpse hulk, massive rotting brute, chains and scrap armor, glowing green core, heavy',
    boss: 'annihilator, colossal amalgamation of corpses, green toxic aura, multiple arms, glowing core, terrifying',
    floor: 'seamless ruined wasteland floor, cracked asphalt, toxic green puddles, debris, top-down view',
    bg: 'zombie apocalypse ruins, gray-green wasteland, abandoned buildings, toxic fog, atmospheric, no characters',
  },
  {
    id: 'gongshengchao', codex: 7, name: '共生巢', accent: 'spore pink and purple',
    minionA: 'parasite spore grub, pink-purple organic body, tendrils, tiny mandibles, crawling',
    minionB: 'hive incubator pod, pulsating organic sac, glowing pink core, spore vents, rooted',
    elite: 'symbiotic queen guardian, elegant pink-purple insectoid, glowing crown, tendril wings, hovering',
    boss: 'all-mother, colossal organic hive queen, pulsating pink flesh, spore clouds, tendril arms, motherly menacing',
    floor: 'seamless organic hive floor, pink-purple flesh tiles, spore patches, bioluminescent, top-down view',
    bg: 'biological hive interior, pulsating organic walls, pink-purple spores, bioluminescent glow, atmospheric, no characters',
  },
  {
    id: 'wuxia', codex: 8, name: '武侠江湖', accent: 'ink wash black and white',
    minionA: 'bandit thug, ragged ink-wash robe, straw hat, rusty dao sword, sneaky stance',
    minionB: 'flying dagger assassin, black masked figure, twin daggers, acrobatic pose',
    elite: 'wuxia sword master, elegant ink-wash robe, flowing sleeves, glowing sword, calm deadly stance',
    boss: 'nameless sword saint, old master with long beard, ink-wash robes, sword aura, one eye closed, legendary',
    floor: 'seamless bamboo forest floor, fallen leaves, light ink-wash tones, top-down view',
    bg: 'jianghu martial world, bamboo forest and old tavern, misty mountains, light ink-wash painting style, atmospheric, no characters',
  },
  {
    id: 'shanhai', codex: 9, name: '山海洪荒', accent: 'primal red-brown and beast tones',
    minionA: 'primal beast cub, red-brown fur, tusks, small horns, wild fierce look, four legs',
    minionB: 'thunder roc chick, giant bird hatchling with electric feathers, sharp beak, spread wings',
    elite: 'savage beast elder, massive horned beast, battle scars, glowing red eyes, heavy stance',
    boss: 'taotie glutton, colossal mythic beast with giant mouth, red-brown fur, devouring aura, legendary',
    floor: 'seamless primal wilderness floor, red-brown earth, giant footprints, grass tufts, top-down view',
    bg: 'primeval wilderness, giant beast silhouettes, red-brown mountains, ancient primal sky, atmospheric, no characters',
  },
  {
    id: 'jijia', codex: 10, name: '机甲战线', accent: 'steel blue and silver',
    minionA: 'patrol mech soldier, small blue-steel humanoid robot, single visor eye, shoulder cannon, marching',
    minionB: 'missile drone, hovering quad-rotor drone, missile pods, red targeting light, compact',
    elite: 'heavy mech commander, bulky blue-steel mech, twin missile launchers, glowing visor, imposing',
    boss: 'zero mech, colossal battle mech, missile barrage racks, energy shield, blue visor, menacing final boss',
    floor: 'seamless steel hangar floor, metal panels, hazard stripes, top-down view',
    bg: 'future mecha battlefield, steel fortress, hangar lights, blue-silver tones, atmospheric, no characters',
  },
  {
    id: 'jushen', codex: 11, name: '巨神界', accent: 'ice white and frost blue',
    minionA: 'frost giant whelp, small pale-blue giant child, ice crystal club, shaggy white fur',
    minionB: 'cloudtop stone statue, floating marble sentinel with glowing blue runes, hovering',
    elite: 'frost titan guard, towering ice-armored giant, frozen axe, glowing blue core',
    boss: 'titan giant, colossal mountain-sized giant, icy crown, throwing boulders, stomping earth, legendary',
    floor: 'seamless cloudtop stone floor, frost-covered tiles, ice crystals, top-down view',
    bg: 'cloudtop giant realm, floating islands above clouds, ice-white towers, giant silhouettes, atmospheric, no characters',
  },
  {
    id: 'zhutian', codex: 12, name: '诸天之心', accent: 'cosmic violet and shard colors',
    minionA: 'rift shard imp, floating jagged crystal creature, violet core, broken world shards orbiting',
    minionB: 'void devourer, small dark void sphere with hungry maw, purple glints, floating',
    elite: 'cosmic rift guardian, crystalline armor, violet energy core, shard wings, hovering',
    boss: 'collapsed shadow, colossal cosmic horror of broken world shards, mirror face, violet void core, ultimate boss',
    floor: 'seamless cosmic rift floor, broken world shards, violet void seams, starry glints, top-down view',
    bg: 'center of all worlds, cosmic rift, shards of worlds orbiting, violet chaos, atmospheric, no characters',
  },
];

const BG_FILE = {
  jiguan: 'plane_01_jiguan', aofa: 'plane_02_aofa', qiqiao: 'plane_03_qiqiao',
  dujie: 'plane_04_dujie', gongde: 'plane_05_gongde', shihai: 'plane_06_shihai',
  gongshengchao: 'plane_07_gongshengchao', wuxia: 'plane_08_wuxia', shanhai: 'plane_09_shanhai',
  jijia: 'plane_10_jijia', jushen: 'plane_11_jushen', zhutian: 'plane_12_zhutian',
};

/** 单帧 PNG 的宽高（读 IHDR） */
function sizeOf(p) {
  const buf = fs.readFileSync(p);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** 把若干 RGBA 图横排拼成一张雪碧图（动画帧用） */
function composeHorizontal(imgs, gap = 0) {
  const h = Math.max(...imgs.map((i) => i.height));
  const w = imgs.reduce((s, i) => s + i.width, 0) + gap * (imgs.length - 1);
  const out = new Uint8Array(w * h * 4);
  let x = 0;
  for (const img of imgs) {
    for (let y = 0; y < img.height; y++) {
      const src = y * img.width * 4;
      const dst = (y * w + x) * 4;
      out.set(img.data.subarray(src, src + img.width * 4), dst);
    }
    x += img.width + gap;
  }
  return { width: w, height: h, data: out };
}

/** 把若干 RGBA 图拼成网格（自检蒙太奇用） */
function composeGrid(imgs, cols = 5) {
  const cellW = Math.max(...imgs.map((i) => i.width));
  const cellH = Math.max(...imgs.map((i) => i.height));
  const rows = Math.ceil(imgs.length / cols);
  const pad = 8;
  const W = cols * (cellW + pad) + pad;
  const H = rows * (cellH + pad) + pad;
  const out = new Uint8Array(W * H * 4);
  // 深色底
  for (let i = 0; i < W * H; i++) { out[i * 4 + 3] = 255; }
  imgs.forEach((img, idx) => {
    const cx = pad + (idx % cols) * (cellW + pad);
    const cy = pad + Math.floor(idx / cols) * (cellH + pad);
    const ox = Math.floor((cellW - img.width) / 2);
    const oy = Math.floor((cellH - img.height) / 2);
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const s = (y * img.width + x) * 4;
        if (img.data[s + 3] === 0) continue;
        const d = ((cy + oy + y) * W + (cx + ox + x)) * 4;
        out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2]; out[d + 3] = 255;
      }
    }
  });
  return { width: W, height: H, data: out };
}

/** 写一张雪碧图 + 更新 anim.json（覆盖 web 与 Cocos 两份） */
async function writeSheet(rel, frames, fps, loop = true) {
  const sheet = composeHorizontal(frames);
  writePng(rel, sheet);
  const manifest = JSON.parse(fs.readFileSync(path.join(artDir, 'anim.json'), 'utf8'));
  const key = `art/${rel}`;
  manifest.clips = manifest.clips.filter((c) => c.file !== key);
  manifest.clips.push({
    file: key, frameWidth: frames[0].width, frameHeight: sheet.height,
    frames: frames.length, fps, loop,
  });
  fs.writeFileSync(path.join(artDir, 'anim.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(runtimeArtDir, 'anim.json'), JSON.stringify(manifest, null, 2));
}

/** 生成一个位面的全部资产；返回生成的图片列表（供蒙太奇） */
export async function genPlane(plane, { withPlayer = false } = {}) {
  const imgs = [];
  const { id } = plane;
  const rel = (p) => path.join(artDir, p);
  const ok = (p) => fs.existsSync(rel(p));
  const done = (p) => imgs.push({ rel: p, w: sizeOf(rel(p)).w, h: sizeOf(rel(p)).h });

  // —— 玩家（全局共享，只生成一次）——
  if (withPlayer) {
    await genAndWrite(`${PX}, cute round chubby insect larva hero, milky white pearlescent shell, bright cyan glowing core in chest, large amber eyes, tiny stubby legs, idle standing pose, kawaii cute protagonist, NOT a bird, no wings, no beak, no feathers`,
      'units/player.png', { targetH: T.player, maxColors: 8 });
    done('units/player.png');
    for (let i = 0; i < 4; i++) {
      const pose = ['left leg forward, mid step', 'both feet together, low bounce', 'right leg forward, mid step', 'feet apart, landing'][i];
      await genAndWrite(`${PX}, same cute round white insect larva hero with cyan glowing core, ${pose}, walking animation frame ${i + 1}/4`,
        `units/player_f${i}.png`, { targetH: T.player, maxColors: 8 });
      done(`units/player_f${i}.png`);
    }

    // —— 基因球（全局共享，渲染层直接引用 items/gene_orb.png）——
    await genAndWrite(`${PX}, small glowing cyan gene orb, teal energy sphere with inner swirl, floating game pick-up item, bright soft glow`,
      'items/gene_orb.png', { targetH: T.orb, maxColors: 6 });
    done('items/gene_orb.png');
  }

  // —— 物种 A：walker（近战追击）→ charger（冲撞形态）——
  for (const [variant, pose, extra] of [
    ['walker', 'aggressive stance, ready to lunge', ''],
    ['charger', 'low charging pose, sparks flying, leaning forward', ''],
  ]) {
    await genAndWrite(`${PX}, ${plane.minionA}, ${pose}, enemy minion, ${plane.accent} colors${extra}`,
      `units/minion_${variant}_${id}.png`, { targetH: T.minion, maxColors: 10 });
    done(`units/minion_${variant}_${id}.png`);
  }
  // 物种 A 的动作帧（walker 与 charger 共用：同一物种）
  for (const [suffix, desc] of [
    ['walk0', 'walking forward, one leg up, moving'],
    ['atk0', 'attack windup, rearing back, about to strike'],
    ['atk1', 'attack strike, lunging forward with claws/weapon extended'],
    ['atk2', 'attack follow-through, recovering stance'],
    ['death', 'destroyed, broken gears and parts scattering, defeated'],
  ]) {
    await genAndWrite(`${PX}, ${plane.minionA}, ${desc}, enemy minion, ${plane.accent} colors`,
      `units/minion_walker_${id}_${suffix}.png`, { targetH: T.minion, maxColors: 10 });
    done(`units/minion_walker_${id}_${suffix}.png`);
    // charger 复用同物种动作帧（拷贝文件，保证渲染层能找到）
    fs.copyFileSync(rel(`units/minion_walker_${id}_${suffix}.png`), rel(`units/minion_charger_${id}_${suffix}.png`));
    fs.copyFileSync(path.join(runtimeArtDir, `units/minion_walker_${id}_${suffix}.png`), path.join(runtimeArtDir, `units/minion_charger_${id}_${suffix}.png`));
    if (suffix !== 'walk0') done(`units/minion_charger_${id}_${suffix}.png`);
  }

  // —— 物种 B：spitter（远程吐射）——
  for (const [suffix, desc] of [
    ['', 'hovering idle, aiming'],
    ['walk0', 'hovering forward, repositioning'],
    ['atk0', 'attack windup, barrel charging energy'],
    ['atk1', 'attack fire, projectile shooting out'],
    ['atk2', 'attack follow-through, recoil, steam puff'],
    ['death', 'destroyed, broken parts scattering, defeated'],
  ]) {
    // 空 suffix = 待机图（minion_spitter_jiguan.png），有 suffix 才接 `_`；
    // 少了这个三元会生成 minion_spitter_jiguanwalk0.png 这种渲染层永远加载不到的名字。
    const file = `units/minion_spitter_${id}${suffix ? `_${suffix}` : ''}.png`;
    await genAndWrite(`${PX}, ${plane.minionB}, ${desc}, enemy minion, ${plane.accent} colors`,
      file, { targetH: T.minion, maxColors: 10 });
    done(file);
  }

  // —— 精英 ——
  await genAndWrite(`${PX}, ${plane.elite}, elite enemy, ${plane.accent} colors`,
    `units/elite_${id}.png`, { targetH: T.elite, maxColors: 12 });
  done(`units/elite_${id}.png`);

  // —— BOSS（位面之主）——
  await genAndWrite(`${PX}, ${plane.boss}, final boss, ${plane.accent} colors, very large`,
    `units/boss_${id}.png`, { targetH: T.boss, maxColors: 14 });
  done(`units/boss_${id}.png`);

  // —— 地砖（无缝平铺）——
  await genAndWrite(`${PX}, ${plane.floor}, game floor tile texture`,
    `backgrounds/floor_${id}.png`, { targetH: T.floor, maxColors: 16, alpha: false, bgRemove: false });
  done(`backgrounds/floor_${id}.png`);

  // —— 全场景背景 ——
  await genAndWrite(`${PX}, ${plane.bg}, game background scene`,
    `backgrounds/${BG_FILE[id]}.png`, { targetH: T.bg, maxColors: 24, alpha: false, bgRemove: false });
  done(`backgrounds/${BG_FILE[id]}.png`);

  return imgs;
}

/** 生成玩家走路/攻击/受击动画 clip（anim.json 需要） */
export async function genPlayerClips() {
  const read = (p) => {
    const buf = fs.readFileSync(path.join(artDir, p));
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), buf };
  };
  // 单帧 idle / hit
  const idle = read('units/player.png');
  fs.copyFileSync(path.join(artDir, 'units/player.png'), path.join(artDir, 'anim/player_idle.png'));
  fs.copyFileSync(path.join(runtimeArtDir, 'units/player.png'), path.join(runtimeArtDir, 'anim/player_idle.png'));
  // 4 帧 walk 横排雪碧图
  const frames = [0, 1, 2, 3].map((i) => {
    const b = fs.readFileSync(path.join(artDir, `units/player_f${i}.png`));
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), data: decodeRgba(b) };
  });
  const walk = composeHorizontal(frames);
  writePng('anim/player_walk.png', walk);
  fs.copyFileSync(path.join(artDir, 'units/player.png'), path.join(artDir, 'anim/player_attack.png'));
  fs.copyFileSync(path.join(runtimeArtDir, 'units/player.png'), path.join(runtimeArtDir, 'anim/player_attack.png'));
  fs.copyFileSync(path.join(artDir, 'units/player.png'), path.join(artDir, 'anim/player_hit.png'));
  fs.copyFileSync(path.join(runtimeArtDir, 'units/player.png'), path.join(runtimeArtDir, 'anim/player_hit.png'));

  const manifest = JSON.parse(fs.readFileSync(path.join(artDir, 'anim.json'), 'utf8'));
  for (const [file, frames, fps] of [
    ['art/anim/player_idle.png', 1, 1],
    ['art/anim/player_walk.png', 4, 8],
    ['art/anim/player_attack.png', 1, 1],
    ['art/anim/player_hit.png', 1, 1],
  ]) {
    manifest.clips = manifest.clips.filter((c) => c.file !== file);
    const s = file.endsWith('player_walk.png') ? { width: walk.width, height: walk.height } : { width: idle.width, height: idle.height };
    manifest.clips.push({ file, frameWidth: s.width / frames, frameHeight: s.height, frames, fps, loop: true });
  }
  fs.writeFileSync(path.join(artDir, 'anim.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(runtimeArtDir, 'anim.json'), JSON.stringify(manifest, null, 2));
}

// —— RGBA 解码（PNG，供拼图用；复用 pipeline 的 decodePng）——
import { decodePng } from './pipeline.mjs';
function decodeRgba(buf) { return decodePng(buf).data; }

// —— 主入口 ——
async function main() {
  const args = process.argv.slice(2);
  const planeArg = args.find((a) => a.startsWith('--plane='))?.split('=')[1]
    ?? (args.includes('--all') ? 'all' : args[args.indexOf('--plane') + 1] ?? 'all');
  const targets = planeArg === 'all' ? PLANES : PLANES.filter((p) => p.id === planeArg);
  if (targets.length === 0) { console.error(`未知位面: ${planeArg}`); process.exit(1); }

  console.log(`生成 ${targets.length} 个位面: ${targets.map((p) => p.id).join(', ')}`);

  // 初始化 anim.json（若不存在）
  fs.mkdirSync(path.join(artDir, 'anim'), { recursive: true });
  fs.mkdirSync(path.join(runtimeArtDir, 'anim'), { recursive: true });
  if (!fs.existsSync(path.join(artDir, 'anim.json'))) {
    fs.writeFileSync(path.join(artDir, 'anim.json'), JSON.stringify({ clips: [] }, null, 2));
    fs.writeFileSync(path.join(runtimeArtDir, 'anim.json'), JSON.stringify({ clips: [] }, null, 2));
  }

  let allImgs = [];
  for (let i = 0; i < targets.length; i++) {
    const plane = targets[i];
    console.log(`\n=== [${i + 1}/${targets.length}] ${plane.id} · ${plane.name} ===`);
    const imgs = await genPlane(plane, { withPlayer: i === 0 });
    allImgs = allImgs.concat(imgs);
    await sleep(300);
  }

  // 玩家动画 clips
  await genPlayerClips();

  // 自检蒙太奇
  const sheetDir = path.join(root, '.tmp', 'ai-art');
  fs.mkdirSync(sheetDir, { recursive: true });
  const grid = composeGrid(allImgs.map((x) => {
    const b = fs.readFileSync(path.join(artDir, x.rel));
    const d = decodeRgba(b);
    const { w, h } = x;
    return { width: w, height: h, data: d };
  }), 6);
  const contact = path.join(sheetDir, `contact-${targets.map((p) => p.id).join('-')}.png`);
  fs.writeFileSync(contact, encodePng(grid.width, grid.height, grid.data));
  console.log(`\n蒙太奇自检图: ${contact}`);
  console.log(`资产数: ${allImgs.length}`);
}

// 只有被直接执行时才跑全量生成。别的脚本 import PLANES 时不该顺带
// 把整个位面的资产重新出一遍（会覆盖已调好的美术，且烧掉大量 API 调用）。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
}
