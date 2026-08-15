const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333 + Math.floor(Math.random() * 1000);

function getJson(url) {
  return new Promise((res, rej) => {
    http.get(url, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

function newTarget(url) {
  return new Promise((res, rej) => {
    const req = http.request(url, { method: 'PUT' }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    });
    req.on('error', rej);
    req.end();
  });
}

async function main() {
  const profile = `E:/Project/aa/.verify-profile`;
  const child = spawn(EDGE, [
    '--headless=new', '--use-angle=swiftshader', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`, '--window-size=1280,720', 'about:blank',
  ], { stdio: 'ignore' });

  // wait for devtools
  let ver;
  for (let i = 0; i < 40; i++) {
    try { ver = await getJson(`http://127.0.0.1:${PORT}/json/version`); break; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ver) { console.log('FAIL: no devtools'); child.kill(); return; }

  const target = await newTarget(`http://127.0.0.1:${PORT}/json/new?http://localhost:8123/`);
  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0;
  const pending = new Map();
  const logs = [];

  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (msg.params.exceptionDetails?.exception?.description || ''));
    if (msg.method === 'Runtime.consoleAPICalled') logs.push('LOG: ' + (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
      logs.push(`HTTP ${msg.params.response.status}: ${msg.params.response.url}`);
    }
  });

  await new Promise((res) => ws.on('open', res));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  // navigate
  await send('Page.navigate', { url: 'http://localhost:8123/' });
  // wait for load
  await new Promise((r) => setTimeout(r, 12000));

  // gather state
  const state = await send('Runtime.evaluate', {
    expression: `(() => {
      const out = { hasCC: !!window.cc, errors: [] };
      try {
        const d = window.cc.director;
        const scene = d.getScene();
        out.sceneName = scene ? scene.name : null;
        const nodes = [];
        const walk = (n, depth) => {
          if (depth > 5 || nodes.length > 60) return;
          const comps = n.components ? n.components.map(c => c.constructor.name) : [];
          let info = '  '.repeat(depth) + n.name + ' [' + comps.join(',') + ']';
          if (n.getComponent) {
            const lb = n.getComponent(window.cc.Label);
            if (lb) info += ' TEXT=' + JSON.stringify(String(lb.string).slice(0, 40));
            const gr = n.getComponent(window.cc.Graphics);
            if (gr) info += ' Graphics';
          }
          nodes.push(info);
          if (n.children) for (const c of n.children) walk(c, depth + 1);
        };
        if (scene) walk(scene, 0);
        out.nodes = nodes;
      } catch (e) { out.errors.push('STATE-ERR: ' + e.message); }
      return out;
    })()`,
    returnByValue: true,
  });

  const val = state?.result?.value || {};
  console.log('=== STATE ===');
  console.log('hasCC:', val.hasCC, 'scene:', val.sceneName);
  console.log('--- node tree ---');
  (val.nodes || []).forEach((n) => console.log(n));
  console.log('--- errors ---', val.errors.length ? val.errors.join('\n') : 'none');

  const readPlayerPosition = () => send('Runtime.evaluate', {
    expression: `(() => {
      const player = window.cc.find('Canvas/player-sprite');
      return player ? { x: player.position.x, y: player.position.y } : null;
    })()`,
    returnByValue: true,
  });
  const beforeMove = await readPlayerPosition();
  await send('Page.bringToFront');
  await send('Runtime.evaluate', { expression: `document.querySelector('canvas')?.focus()` });
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 });
  await new Promise((r) => setTimeout(r, 600));
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 });
  const afterMove = await readPlayerPosition();
  console.log('movement:', JSON.stringify(beforeMove?.result?.value), '->', JSON.stringify(afterMove?.result?.value));

  // screenshot
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot?.data) fs.writeFileSync('E:/Project/aa/_verify-shot.png', Buffer.from(shot.data, 'base64'));
  console.log('screenshot saved:', shot?.data ? 'yes' : 'no');

  console.log('=== LOGS ===');
  console.log(logs.length ? logs.slice(0, 40).join('\n') : '(no console output)');

  ws.close();
  child.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
}

main().catch((e) => { console.log('FATAL:', e.message); process.exit(1); });
