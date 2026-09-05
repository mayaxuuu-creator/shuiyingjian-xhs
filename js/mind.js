/* 水影笺 · 心相读墨 + 分享文案
   读墨 = 规则引擎（不上模型）：从拓印像素提取「色调 / 浓淡 / 动势」三个特征，
   映射到心相名与解读句——同一张笺必得同一个心相，不同笺各有各的说法。
   分享 = 三套小红书口吻模板，随机出稿。
   注：小红书容器禁用剪贴板，文案卡展示可选文字引导手动复制（见 main.js）。 */

window.MIND = (function () {
  'use strict';

  /* ---------- 特征提取 ---------- */
  // pixels 来自拓印渲染（暖宣纸底），隔行采样足够
  function analyze(pixels) {
    const { data, width, height } = pixels;
    const pr = 246, pg = 239, pb = 224;          // 宣纸底色
    let cnt = 0, inkPix = 0, sumY = 0;
    const votes = { blue: 0, green: 0, yellow: 0, red: 0 };
    const step = Math.max(2, Math.floor(Math.min(width, height) / 320));
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4;
        cnt++;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const d = (pr - r) + (pg - g) + (pb - b);
        if (d > 60) {                             // 有墨 = 相对纸面被吸走（阈值低些，淡墨也算）
          inkPix++;
          sumY += y;
          // 墨色相按像素自身支配通道投票（不是吸光量，否则读出补色）
          const mx = Math.max(r, g, b);
          if (mx === b) votes.blue++;
          else if (mx === g) votes.green++;
          else votes[g > r * 0.55 ? 'yellow' : 'red']++;
        }
      }
    }
    const coverage = cnt ? inkPix / cnt : 0;
    // readPixels 自下而上 → 翻回屏幕坐标的墨重心
    const cy = inkPix ? 1 - (sumY / inkPix) / height : 0.5;
    let hue = 'neutral';
    if (inkPix) {
      let best = 'neutral', bestV = 0;
      for (const k of Object.keys(votes)) {
        if (votes[k] > bestV) { bestV = votes[k]; best = k; }
      }
      // 支配通道相对多数（≥40%）才算"有主色"，双色混合时取占比高的一方
      hue = bestV > inkPix * 0.4 ? best : 'neutral';
    }
    const dens = coverage < 0.16 ? 'sparse' : coverage < 0.42 ? 'even' : 'dense';
    const posture = cy < 0.44 ? 'rise' : cy > 0.6 ? 'sink' : 'flat';
    return { coverage, hue, dens, posture };
  }

  /* ---------- 心相名（色调 × 浓淡） ---------- */
  const NAMES = {
    qinglv: {
      blue:   { sparse: '疏雨', even: '静澜', dense: '沉璧' },
      green:  { sparse: '新篁', even: '春汀', dense: '苍岭' },
      red:    { sparse: '疏霞', even: '霞起', dense: '燃霞' },
      yellow: { sparse: '浮金', even: '鎏光', dense: '堆金' },
      neutral:{ sparse: '轻岚', even: '停云', dense: '玄漠' },
    },
    shui: {   // 松烟一色，按浓淡取
      sparse: '孤鹤', even: '远岫', dense: '墨渊',
    },
  };

  const HUE_LINES = {
    blue: '墨主青碧，心性澄澈，遇事自有一池静气。',
    green: '墨主苍翠，生机藏于内，是往高处走也记得看风景的人。',
    red: '墨染朱霞，热在心里，认准的事九头牛拉不回。',
    yellow: '墨浮鎏金，明朗开阔，天生会把日子过出光来。',
    neutral: '烟墨无相，松弛自在，不争不抢自有天地。',
  };
  const POSTURE_LINES = {
    rise: '墨势上扬，近来心里有事要成。',
    flat: '墨势平远，稳字当头，慢慢来比较快。',
    sink: '墨势下沉，宜养精蓄锐，等一个水落石出。',
  };
  const SPARSE_LINE = '留白多，是懂得给自己留余地的性子。';

  function readMind(features, themeKey) {
    let name;
    if (themeKey === 'shui') {
      name = NAMES.shui[features.dens];
    } else {
      name = NAMES.qinglv[features.hue][features.dens];
    }
    const hue = themeKey === 'shui' ? 'neutral' : features.hue;
    let line = HUE_LINES[hue];
    line += POSTURE_LINES[features.posture];
    if (features.dens === 'sparse') line += SPARSE_LINE;
    return { name, line };
  }

  /* ---------- 诗库（唐人名句为主，公版；h=心相色相，m=月夜，a=秋） ---------- */
  const POEM_LIBRARY = [
    // 青 · 水月江夜
    { t: '春江潮水连海平', p: '张若虚', h: 'blue' },
    { t: '海上明月共潮生', p: '张若虚', h: 'blue', m: 1 },
    { t: '月落乌啼霜满天', p: '张继', h: 'blue', m: 1, a: 1 },
    { t: '秋水共长天一色', p: '王勃', h: 'blue' },
    { t: '唯见长江天际流', p: '李白', h: 'blue' },
    { t: '孤帆远影碧空尽', p: '李白', h: 'blue' },
    { t: '烟波江上使人愁', p: '崔颢', h: 'blue' },
    { t: '曾经沧海难为水', p: '元稹', h: 'blue' },
    { t: '月涌大江流', p: '杜甫', h: 'blue', m: 1 },
    { t: '海上生明月', p: '张九龄', h: 'blue', m: 1 },
    { t: '月出惊山鸟', p: '王维', h: 'blue', m: 1 },
    { t: '湖光秋月两相和', p: '刘禹锡', h: 'blue', m: 1, a: 1 },
    { t: '野旷天低树，江清月近人', p: '孟浩然', h: 'blue', m: 1 },
    { t: '天门中断楚江开', p: '李白', h: 'blue' },
    // 绿 · 山川草木
    { t: '春来江水绿如蓝', p: '白居易', h: 'green' },
    { t: '千里莺啼绿映红', p: '杜牧', h: 'green' },
    { t: '两岸青山相对出', p: '李白', h: 'green' },
    { t: '春风又绿江南岸', p: '王安石', h: 'green' },
    { t: '万条垂下绿丝绦', p: '贺知章', h: 'green' },
    { t: '草色遥看近却无', p: '韩愈', h: 'green' },
    { t: '青山一道同云雨', p: '王昌龄', h: 'green' },
    { t: '春色满园关不住', p: '叶绍翁', h: 'green' },
    { t: '淡妆浓抹总相宜', p: '苏轼', h: 'green' },
    { t: '空山新雨后', p: '王维', h: 'green' },
    { t: '山外青山楼外楼', p: '林升', h: 'green' },
    { t: '绿树阴浓夏日长', p: '高骈', h: 'green' },
    // 红 · 霞火花朱
    { t: '日出江花红胜火', p: '白居易', h: 'red' },
    { t: '霜叶红于二月花', p: '杜牧', h: 'red', a: 1 },
    { t: '映日荷花别样红', p: '杨万里', h: 'red' },
    { t: '人面桃花相映红', p: '崔护', h: 'red' },
    { t: '半江瑟瑟半江红', p: '白居易', h: 'red' },
    { t: '桃花潭水深千尺', p: '李白', h: 'red' },
    { t: '日照香炉生紫烟', p: '李白', h: 'red' },
    { t: '落霞与孤鹜齐飞', p: '王勃', h: 'red' },
    { t: '朱雀桥边野草花', p: '刘禹锡', h: 'red' },
    // 金 · 金桂秋实
    { t: '稻花香里说丰年', p: '辛弃疾', h: 'gold' },
    { t: '满园花菊郁金黄', p: '白居易', h: 'gold', a: 1 },
    { t: '一年好景君须记', p: '苏轼', h: 'gold', a: 1 },
    { t: '金风玉露一相逢', p: '秦观', h: 'gold', m: 1, a: 1 },
    { t: '停车坐爱枫林晚', p: '杜牧', h: 'gold', a: 1 },
    { t: '黄河远上白云间', p: '王之涣', h: 'gold' },
    { t: '九曲黄河万里沙', p: '刘禹锡', h: 'gold' },
    { t: '桂子月中落，天香云外飘', p: '宋之问', h: 'gold', m: 1 },
    // 烟 · 烟岚闲云
    { t: '千山鸟飞绝', p: '柳宗元', h: 'neutral' },
    { t: '空山不见人', p: '王维', h: 'neutral' },
    { t: '明月松间照', p: '王维', h: 'neutral', m: 1 },
    { t: '清泉石上流', p: '王维', h: 'neutral' },
    { t: '危楼高百尺', p: '李白', h: 'neutral' },
    { t: '独坐幽篁里', p: '王维', h: 'neutral' },
    { t: '众鸟高飞尽', p: '李白', h: 'neutral' },
    { t: '远上寒山石径斜', p: '杜牧', h: 'neutral', a: 1 },
    { t: '只在此山中，云深不知处', p: '贾岛', h: 'neutral' },
    { t: '采菊东篱下，悠然见南山', p: '陶渊明', h: 'neutral' },
    { t: '行到水穷处，坐看云起时', p: '王维', h: 'neutral' },
    { t: '大漠沙如雪', p: '李贺', h: 'neutral' },
  ];

  /* 心相配诗：按墨色取同色相诗句；月夜材质优先带「月」记号。
     出口统一归一为 { text, poet } 供拓印/文案使用 */
  function pickPoem(hue, opts) {
    let pool = POEM_LIBRARY.filter(p => p.h === hue);
    if (opts && opts.moon) {
      const moonPool = pool.filter(p => p.m);
      if (moonPool.length) pool = moonPool;
    }
    if (!pool.length) pool = POEM_LIBRARY.filter(p => p.h === 'neutral');
    if (!pool.length) pool = POEM_LIBRARY;
    const p = pool[(Math.random() * pool.length) | 0];
    return { text: p.t, poet: p.p, h: p.h, m: p.m, a: p.a };
  }

  /* ---------- 分享文案（三套口吻随机；标题均自带「水影笺」，postNote 标题上限 20 字） ---------- */
  function templates(num, mind, poemText, poet) {
    return [
      {
        title: '水影笺｜把千里江山搅进水里',
        body: '第 ' + num + ' 号流沙笺，全球仅此一张🌊\n'
          + '心相「' + mind.name + '」——' + mind.line + '\n'
          + '题：「' + poemText + '」——' + poet + '\n'
          + '你也来拓一张？评论区交出你的笺👇',
        tags: '#水影笺 #千里江山 #国风 #解压小游戏 #非遗之美',
      },
      {
        title: '水影笺读心 · ' + mind.name,
        body: '玩了个拓印小笺，搅出来的墨纹会读心。\n'
          + '它说：' + mind.line + '\n'
          + '（第 ' + num + ' 号，全球仅此一张）',
        tags: '#今日心相 #水影笺 #国风美学 #摸鱼神器',
      },
      {
        title: '水影笺 · 复活唐人的流沙笺',
        body: '一滴墨、一池水、一张纸。\n'
          + '古人玩的浪漫，我把它做成了小游戏。\n'
          + '这张是「' + mind.name + '」——' + mind.line + '\n'
          + '题：「' + poemText + '」',
        tags: '#水影笺 #流沙笺 #非遗 #小众爱好 #国风',
      },
    ];
  }

  function shareCopy(num, mind, poem) {
    const pool = templates(num, mind, poem.text, poem.poet);
    return pool[(Math.random() * pool.length) | 0];
  }

  return { analyze, readMind, shareCopy, pickPoem, POEM_LIBRARY };
})();
