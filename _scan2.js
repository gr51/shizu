const fs = require('fs');
const path = require('path');

function walk(d, pre, depth, out) {
  if (depth > 6) return;
  let items;
  try { items = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
  for (const ent of items) {
    const p = path.join(d, ent.name);
    const rel = pre + ent.name;
    if (ent.isDirectory()) {
      walk(p, rel + '/', depth + 1, out);
    } else {
      out.push({ rel, size: fs.statSync(p).size });
    }
  }
}

console.log('========== 噬祖/ 顶层 ==========');
const root = 'E:/Project/aa/\u566C\u7956';
for (const f of fs.readdirSync(root, { withFileTypes: true })) {
  const s = fs.statSync(path.join(root, f.name));
  console.log(f.isDirectory() ? '[D]' : '[F]', f.name, f.isDirectory() ? '' : s.size + 'B');
}

console.log('\n========== 噬祖/ 全部 png/jpg (assets外) ==========');
const all = [];
walk(root, '', 0, all);
all.filter(x => /\.(png|jpe?g|webp|gif|ttf|otf)$/i.test(x.rel)).forEach(x => {
  if (!/\/library\//.test(x.rel)) console.log(String(x.size).padStart(9), x.rel);
});

console.log('\n========== 噬祖/cocos/assets 完整结构 ==========');
const assets = path.join(root, 'cocos', 'assets');
const assetFiles = [];
walk(assets, '', 0, assetFiles);
assetFiles.forEach(x => console.log(String(x.size).padStart(9), x.rel));

console.log('\n========== 噬祖/game 和 原型 目录 ==========');
for (const sub of ['game', '\u539F\u578B']) {
  const p = path.join(root, sub);
  if (!fs.existsSync(p)) { console.log(sub, ': NOT EXISTS'); continue; }
  console.log('--- ' + sub + ' ---');
  const files = [];
  walk(p, '', 0, files);
  files.slice(0, 60).forEach(x => console.log(String(x.size).padStart(9), x.rel));
  console.log('total files:', files.length);
}

console.log('\n========== library 里 png 的分布（判断是否为引擎内置） ==========');
const libFiles = all.filter(x => /\/library\//.test(x.rel) && /\.(png|jpg|jpeg|ttf|otf)$/i.test(x.rel));
console.log('library 图片/字体数:', libFiles.length);
// 统计是否有用户自定义命名的资源（非 uuid 文件名）
const named = libFiles.filter(x => {
  const base = path.basename(x.rel).replace(/\.(png|jpg|jpeg|ttf|otf)$/i, '');
  return /[a-zA-Z\u4e00-\u9fa5]/.test(base) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(base);
});
console.log('非 uuid 命名的图片/字体（可能是用户资源）:');
named.forEach(x => console.log('  ', String(x.size).padStart(9), x.rel));
