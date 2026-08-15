// 临时验证脚本：core/plane/PlanePool.js
import { planes } from './data/planes.js';
import { rollPlane, planeWeight, resolveConflict, planeChannel } from './core/plane/PlanePool.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}

// 构造玩家
function mkPlayer(geneLocks = {}, sealedRoutes = []) {
  return { geneLocks, sealedRoutes, totalRuns: 0 };
}

console.log('== 1. 首进固定机关城 ==');
{
  const save = { player: mkPlayer({}, []) };
  for (let i = 0; i < 20; i++) {
    const p = rollPlane(save);
    assert(p.codex === 1, `第${i + 1}次首进应固定机关城，实际 ${p.name}`);
  }
}

console.log('== 2. 权重规则 ==');
{
  const player = mkPlayer({ dujie: 1 }, ['sangshi', 'gongsheng']);
  const qiji = planes.find(p => p.route === 'qiji');
  const dujie = planes.find(p => p.route === 'dujie');
  const sangshi = planes.find(p => p.route === 'sangshi');
  const nullRoute = planes.find(p => p.route === null);
  assert(planeWeight(qiji, player) === 1, '未激活路线位面权重应为 1');
  assert(planeWeight(dujie, player) === 2, '已激活路线位面权重应为 2');
  assert(planeWeight(sangshi, player) === 0, '互斥路线位面权重应为 0');
  assert(planeWeight(nullRoute, player) === 1, '无专属路线位面权重恒为 1');
}

console.log('== 3. 互斥过滤（rollPlane 不抽中互斥位面）==');
{
  const save = { player: mkPlayer({ dujie: 1 }, ['sangshi', 'gongsheng']) };
  save.player.totalRuns = 5;
  for (let i = 0; i < 200; i++) {
    const p = rollPlane(save);
    assert(!['sangshi', 'gongsheng'].includes(p.route), `不应抽中互斥位面 ${p.name}`);
  }
}

console.log('== 4. 已激活位面占比更高（权重 ×2）==');
{
  const save = { player: mkPlayer({ dujie: 1 }, []) };
  save.player.totalRuns = 5;
  let dujieCount = 0, total = 500;
  for (let i = 0; i < total; i++) {
    if (rollPlane(save).route === 'dujie') dujieCount++;
  }
  // 已激活权重2，其余10个位面权重1（含2个null=1），理论占比 2/(2+10)=16.7%
  const ratio = dujieCount / total;
  console.log(`  已激活位面占比 ${(ratio * 100).toFixed(1)}%（理论约 16.7%）`);
  assert(ratio > 0.10 && ratio < 0.25, '已激活位面占比应在合理区间');
}

console.log('== 5. resolveConflict 互斥兜底 ==');
{
  const player = mkPlayer({ dujie: 1 }, ['sangshi', 'gongsheng']);
  const conflict = planes.find(p => p.route === 'sangshi');
  const resolved = resolveConflict(conflict, player);
  assert(resolved.codex !== conflict.codex, '冲突位面应被替换');
  assert(planeWeight(resolved, player) > 0, '替换位面应可抽中');
}

console.log('== 6. 通道判定 ==');
{
  const save = { player: mkPlayer({ dujie: 1 }, []) };
  const dujie = planes.find(p => p.route === 'dujie');
  const qiji = planes.find(p => p.route === 'qiji');
  const nullRoute = planes.find(p => p.route === null);
  assert(planeChannel(dujie, save) === 'skill', '已激活路线位面 → skill 通道');
  assert(planeChannel(qiji, save) === 'attr', '未激活路线位面 → attr 通道');
  assert(planeChannel(nullRoute, save) === 'attr', '无专属路线位面 → attr 通道');
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);