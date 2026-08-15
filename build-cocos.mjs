import { spawn } from 'node:child_process';
import fs from 'node:fs';

const exe = 'E:/Program Files/cocosEngine/CocosCreator-v3.8.8-win-121518/CocosCreator.exe';
const project = 'E:/Project/aa/shizu-cocos';

const log = fs.createWriteStream('E:/Project/aa/build-log2.txt', { flags: 'w' });

const child = spawn(exe, ['--project', project, '--build', 'platform=web-mobile', '--nologin'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.stdout.on('data', (d) => { process.stdout.write(d); log.write(d); });
child.stderr.on('data', (d) => { process.stdout.write('[ERR] ' + d); log.write(d); });
child.on('close', (code) => { log.end(); console.log('EXIT CODE:', code); });

// 超时保护：20 分钟后强制结束
setTimeout(() => {
  console.log('TIMEOUT: killing');
  child.kill();
}, 20 * 60 * 1000);
