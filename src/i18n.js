// Player-facing string catalog. Phaser-free so Node can test every key.
// Locales: en (default) and zh-Hans (Simplified Chinese).

export const DEFAULT_LOCALE = 'en';
export const LOCALES = ['en', 'zh-Hans'];

const STRINGS = {
  en: {
    readyTitle: 'FLAPPY POOP',
    howToPlay: 'How to play',
    tapToFlap: 'tap to flap',
    pauseTitle: 'PAUSED',
    pauseHint: 'tap anywhere to resume game',
    gameOver: 'GAME OVER',
    scoreLabel: 'SCORE',
    bestLabel: 'BEST',
    tapToRetry: 'tap to retry',
    settingsTitle: 'SETTINGS',
    sound: 'Sound',
    haptics: 'Haptics',
    on: 'ON',
    off: 'OFF',
    hapticsHint: 'Android only — iPhone has no vibrate',
    musicComingSoon: 'Music   coming soon',
    aboutLink: 'About',
    aboutTitle: 'ABOUT',
    aboutBody: `Flappy Poop

A gut-themed Flappy Bird clone.

This game was coded with the assistance of an LLM. The idea, game design, and all art are by Michael Sieler.

Credits
Code: JavaScript (ES modules) on Phaser 4.2.1 (MIT)
Art: Michael Sieler
Sound: "fart" by MacKaffee (Freesound / Pixabay)
Inspired by Flappy Bird`,
    howToTitle: 'HOW TO PLAY',
    howToBody:
      'Tap to flap. Pass a pipe pair for a point. Hit a pipe, the ceiling, or the floor and the run ends. On iPhone, Silent mode mutes the game — turn it off to hear sound.',
    itemFiberName: 'Fiber',
    itemFiberDetail: '+1 point',
    itemProbioticName: 'Probiotic',
    itemProbioticDetail: 'Blocks one bacteria hit for 5 pipes',
    itemBacteriaName: 'Bad bacteria',
    itemBacteriaDetail: '−2 points (score never below 0). Does not kill.',
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
  },
  'zh-Hans': {
    readyTitle: 'FLAPPY POOP',
    howToPlay: '玩法说明',
    tapToFlap: '点击飞扑',
    pauseTitle: '已暂停',
    pauseHint: '点击任意处继续游戏',
    gameOver: '游戏结束',
    scoreLabel: '得分',
    bestLabel: '最高',
    tapToRetry: '点击重试',
    settingsTitle: '设置',
    sound: '声音',
    haptics: '震动',
    on: '开',
    off: '关',
    hapticsHint: '仅 Android — iPhone 无法震动',
    musicComingSoon: '音乐   即将推出',
    aboutLink: '关于',
    aboutTitle: '关于',
    aboutBody: `Flappy Poop

一款肠道主题的 Flappy Bird 克隆。

本游戏在 LLM 协助下编写。创意、游戏设计与全部美术由 Michael Sieler 完成。

致谢
代码：JavaScript（ES 模块）与 Phaser 4.2.1（MIT）
美术：Michael Sieler
音效："fart" by MacKaffee（Freesound / Pixabay）
灵感来自 Flappy Bird`,
    howToTitle: '玩法说明',
    howToBody:
      '点击飞扑。穿过一对管道得一分。撞到管道、天花板或地面则本局结束。在 iPhone 上，静音模式会让游戏无声——关闭静音即可听到声音。',
    itemFiberName: '纤维',
    itemFiberDetail: '+1 分',
    itemProbioticName: '益生菌',
    itemProbioticDetail: '可抵挡一次有害细菌，持续 5 根管道',
    itemBacteriaName: '有害细菌',
    itemBacteriaDetail: '−2 分（分数不低于 0）。不会致死。',
    updatedPrefix: '更新于',
    languageTitle: '语言',
    langEnglish: 'English',
    langChinese: '简体中文',
    feedbackTitle: '反馈',
    feedbackBody: '报告问题或提出功能建议。将在浏览器中打开 GitHub — 提交需要 GitHub 账号。',
    bugReport: '问题反馈',
    featureRequest: '功能建议',
    feedbackLink: '问题或功能建议？',
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

/** How to play item rows for a locale. key matches Boot texture names. */
export function howToItems(locale) {
  return [
    { key: 'fiber', name: t(locale, 'itemFiberName'), detail: t(locale, 'itemFiberDetail') },
    { key: 'probiotic', name: t(locale, 'itemProbioticName'), detail: t(locale, 'itemProbioticDetail') },
    { key: 'bacteria', name: t(locale, 'itemBacteriaName'), detail: t(locale, 'itemBacteriaDetail') },
  ];
}

/** Pause banner as two lines joined by newline (Play splits for sizing). */
export function pauseBannerText(locale) {
  return `${t(locale, 'pauseTitle')}\n${t(locale, 'pauseHint')}`;
}

/** Small meta lines (version, Updated, haptics hint): 14px in Chinese, 12px in English. */
export function metaFontSize(locale) {
  return locale === 'zh-Hans' ? '14px' : '12px';
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
