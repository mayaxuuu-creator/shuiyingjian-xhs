/* 水影笺 · 覆纸拓印（Canvas 2D 二次渲染）
   输入：流体引擎导出的拓印像素 → 输出：720×1040 成笺
   v2.0：材质包（宣纸/磁青）· 素笺模式 · 署名印 · 诗句由外部传入（心相配诗）
   零外部素材，全部程序绘制（版权安全 + 小红书容器离线合规） */

window.RUBBING = (function () {
  'use strict';

  const W = 720, H = 1040;
  const SERIF = '"WenKai", "Songti SC", "STSong", "Noto Serif CJK SC", "Noto Serif SC", serif';

  /* 材质包：拓印载体各自的纸底/纤维/文字/框线配色
     xuanzhi = 暖宣纸（墨字金饰）；ciqing = 磁青纸（深夜蓝底描金） */
  const MATERIALS = {
    xuanzhi: {
      paper: '#f6efdc',
      fiberDark: 'rgba(122, 98, 62, ',
      fiberDarkA: 0.05,
      fiberLight: 'rgba(255, 252, 242, ',
      fiberLightA: 0.07,
      fiberStroke: 'rgba(120, 96, 60, 0.035)',
      golds: ['#c9a227', '#d9b64a', '#b8912f', '#e8ca6b'],
      slipBg: 'rgba(246, 239, 220, 0.9)',
      slipBorder: 'rgba(74, 64, 52, 0.45)',
      slipDot: 'rgba(165, 50, 42, 0.85)',
      inkText: '#2e2a24',
      inkDim: 'rgba(46, 42, 36, 0.62)',
      poetColor: 'rgba(46, 42, 36, 0.62)',
      numberColor: 'rgba(74, 64, 52, 0.8)',
      yearColor: 'rgba(74, 64, 52, 0.55)',
      borderOuter: 'rgba(74, 64, 52, 0.5)',
      borderInner: 'rgba(74, 64, 52, 0.25)',
      vignette: 'rgba(60, 45, 25, 0.11)',
      sealFace: 'rgba(158, 42, 32, 0.92)',
      sealText: 'rgba(246, 239, 220, 0.95)',
      sealInner: 'rgba(246, 239, 220, 0.5)',
    },
    ciqing: {
      paper: '#0e162e',
      fiberDark: 'rgba(140, 160, 215, ',
      fiberDarkA: 0.05,
      fiberLight: 'rgba(215, 228, 255, ',
      fiberLightA: 0.06,
      fiberStroke: 'rgba(150, 170, 220, 0.03)',
      golds: ['#d9b96a', '#e3ca80', '#c9a957', '#efe0ae'],
      slipBg: 'rgba(10, 18, 40, 0.42)',
      slipBorder: 'rgba(217, 185, 106, 0.55)',
      slipDot: 'rgba(217, 185, 106, 0.9)',
      inkText: '#d9b96a',
      inkDim: 'rgba(217, 185, 106, 0.7)',
      poetColor: 'rgba(217, 185, 106, 0.7)',
      numberColor: 'rgba(217, 185, 106, 0.78)',
      yearColor: 'rgba(217, 185, 106, 0.5)',
      borderOuter: 'rgba(217, 185, 106, 0.55)',
      borderInner: 'rgba(217, 185, 106, 0.28)',
      vignette: 'rgba(0, 4, 18, 0.2)',
      sealFace: 'rgba(158, 42, 32, 0.95)',
      sealText: 'rgba(246, 239, 220, 0.95)',
      sealInner: 'rgba(246, 239, 220, 0.5)',
      fleckR: 0.55,   // 磁青洒金 = 细小星子（与大瓣桂雨区分）
      fleckA: 0.6,
    },
  };

  /* 署名印：按字数定印面（0=默认水影笺印，1=单字，2=某某之印，3=某某某印） */
  function sealChars(name) {
    const cs = (name || '').trim().split('').filter(Boolean);
    if (!cs.length) return { chars: ['水', '影', '笺', '印'], font: 30 };
    if (cs.length === 1) return { chars: [cs[0]], font: 44 };
    if (cs.length === 2) return { chars: [cs[0], cs[1], '之', '印'], font: 27 };
    return { chars: [cs[0], cs[1], cs[2], '印'], font: 24, col3: true };
  }

  function create(opts) {
    const pixels = opts.pixels;               // { data, width, height }
    const number = opts.number;
    const poem = opts.poem || { text: '秋水共长天一色', poet: '王勃' };
    const mind = opts.mind;                   // { name, line }
    const pure = !!opts.pure;                 // 素笺模式：无题签/心相签/编号文字
    const sealName = opts.sealName || '';     // 署名（≤3 字）
    const mat = MATERIALS[opts.material] || MATERIALS.xuanzhi;

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 1. 纸底
    ctx.fillStyle = mat.paper;
    ctx.fillRect(0, 0, W, H);

    // 2. 纸纤维：细噪点 + 长短纤维丝
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      ctx.fillStyle = Math.random() > 0.5
        ? mat.fiberDark + (Math.random() * mat.fiberDarkA) + ')'
        : mat.fiberLight + (Math.random() * mat.fiberLightA) + ')';
      ctx.fillRect(x, y, Math.random() > 0.8 ? 2 : 1, 1);
    }
    ctx.strokeStyle = mat.fiberStroke;
    ctx.lineWidth = 1;
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const a = Math.random() * Math.PI, l = 8 + Math.random() * 26;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.4);
      ctx.stroke();
    }

    // 3. 墨纹：readPixels 自下而上，先翻行，再 multiply 吸附到纸面
    const flipped = new Uint8ClampedArray(pixels.data.length);
    const pw = pixels.width, ph = pixels.height, row = pw * 4;
    for (let y = 0; y < ph; y++) {
      flipped.set(pixels.data.subarray((ph - 1 - y) * row, (ph - y) * row), y * row);
    }
    const temp = document.createElement('canvas');
    temp.width = pw; temp.height = ph;
    temp.getContext('2d').putImageData(new ImageData(flipped, pw, ph), 0, 0);

    const scale = Math.max(W / pw, H / ph);
    const dw = pw * scale, dh = ph * scale;
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = mat === MATERIALS.ciqing ? 0.9 : 0.94;   // 磁青深底少压一层
    ctx.drawImage(temp, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

    // 4. 洒金（宣纸=金箔；磁青=细小星子，避免和桂雨纹样混淆）
    const fleckR = mat.fleckR || 1, fleckA = mat.fleckA || 1;
    for (let i = 0; i < 130; i++) {
      const x = 30 + Math.random() * (W - 60), y = 30 + Math.random() * (H - 60);
      const r = (0.7 + Math.random() * 1.8) * fleckR;
      ctx.globalAlpha = (0.45 + Math.random() * 0.3) * fleckA;
      ctx.fillStyle = mat.golds[(Math.random() * mat.golds.length) | 0];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.random() * Math.PI);
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * (0.45 + Math.random() * 0.4), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < (mat.fleckR < 1 ? 5 : 14); i++) {
      const x = 40 + Math.random() * (W - 80), y = 40 + Math.random() * (H - 80);
      ctx.globalAlpha = 0.6 * fleckA;
      ctx.fillStyle = mat.golds[(Math.random() * 2) | 0];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.random() * Math.PI);
      ctx.fillRect(0, 0, 3.5 + Math.random() * 4.5, 2 + Math.random() * 3.5);
      ctx.restore();
    }
    ctx.globalAlpha = 1.0;

    // 5. 题签（竖排诗笺；磁青 = 描金签；素笺模式省略）
    if (!pure) {
      const parts = poem.text.split('，');
      const cols = parts.length;
      const maxChars = Math.max(...parts.map(s => s.length));
      const slipW = cols === 2 ? 108 : 66;
      const slipH = maxChars * 42 + 74;
      const sx = W - 56 - slipW, sy = 128;
      ctx.fillStyle = mat.slipBg;
      ctx.strokeStyle = mat.slipBorder;
      roundRect(ctx, sx, sy, slipW, slipH, 5);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = mat.slipDot;
      ctx.beginPath();
      ctx.arc(sx + slipW / 2, sy + 16, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = mat.inkText;
      ctx.font = '26px ' + SERIF;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const colXs = cols === 2 ? [sx + slipW * 0.72, sx + slipW * 0.28] : [sx + slipW / 2];
      parts.forEach((part, ci) => {
        const chars = part.split('');
        const startY = sy + 52;
        for (let k = 0; k < chars.length; k++) {
          ctx.fillText(chars[k], colXs[ci], startY + k * 42);
        }
      });
      ctx.font = '15px ' + SERIF;
      ctx.fillStyle = mat.poetColor;
      ctx.fillText(poem.poet, cols === 2 ? colXs[1] : colXs[0], sy + 52 + maxChars * 42 + 2);
    }

    // 6. 心相签（左上小竖签；随材质配色，磁青为描金签）
    if (!pure && mind && mind.name) {
      const nw = 58;
      const nh = 40 + mind.name.length * 30 + 16;
      const nx = 64, ny = 128;
      ctx.fillStyle = mat.slipBg;
      ctx.strokeStyle = mat.slipBorder;
      roundRect(ctx, nx, ny, nw, nh, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = mat.slipDot;
      ctx.beginPath();
      ctx.arc(nx + nw / 2, ny + 14, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '13px ' + SERIF;
      ctx.fillStyle = mat.inkDim;
      ctx.fillText('心相', nx + nw / 2, ny + 32);
      ctx.font = '600 22px ' + SERIF;
      ctx.fillStyle = mat.inkText;
      const mchars = mind.name.split('');
      mchars.forEach((ch, k) => {
        ctx.fillText(ch, nx + nw / 2, ny + 56 + k * 30);
      });
    }

    // 7. 朱砂印（右下：署名印/默认水影笺印）
    drawSeal(ctx, W - 132, H - 208, 86, sealName);

    // 8. 编号与年款（素笺模式省略）
    if (!pure) {
      ctx.textAlign = 'left';
      ctx.font = '20px ' + SERIF;
      ctx.fillStyle = mat.numberColor;
      ctx.fillText('流沙笺 · 第 ' + number + ' 号', 48, H - 76);
      ctx.font = '14px ' + SERIF;
      ctx.fillStyle = mat.yearColor;
      ctx.fillText('丙午年 · 全球仅此一张', 48, H - 48);
    }

    // 9. 细框 + 暗角
    ctx.strokeStyle = mat.borderOuter;
    ctx.lineWidth = 1;
    ctx.strokeRect(24.5, 24.5, W - 49, H - 49);
    ctx.strokeStyle = mat.borderInner;
    ctx.strokeRect(32.5, 32.5, W - 65, H - 65);

    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
    grad.addColorStop(0, 'rgba(60, 45, 25, 0)');
    grad.addColorStop(1, mat.vignette);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    return canvas;
  }

  function drawSeal(ctx, sx, sy, s, name) {
    const mat = MATERIALS.xuanzhi;   // 印面材质固定朱砂
    ctx.save();
    ctx.translate(sx + s / 2, sy + s / 2);
    ctx.rotate((Math.random() - 0.5) * 0.04);
    ctx.translate(-s / 2, -s / 2);
    ctx.fillStyle = mat.sealFace;
    roundRect(ctx, 0, 0, s, s, 7);
    ctx.fill();
    ctx.strokeStyle = mat.sealInner;
    ctx.lineWidth = 1.5;
    roundRect(ctx, 5.5, 5.5, s - 11, s - 11, 4);
    ctx.stroke();
    // 印文布局：按署名字数定（右起竖读）
    const { chars, font, col3 } = sealChars(name);
    ctx.fillStyle = mat.sealText;
    ctx.font = 'bold ' + font + 'px ' + SERIF;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (chars.length === 1) {
      ctx.fillText(chars[0], s * 0.5, s * 0.5);
    } else if (col3) {
      // 三字名：右列三名，左列「印」
      ctx.fillText(chars[0], s * 0.71, s * 0.2);
      ctx.fillText(chars[1], s * 0.71, s * 0.5);
      ctx.fillText(chars[2], s * 0.71, s * 0.8);
      ctx.fillText(chars[3], s * 0.29, s * 0.5);
    } else {
      ctx.fillText(chars[0], s * 0.71, s * 0.29);
      ctx.fillText(chars[1], s * 0.71, s * 0.71);
      ctx.fillText(chars[2], s * 0.29, s * 0.29);
      ctx.fillText(chars[3], s * 0.29, s * 0.71);
    }
    // 残缺感：边缘随机蚀刻
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 70; i++) {
      const edge = (Math.random() * 4) | 0;
      let x, y;
      if (edge === 0) { x = Math.random() * s; y = Math.random() < 0.5 ? 0 : s; }
      else { y = Math.random() * s; x = Math.random() < 0.5 ? 0 : s; }
      ctx.globalAlpha = 0.25 + Math.random() * 0.4;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + Math.random() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { create, W, H };
})();
