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
    aboutTagline: 'The #1 game to play while going #2!',
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
      'Tap to flap. Hit a pipe, the ceiling, or the floor and the run ends.',
    itemPipeName: 'Pipe',
    itemPipeDetail: 'This is a pipe. Dodge the pipes for as long as possible. You gain 1 point for every pipe you dodge. From level 4 some pairs drift slowly up and down.',
    itemFiberName: 'Fiber',
    itemFiberDetail: '+3 points. Waits between the pipes; from level 2 it bobs up and down.',
    itemProbioticName: 'Probiotic',
    itemProbioticDetail: 'Protects you against bad bacteria for 5 pipes. Subsequent probiotics stack, but hitting a bad bacteria uses them all up. Eat a fiber while it is active to make a postbiotic. From level 3 it moves up and down in the gap.',
    itemPostbioticName: 'Postbiotic',
    itemPostbioticDetail: 'Eat fiber while a probiotic is active and it turns into a postbiotic: every pipe and fiber is worth double (×2) until the probiotic runs out, and every kernel you pick up counts twice. Another probiotic keeps it going; a bad bacteria hit ends it.',
    itemBacteriaName: 'Bad bacteria',
    itemBacteriaDetail: '−3 points. From level 3 it moves up and down in the gap.',
    itemBeanName: 'Beans',
    itemBeanDetail: 'Grab a bean, then press the bean button at the bottom (or your poop) to fart past the next 5 pipes: nothing can touch you. A normal fart uses one bean; you can carry 3, and with all three the fart rockets you past 20 in a rainbow glow.',
    itemCoinName: 'Kernels',
    itemCoinDetail: 'A golden corn kernel. Kernels go into your purse and can be redeemed for items in the shop. Tap 💰 to open the shop in between levels.',
    itemMysteryName: 'Mystery box',
    itemMysteryDetail: 'Mystery boxes contain a random surprise item.',
    itemToiletName: 'On the toilet',
    itemToiletDetail: 'Playing on the toilet? Flip the switch under the poop on the home screen. Those scores get a 🚽 next to them.',
    itemLevelsName: 'Levels',
    itemLevelsDetail: 'The gut comes in levels: stomach, duodenum, jejunum and on, down to the rectum. Pass a checkered finish line to clear one; the game pauses for a breather before the next level. Clear the rectum and you win! The bar at the top shows how far you are.',
    itemTwoPlayerName: 'Two players',
    itemTwoPlayerDetail: 'On a wide screen, flip the 👥 switch under the toilet one and race a friend side by side on the same course. A crash costs points, not the match; first over each finish line gets +25, and the higher score wins.',
    itemTournamentName: 'Tournament',
    itemTournamentDetail: '3 to 8 players race two at a time in a knockout bracket: tap 🏅 Tournament on the two-player screen. The top three win 🥇 🥈 🥉, and players who joined with their user code keep their medals on the 🏅 board.',
    itemDailyName: 'Daily Dump',
    itemDailyDetail: "Tap the 🌞 at the top of the home screen: one try a day on a course everyone shares, endless at the day's level, with no kernels. Your score goes on the 🌞 board; a new course every day at 00:00 UTC.",
    itemInfoName: 'About',
    itemInfoDetail: "The i button opens About: the credits, this guide and What's new (the update notes). Key: I.",
    itemLanguageName: 'Language',
    itemLanguageDetail: 'Switch between English and 简体中文. Key: L.',
    itemFeedbackName: 'Feedback',
    itemFeedbackDetail: 'Report a bug or suggest a feature on GitHub. Key: F.',
    itemLeaderboardName: 'Leaderboard',
    itemLeaderboardDetail: "The top 25 scores. Its 🌞 tab has today's Daily Dump, its 🏅 tab the tournament medals. Key: T.",
    itemSettingsName: 'Settings',
    itemSettingsDetail: "Sound, haptics (Android only), the bean button's side in landscape, and Reload game to fetch the newest version. Key: S.",
    itemSoundName: 'Sound',
    itemSoundDetail: 'Mute or unmute the game. Key: M. On iPhone, Silent mode mutes the game - turn it off to hear sound.',
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
      'Report a bug or suggest a feature. Opens GitHub in your browser - you need a GitHub account to submit.',
    bugReport: 'Bug',
    featureRequest: 'Feature request',
    feedbackLink: 'Bug or feature request?',
    saveTitle: 'SAVE / LOAD USER',
    saveIntro: '1. Pick a username and press Save.\n2. Copy your user code and keep it somewhere safe (a note, a message to yourself).\n3. On another phone or browser, paste it under Load user code: your name and scores follow you, and the leaderboard joins both into one player.\n4. To change your username, type a new one and press Save. Devices and browsers that use your user code update to the new name automatically.',
    saveNameLabel: 'Username',
    saveNamePlaceholder: '4–16 characters',
    saveYourCode: 'Save user code',
    saveCopy: 'Copy',
    saveCopied: 'Copied',
    saveLoadLabel: 'Load user code',
    saveLoad: 'Load',
    saveLoadPlaceholder: 'Paste a code',
    saveSave: 'Save',
    saveNameSaved: 'Username saved',
    saveNameShort: 'Usernames need at least 4 characters (2 in Chinese, Japanese or Korean)',
    saveNameSpace: 'Usernames cannot have spaces',
    saveNameEmoji: 'Usernames cannot have emoji',
    saveNameBlocked: 'Please pick a different username',
    saveNameLong: 'Usernames can have at most 16 characters',
    saveNameChecking: 'Checking the leaderboard…',
    saveNameTaken: "That username is taken. If it's yours, copy your user code on the device where you set it and paste it here under Load user code. Otherwise pick another name.",
    saveNameOffline: "Username saved on this device (couldn't check the leaderboard)",
    saveClear: 'Clear',
    saveClearConfirm: "Copy your user code first: without it this username and its scores can't come back. Tap Clear again to sign out.",
    saveCleared: 'Signed out: this device has no username now',
    saveMerged: 'Welcome back, {name} — this device is now part of your player',
    testModeOn: "Test mode on — scores won't be saved",
    testModeOff: 'Test mode off',
    saveWelcome: 'Welcome back, {name} — {scores}',
    saveWelcomeNoScores: 'Welcome back, {name}',
    saveNameRequired: 'Enter a username first (4–16 characters)',
    saveErrorDamaged: 'Save code is damaged or was edited',
    saveErrorUnrecognised: 'Unrecognised save code',
    shareButton: 'Share',
    shareCardPlay: 'Play: {url}',
    shareText: 'I scored {score} on Flappy Poop ({level})! {url}',
    testRunNotSaved: 'Test run — score not saved',
    playAgain: 'Play again',
    newPersonalBest: '🎉 New personal best!',
    scoresEmpty: 'No scores yet',
    leaderboardTitle: 'LEADERBOARD',
    leaderboardLoading: 'Loading…',
    leaderboardOffline: "Can't reach the leaderboard",
    leaderboardJoin: 'Tap Load user on the home screen to set a username and join',
    leaderboardRank: 'Your best {score} is #{rank} of {total}',
    leaderboardNotYet: 'Your best is not on the board yet',
    leaderboardNameTaken: 'Your username belongs to another player: tap your name on the home screen to fix it',
    leaderboardLevel: 'LV',
    medalBoardTitle: 'MEDAL BOARD',
    medalBoardBest: 'BEST RACE',
    medalBoardEmpty: 'No medals yet: finish a tournament to start the board',
    medalBoardJoin: 'Join a tournament with your user code to get on this board',
    medalBoardYou: 'You: #{rank} · {events} tournaments',
    saveLeaderboardNote: 'Your username and best score are shown on the public leaderboard',
    loadUserButton: 'Load user',
    versusTitle: '2 PLAYERS',
    versusPlayer: 'P{n}',
    versusJoinPrompt: 'press your flap button',
    versusJoinReady: 'ready!',
    versusJoinHint: 'Keyboard: W / Space or ↑ / Enter · a controller · tap your half',
    versusGo: 'GO!',
    versusWins: '{name} WINS!',
    versusDraw: 'DRAW',
    versusRematch: 'Rematch',
    versusNotSaved: 'Two-player runs are not saved',
    versusEscaped: 'Made it out!',
    versusWaiting: 'Waiting for {name}…',
    versusTapReady: 'Tap when ready',
    versusReadyWaiting: 'Ready! Waiting for {name}…',
    versusUnreadyHint: 'Tap again to un-ready',
    tournamentContinue: 'Continue',
    tournamentByDeaths: 'Fewer crashes',
    tournamentByLevelWins: 'More finish lines first',
    tournamentByFinalFirst: 'First across the line',
    tournamentButton: '🏅 Tournament',
    tournamentTitle: '🏅 TOURNAMENT',
    tournamentPlayers: 'Players',
    tournamentPaste: 'Paste code',
    tournamentGuest: 'Guest',
    tournamentMe: 'Use my player',
    tournamentAdd: 'Add',
    tournamentStart: 'Start',
    tournamentDuplicate: 'That player already has a spot',
    tournamentNeedName: 'Set a username first (Load user on the home screen)',
    tournamentGuestTag: '(guest)',
    tournamentHostTag: '(you)',
    tournamentVs: 'vs',
    tournamentPlay: 'Play',
    tournamentAbandon: 'Abandon',
    tournamentAbandonConfirm: 'Tap Abandon again to end the tournament: nothing is saved',
    tournamentQuarter: 'QUARTER-FINAL',
    tournamentSemi: 'SEMI-FINAL',
    tournamentBronze: 'BRONZE MATCH',
    tournamentFinal: 'FINAL',
    tournamentPodium: 'PODIUM',
    tournamentNew: 'New tournament',
    tournamentBracket: 'Bracket',
    tournamentHowTitle: 'How a tournament works',
    tournamentHowBody:
      '3 to 8 players race two at a time on this screen, knockout style: win to move on.\nAdd each player by pasting their user code, as a guest, or with your own player.\nRaces are shorter than a normal run. The higher score wins; a tie goes to fewer crashes, then more finish lines crossed first.\nThe top three take the podium 🥇 🥈 🥉. Players who joined with their user code get their medals on the 🏅 board; guests aren\'t saved.',
    tournamentGotIt: 'Got it',
    dailyTitle: '🌞 DAILY DUMP',
    dailyToday: "Today's course: {level}",
    dailyBody: 'One try a day. Everyone flies the same course today, and it never ends: go as far as you can. No kernels, no shop. Compare scores on the 🌞 leaderboard; a new course starts every day at midnight UTC.',
    dailyCreateUser: 'Create user',
    dailyPlay: 'Play',
    dailyChecking: 'Checking…',
    dailySeeResult: "See today's result",
    dailyPractice: 'Practice',
    dailyNeedName: 'Pick a username first: your score goes on the 🌞 board under it.',
    dailyPracticeNote: 'Test mode: practice runs are not saved and do not use up the day.',
    dailyNext: 'Next Daily Dump in {time}',
    dailyOverTitle: 'DAILY DUMP · {day}',
    dailyRank: '🏆 #{rank} of {total}',
    dailyRankLoading: 'Rank…',
    dailyRankQueued: 'Posts when online',
    dailyRankNameTaken: 'Name taken',
    dailyRankRejected: 'Not saved',
    dailyRankUnavailable: 'Rank unavailable',
    dailyShareText: '🌞 I scored {score} in the Flappy Poop Daily Dump ({day}){rank}! {url}',
    dailyShareRank: ', #{rank} of {total}',
    dailyBoardTitle: 'DAILY DUMP',
    dailyBoardEmpty: "No one has played today's Daily Dump yet",
    dailyBoardJoin: "Play today's Daily Dump from the 🌞 on the home screen",
    dailyBoardYou: 'You: #{rank} of {total} · {score}',
    tournamentSaving: 'Saving medals…',
    tournamentSaveSent: 'Medals saved to the 🏅 board',
    tournamentSaveLater: 'Medals saved on this device: they post when you\'re online',
    tournamentSaveRejected: 'Couldn\'t save this tournament\'s medals',
    tournamentSaveNone: 'No one joined with a user code: no medals to save',
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
    aboutTagline: '上大号时必玩的头号游戏！',
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
      '点击起飞。撞到管道、天花板或地面则本局结束。',
    itemPipeName: '管道',
    itemPipeDetail: '这是管道。尽量长时间躲开管道。每躲过一道管道得 1 分。从第 4 关起，有些管道会缓缓上下漂移。',
    itemFiberName: '纤维',
    itemFiberDetail: '+3 分。停在管道之间；从第 2 关起会上下漂浮。',
    itemProbioticName: '益生菌',
    itemProbioticDetail: '在 5 道管道内保护你不受有害细菌伤害。后续益生菌可叠加，但撞到有害细菌会全部用完。生效期间吃到纤维会变成后生元。从第 3 关起它会在管道口之间上下移动。',
    itemPostbioticName: '后生元',
    itemPostbioticDetail: '在益生菌生效期间吃到纤维，就会变成后生元：在益生菌结束前，每道管道和每个纤维都得双倍分数（×2），拾取的每粒玉米粒也算两粒。再吃到益生菌可延长时间；撞到有害细菌则立即结束。',
    itemBacteriaName: '有害细菌',
    itemBacteriaDetail: '−3 分。从第 3 关起它会在管道口之间上下移动。',
    itemBeanName: '豆子',
    itemBeanDetail: '吃到豆子后，点击底部的豆子按钮（或便便）放屁冲过接下来的 5 道管道，期间什么都碰不到你。普通放屁只用一颗豆子；最多可攒 3 颗，集齐 3 颗再放屁，就能顶着彩虹光芒一口气冲过 20 道管道。',
    itemCoinName: '玉米粒',
    itemCoinDetail: '金黄的玉米粒。玉米粒会进入钱袋，可在商店兑换物品。关卡之间点击 💰 打开商店。',
    itemMysteryName: '神秘盒子',
    itemMysteryDetail: '神秘盒子里装有随机惊喜道具。',
    itemToiletName: '如厕模式',
    itemToiletDetail: '在马桶上玩？打开主界面便便下方的开关，这些分数旁会显示 🚽。',
    itemLevelsName: '关卡',
    itemLevelsDetail: '肠道分成关卡：胃、十二指肠、空肠……一直到直肠。越过黑白格终点线即可过关；游戏会稍作停顿再进入下一关。通过直肠就赢了！顶部的进度条显示你走到了哪里。',
    itemTwoPlayerName: '双人模式',
    itemTwoPlayerDetail: '在宽屏上，打开马桶开关下方的👥开关，和朋友在同一条赛道上并排比赛。撞到只会扣分，不会输掉比赛；率先冲过每条终点线得25分，最后分高者胜。',
    itemTournamentName: '锦标赛',
    itemTournamentDetail: '3到8名玩家两两比赛，淘汰制：在双人模式页面点“🏅锦标赛”。前三名获得🥇🥈🥉，用用户码加入的玩家奖牌会记到🏅榜上。',
    itemDailyName: '每日一拉',
    itemDailyDetail: '点首页顶部的🌞：每天一次机会，所有人飞同一条赛道，按当天的关卡一直飞下去，没有玉米粒。分数记到🌞榜上；每天UTC 00:00换新赛道。',
    itemInfoName: '关于',
    itemInfoDetail: 'i按钮打开“关于”：制作名单、本玩法说明和更新说明。按键：I。',
    itemLanguageName: '语言',
    itemLanguageDetail: '在English和简体中文之间切换。按键：L。',
    itemFeedbackName: '反馈',
    itemFeedbackDetail: '在GitHub上报告问题或提出功能建议。按键：F。',
    itemLeaderboardName: '排行榜',
    itemLeaderboardDetail: '前25名的成绩。🌞页是今天的每日一拉，🏅页是锦标赛奖牌榜。按键：T。',
    itemSettingsName: '设置',
    itemSettingsDetail: '音效、震动（仅限Android）、横屏时豆子按钮的位置，以及“刷新游戏”获取最新版本。按键：S。',
    itemSoundName: '声音',
    itemSoundDetail: '静音或取消静音。按键：M。 iPhone需关闭静音模式才有声音。',
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
    saveTitle: '存档 / 载入用户',
    saveIntro: '1. 输入用户名并按“保存”。\n2. 复制你的用户码，保存在安全的地方（备忘录、发给自己的消息）。\n3. 在其他手机或浏览器上，把它粘贴到“载入用户码”：你的名字和分数会跟着你，排行榜也会把两边合并为同一位玩家。\n4. 要更改用户名，输入新名字并按“保存”。使用你用户码的其他设备和浏览器会自动更新为新名字。',
    saveNameLabel: '用户名',
    saveNamePlaceholder: '4–16 个字符',
    saveYourCode: '保存用户码',
    saveCopy: '复制',
    saveCopied: '已复制',
    saveLoadLabel: '载入用户码',
    saveLoad: '载入',
    saveLoadPlaceholder: '粘贴存档码',
    saveSave: '保存',
    saveNameSaved: '用户名已保存',
    saveNameShort: '用户名至少需要4个字符（中文、日文或韩文至少2个）',
    saveNameSpace: '用户名不能包含空格',
    saveNameEmoji: '用户名不能包含表情符号',
    saveNameBlocked: '请换一个用户名',
    saveNameLong: '用户名最多16个字符',
    saveNameChecking: '正在查询排行榜…',
    saveNameTaken: '这个用户名已被使用。如果是你的，请在设置它的那台设备上复制用户码，然后粘贴到这里的“载入用户码”。否则请换一个名字。',
    saveNameOffline: '用户名已保存在此设备（无法连接排行榜核对）',
    saveClear: '清除',
    saveClearConfirm: '请先复制你的用户码：没有它，这个用户名和分数就找不回来了。再点一次“清除”即可退出。',
    saveCleared: '已退出：此设备现在没有用户名',
    saveMerged: '欢迎回来，{name}——这台设备现已并入你的玩家账号',
    testModeOn: '测试模式已开启——分数不会保存',
    testModeOff: '测试模式已关闭',
    saveWelcome: '欢迎回来，{name}——{scores}',
    saveWelcomeNoScores: '欢迎回来，{name}',
    saveNameRequired: '请先输入用户名（4–16 个字符）',
    saveErrorDamaged: '存档码已损坏或被修改',
    saveErrorUnrecognised: '无法识别的存档码',
    shareButton: '分享',
    shareCardPlay: '来玩：{url}',
    shareText: '我在 Flappy Poop 拿到了 {score} 分（{level}）！{url}',
    testRunNotSaved: '测试局——分数未保存',
    playAgain: '再玩一次',
    newPersonalBest: '🎉 新的个人最佳！',
    scoresEmpty: '暂无分数',
    leaderboardTitle: '排行榜',
    leaderboardLoading: '加载中…',
    leaderboardOffline: '无法连接排行榜',
    leaderboardJoin: '在首页点“载入用户”设置用户名即可上榜',
    leaderboardRank: '你的最高分 {score} 排在第 {rank} 名（共 {total} 人）',
    leaderboardNotYet: '你的最高分尚未上榜',
    leaderboardNameTaken: '你的用户名属于另一位玩家：请在首页点你的名字处理',
    leaderboardLevel: '关卡',
    medalBoardTitle: '奖牌榜',
    medalBoardBest: '单场最佳',
    medalBoardEmpty: '还没有奖牌：完成一届锦标赛就能上榜',
    medalBoardJoin: '用你的用户码参加锦标赛，就能上这个榜',
    medalBoardYou: '你：第 {rank} 名 · 参赛 {events} 届',
    saveLeaderboardNote: '你的用户名和最高分会显示在公开排行榜上',
    loadUserButton: '载入用户',
    versusTitle: '双人模式',
    versusPlayer: '玩家{n}',
    versusJoinPrompt: '按下你的起飞键',
    versusJoinReady: '准备好了！',
    versusJoinHint: '键盘：W / 空格 或 ↑ / 回车 · 手柄 · 点击你这一侧',
    versusGo: '出发！',
    versusWins: '{name} 获胜！',
    versusDraw: '平局',
    versusRematch: '再来一局',
    versusNotSaved: '双人模式的分数不会保存',
    versusEscaped: '顺利排出！',
    versusWaiting: '等待{name}…',
    versusTapReady: '准备好了就点一下',
    versusReadyWaiting: '已准备！等待{name}…',
    versusUnreadyHint: '再点一次可取消准备',
    tournamentContinue: '继续',
    tournamentByDeaths: '撞得更少',
    tournamentByLevelWins: '率先过线的关卡更多',
    tournamentByFinalFirst: '率先冲过终点线',
    tournamentButton: '🏅 锦标赛',
    tournamentTitle: '🏅 锦标赛',
    tournamentPlayers: '人数',
    tournamentPaste: '粘贴用户码',
    tournamentGuest: '访客',
    tournamentMe: '用我的玩家',
    tournamentAdd: '添加',
    tournamentStart: '开始',
    tournamentDuplicate: '这位玩家已经在名单里了',
    tournamentNeedName: '请先设置用户名（首页的“载入用户”）',
    tournamentGuestTag: '（访客）',
    tournamentHostTag: '（我）',
    tournamentVs: '对',
    tournamentPlay: '开赛',
    tournamentAbandon: '放弃',
    tournamentAbandonConfirm: '再点一次“放弃”结束锦标赛：不会保存任何结果',
    tournamentQuarter: '四分之一决赛',
    tournamentSemi: '半决赛',
    tournamentBronze: '铜牌赛',
    tournamentFinal: '决赛',
    tournamentPodium: '领奖台',
    tournamentNew: '再来一届',
    tournamentBracket: '赛程',
    tournamentHowTitle: '锦标赛怎么玩',
    tournamentHowBody:
      '3 到 8 名玩家在这台设备上两两比赛，淘汰制：赢了才能晋级。\n添加玩家：粘贴他们的用户码、选“访客”，或“用我的玩家”。\n每场比赛比平常短。得分高者胜；平分时撞得少的胜，再看谁率先过线的关卡更多。\n前三名登上领奖台 🥇 🥈 🥉。用用户码加入的玩家，奖牌会记到 🏅 榜上；访客不会保存。',
    tournamentGotIt: '知道了',
    dailyTitle: '🌞 每日一拉',
    dailyToday: '今日赛道：{level}',
    dailyBody: '每天只有一次机会。\n今天所有人飞同一条赛道，\n而且没有尽头：能飞多远就飞多远。\n没有玉米粒，也没有商店。\n在🌞排行榜上比分数；\n每天UTC午夜换一条新赛道。',
    dailyCreateUser: '创建用户',
    dailyPlay: '开始',
    dailyChecking: '检查中…',
    dailySeeResult: '查看今日成绩',
    dailyPractice: '练习',
    dailyNeedName: '先取一个用户名：你的分数会以这个名字记到🌞榜上。',
    dailyPracticeNote: '测试模式：练习不会保存，也不会用掉今天的机会。',
    dailyNext: '下一次每日一拉：{time}后',
    dailyOverTitle: '每日一拉 · {day}',
    dailyRank: '🏆 第{rank}名 / 共{total}人',
    dailyRankLoading: '排名…',
    dailyRankQueued: '联网后上传',
    dailyRankNameTaken: '名字已被占用',
    dailyRankRejected: '未保存',
    dailyRankUnavailable: '暂无排名',
    dailyShareText: '🌞 我在 Flappy Poop 每日一拉（{day}）拿到了 {score} 分{rank}！{url}',
    dailyShareRank: '，第{rank}名 / 共{total}人',
    dailyBoardTitle: '每日一拉',
    dailyBoardEmpty: '今天还没有人玩每日一拉',
    dailyBoardJoin: '在首页点🌞玩今天的每日一拉',
    dailyBoardYou: '你：第{rank}名 / 共{total}人 · {score}',
    tournamentSaving: '正在保存奖牌…',
    tournamentSaveSent: '奖牌已记到 🏅 榜',
    tournamentSaveLater: '奖牌已存在本设备：联网后自动上传',
    tournamentSaveRejected: '无法保存这届锦标赛的奖牌',
    tournamentSaveNone: '没有人用用户码加入：没有奖牌要保存',
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

/** How to play rows for a locale: pipe first, the pickups, levels, controls, toilet, two players, tournament, the Daily Dump, then the tray buttons left to right (ⓘ 🌐 💬 🏆 🔊 ⚙). key matches a Boot texture name or an emoji row in HowTo. */
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
    { key: 'levels', name: t(locale, 'itemLevelsName'), detail: t(locale, 'itemLevelsDetail') },
    { key: 'controls', name: t(locale, 'itemControlsName'), detail: t(locale, 'itemControlsDetail') },
    { key: 'toilet', name: t(locale, 'itemToiletName'), detail: t(locale, 'itemToiletDetail') },
    { key: 'twoPlayer', name: t(locale, 'itemTwoPlayerName'), detail: t(locale, 'itemTwoPlayerDetail') },
    { key: 'tournament', name: t(locale, 'itemTournamentName'), detail: t(locale, 'itemTournamentDetail') },
    { key: 'daily', name: t(locale, 'itemDailyName'), detail: t(locale, 'itemDailyDetail') },
    { key: 'info', name: t(locale, 'itemInfoName'), detail: t(locale, 'itemInfoDetail') },
    { key: 'language', name: t(locale, 'itemLanguageName'), detail: t(locale, 'itemLanguageDetail') },
    { key: 'feedback', name: t(locale, 'itemFeedbackName'), detail: t(locale, 'itemFeedbackDetail') },
    { key: 'leaderboard', name: t(locale, 'itemLeaderboardName'), detail: t(locale, 'itemLeaderboardDetail') },
    { key: 'sound', name: t(locale, 'itemSoundName'), detail: t(locale, 'itemSoundDetail') },
    { key: 'settings', name: t(locale, 'itemSettingsName'), detail: t(locale, 'itemSettingsDetail') },
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

/** The coin glyph and a count: "💰 12" (the shop button, the purse line, every price); a test run's endless purse reads "💰 ∞". Locale-free, like formatScore's "🚽 41". */
export function coinLabel(n) {
  return `💰 ${countText(n)}`;
}

/** A count for the coin labels: the number, or ∞ for a test run's endless purse (Infinity). */
export function countText(n) {
  return Number.isFinite(n) ? String(n) : '∞';
}

/** Short level label for the progress bar and score lines: "LV 2". */
export function levelLabel(locale, level) {
  return t(locale, 'levelShort').replace('{n}', String(level));
}

/** A match half's display name: the tournament competitor's (match.names), else "P1" / "P2" (versusPlayer). */
export function versusName(locale, match, index) {
  return match?.names?.[index] || t(locale, 'versusPlayer').replace('{n}', String(index + 1));
}

/** Pause banner as two lines joined by newline (Play splits for sizing). */
export function pauseBannerText(locale) {
  return `${t(locale, 'pauseTitle')}\n${t(locale, 'pauseHint')}`;
}

/** Small meta lines (version, Updated, haptics hint): 28px in Chinese, 24px in English (2x field). */
export function metaFontSize(locale) {
  return locale === 'zh-Hans' ? '28px' : '24px';
}

/** Ready-screen user button: "Name · 🚽 41" once a username is set, else "Load user". Either way it opens the save panel. */
export function profileButtonText(locale, state) {
  return profileLine(state) || t(locale, 'loadUserButton');
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

/** A Daily Dump day ('YYYY-MM-DD') as the locale writes a short date: "10 Nov", "11月10日" (the day itself if Intl cannot). */
export function dailyDayText(locale, day) {
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(ms)) return String(day);
  try {
    return new Intl.DateTimeFormat(isLocale(locale) && locale !== 'en' ? locale : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(ms);
  } catch {
    return String(day);
  }
}

/** The 🌞 board's footer for the player's own row: "You: #3 of 12 · 87". */
export function dailyYouText(locale, { rank, total, score }) {
  return t(locale, 'dailyBoardYou').replace('{rank}', String(rank)).replace('{total}', String(total)).replace('{score}', String(score));
}

/** The rank on a Daily Dump result: "🏆 #3 of 12" (the share text words it without the 🏆: dailyShareRank). */
export function dailyRankText(locale, { rank, total }) {
  return t(locale, 'dailyRank').replace('{rank}', String(rank)).replace('{total}', String(total));
}

/** The message shared with a Daily Dump result: the day, the score and (once known) the rank, and the link. */
export function dailyShareText(locale, { day, score = 0, rank = null, total = null, url = '' } = {}) {
  const place = Number.isInteger(rank) && Number.isInteger(total) ? t(locale, 'dailyShareRank').replace('{rank}', String(rank)).replace('{total}', String(total)) : '';
  return t(locale, 'dailyShareText')
    .replace('{day}', dailyDayText(locale, day))
    .replace('{score}', String(Number.isInteger(score) ? score : 0))
    .replace('{rank}', place)
    .replace('{url}', url)
    .trim();
}

/** The share card's footer: "Play: sielerjm.github.io/flappy-poop" (the link without https:// or a trailing slash). */
export function shareCardFooter(locale, url = '') {
  const bare = String(url).replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, '');
  return t(locale, 'shareCardPlay').replace('{url}', bare);
}

/** "Your best 🚽 41 is #23 of 150" for a player who is not on the board. */
/** The 🏅 board's footer line for the player's own row: "You: #3 · 5 tournaments". */
export function medalYouText(locale, row) {
  return t(locale, 'medalBoardYou')
    .replace('{rank}', String(row?.rank ?? 0))
    .replace('{events}', String(row?.events ?? 0));
}

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
