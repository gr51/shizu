// 最小验证：生成玩家基础形象，检查管线端到端是否通
import { genAndWrite, generateSprite } from './pipeline.mjs';

const PX = '16-bit pixel art, game sprite, black outline, transparent background, limited color palette, retro arcade style';

async function main() {
  console.log('=== 管线验证：玩家基础形象 ===\n');
  
  const img = await genAndWrite(
    `${PX}, a cute round insect nestling creature with milky white pearlescent shell, cyan glowing core in chest center, big cute eyes, small stubby legs, idle standing pose facing right, single character sprite centered, no background, no shadow`,
    'units/player.png',
  );
  
  console.log('\n✓ 管线验证通过');
  console.log(`  尺寸: ${img.w}×${img.h}`);
  console.log('  路径: shizu-cocos/assets/art/units/player.png');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
