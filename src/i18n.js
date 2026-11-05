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
    reloadGame: 'Reload game',
    aboutLink: 'About',
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
Thanks to Tori Schummer for help with ideation
Inspired by Flappy Bird`,
    howToTitle: 'HOW TO PLAY',
    howToBody:
      'Tap to flap. Hit a pipe, the ceiling, or the floor and the run ends. On iPhone, Silent mode mutes the game — turn it off to hear sound.',
    itemPipeName: 'Pipe',
    itemPipeDetail: 'This is a pipe. Dodge the pipes for as long as possible. You gain 1 point for every pipe you dodge.',
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
    itemMysteryName: 'Mystery box',
    itemMysteryDetail: 'One waits between the pipes early in level 3; from level 4 they float slowly up and down and can turn up again and again. Grab one for a surprise: usually fiber, often a probiotic or a bean, sometimes a 5-pipe postbiotic or three beans, and very rarely a skip to the end of the level (the skipped pipes still score).',
    itemToiletName: 'On the toilet',
    itemToiletDetail: 'Playing on the toilet? Flip the switch under the poop on the home screen. Those scores get a 🚽 next to them.',
    itemLevelsName: 'Levels',
    itemLevelsDetail: 'The gut comes in levels: stomach, duodenum, jejunum and on, down to the rectum. Pass a checkered finish line to clear one; the game pauses for a breather, then each level scrolls a little faster. Clear the rectum and you win. The bar at the top shows how far you are.',
    updatedPrefix: 'Updated',
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
    saveWelcome: 'Welcome back, {name} — {scores}',
    saveWelcomeNoScores: 'Welcome back, {name}',
    saveNameRequired: 'Enter a username first (1–16 characters)',
    saveErrorDamaged: 'Save code is damaged or was edited',
    saveErrorUnrecognised: 'Unrecognised save code',
    newTopHint: 'New high score! Press Save / Load User on the home screen to save it.',
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
  },
  'zh-Hans': {
    readyTitle: 'FLAPPY POOP',
    howToPlay: '玩法说明',
    pauseTitle: '已暂停',
    pauseHint: '点击任意处继续游戏',
    levelBanner: '第 {n} 关',
    levelContinue: '点击继续',
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
    reloadGame: '刷新游戏',
    aboutLink: '关于',
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
感谢 Tori Schummer 协助构思
灵感来自 Flappy Bird`,
    howToTitle: '玩法说明',
    howToBody:
      '点击起飞。撞到管道、天花板或地面则本局结束。在 iPhone 上，静音模式会让游戏无声——关闭静音即可听到声音。',
    itemPipeName: '管道',
    itemPipeDetail: '这是管道。尽量长时间躲开管道。每躲过一道管道得 1 分。',
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
    itemMysteryName: '神秘盒子',
    itemMysteryDetail: '第 3 关开头会有一个停在管道之间；从第 4 关起它们会缓缓上下漂浮，并且可能多次出现。吃到它会随机获得奖励：通常是纤维，也常是益生菌或一颗豆子，偶尔是持续 5 道管道的后生元或三颗豆子，极少数情况下会直接跳到本关终点（跳过的管道照样计分）。',
    itemToiletName: '如厕模式',
    itemToiletDetail: '在马桶上玩？打开主界面便便下方的开关，这些分数旁会显示 🚽。',
    itemLevelsName: '关卡',
    itemLevelsDetail: '肠道分成关卡：胃、十二指肠、空肠……一直到直肠。越过黑白格终点线即可过关；游戏会稍作停顿，之后每一关都会滚得更快一些。通过直肠就赢了。顶部的进度条显示你走到了哪里。',
    updatedPrefix: '更新于',
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
    saveWelcome: '欢迎回来，{name}——{scores}',
    saveWelcomeNoScores: '欢迎回来，{name}',
    saveNameRequired: '请先输入用户名（1–16 个字符）',
    saveErrorDamaged: '存档码已损坏或被修改',
    saveErrorUnrecognised: '无法识别的存档码',
    newTopHint: '新高分！在主界面点击“存档 / 载入用户”即可保存。',
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

/** How to play rows for a locale, pipe first. key matches Boot texture names. */
export function howToItems(locale) {
  return [
    { key: 'pipe', name: t(locale, 'itemPipeName'), detail: t(locale, 'itemPipeDetail') },
    { key: 'fiber', name: t(locale, 'itemFiberName'), detail: t(locale, 'itemFiberDetail') },
    { key: 'probiotic', name: t(locale, 'itemProbioticName'), detail: t(locale, 'itemProbioticDetail') },
    { key: 'postbiotic', name: t(locale, 'itemPostbioticName'), detail: t(locale, 'itemPostbioticDetail') },
    { key: 'bacteria', name: t(locale, 'itemBacteriaName'), detail: t(locale, 'itemBacteriaDetail') },
    { key: 'bean', name: t(locale, 'itemBeanName'), detail: t(locale, 'itemBeanDetail') },
    { key: 'mystery-icon', name: t(locale, 'itemMysteryName'), detail: t(locale, 'itemMysteryDetail') },
    { key: 'toilet', name: t(locale, 'itemToiletName'), detail: t(locale, 'itemToiletDetail') },
    { key: 'levels', name: t(locale, 'itemLevelsName'), detail: t(locale, 'itemLevelsDetail') },
  ];
}

/**
 * Level-break banner as two lines: "LEVEL 2 · Jejunum" (the segment name is
 * omitted past the named list) and "Tap to continue".
 */
export function levelBannerText(locale, level, levels) {
  const key = levels?.[level - 1]?.key;
  const title = t(locale, 'levelBanner').replace('{n}', String(level));
  const name = key ? t(locale, `level.${key}`) : '';
  return `${name ? `${title} · ${name}` : title}\n${t(locale, 'levelContinue')}`;
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
