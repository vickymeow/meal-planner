// 固定数据：家里人、菜谱起步数据、推荐新菜、节气、暖心话。
(function () {
  var PEOPLE = [
    { id: "mom",   name: "妈妈",  sub: "做饭的人", cls: "av-mom",   initial: "妈" },
    { id: "dad",   name: "爸爸",  sub: "家里人",   cls: "av-dad",   initial: "爸" },
    { id: "vicky", name: "Vicky", sub: "女儿",     cls: "av-vicky", initial: "V" },
    { id: "chen",  name: "小陈",  sub: "家里人",   cls: "av-chen",  initial: "陈" }
  ];
  var FAMILY = ["vicky", "chen", "dad"]; // 点菜的人，用同一版

  var CATS = [
    { id: "all", label: "全部" },
    { id: "fish", label: "🐟 鱼" },
    { id: "meat", label: "🥩 肉" },
    { id: "egg", label: "🥚 蛋" },
    { id: "tofu", label: "豆腐" },
    { id: "veg", label: "🥬 青菜" },
    { id: "staple", label: "🍚 主食" }
  ];
  var CAT_EMOJI = { fish: "🐟", meat: "🍖", egg: "🥚", tofu: "🧈", veg: "🥬", staple: "🍚" };

  var CRAVES = [
    { level: 1, emoji: "😊", label: "想吃", desc: "有空做就行" },
    { level: 2, emoji: "😊😊", label: "很想吃", desc: "这几天就想吃到" },
    { level: 3, emoji: "❤️❤️❤️", label: "超想吃", desc: "最想先吃这道" }
  ];

  // 早饭特别选项：不是菜，是一种选择
  var BF_ANY = "随便";       // 妈妈看着做
  var BF_SKIP = "今天不吃";   // 不做这个人的早饭
  var BF_FALLBACK = "鸡蛋三明治"; // 在家但没点 → 默认做这个

  // 起步菜谱。早饭是妈妈最初的 8 道 + 默认的鸡蛋三明治。份量按一家 4 口。
  var SEED_DISHES = [
    // —— 早饭 ——
    { name: "乌冬面", meal: "breakfast", cat: "staple", ings: ["乌冬面 4 包", "鸡蛋 4 个", "小青菜 1 把", "葱"], steps: ["锅里烧开水，放乌冬面煮 2 分钟。", "打进鸡蛋，放小青菜，再煮 1 分钟。", "加生抽和一点盐，撒葱花出锅。"] },
    { name: "炒荞麦面", meal: "breakfast", cat: "staple", ings: ["荞麦面 1 把", "鸡蛋 3 个", "胡萝卜 1 根", "小青菜 1 把"], steps: ["荞麦面煮 4 分钟，过凉水沥干。", "鸡蛋炒散盛出，胡萝卜切丝炒软。", "放面、青菜、鸡蛋一起炒，加生抽调味。"] },
    { name: "馄饨", meal: "breakfast", cat: "staple", ings: ["馄饨 1 袋", "紫菜", "虾皮", "葱"], steps: ["碗里放紫菜、虾皮、一点盐和生抽。", "水开下馄饨，浮起来再煮 2 分钟。", "连汤盛进碗里，撒葱花。"] },
    { name: "蒸饺", meal: "breakfast", cat: "staple", ings: ["饺子 1 袋", "醋", "姜"], steps: ["蒸笼铺纸，饺子摆好留点空。", "水开后大火蒸 12 分钟（冻的蒸 15 分钟）。", "姜丝泡醋，蘸着吃。"] },
    { name: "煎饺", meal: "breakfast", cat: "staple", ings: ["饺子 1 袋", "食用油", "芝麻"], steps: ["平底锅放油，饺子摆好，中火煎 2 分钟。", "倒半碗水，盖锅盖焖到水干。", "撒芝麻，底煎脆就出锅。"] },
    { name: "炒饭", meal: "both", cat: "staple", ings: ["米饭 4 碗", "鸡蛋 3 个", "火腿 1 根", "青豆", "葱"], steps: ["鸡蛋打散先炒碎，盛出。", "火腿丁、青豆炒一下，放米饭大火翻炒。", "放回鸡蛋，加盐、葱花炒匀。"] },
    { name: "吐司", meal: "breakfast", cat: "staple", ings: ["吐司面包 1 袋", "果酱", "牛奶 1 盒"], steps: ["吐司放烤面包机烤 2 分钟。", "抹果酱或黄油。", "牛奶热一下一起吃。"] },
    { name: "鸡蛋", meal: "breakfast", cat: "egg", ings: ["鸡蛋 6 个", "牛奶 1 盒"], steps: ["鸡蛋冷水下锅。", "水开后煮 8 分钟，捞出过凉水。", "牛奶热一下一起吃。"] },
    { name: "鸡蛋三明治", meal: "breakfast", cat: "egg", ings: ["吐司面包 1 袋", "鸡蛋 4 个", "生菜", "沙拉酱"], steps: ["鸡蛋煎熟或煮熟切片。", "吐司烤一下，铺生菜、鸡蛋，挤沙拉酱。", "盖上另一片，对角切开。"] },
    // —— 晚饭 ——
    { name: "红烧肉", meal: "dinner", cat: "meat", prep: "五花肉要提前买好", ings: ["五花肉 750克", "生抽", "老抽", "冰糖", "姜", "葱"], steps: ["五花肉切块，冷水下锅焯一下，捞出洗净。", "小火炒冰糖到琥珀色，放肉翻炒上色。", "加姜葱、生抽、老抽和热水，小火炖 1 小时，大火收汁。"] },
    { name: "番茄炒蛋", meal: "dinner", cat: "egg", ings: ["番茄 4 个", "鸡蛋 5 个", "葱"], steps: ["鸡蛋加点盐打散，炒到凝固盛出。", "番茄切块炒出汁，加一点糖。", "放回鸡蛋炒匀，加盐，撒葱花。"] },
    { name: "麻婆豆腐", meal: "dinner", cat: "tofu", prep: "豆腐当天买", ings: ["豆腐 1 盒", "猪肉末 150克", "豆瓣酱", "花椒", "蒜"], steps: ["豆腐切块，盐水焯一下。", "肉末炒散，放豆瓣酱、蒜炒出红油。", "加水和豆腐煮 3 分钟，勾芡，撒花椒粉。"] },
    { name: "清蒸鲈鱼", meal: "dinner", cat: "fish", prep: "鱼当天买新鲜的", ings: ["鲈鱼 1 条", "姜", "葱", "蒸鱼豉油"], steps: ["鱼处理干净，两面各划 3 刀，抹一点盐，腌 10 分钟。", "盘底铺姜丝，鱼放上去，水开后大火蒸 8 分钟。", "倒掉盘里的水，铺葱丝，浇一勺热油，再淋蒸鱼豉油。"] },
    { name: "红烧带鱼", meal: "dinner", cat: "fish", prep: "带鱼提前买好", ings: ["带鱼 500克", "姜", "葱", "生抽", "香醋"], steps: ["带鱼切段，擦干，薄薄拍一层淀粉。", "油热后煎到两面金黄，盛出。", "姜葱爆香，放带鱼、生抽、香醋和半碗水，烧 8 分钟收汁。"] },
    { name: "松鼠桂鱼", meal: "dinner", cat: "fish", prep: "桂鱼提前订", ings: ["桂鱼 1 条", "番茄酱", "白糖", "香醋", "淀粉"], steps: ["桂鱼去骨切花刀，拍淀粉。", "油温七成热下锅，炸到金黄定型。", "番茄酱、白糖、香醋调汁，烧开浇在鱼上。"] },
    { name: "鱼头豆腐汤", meal: "dinner", cat: "fish", prep: "鱼头当天买", ings: ["鱼头 1 个", "豆腐 1 盒", "姜", "葱", "香菜"], steps: ["鱼头煎到两面微黄，加姜片。", "加开水大火煮 10 分钟，汤变白。", "放豆腐再煮 5 分钟，加盐、葱和香菜。"] },
    { name: "青菜汤", meal: "dinner", cat: "veg", ings: ["小白菜 1 把", "豆腐 1 盒", "姜"], steps: ["水开放姜片和豆腐，煮 3 分钟。", "放小白菜煮 1 分钟。", "加盐和几滴香油。"] },
    { name: "糖醋排骨", meal: "dinner", cat: "meat", prep: "排骨提前买回来", ings: ["排骨 750克", "香醋", "白糖", "生抽", "姜"], steps: ["排骨焯水，捞出沥干。", "煎到两面微黄，加姜、生抽和热水，炖 30 分钟。", "加糖和醋，大火收汁到发亮。"] },
    { name: "白切鸡", meal: "dinner", cat: "meat", prep: "鸡要提前一天买", ings: ["三黄鸡 1 只", "姜", "葱", "沙姜"], steps: ["水开放姜葱，提着鸡烫三次再放进去。", "小火泡 20 分钟，关火再焖 10 分钟。", "捞出泡冰水，切块，配姜葱蘸料。"] }
  ];

  // 「帮我想新菜」的推荐池：每次推荐 4 道，点「要这道」才进菜谱。
  var RECOMMENDS = [
    { name: "冬瓜排骨汤", meal: "dinner", cat: "meat", blurb: "清淡鲜甜，排骨炖得软软的", ings: ["排骨 500克", "冬瓜 1 块", "姜", "葱", "香菜"], steps: ["排骨冷水下锅焯一下，捞出洗净。", "排骨加姜和清水，炖 40 分钟。", "放冬瓜再炖 15 分钟，加盐，撒葱和香菜。"] },
    { name: "蒜蓉粉丝蒸虾", meal: "dinner", cat: "meat", blurb: "好看又鲜，粉丝吸满虾汁", ings: ["鲜虾 500克", "粉丝 1 把", "蒜 1 头", "生抽", "葱"], steps: ["粉丝泡软铺在盘底，虾开背去线摆好。", "蒜蓉炒香，加生抽调成蒜蓉酱，铺在虾上。", "水开蒸 6 分钟，撒葱，浇一勺热油。"] },
    { name: "可乐鸡翅", meal: "dinner", cat: "meat", blurb: "甜咸入味，做法简单", ings: ["鸡翅 500克", "可乐 1 罐", "姜", "生抽", "老抽"], steps: ["鸡翅两面煎到微黄。", "倒可乐没过鸡翅，加姜、生抽、一点老抽。", "大火收汁到发亮就出锅。"] },
    { name: "香菇滑鸡", meal: "dinner", cat: "meat", blurb: "鸡肉嫩滑，香菇鲜，下饭", ings: ["鸡腿肉 500克", "干香菇 8 朵", "姜", "葱", "生抽", "淀粉"], steps: ["香菇泡发，鸡肉加生抽、淀粉抓匀腌 15 分钟。", "热油爆姜，下鸡肉炒到变色。", "放香菇和泡香菇的水，焖 8 分钟，撒葱。"] },
    { name: "地三鲜", meal: "dinner", cat: "veg", blurb: "土豆茄子青椒，下饭", ings: ["土豆 2 个", "茄子 1 个", "青椒 2 个", "蒜", "生抽"], steps: ["土豆、茄子切块，分别煎到边缘微焦。", "青椒下锅一起炒。", "生抽、糖、蒜调汁倒进去，翻匀收汁。"] },
    { name: "酸辣土豆丝", meal: "dinner", cat: "veg", blurb: "酸辣脆爽，几分钟就好", ings: ["土豆 2 个", "干辣椒", "花椒", "香醋", "蒜"], steps: ["土豆切细丝，泡水洗掉淀粉，沥干。", "热油爆花椒、干辣椒和蒜。", "大火快炒土豆丝，沿锅边淋醋，加盐出锅。"] },
    { name: "蚝油生菜", meal: "dinner", cat: "veg", blurb: "清爽解腻，两分钟上桌", ings: ["生菜 2 棵", "蒜", "蚝油", "生抽"], steps: ["生菜烫 30 秒捞出摆盘。", "蒜末爆香，加蚝油、生抽和一点水烧开。", "把汁浇在生菜上。"] },
    { name: "手撕包菜", meal: "dinner", cat: "veg", blurb: "香辣脆，配干辣椒特别香", ings: ["包菜 半个", "干辣椒", "蒜", "香醋", "生抽"], steps: ["包菜手撕成片，洗净沥干。", "热油爆干辣椒和蒜。", "大火炒包菜，淋醋和生抽，断生就出锅。"] },
    { name: "西兰花炒虾仁", meal: "dinner", cat: "veg", blurb: "颜色好看，清淡有营养", ings: ["西兰花 1 棵", "虾仁 200克", "蒜", "盐"], steps: ["西兰花切小朵，焯水 1 分钟。", "蒜爆香，下虾仁炒到变红。", "放西兰花快炒，加盐调味。"] },
    { name: "蒸水蛋", meal: "dinner", cat: "egg", blurb: "嫩得像布丁，好消化", ings: ["鸡蛋 3 个", "葱", "生抽", "香油"], steps: ["鸡蛋打散，加 1.5 倍温水和一点盐，搅匀过筛。", "盖盘子，水开后中火蒸 10 分钟。", "淋生抽、香油，撒葱花。"] },
    { name: "红烧鲫鱼", meal: "dinner", cat: "fish", blurb: "家常味，汤汁拌饭香", prep: "鱼当天买", ings: ["鲫鱼 2 条", "姜", "葱", "生抽", "料酒"], steps: ["鲫鱼擦干，两面煎到金黄。", "放姜葱、料酒、生抽和热水。", "中火烧 10 分钟，收汁出锅。"] },
    { name: "家常豆腐", meal: "dinner", cat: "tofu", blurb: "外焦里嫩，老少都爱", ings: ["老豆腐 1 盒", "青椒 1 个", "木耳", "猪肉片 100克", "豆瓣酱"], steps: ["豆腐切片，煎到两面金黄。", "肉片炒散，放豆瓣酱炒香。", "放豆腐、青椒、木耳，加一点水烧 3 分钟。"] },
    { name: "小米粥", meal: "breakfast", cat: "staple", blurb: "养胃，早上一碗热乎乎", ings: ["小米 1 小碗", "红枣 6 颗"], steps: ["小米淘洗一下，红枣洗净。", "水开下小米和红枣，小火熬 25 分钟。", "熬到黏稠就好，配小菜吃。"] },
    { name: "葱油饼", meal: "breakfast", cat: "staple", blurb: "外脆里软，能多做冻起来", ings: ["面粉 300克", "葱 1 把", "盐", "食用油"], steps: ["面粉加温水揉成软面团，醒 20 分钟。", "擀薄，刷油撒盐和葱花，卷起盘成饼再擀开。", "平底锅小火烙到两面金黄。"] },
    { name: "生煎包", meal: "breakfast", cat: "staple", blurb: "底脆汁多，冻的也好吃", ings: ["冷冻生煎包 1 袋", "芝麻", "葱"], steps: ["平底锅放油，生煎包摆好。", "倒水到包子三分之一高，盖锅盖焖 8 分钟。", "开盖煎到水干底脆，撒芝麻葱花。"] },
    { name: "豆浆油条", meal: "breakfast", cat: "staple", blurb: "老味道，热一下就好", ings: ["豆浆 1 大盒", "冷冻油条 1 袋"], steps: ["油条放烤箱 200 度烤 6 分钟。", "豆浆热到冒小泡。", "加不加糖看各人。"] }
  ];

  // ---- 节气：21 世纪通用公式，算出某年 24 节气的日期 ----
  var TERMS = [
    ["小寒", 0, 5.4055], ["大寒", 0, 20.12], ["立春", 1, 3.87], ["雨水", 1, 18.73],
    ["惊蛰", 2, 5.63], ["春分", 2, 20.646], ["清明", 3, 4.81], ["谷雨", 3, 20.1],
    ["立夏", 4, 5.52], ["小满", 4, 21.04], ["芒种", 5, 5.678], ["夏至", 5, 21.37],
    ["小暑", 6, 7.108], ["大暑", 6, 22.83], ["立秋", 7, 7.5], ["处暑", 7, 23.13],
    ["白露", 8, 7.646], ["秋分", 8, 23.042], ["寒露", 9, 8.318], ["霜降", 9, 23.438],
    ["立冬", 10, 7.438], ["小雪", 10, 22.36], ["大雪", 11, 7.18], ["冬至", 11, 21.94]
  ];
  function termsOfYear(year) {
    var y = year % 100;
    return TERMS.map(function (t) {
      var leap = t[1] < 2 ? Math.floor((y - 1) / 4) : Math.floor(y / 4);
      var day = Math.floor(y * 0.2422 + t[2]) - leap;
      return { name: t[0], date: new Date(year, t[1], day) };
    });
  }
  // 返回 { current: "立冬", next: "小雪", daysToNext: 1 }
  function solarTerm(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var all = termsOfYear(d.getFullYear() - 1).concat(termsOfYear(d.getFullYear()), termsOfYear(d.getFullYear() + 1));
    var cur = null, next = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].date <= d) cur = all[i];
      else { next = all[i]; break; }
    }
    return { current: cur.name, next: next.name, daysToNext: Math.round((next.date - d) / 86400000), isToday: +cur.date === +d };
  }

  var WARM = [
    "天凉了，喝碗热汤最暖和。",
    "妈妈慢慢做，大家都等着您。",
    "买菜路上慢点走，多穿一件。",
    "您身体好，就是全家福气。",
    "周末慢慢吃，不着急。",
    "谢谢妈妈，今天也辛苦啦。",
    "做多少都香，一家人一起吃最好。",
    "累了就做简单的，大家都爱吃。",
    "今天也想吃妈妈做的饭。",
    "慢慢来，饭香不怕晚。",
    "记得给自己也盛一碗。",
    "有您在，家里就有饭香。"
  ];
  function warmLine(date) {
    var n = date.getFullYear() * 372 + date.getMonth() * 31 + date.getDate();
    return WARM[n % WARM.length];
  }

  window.MP_DATA = {
    PEOPLE: PEOPLE, FAMILY: FAMILY, CATS: CATS, CAT_EMOJI: CAT_EMOJI, CRAVES: CRAVES,
    BF_ANY: BF_ANY, BF_SKIP: BF_SKIP, BF_FALLBACK: BF_FALLBACK,
    SEED_DISHES: SEED_DISHES, RECOMMENDS: RECOMMENDS,
    solarTerm: solarTerm, warmLine: warmLine
  };
})();
