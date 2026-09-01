/* 水影笺 · 纹样保底
   一键编排的"墨序"：位置/时机/力度预设，保证出图下限。
   配色规则（Maya 定）：主调 = 用户当前选中色，辅色 = 每次随机另择一款，
   点睛固定（金泥/朱砂）——构图骨架不变，每次点击换装。
   事件格式：{ delay, x, y(左上原点0~1), dx, dy(速度，GL空间：正=向上), color, radius } */

window.PATTERNS = (function () {
  'use strict';

  const rnd = (a, b) => a + Math.random() * (b - a);

  // 归一化到最大分量（深色墨不亏亮度）
  function norm(rgb) {
    const m = Math.max(rgb[0], rgb[1], rgb[2]) || 1;
    return [rgb[0] / m, rgb[1] / m, rgb[2] / m];
  }

  /* 配色方案：primary=用户选中色；accent=随机辅色（每次点击不同）；
     spark=点睛（盘里有金泥/朱砂就固定用，纯水墨盘退到辅色） */
  function scheme(palette, primaryRgb) {
    const key = norm(primaryRgb).join();
    const others = palette.colors.filter(c => norm(c.rgb).join() !== key);
    const accent = others.length ? others[(Math.random() * others.length) | 0].rgb : primaryRgb;
    const sparkC = palette.colors.find(c => c.name === '金泥')
      || palette.colors.find(c => c.name === '朱砂')
      || { rgb: accent };
    return {
      primary: norm(primaryRgb),
      accent: norm(accent),
      spark: norm(sparkC.rgb),
      damp: palette.key === 'shui' ? 0.55 : 1.0,   // 松烟淡色入黑水，压一档防过曝
    };
  }
  function ink(s, color, strength, jitter) {
    const j = jitter === undefined ? 1 : jitter;
    const v = strength * j * s.damp;
    return [color[0] * v, color[1] * v, color[2] * v];
  }

  /* 云纹：横贯画面的一条流云带 + 上方淡云回声 + 下方薄雾 */
  function yun(s) {
    const e = [];
    const y0 = rnd(0.40, 0.46), amp = rnd(0.10, 0.14);
    for (let i = 0; i < 24; i++) {
      const x = 0.06 + 0.88 * (i / 23);
      const y = y0 + amp * Math.sin(i * 0.55);
      // 主调为主，随机掺辅色，每隔几点点睛
      const role = i % 6 === 3 ? s.spark : (i % 3 === 0 ? s.primary : (i % 3 === 1 ? s.primary : s.accent));
      const st = role === s.primary ? 0.60 : (role === s.accent ? 0.48 : 0.45);
      e.push({
        delay: i * 42, x: x, y: y,
        dx: rnd(230, 320), dy: rnd(-50, 50),
        color: ink(s, role, st, rnd(0.9, 1.1)),
        radius: role === s.spark ? 0.8 : 1.15,
      });
    }
    for (let i = 0; i < 13; i++) {
      const x = 0.14 + 0.72 * (i / 12);
      const role = i % 3 === 2 ? s.spark : s.accent;
      e.push({
        delay: 520 + i * 48, x: x, y: 0.28 + 0.055 * Math.sin(i * 0.7 + 2),
        dx: rnd(130, 180), dy: rnd(-20, 20),
        color: ink(s, role, 0.30, rnd(0.9, 1.1)),
        radius: 1.3,
      });
    }
    for (let i = 0; i < 9; i++) {
      e.push({
        delay: 980 + i * 65, x: 0.10 + 0.8 * (i / 8), y: 0.66 + rnd(-0.03, 0.05),
        dx: rnd(60, 110), dy: rnd(10, 30),
        color: ink(s, s.primary, 0.22, rnd(0.85, 1.1)),
        radius: 1.5,
      });
    }
    return e;
  }

  /* 浪纹：三层横扫的浪（S 走向：主调/辅色/主调回声）+ 尾部金沫 */
  function lang(s) {
    const e = [];
    const rows = [
      { y: 0.26, c: s.primary, st: 0.58, dir: 1 },
      { y: 0.50, c: s.accent, st: 0.52, dir: -1 },
      { y: 0.74, c: s.primary, st: 0.32, dir: 1 },
    ];
    rows.forEach((row, r) => {
      for (let i = 0; i < 18; i++) {
        const t = i / 17;
        e.push({
          delay: r * 150 + i * 24,
          x: row.dir > 0 ? -0.02 + 1.04 * t : 1.02 - 1.04 * t,
          y: row.y + rnd(-0.015, 0.015),
          dx: row.dir * rnd(230, 290),
          dy: rnd(-45, 20),
          color: ink(s, i % 5 === 4 && r < 2 ? s.spark : row.c, row.st, rnd(0.9, 1.1)),
          radius: 1.2,
        });
      }
    });
    for (let i = 0; i < 7; i++) {
      e.push({
        delay: 560 + i * 45, x: rnd(0.2, 0.8), y: rnd(0.20, 0.40),
        dx: rnd(80, 140), dy: rnd(-50, 0),
        color: ink(s, s.spark, 0.26, rnd(0.85, 1.15)),
        radius: 0.6,
      });
    }
    return e;
  }

  /* 漩涡：双涡对流（主调涡 + 辅色涡）+ 中心一点朱砂/金 */
  function xuan(s) {
    const e = [];
    const centers = [
      { cx: 0.63, cy: 0.38, c: s.primary, t0: 0 },
      { cx: 0.33, cy: 0.64, c: s.accent, t0: 430 },
    ];
    centers.forEach(c => {
      const dir = Math.random() > 0.5 ? 1 : -1;
      const n = 17;
      for (let k = 0; k < n; k++) {
        const th = (k / n) * Math.PI * 2 + rnd(-0.1, 0.1);
        const r = 0.062;
        const px = c.cx + r * Math.cos(th);
        const py = c.cy + r * 0.92 * Math.sin(th);
        e.push({
          delay: c.t0 + k * 38, x: px, y: py,
          dx: -Math.sin(th) * dir * rnd(360, 440),
          dy: -Math.cos(th) * dir * rnd(360, 440) * -1,
          color: ink(s, c.c, 0.52, rnd(0.9, 1.1)),
          radius: 0.95,
        });
      }
      e.push({
        delay: c.t0 + n * 38 + 120, x: c.cx, y: c.cy,
        dx: 0, dy: 0,
        color: ink(s, s.spark, 0.42, 1),
        radius: 0.55,
      });
    });
    return e;
  }

  const registry = { yun, lang, xuan };
  return {
    make(name, palette, primaryRgb) {
      const fn = registry[name] || yun;
      return fn(scheme(palette, primaryRgb || palette.colors[palette.defaultIndex].rgb));
    },
    names: Object.keys(registry),
  };
})();
