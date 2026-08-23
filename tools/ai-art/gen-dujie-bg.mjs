// 补生成渡劫位面背景（此前缺失）：雷劫云海主题，与其它位面 bg 同规格
import { genAndWrite } from './pipeline.mjs';

const PX = 'pixel art game background, 16-bit retro style, dark moody atmosphere, no characters, no text';
await genAndWrite(
  `${PX}, endless storm clouds above a mountain peak shrine, massive purple lightning bolts striking down, golden tribulation runes glowing in the dark sky, chinese xianxia apocalypse mood`,
  'backgrounds/plane_04_dujie.png',
  { targetH: 270, maxColors: 32 },
);
console.log('done');
