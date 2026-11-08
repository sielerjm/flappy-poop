// Player-facing string catalog. Phaser-free so Node can test every key.
// Locales: en (default) and zh-Hans (Simplified Chinese).

import { formatScore, profileLine } from './save.js';

export const DEFAULT_LOCALE = 'en';
export const LOCALES = ['en', 'zh-Hans'];

const STRINGS = {
  en: {
    readyTitle: 'FLAPPY POOP',
    howToPlay: 'How to play',
    pauseTitle: 'PAUSED',
    pauseHint: 'tap anywhere to resume game',
    levelBanner: 'LEVEL {n}',
    levelContinue: 'Tap to continue',
    levelShopHint: 'Tap to continue · 💰 to shop',
    shopTitle: 'SHOP',
    shopCoins: 'Your coins',
    shopFiber: 'Fiber · +3 points',
    shopBean: 'One bean',
    shopSuperBean: 'Super fart · fills the bag',
    shopMystery: 'Mystery box',
    shopFull: 'Bag full',
    levelShort: 'LV {n}',
    'level.stomach': 'Stomach',
    'level.duodenum': 'Duodenum',
    'level.jejunum': 'Jejunum',
    'level.ileum': 'Ileum',
    'level.caecum': 'Caecum',
    'level.colon': 'Colon',
    'level.rectum': 'Rectum',
    gameOver: 'GAME OVER',
    runWon: 'YOU MADE IT OUT!',
    scoreLabel: 'SCORE',
    bestLabel: 'BEST',
    tapToHome: 'Home',
    settingsTitle: 'SETTINGS',
    sound: 'Sound',
    haptics: 'Haptics',
    on: 'ON',
    off: 'OFF',
    hapticsHint: 'Android only — iPhone has no vibrate',
    handHint: 'Bean button side in landscape',
    reloadGame: 'Reload game',
    aboutLink: 'About',
    testTitle: '🧪 TEST MODE',
    testStartLevel: 'Start at',
    invincible: 'Invincible',
    testExit: 'Exit test mode',
    aboutTitle: 'ABOUT',
    aboutName: 'Flappy Poop',
    aboutTagline: 'A gut-themed Flappy Bird clone.',
    aboutBlurb: 'The idea, game design, and all art were created by Michael Sieler.',
    aboutLlmNote: 'This game was coded with the assistance of an LLM.',
    aboutCreditsTitle: 'Credits',
    aboutCredits: `Code: JavaScript / Phaser 4.2.1 (MIT)
Art: Michael Sieler
Death fart: MacKaffee (Freesound / Pixabay)
Power fart: "fart sound effect (reed)" (Pixabay)
New level: "Shine 11" by BenKirb (Pixabay)
Coin: "Drop Coin" by freesound_gamestudio (Pixabay)
Purchase: "Coin Drop" by Universfield (Pixabay)
Shop: "Money Bag" by PhilSavlem (Pixabay)
Thanks to Tori Schummer for help with ideation
Inspired by Flappy Bird`,
    howToTitle: 'HOW TO PLAY',
    howToBody:
      'Tap to flap. Hit a pipe, the ceiling, or the floor and the run ends. On iPhone, Silent mode mutes the game — turn it off to hear sound.',
    itemPipeName: 'Pipe',
    itemPipeDetail: 'This is a pipe. Dodge the pipes for as long as possible. You gain 1 point for every pipe you dodge. From level 4 some pairs drift slowly up and down.',
    itemFiberName: 'Fiber',
    itemFiberDetail: '+3 points. Waits between the pipes; from level 2 it bobs up and down.',
    itemProbioticName: 'Probiotic',
    itemProbioticDetail: 'Protects you against bad bacteria for 5 pipes. Subsequent probiotics stack, but hitting a bad bacteria uses them all up. Eat a fiber while it is active to make a postbiotic. From level 3 it moves up and down in the gap.',
    itemPostbioticName: 'Postbiotic',
    itemPostbioticDetail: 'Eat fiber while a probiotic is active and it turns into a postbiotic: every pipe and fiber is worth double (×2) until the probiotic runs out. Another probiotic keeps it going; a bad bacteria hit ends it.',
    itemBacteriaName: 'Bad bacteria',
    itemBacteriaDetail: '−3 points. From level 3 it moves up and down in the gap.',
    itemBeanName: 'Beans',
    itemBeanDetail: 'Grab a bean, then press the bean button at the bottom (or your poop) to fart past the next 5 pipes: nothing can touch you. A normal fart uses one bean; you can carry 3, and with all three the fart rockets you past 20 in a rainbow glow.',
    itemCoinName: 'Coins',
    itemCoinDetail: 'A golden corn kernel. One waits on every level: on level 1 just past the last pipe, from level 2 at a random spot between the pipes, bobbing; more turn up now and then, and mystery boxes can hold some too. Coins go into your purse, shown above your beans, and last for this run only (a death takes them all); at the level break, tap 💰 to open the shop and spend them on fiber, a bean, a super fart or a mystery box.',
    itemMysteryName: 'Mystery box',
    itemMysteryDetail: 'The first waits between the pipes before pipe 5 of level 3; after that they turn up at random, holding still on level 3 and floating slowly up and down from level 4. Grab one for a surprise: usually fiber, often a probiotic or a bean, sometimes 5 coins, a 5-pipe postbiotic or three beans, now and then 10 coins, and very rarely 15 coins or a skip to the end of the level (the skipped pipes still score).',
    itemToiletName: 'On the toilet',
    itemToiletDetail: 'Playing on the toilet? Flip the switch under the poop on the home screen. Those scores get a 🚽 next to them.',
    itemLevelsName: 'Levels',
    itemLevelsDetail: 'The gut comes in levels: stomach, duodenum, jejunum and on, down to the rectum. Pass a checkered finish line to clear one; the game pauses for a breather before the next. Levels 2 and 3 scroll faster, then the speed holds; from level 4 some pipes drift up and down. Clear the rectum and you win. The bar at the top shows how far you are.',
    itemControlsName: 'Controls',
    itemControlsDetail:
      'One player: tap or click to flap; the bean button (or the poop) farts. Keyboard: Space or ↑ flaps, B farts, P or Esc pauses. Controller: A flaps, RT farts, Menu pauses. Two players (the 👥 toggle): P1 flaps with W or Space and farts with E or Left Shift; P2 flaps with ↑ or Enter and farts with Right Shift or Numpad 0. A controller (A, RT) or a tap on your half works too. In a level break your fart button (B, RT, E…) opens and closes the 💰 shop.',
    updatedPrefix: 'Updated',
    versionLine: 'v{version} beta',
    changelogTitle: "WHAT'S NEW",
    changelogLatest: 'Latest',
    changelogPrevious: 'Previous updates',
    languageTitle: 'Language',
    langEnglish: 'English',
    langChinese: '简体中文',
    feedbackTitle: 'FEEDBACK',
    feedbackBody:
      'Report a bug or suggest a feature. Opens GitHub in your browser — you need a GitHub account to submit.',
    bugReport: 'Bug',
    featureRequest: 'Feature request',
    feedbackLink: 'Bug or feature request?',
    saveLoadButton: 'Save / Load User',
    saveTitle: 'SAVE / LOAD USER',
    saveIntro: 'Copy your code to keep your name and top scores on another phone or browser. Paste it there to load them. Press the Save button to save your username.',
    saveNameLabel: 'Username',
    saveNamePlaceholder: '1–16 characters',
    saveYourCode: 'Save user code',
    saveCopy: 'Copy',
    saveCopied: 'Copied',
    saveLoadLabel: 'Load user code',
    saveLoad: 'Load',
    saveLoadPlaceholder: 'Paste a code',
    saveSave: 'Save',
    saveNameSaved: 'Username saved',
    testModeOn: "Test mode on — scores won't be saved",
    testModeOff: 'Test mode off',
    saveWelcome: 'Welcome back, {name} — {scores}',
    saveWelcomeNoScores: 'Welcome back, {name}',
    saveNameRequired: 'Enter a username first (1–16 characters)',
    saveErrorDamaged: 'Save code is damaged or was edited',
    saveErrorUnrecognised: 'Unrecognised save code',
    shareButton: 'Share',
    shareCardPlay: 'Play: {url}',
    shareText: 'I scored {score} on Flappy Poop ({level})! {url}',
    testRunNotSaved: 'Test run — score not saved',
    scoresTitle: 'HIGH SCORES',
    scoresEmpty: 'No scores yet',
    leaderboardTitle: 'LEADERBOARD',
    leaderboardLoading: 'Loading…',
    leaderboardOffline: "Can't reach the leaderboard",
    leaderboardJoin: 'Set a username in Save / Load User to join',
    leaderboardRank: 'Your best {score} is #{rank} of {total}',
    leaderboardNotYet: 'Your best is not on the board yet',
    leaderboardLevel: 'LV',
    saveLeaderboardNote: 'Your username and best score are shown on the public leaderboard',
    profilePrompt: 'Enter username',
    versusTitle: '2 PLAYERS',
    versusPlayer: 'P{n}',
    versusJoinPrompt: 'press your flap button',
    versusJoinReady: 'ready!',
    versusJoinHint: 'Keyboard: W / Space or ↑ / Enter · a controller · tap your half',
    versusGo: 'GO!',
    versusWins: 'P{n} WINS!',
    versusDraw: 'DRAW',
    versusRematch: 'Rematch',
    versusNotSaved: 'Two-player runs are not saved',
    versusEscaped: 'Made it out!',
    versusWaiting: 'Waiting for P{n}…',
  },
  'zh-Hans': {
    readyTitle: 'FLAPPY POOP',
    howToPlay: '玩法说明',
    pauseTitle: '已暂停',
    pauseHint: '点击任意处继续游戏',
    levelBanner: '第 {n} 关',
    levelContinue: '点击继续',
    levelShopHint: '点击继续 · 💰 进商店',
    shopTitle: '商店',
    shopCoins: '你的金币',
    shopFiber: '纤维 · +3 分',
    shopBean: '一颗豆子',
    shopSuperBean: '超级屁 · 装满豆袋',
    shopMystery: '神秘盒子',
    shopFull: '豆袋已满',
    levelShort: '第{n}关',
    'level.stomach': '胃',
    'level.duodenum': '十二指肠',
    'level.jejunum': '空肠',
    'level.ileum': '回肠',
    'level.caecum': '盲肠',
    'level.colon': '结肠',
    'level.rectum': '直肠',
    gameOver: '游戏结束',
    runWon: '顺利排出！',
    scoreLabel: '得分',
    bestLabel: '最高',
    tapToHome: '返回主页',
    settingsTitle: '设置',
    sound: '声音',
    haptics: '震动',
    on: '开',
    off: '关',
    hapticsHint: '仅限 Android——iPhone 不支持震动',
    handHint: '横屏时豆子按钮的位置',
    reloadGame: '刷新游戏',
    aboutLink: '关于',
    testTitle: '🧪 测试模式',
    testStartLevel: '开始于',
    invincible: '无敌',
    testExit: '退出测试模式',
    aboutTitle: '关于',
    aboutName: 'Flappy Poop',
    aboutTagline: '一款肠道主题的 Flappy Bird 克隆。',
    aboutBlurb: '创意、游戏设计与全部美术均由 Michael Sieler 创作。',
    aboutLlmNote: '本游戏在 LLM 协助下编写。',
    aboutCreditsTitle: '致谢',
    aboutCredits: `代码：JavaScript / Phaser 4.2.1（MIT）
美术：Michael Sieler
死亡屁声：MacKaffee（Freesound / Pixabay）
放屁冲刺音效："fart sound effect (reed)"（Pixabay）
新关卡音效："Shine 11"，BenKirb（Pixabay）
金币音效："Drop Coin"，freesound_gamestudio（Pixabay）
购买音效："Coin Drop"，Universfield（Pixabay）
商店音效："Money Bag"，PhilSavlem（Pixabay）
感谢 Tori Schummer 协助构思
灵感来自 Flappy Bird`,
    howToTitle: '玩法说明',
    howToBody:
      '点击起飞。撞到管道、天花板或地面则本局结束。在 iPhone 上，静音模式会让游戏无声——关闭静音即可听到声音。',
    itemPipeName: '管道',
    itemPipeDetail: '这是管道。尽量长时间躲开管道。每躲过一道管道得 1 分。从第 4 关起，有些管道会缓缓上下漂移。',
    itemFiberName: '纤维',
    itemFiberDetail: '+3 分。停在管道之间；从第 2 关起会上下漂浮。',
    itemProbioticName: '益生菌',
    itemProbioticDetail: '在 5 道管道内保护你不受有害细菌伤害。后续益生菌可叠加，但撞到有害细菌会全部用完。生效期间吃到纤维会变成后生元。从第 3 关起它会在管道口之间上下移动。',
    itemPostbioticName: '后生元',
    itemPostbioticDetail: '在益生菌生效期间吃到纤维，就会变成后生元：在益生菌结束前，每道管道和每个纤维都得双倍分数（×2）。再吃到益生菌可延长时间；撞到有害细菌则立即结束。',
    itemBacteriaName: '有害细菌',
    itemBacteriaDetail: '−3 分。从第 3 关起它会在管道口之间上下移动。',
    itemBeanName: '豆子',
    itemBeanDetail: '吃到豆子后，点击底部的豆子按钮（或便便）放屁冲过接下来的 5 道管道，期间什么都碰不到你。普通放屁只用一颗豆子；最多可攒 3 颗，集齐 3 颗再放屁，就能顶着彩虹光芒一口气冲过 20 道管道。',
    itemCoinName: '金币',
    itemCoinDetail: '金黄的玉米粒。每一关都有一粒：第 1 关在最后一道管道之后，从第 2 关起随机出现在管道之间并上下漂浮；此外还会偶尔多出几粒，神秘盒子里有时也有。金币存进钱袋，显示在豆子计数上方，只在本局有效（死亡会全部清空）；过关休息时点击 💰 打开商店，可以用来买纤维、豆子、超级屁或神秘盒子。',
    itemMysteryName: '神秘盒子',
    itemMysteryDetail: '第 3 关第 5 道管道之前必定会有一个停在管道之间；之后会随机出现：第 3 关里静止不动，从第 4 关起缓缓上下漂浮。吃到它会随机获得奖励：通常是纤维，也常是益生菌或一颗豆子，有时是 5 枚金币、持续 5 道管道的后生元或三颗豆子，偶尔是 10 枚金币，极少数情况下是 15 枚金币或直接跳到本关终点（跳过的管道照样计分）。',
    itemToiletName: '如厕模式',
    itemToiletDetail: '在马桶上玩？打开主界面便便下方的开关，这些分数旁会显示 🚽。',
    itemLevelsName: '关卡',
    itemLevelsDetail: '肠道分成关卡：胃、十二指肠、空肠……一直到直肠。越过黑白格终点线即可过关；游戏会稍作停顿再进入下一关。第 2、3 关会滚得更快，之后速度保持不变；从第 4 关起有些管道会上下漂移。通过直肠就赢了。顶部的进度条显示你走到了哪里。',
    itemControlsName: '操作方式',
    itemControlsDetail:
      '单人：点击起飞；按豆子按钮（或便便）放屁。键盘：空格或 ↑ 起飞，B 放屁，P 或 Esc 暂停。手柄：A 起飞，RT 放屁，Menu 暂停。双人模式（👥 开关）：玩家 1 用 W 或空格起飞、E 或左 Shift 放屁；玩家 2 用 ↑ 或回车起飞、右 Shift 或小键盘 0 放屁。也可以用手柄（A、RT）或点击你这一侧。过关休息时，放屁键（B、RT、E 等）可打开或关闭 💰 商店。',
    updatedPrefix: '更新于',
    versionLine: 'v{version} 测试版',
    changelogTitle: '更新说明',
    changelogLatest: '最新版本',
    changelogPrevious: '历史更新',
    languageTitle: '语言',
    langEnglish: 'English',
    langChinese: '简体中文',
    feedbackTitle: '反馈',
    feedbackBody: '报告问题或提出功能建议。将在浏览器中打开 GitHub——提交需要 GitHub 账号。',
    bugReport: '问题反馈',
    featureRequest: '功能建议',
    feedbackLink: '问题或功能建议？',
    saveLoadButton: '存档 / 载入用户',
    saveTitle: '存档 / 载入用户',
    saveIntro: '复制存档码，即可在其他手机或浏览器保留你的名字和最高分。在那里粘贴即可载入。按“保存”可保存用户名。',
    saveNameLabel: '用户名',
    saveNamePlaceholder: '1–16 个字符',
    saveYourCode: '保存用户码',
    saveCopy: '复制',
    saveCopied: '已复制',
    saveLoadLabel: '载入用户码',
    saveLoad: '载入',
    saveLoadPlaceholder: '粘贴存档码',
    saveSave: '保存',
    saveNameSaved: '用户名已保存',
    testModeOn: '测试模式已开启——分数不会保存',
    testModeOff: '测试模式已关闭',
    saveWelcome: '欢迎回来，{name}——{scores}',
    saveWelcomeNoScores: '欢迎回来，{name}',
    saveNameRequired: '请先输入用户名（1–16 个字符）',
    saveErrorDamaged: '存档码已损坏或被修改',
    saveErrorUnrecognised: '无法识别的存档码',
    shareButton: '分享',
    shareCardPlay: '来玩：{url}',
    shareText: '我在 Flappy Poop 拿到了 {score} 分（{level}）！{url}',
    testRunNotSaved: '测试局——分数未保存',
    scoresTitle: '最高分',
    scoresEmpty: '暂无分数',
    leaderboardTitle: '排行榜',
    leaderboardLoading: '加载中…',
    leaderboardOffline: '无法连接排行榜',
    leaderboardJoin: '在“存档 / 载入用户”中设置用户名即可上榜',
    leaderboardRank: '你的最高分 {score} 排在第 {rank} 名（共 {total} 人）',
    leaderboardNotYet: '你的最高分尚未上榜',
    leaderboardLevel: '关卡',
    saveLeaderboardNote: '你的用户名和最高分会显示在公开排行榜上',
    profilePrompt: '输入用户名',
    versusTitle: '双人模式',
    versusPlayer: '玩家{n}',
    versusJoinPrompt: '按下你的起飞键',
    versusJoinReady: '准备好了！',
    versusJoinHint: '键盘：W / 空格 或 ↑ / 回车 · 手柄 · 点击你这一侧',
    versusGo: '出发！',
    versusWins: '玩家{n} 获胜！',
    versusDraw: '平局',
    versusRematch: '再来一局',
    versusNotSaved: '双人模式的分数不会保存',
    versusEscaped: '顺利排出！',
    versusWaiting: '等待玩家{n}…',
  },
};

export function isLocale(value) {
  return LOCALES.includes(value);
}

/**
 * Resolve locale: stored choice wins; otherwise first-run from navigator language.
 * @param {string|undefined|null} navLang e.g. navigator.language
 * @param {string|undefined|null} stored value from settings (may be missing)
 */
export function initialLocale(navLang, stored) {
  if (isLocale(stored)) return stored;
  const lang = typeof navLang === 'string' ? navLang.toLowerCase() : '';
  if (lang.startsWith('zh')) return 'zh-Hans';
  return DEFAULT_LOCALE;
}

/** Look up a catalog key; unknown locale or key falls back to English. */
export function t(locale, key) {
  const pack = STRINGS[isLocale(locale) ? locale : DEFAULT_LOCALE] ?? STRINGS[DEFAULT_LOCALE];
  if (Object.prototype.hasOwnProperty.call(pack, key)) return pack[key];
  return STRINGS[DEFAULT_LOCALE][key] ?? key;
}

/** How to play rows for a locale, pipe first, controls last. key matches a Boot texture name or an emoji row in HowTo. */
export function howToItems(locale) {
  return [
    { key: 'pipe', name: t(locale, 'itemPipeName'), detail: t(locale, 'itemPipeDetail') },
    { key: 'fiber', name: t(locale, 'itemFiberName'), detail: t(locale, 'itemFiberDetail') },
    { key: 'probiotic', name: t(locale, 'itemProbioticName'), detail: t(locale, 'itemProbioticDetail') },
    { key: 'postbiotic', name: t(locale, 'itemPostbioticName'), detail: t(locale, 'itemPostbioticDetail') },
    { key: 'bacteria', name: t(locale, 'itemBacteriaName'), detail: t(locale, 'itemBacteriaDetail') },
    { key: 'bean', name: t(locale, 'itemBeanName'), detail: t(locale, 'itemBeanDetail') },
    { key: 'coin', name: t(locale, 'itemCoinName'), detail: t(locale, 'itemCoinDetail') },
    { key: 'mystery-icon', name: t(locale, 'itemMysteryName'), detail: t(locale, 'itemMysteryDetail') },
    { key: 'toilet', name: t(locale, 'itemToiletName'), detail: t(locale, 'itemToiletDetail') },
    { key: 'levels', name: t(locale, 'itemLevelsName'), detail: t(locale, 'itemLevelsDetail') },
    { key: 'controls', name: t(locale, 'itemControlsName'), detail: t(locale, 'itemControlsDetail') },
  ];
}

/**
 * Level-break banner as two lines: "LEVEL 2 · Jejunum" (the segment name is
 * omitted past the named list) and "Tap to continue", or with `shop` (coins in
 * the purse) "Tap to continue · 💰 to shop".
 */
export function levelBannerText(locale, level, levels, { shop = false } = {}) {
  const key = levels?.[level - 1]?.key;
  const title = t(locale, 'levelBanner').replace('{n}', String(level));
  const name = key ? t(locale, `level.${key}`) : '';
  return `${name ? `${title} · ${name}` : title}\n${t(locale, shop ? 'levelShopHint' : 'levelContinue')}`;
}

/** The coin glyph and a count: "💰 12" (the shop button, the purse line, every price). Locale-free, like formatScore's "🚽 41". */
export function coinLabel(n) {
  return `💰 ${n}`;
}

/** Short level label for the progress bar and score lines: "LV 2". */
export function levelLabel(locale, level) {
  return t(locale, 'levelShort').replace('{n}', String(level));
}

/** Pause banner as two lines joined by newline (Play splits for sizing). */
export function pauseBannerText(locale) {
  return `${t(locale, 'pauseTitle')}\n${t(locale, 'pauseHint')}`;
}

/** Small meta lines (version, Updated, haptics hint): 28px in Chinese, 24px in English (2x field). */
export function metaFontSize(locale) {
  return locale === 'zh-Hans' ? '28px' : '24px';
}

/** Ready-screen profile button: "Name · 🚽 41" once a username is set, else the prompt to enter one. */
export function profileButtonText(locale, state) {
  return profileLine(state) || t(locale, 'profilePrompt');
}

/** "Welcome back, Name — 41 · 37 · 30" after a successful save-code load. */
export function welcomeText(locale, state) {
  const name = state?.name ?? '';
  const top = Array.isArray(state?.top) ? state.top : [];
  if (top.length === 0) return t(locale, 'saveWelcomeNoScores').replace('{name}', name);
  return t(locale, 'saveWelcome').replace('{name}', name).replace('{scores}', top.map(formatScore).join(' · '));
}

/**
 * The message shared with the game-over image: the score (with the 🚽 when
 * toilet mode was on), the level label, and the game's link.
 */
export function shareText(locale, { score = 0, toilet = false, level = 1, url = '' } = {}) {
  return t(locale, 'shareText')
    .replace('{score}', formatScore({ score: Number.isInteger(score) ? score : 0, toilet: Boolean(toilet) }))
    .replace('{level}', levelLabel(locale, level))
    .replace('{url}', url)
    .trim();
}

/** The share card's footer: "Play: sielerjm.github.io/flappy-poop" (the link without https:// or a trailing slash). */
export function shareCardFooter(locale, url = '') {
  const bare = String(url).replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, '');
  return t(locale, 'shareCardPlay').replace('{url}', bare);
}

/** "Your best 🚽 41 is #23 of 150" for a player who is not on the board. */
export function rankText(locale, info) {
  return t(locale, 'leaderboardRank')
    .replace('{score}', formatScore({ score: info?.score ?? 0, toilet: Boolean(info?.toilet) }))
    .replace('{rank}', String(info?.rank ?? 0))
    .replace('{total}', String(info?.total ?? 0));
}

/** Toggle label like "Sound   ON". */
export function toggleLabel(locale, nameKey, on) {
  return `${t(locale, nameKey)}   ${t(locale, on ? 'on' : 'off')}`;
}

/** Catalog key set for tests (English is the source of truth). */
export function catalogKeys() {
  return Object.keys(STRINGS[DEFAULT_LOCALE]);
}

export function catalogFor(locale) {
  return { ...(STRINGS[isLocale(locale) ? locale : DEFAULT_LOCALE] ?? STRINGS[DEFAULT_LOCALE]) };
}
