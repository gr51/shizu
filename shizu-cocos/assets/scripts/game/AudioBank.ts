// ===== game/AudioBank.ts · 音频适配（BGM 生命周期 + SFX 通道）=====
//
// 与 SpriteBank 同一模式：resources 按约定路径加载，**缺资产静默降级**——
// 音频文件后补时零代码变更。路径约定（放在 assets/resources/audio/ 下）：
//   audio/bgm_<planeId>   循环 BGM（每位面一首）
//   audio/sfx_<name>      一次性音效（devour / boss / hit …）
//
// 平台差异都封在这里：Web 构建走 WebGL 页面的 WebAudio 由引擎封装；
// 小游戏/原生由引擎各自实现 —— 业务层只调 startBgm/stop/sfx。

import { AudioClip, AudioSource, resources } from 'cc';

export class AudioBank {
  private source: AudioSource | null = null;
  private bgmCache = new Map<string, AudioClip>();
  private wantBgm = false;

  /** 挂一个常驻 AudioSource（GameRoot 在 onLoad 创建；无头/shim 环境可缺省） */
  attach(src: AudioSource | null): void { this.source = src; }

  private static path(kind: 'bgm' | 'sfx', id: string): string {
    return `audio/${kind}_${id}`;
  }

  private loadClip(path: string): Promise<AudioClip | null> {
    return new Promise((resolve) => {
      if (!resources?.load) { resolve(null); return; }   // 无头/shim 环境
      resources.load(path, AudioClip, (err, clip) => resolve(err || !clip ? null : clip));
    });
  }

  /** 进入战斗：异步切到位面 BGM（循环）。加载完成前已离开战场则放弃播放。缺资产=静默。 */
  async enterBattle(planeId: string): Promise<void> {
    this.wantBgm = true;
    let clip = this.bgmCache.get(planeId) ?? null;
    if (!clip) clip = await this.loadClip(AudioBank.path('bgm', planeId));
    if (clip) this.bgmCache.set(planeId, clip);
    if (!this.wantBgm || !this.source) return;
    this.stop();
    if (cachedPlay(this.source)) { /* started */ }

    function cachedPlay(src: AudioSource): boolean {
      const c = clip!;
      if (!c) return false;
      src.clip = c;
      src.loop = true;
      src.play();
      return true;
    }
  }

  /** 回大厅/结算：停 BGM（一次性音效不受影响） */
  leaveBattle(): void { this.wantBgm = false; this.stop(); }
  private stop(): void { try { this.source?.stop(); } catch { /* 引擎差异兜底 */ } }

  /** 一次性音效：fire-and-forget，按需拉取；缺资产静默 */
  async sfx(name: string): Promise<void> {
    if (!this.source) return;
    const clip = await this.loadClip(AudioBank.path('sfx', name));
    if (clip && this.source) {
      try { this.source.playOneShot(clip, 1); } catch { /* 平台差异兜底 */ }
    }
  }
}
