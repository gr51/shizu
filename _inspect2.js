const fs = require('fs');

// 1. 检查大 json（构建产物里 1MB 的文件）
const big = 'E:/Project/aa/shizu-cocos/build/web-mobile/assets/internal/import/07/07d3aae9f.json';
try {
  const j = JSON.parse(fs.readFileSync(big, 'utf8'));
  const str = JSON.stringify(j);
  const types = {};
  const re = /"__type__":"([^"]+)"/g;
  let m;
  while ((m = re.exec(str))) types[m[1]] = (types[m[1]] || 0) + 1;
  console.log('=== 1MB json keys:', Object.keys(j).slice(0, 20).join(', '));
  console.log('=== types:', JSON.stringify(types, null, 0));
} catch (e) { console.log('big json ERR:', e.message); }

// 2. Main.scene 内容
const scene = 'E:/Project/aa/shizu-cocos/assets/scenes/Main.scene';
console.log('\n=== Main.scene ===');
const sc = JSON.parse(fs.readFileSync(scene, 'utf8'));
console.log('scene keys:', Object.keys(sc).join(', '));
const sceneStr = JSON.stringify(sc);
const sre = /"__type__":"([^"]+)"/g;
const stypes = {};
let sm;
while ((sm = sre.exec(sceneStr))) stypes[sm[1]] = (stypes[sm[1]] || 0) + 1;
console.log('scene component types:', JSON.stringify(stypes, null, 0));
console.log('texture refs:', (sceneStr.match(/_[A-Za-z0-9]{22}/g) || []).slice(0, 20));

// 3. GameController.ts / UI 代码
const gc = 'E:/Project/aa/shizu-cocos/assets/scripts/game/GameController.ts';
console.log('\n=== GameController.ts ===');
console.log(fs.readFileSync(gc, 'utf8'));
