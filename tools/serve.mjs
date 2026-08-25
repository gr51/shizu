// 静态文件服务器（零依赖）。用法：node tools/serve.mjs [port]
// 路径全部相对本文件解析 —— 不含任何硬编码绝对路径。

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 服务仓库根目录：web/ 的原型壳要能引用 shizu-cocos/assets/scripts/ 里的核心层
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] ?? process.env.PORT ?? 8123);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

const OVERRIDE_FILE = 'web/src/config/overrides.data.json';
const COCOS_OVERRIDE_FILE = 'shizu-cocos/assets/resources/config/overrides.json';

// 资产清单端点白名单目录（后台「资产库」与 sprite 自动补全用；只报文件名，防目录遍历）
const ART_DIRS = ['units', 'backgrounds', 'effects', 'items', 'lobby'];
const IMG_RE = /\.(png|webp|jpg)$/i;

function listArt() {
  const out = {};
  const base = path.join(root, 'shizu-cocos/assets/art');
  for (const dir of ART_DIRS) {
    const p = path.join(base, dir);
    out[dir] = fs.existsSync(p)
      ? fs.readdirSync(p).filter((f) => IMG_RE.test(f)).map((f) => f.replace(IMG_RE, '')).sort()
      : [];
  }
  return out;
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  // 后台资产清单：只读、固定根、文件名去扩展名（供 datalist 自动补全与资产库网格）
  if (req.method === 'GET' && urlPath === '/api/art-list') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(listArt()));
    return;
  }
  // 后台「保存到项目」：唯一写入端点（固定路径 / 限 256KB / 必须合法 JSON）
  if (req.method === 'POST' && urlPath === '/web/src/config/overrides.data.json') {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 262144) { res.writeHead(413).end('too large'); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        JSON.parse(body.toString('utf8'));   // 非 JSON 直接拒绝
        fs.mkdirSync(path.dirname(path.join(root, COCOS_OVERRIDE_FILE)), { recursive: true });
        fs.writeFileSync(path.join(root, OVERRIDE_FILE), body);
        fs.writeFileSync(path.join(root, COCOS_OVERRIDE_FILE), body);
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`bad json: ${e.message}`);
      }
    });
    return;
  }
  let file = path.join(root, urlPath === '/' ? 'web/index.html' : urlPath);
  if (!file.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  // 目录 → index.html（让 /web/ 这类路径可用，且页面里的相对 import 能正确解析）
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`404 ${urlPath}`);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, () => {
  console.log(`噬祖 · 网页原型 → http://localhost:${port}/web/`);
  console.log(`根目录：${root}`);
});
