const fs = require('fs');
const path = require('path');

function walk(d, pre) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) {
      walk(p, pre + f + '/');
    } else {
      const ext = path.extname(f).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.webp', '.ttf', '.otf', '.bmp', '.gif', '.mp3', '.wav', '.ogg'].includes(ext)) {
        console.log(String(s.size).padStart(8), pre + f);
      }
    }
  }
}

walk('E:/Project/aa/\u566C\u7956', '');
