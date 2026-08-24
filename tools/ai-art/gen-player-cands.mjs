// 初始形象重生成：三候选（经典动作英雄/虚空吞噬者/武侠剑客方向）
import { genAndWrite } from './pipeline.mjs';

const BASE = '16-bit pixel art sprite, SINGLE character centered, full body, side view facing right, strong readable silhouette, high contrast against background, limited palette 12 colors, hard edges no anti-aliasing, crisp pixels, solid flat dark gray background #202028';
const CANDIDATES = [
  {
    name: 'A 血袍吞噬者',
    file: '.tmp/vqa/player-cand-A.png',
    prompt: `${BASE}, a young devourer hero in black and crimson robes, glowing white void-maw gauntlet on one arm, sharp golden eyes, dynamic ready stance, wuxia action hero silhouette like a classic kung-fu movie poster`,
  },
  {
    name: 'B 虚空暗影',
    file: '.tmp/vqa/player-cand-B.png',
    prompt: `${BASE}, a shadowy void-devourer wrapped in tattered dark cloak with purple energy seams, one glowing cyan eye, floating slightly, mysterious assassin silhouette like a classic sci-fi movie antihero`,
  },
  {
    name: 'C 鎏金武尊',
    file: '.tmp/vqa/player-cand-C.png',
    prompt: `${BASE}, a golden-armored warrior with flowing dark hair and jade ornaments, dual curved blades on back, heroic wide stance, epic chinese fantasy blockbuster protagonist look`,
  },
];
for (const c of CANDIDATES) {
  await genAndWrite(c.prompt, c.file, { targetH: 96, maxColors: 16 });
}
console.log('candidates done');
