// ===== 词库中心.js · 用完即弃 + 动态挂载（吸收 WordSimulator 精髓）=====

/**
 * 词库中心：
 * - 词库 = { name, 词条: [] }
 * - 随机获得词条：从所有已挂载词库随机选库 → splice 随机抽词（用完即弃）→ 空库自动卸载
 * - 词库响应：属性触发时挂载/卸载词库（匹配位面挂技能库 / 不匹配挂属性库 / 装备库常驻）
 */
class 词库中心 {
  constructor() {
    this.库列表 = [];
    this.响应器 = [];  // { 词库名, 属性, 判断 }
  }

  注册词库(lib) {
    if (!this.库列表.some((l) => l.name === lib.name)) this.库列表.push(lib);
  }

  挂载词库(name) {
    const lib = this.库列表.find((l) => l.name === name);
    if (lib && !lib.已挂载) lib.已挂载 = true;
  }

  卸载词库(name) {
    const lib = this.库列表.find((l) => l.name === name);
    if (lib) lib.已挂载 = false;
  }

  已挂载词库() {
    return this.库列表.filter((l) => l.已挂载);
  }

  /** 词库响应：属性值满足判断 → 挂载，否则卸载 */
  词库响应(词库名, 属性, 判断) {
    this.响应器.push({ 词库名, 属性, 判断 });
  }

  /** 属性变化时刷新所有响应词库 */
  刷新(变化对象) {
    for (const r of this.响应器) {
      const ok = r.判断(变化对象);
      if (ok) this.挂载词库(r.词库名);
      else this.卸载词库(r.词库名);
    }
  }

  /** 随机获得词条：随机选已挂载库 → 抽词即删 → 空库卸载 */
  随机获得词条(rng = Math.random) {
    const 挂载 = this.已挂载词库();
    if (!挂载.length) return null;
    const lib = 挂载[Math.floor(rng() * 挂载.length)];
    if (!lib.词条.length) {
      this.卸载词库(lib.name);
      return this.随机获得词条(rng);
    }
    const i = Math.floor(rng() * lib.词条.length);
    const [词] = lib.词条.splice(i, 1);
    if (!lib.词条.length) this.卸载词库(lib.name);
    return { 词, 词库: lib.name };
  }

  /** 全量抽词（不消耗）——用于三选一预览 */
  预览词条(词库名, n = 3) {
    const lib = this.库列表.find((l) => l.name === 词库名);
    if (!lib) return [];
    return lib.词条.slice(0, n);
  }
}

export const 词库中心实例 = new 词库中心();
export default 词库中心实例;
