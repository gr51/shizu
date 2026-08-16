// ===== game/audio.js · Web Audio 合成音效 + BGM =====
// 零资源依赖：所有音效用振荡器 + 噪声现成合成，BGM 用循环的慢和声。
// 素材清单四/五章要求「Web Audio 合成」，这里就是那一层的落地。

const PLANE_KEY = {
  jiguan: 0, aofa: 1, qiqiao: 2, dujie: 3, gongde: 4, shihai: 5,
  gongshengchao: 6, wuxia: 7, shanhai: 8, jijia: 9, jushen: 10, zhutian: 11,
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this._bgm = null;      // { stop() } 句柄
  }

  /** 惰性创建 AudioContext（必须在用户手势后调用一次） */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    this.ctx.resume?.();
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) this.stopBgm();
  }

  // —— 底层合成原语 ——

  /** 单个振荡器：freq → (可选 glideTo)，时长 dur，音量 gain */
  tone(freq, dur, type = 'sine', gain = 0.15, glideTo = null, when = 0) {
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** 噪声脉冲（打击/受击/翻滚用） */
  noise(dur, gain = 0.2, filterFreq = 1200, type = 'bandpass', when = 0) {
    const t = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  /** 音效：按名字分发 */
  sfx(name) {
    if (!this.ctx || !this.enabled) return;
    switch (name) {
      case 'slash':        this.noise(0.06, 0.12, 2600, 'highpass'); break;
      case 'crit':         this.tone(880, 0.08, 'square', 0.1); this.tone(1320, 0.06, 'square', 0.08); break;
      case 'hit':          this.tone(160, 0.18, 'sine', 0.28, 90); this.noise(0.1, 0.15, 500, 'lowpass'); break;
      case 'burst':        this.tone(220, 0.08, 'triangle', 0.1, 90); break;
      case 'gene':         this.tone(420, 0.12, 'sine', 0.1, 720); break;
      case 'spit':         this.tone(300, 0.07, 'sawtooth', 0.06, 200); break;
      case 'dodge':        this.noise(0.2, 0.15, 900, 'bandpass'); break;
      case 'devour':       this.tone(120, 0.7, 'sawtooth', 0.2, 45); this.noise(0.5, 0.12, 300, 'lowpass'); break;
      case 'skill':        this.tone(523, 0.3, 'square', 0.1); this.tone(659, 0.3, 'square', 0.1, null, 0.05); this.tone(784, 0.4, 'square', 0.1, null, 0.1); break;
      case 'elite':        this.tone(600, 0.12, 'square', 0.12); this.tone(600, 0.12, 'square', 0.12, null, 0.16); break;
      case 'boss':         this.tone(80, 0.8, 'sawtooth', 0.22, 40); this.noise(0.7, 0.15, 250, 'lowpass'); break;
      case 'bossdie':      this.tone(392, 0.5, 'square', 0.14); this.tone(523, 0.5, 'square', 0.14, null, 0.1); this.tone(659, 0.7, 'square', 0.14, null, 0.2); break;
      case 'levelup':      this.tone(660, 0.1, 'sine', 0.12); this.tone(880, 0.16, 'sine', 0.12, null, 0.08); break;
      case 'won':          [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.12, null, i * 0.1)); break;
      case 'lost':         this.tone(440, 0.5, 'sine', 0.16, 110); break;
      case 'click':        this.tone(1000, 0.03, 'square', 0.05); break;
      default: break;
    }
  }

  /** 消费一批战斗特效，映射成音效 */
  onEffects(fxList) {
    for (const fx of fxList) {
      switch (fx.type) {
        case 'slash': case 'burst': case 'gene': case 'spit':
        case 'dodge': case 'devour': case 'skill': case 'crit':
          this.sfx(fx.type); break;
        case 'hit': this.sfx('hit'); break;
        case 'surge': case 'elite': this.sfx('elite'); break;
        case 'boss': this.sfx('boss'); break;
        default: break;
      }
    }
  }

  // —— BGM：循环慢和声，每个位面换一个调 ——

  startBgm(planeId) {
    if (!this.ctx || !this.enabled) return;
    this.stopBgm();
    const key = PLANE_KEY[planeId] ?? 0;
    const base = 110 * Math.pow(2, (key % 12) / 12);   // 十二平均律里错开
    const pad = this.ctx.createGain();
    pad.gain.value = 0.045;
    pad.connect(this.master);

    // 每 4 秒推进一个和弦（I - vi - IV - V 的低音铺底），无限循环
    const chords = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -2, 2]];
    let i = 0;
    const loop = () => {
      if (!this.enabled || this._bgm !== handle) return;
      const semis = chords[i % chords.length];
      const now = this.ctx.currentTime;
      for (const s of semis) {
        const f = base * Math.pow(2, s / 12);
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.6, now + 1.2);
        g.gain.linearRampToValueAtTime(0.3, now + 3.6);
        g.gain.linearRampToValueAtTime(0, now + 4);
        o.connect(g).connect(pad);
        o.start(now);
        o.stop(now + 4.05);
      }
      i += 1;
    };
    const handle = { stop: () => {} };
    loop();
    const timer = setInterval(loop, 4000);
    handle.stop = () => {
      clearInterval(timer);
      pad.disconnect();
    };
    this._bgm = handle;
  }

  stopBgm() {
    if (this._bgm) { this._bgm.stop(); this._bgm = null; }
  }
}

export const audio = new Audio();
