import fs from 'node:fs';
import path from 'node:path';

const src = 'E:/Project/aa/噬祖/cocos';
const dst = 'E:/Project/aa/shizu-cocos';

if (!fs.existsSync(src)) {
  console.error('SRC NOT EXISTS:', src);
  process.exit(1);
}

// 1. 清空目标（Node 处理路径无损，且这里无中文）
if (fs.existsSync(dst)) {
  fs.rmSync(dst, { recursive: true, force: true });
  console.log('removed dst');
}

// 2. 递归复制（跳过 node_modules 等大目录以提速，保留其他全部）
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const t = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, t);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, t);
    }
  }
}

copyDir(src, dst);

// 3. 验证
let count = 0;
function countFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) countFiles(path.join(dir, e.name));
    else count++;
  }
}
countFiles(dst);
console.log('copied files:', count);
console.log('dst top-level:', JSON.stringify(fs.readdirSync(dst)));
console.log('dst package.json exists:', fs.existsSync(path.join(dst, 'package.json')));
