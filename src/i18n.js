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
    levelGateTap: "Tap 📚 to answer this break's cards before continuing.",
    shopPill: 'Shop',
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
    'level.super': 'Challenge question',
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
Card scheduling: FSRS by Open Spaced Repetition (MIT)
Thanks to Tori Schummer and Niklas Werner for help with ideation and testing
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
    itemCoinDetail: 'A golden corn kernel. Kernels go into your purse and can be redeemed for items in the shop. Tap the kernel button under the banner to open the shop in between levels.',
    itemMysteryName: 'Mystery box',
    itemMysteryDetail: 'Mystery boxes contain a random surprise item.',
    itemToiletName: 'On the toilet',
    itemToiletDetail: 'Playing on the toilet? Flip the switch under the poop on the home screen. Those scores get a 🚽 next to them.',
    itemLevelsName: 'Levels',
    itemLevelsDetail: 'The gut comes in levels: stomach, duodenum, jejunum and on, down to the rectum. Pass a checkered finish line to clear one; the game pauses for a breather before the next level. Clear the rectum and you win! The bar at the top shows how far you are.',
    itemTwoPlayerName: 'Two players',
    itemTwoPlayerDetail: 'On a wide screen, flip the 👥 switch under the toilet one and race friends side by side on the same course, two at a time. A crash costs points, not the race; first over each finish line gets +25, and the higher score wins.',
    itemTournamentName: 'Tournament',
    itemTournamentDetail: 'Every two-player session is a tournament for 2 to 8 players: two race one Final, more play a knockout bracket you can arrange before the first race. The winners take the podium (🥉 from 3 players); with 3 or more players, those who joined with their user code keep their medals on the 🏅 board.',
    itemDailyName: 'Daily Dump',
    itemDailyDetail: "Tap the 🌞 at the top of the home screen: one try a day on a course everyone shares, endless at the day's level, with no kernels. Your score goes on the 🌞 board; a new course every day at 00:00 UTC.",
    itemInfoName: 'About',
    itemInfoDetail: "The i button opens About: the credits, this guide and What's new (the update notes). Key: I.",
    itemLanguageName: 'Language',
    itemLanguageDetail: 'Switch between English and 简体中文. Key: L.',
    itemFeedbackName: 'Feedback',
    itemFeedbackDetail: 'Report a bug or suggest a feature on GitHub. Key: F.',
    itemLeaderboardName: 'Leaderboard',
    itemLeaderboardDetail: "The top 25 scores. Its 🌞 tab has today's Daily Dump, its 🏅 tab the tournament medals. Tap a name to see that player's profile. Key: T.",
    itemSettingsName: 'Settings',
    itemSettingsDetail: "Sound, haptics (Android only), the bean button's side in landscape, and Reload game to fetch the newest version. Key: S.",
    itemSoundName: 'Sound',
    itemSoundDetail: 'Mute or unmute the game. Key: M. On iPhone, Silent mode mutes the game - turn it off to hear sound.',
    itemControlsName: 'Controls',
    itemControlsDetail:
      'One player: tap or click to flap; the bean button (or the poop) farts. Keyboard: Space or ↑ flaps, B farts, P or Esc pauses. Controller: A flaps, RT farts, Menu pauses. Two players (the 👥 toggle): P1 flaps with W or Space and farts with E or Left Shift; P2 flaps with ↑ or Enter and farts with Right Shift or Numpad 0. A controller (A, RT) or a tap on your half works too. In a level break your fart button (B, RT, E…) opens and closes the shop.',
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
    quizRight: 'Right!',
    quizRightCoins: 'Right! +{n}',
    quizPaidToday: '🌽 already earned today',
    quizNextSoon: 'Next review: again soon',
    quizNextIn: 'Next review: in {t}',
    waitMin: '{n} min',
    waitHours: '{n} h',
    waitDay: '1 day',
    waitDays: '{n} days',
    waitMonth: '1 month',
    waitMonths: '{n} months',
    waitYear: '1 year',
    waitYears: '{n} years',
    quizPill: 'Quiz',
    reviewPill: 'Review',
    quizSkip: 'Skip · {n} 🌽',
    quizSkipFree: 'Skip',
    quizSkipWarn: 'Skipping costs {n} 🌽, and this card waits until tomorrow. Tap Skip again.',
    quizSkipWarnDue: 'Skipping costs {n} 🌽 and sends this card to tomorrow. Tap Skip again.',
    quizSkipNoCoins: 'Skipping costs {n} 🌽: not enough corn yet.',
    quizSkipCap: 'You have skipped {n} due cards today: answer this one, or come back tomorrow.',
    breakQuit: 'Quit',
    breakQuitSure: 'Quit? Tap again',
    breakQuitDueSure: 'Quit ungraded? Tap again',
    quizWrong: 'Not quite: the right answer has a ✓',
    quizWhy: 'Why?',
    quizNext: 'Next Card',
    quizReturn: 'End Review',
    quizKeepPracticing: 'Keep practicing',
    quizStatsTitle: 'This run',
    eduCardsTitle: 'Your cards',
    quizCountsTitle: 'Waiting in this quiz',
    eduCardsNew: '🔵 {n} new (not seen yet)',
    eduCardsMissed: '🔴 {n} missed (due now)',
    eduCardsReview: '🟢 {n} to review (due today)',
    eduCardsSeen: '👁️ Seen {n} of {total} cards',
    eduCardsDue: 'The number on 📚 = # of cards to review',
    quizCaughtUp: "You're all caught up! New cards come with the next level, and old ones come back when they are due.",
    quizCaughtUpPerDay: "You're all caught up! New cards come with the next level, up to {n} a day, and old ones come back when they are due.",
    quizCaughtUpMoreOne: "That's all this break asks! {n} more card is due: Keep practicing asks it now, or it waits for the next break.",
    quizCaughtUpMore: "That's all this break asks! {n} more cards are due: Keep practicing asks them now, or they wait for the next break.",
    quizGeneral: 'Gut microbes',
    quizSource: 'Source: {source}',
    quizLearnMore: '📄 Learn more 🔗',
    reviveHeader: 'Crashed! Answer to fly on',
    reviveStreakHeader: 'Win back your coins and power-ups',
    reviveBack: "Right! You're back in.",
    reviveChoice: 'Answer {n} more in a row to win back your coins and power-ups.',
    reviveContinue: 'Fly on',
    reviveStreakGo: 'Go for it',
    reviveRestored: 'All back: coins and power-ups!',
    reviveStreakMiss: "Missed, but you're still back in.",
    reviveOver: 'Out of tries: game over.',
    reviveEnd: 'End run',
    reviveQuit: 'Quit',
    reviveQuitSure: 'Quit? Tap again',
    reviveQuitWarn: 'Quitting ends this run, and its progress is lost. Tap Quit again to end it.',
    reviveFree: "No questions left: you're back in.",
    eduNotSaved: 'Education runs are not on the 🏆 boards',
    saveEduData: '📚 Education data',
    eduIntroTitle: '📚 Education mode',
    eduIntroBeta: 'Beta: the cards are still being checked. If one looks wrong, tap the 🚩 by its code to tell us.',
    eduWordRetired: "📚 Education mode is on the home screen for everyone now.",
    eduIntroNotMedical: "The cards are about how the gut and its microbes work. They are not medical advice.",
    splashEducation: "Education mode: quiz cards about the gut and its microbes between levels. Turn on 📚 at home.",
    itemEducationName: "Education mode",
    itemEducationDetail: "Turn on 📚 on the home screen: level breaks ask quiz cards about the gut and its microbes, and after a crash, right answers let you fly on. Cards you miss come back until you know them; right answers pay corn. Tap 📚 for how it works.",
    eduIntroHowTitle: 'How it works',
    eduIntroHowSummary: 'Answer cards at each level break and to come back from a crash. Right answers at a break earn 🌽 corn kernels.',
    eduIntroHowLevels: 'Each level break asks new cards about the part of the gut you just flew through (as many as you choose below) and up to {n} cards due for review. Answer them before you fly on; a card you miss comes back until you get it right.',
    eduIntroHowLevelsAll: 'Each level break asks new cards about the part of the gut you just flew through (as many as you choose below) and every card due for review. Answer them before you fly on; a card you miss comes back until you get it right.',
    eduIntroHowRevive: 'Crash, and a card is your way back: ❤️ three tries to get one right, then ⭐ three in a row to win back your coins and power-ups.',
    eduIntroHowSkip: 'Stuck on a card at a break? Skip it for a few 🌽 (it waits until tomorrow), or quit the run.',
    eduIntroHowCoins: "Right answers in a level break earn you corn kernels, once per card a day: 3 for a new card, 2 for a card due for review, 1 for practice or a card you missed. Cards are automatically ordered to be shown right before you're likely to forget them.",
    eduIntroChoices: 'Your choices',
    eduIntroChoicesSummary: 'Choose where you start and how new cards come up.',
    eduIntroShow: 'Show',
    eduIntroHide: 'Hide',
    eduIntroShowHint: 'Press to show more information',
    eduIntroHideHint: 'Press to hide information',
    eduIntroStart: 'Start at',
    eduIntroStartLocked: 'Reach a level in an education run to start there next time.',
    eduIntroOrder: 'New cards',
    eduOrderBefore: 'Before reviews',
    eduOrderMixed: 'Mixed in',
    eduOrderAfter: 'After reviews',
    eduOrderBeforeHint: 'New cards come first, then the missed and review cards.',
    eduOrderMixedHint: 'New cards are mixed in with the missed and review cards.',
    eduOrderAfterHint: 'New cards come once the missed and review cards are answered.',
    eduIntroPerDay: 'Up to {n} new cards a day.',
    eduIntroPerLevel: 'New cards per level',
    eduPerLevelAll: 'All',
    eduPerLevelHint: 'Each level break asks up to {n} new cards.',
    eduPerLevelAllHint: 'Each level break asks all its new cards.',
    eduIntroDevice: 'Your data is stored locally on your device in the browser, not on our servers, unless you choose to share it.',
    eduIntroKeep: 'The browser can erase it (clearing site data, or Safari after weeks without a visit), so add the game to your Home Screen and back up your cards now and then:',
    eduBackupTitle: '💾 Back up your cards',
    eduBackupBody: 'Your cards live in this browser only, and the browser can erase them. Save a copy now and then, and restore it here or on another device.',
    eduBackupCount: '{n} cards on this device.',
    eduBackupNone: 'Nothing to back up yet: answer a card first.',
    eduBackupSave: 'Back up my cards',
    eduBackupCopy: 'Copy as text',
    eduBackupShared: 'Backed up.',
    eduBackupDownloaded: 'Saved to your downloads.',
    eduBackupCancelled: 'Not backed up.',
    eduBackupFailed: 'Could not save a file here. Try Copy as text.',
    eduBackupCopied: 'Copied. Paste it somewhere safe, such as a note to yourself.',
    eduBackupCopyHere: 'Copy the text in the box below and keep it somewhere safe.',
    eduRestoreFile: 'Restore from a file',
    eduRestorePastePlaceholder: 'Or paste a backup here',
    eduRestorePaste: 'Restore pasted text',
    eduRestoreGoHome: 'Restore works on the home screen: close this and go home first.',
    eduRestoreDone: 'Restored. New cards: {added}. Updated: {updated}. New badges: {badges}.',
    eduRestoreNothing: 'Nothing new: this device already has these cards.',
    eduRestoreProgress: 'Restored: no new cards, but your learning streak, levels or grades are brought up to date.',
    eduRestoreSkipped: '{n} cards in the backup could not be read.',
    eduRestoreVisitOnly: 'This browser is not saving data, so the restore lasts for this visit only.',
    eduRestoreBad: 'That is not a Flappy Poop card backup.',
    eduRestoreNewer: 'This backup is from a newer version of the game. Reload the game, then try again.',
    eduRestoreTooBig: 'That file is too big to be a card backup.',
    eduIntroPlay: 'Play',
    eduIntroClose: 'Close',
    eduDataTitle: '📚 Education data',
    eduDataIntro: 'Education mode keeps your answers, grades and badges on this device. Nothing leaves it unless you choose to share below.',
    eduDataReport: "Report a wrong card, a broken link, or an idea for a card",
    eduDataInvite: "Sharing your grades and joining the tester data are by invitation. Type the invite code you were given, or open your invite link.",
    eduShareNeedInvite: "Sharing is by invitation: type the invite code you were given above.",
    eduDataAdult: 'I am 18 or older',
    eduShareTitle: 'Share my grades',
    eduShareBody: 'Puts your username, your average grade, the number of graded runs and your education badges on the 📚 board, which every player can see. Your answers are not shared, and this is not research. Stopping deletes it from the board at once.',
    eduShareOn: 'Sharing is on.',
    eduShareOff: 'Sharing is off.',
    eduShareStop: 'Stop sharing',
    eduShareNeedName: 'Save a username first: tap the user button on the home screen.',
    eduShareNeedAdult: 'Sharing is for adults: tick the box if you are 18 or older.',
    eduShareClosed: 'Sharing is not open yet. It opens soon.',
    eduShareNameTaken: 'Another player holds this username. Pick another one, or load your user code.',
    eduShareOffline: "Couldn't reach the board. Try again in a moment.",
    eduShareStarted: 'Your grades are going to the 📚 board.',
    eduShareStopped: 'Sharing stopped: your grades are off the board.',
    eduShareStopOffline: "Couldn't reach the board, so your grades are still on it. Try again.",
    eduBoardTitle: 'EDUCATION',
    eduBoardGrade: 'Grade',
    eduBoardRuns: 'Runs',
    eduBoardEmpty: 'No grades shared yet',
    eduBoardYou: 'You: #{rank} of {total} · {grade} %',
    eduBoardShare: 'Share my grades to join ›',
    eduBoardMore: '{n} more graded runs to appear on the board',
    eduBoardQueued: 'Your grades are on their way to the board',
    statsEduShared: 'On the 📚 board',
    statsEduSharedOn: 'Shared ›',
    statsEduSharedOff: 'Not shared ›',
    eduPilotTitle: '🔬 Tester data',
    eduPilotBody: 'For invited testers. This tests the tools only: no research is being done with it. Your answers are not analysed, and they are deleted before any study starts. If you join, each answer you give in education mode is sent (the card, what you picked, right or wrong, how long it took) under a random id, never your username.',
    eduPilotMore: 'What is collected, and how to withdraw',
    eduPilotCode: 'Invite code',
    eduPilotJoin: 'Join',
    eduPilotOn: 'You are in the tester pilot.',
    eduPilotOff: 'You are not in the tester pilot.',
    eduPilotStale: 'The notice changed: join again to keep sending, or withdraw.',
    eduPilotLeave: 'Withdraw and delete my data',
    eduPilotNeedAdult: 'The pilot is for adults: tick the box if you are 18 or older.',
    eduPilotNeedCode: 'Type the invite code you were given.',
    eduPilotBadCode: 'That code is not right.',
    eduPilotClosed: 'The pilot is not open at the moment.',
    eduPilotOffline: "Couldn't reach the server. Try again in a moment.",
    eduPilotJoined: 'You are in: answers you give from now on are sent.',
    eduPilotLeft: 'Withdrawn: your answers were deleted from the server.',
    eduPilotLeaveOffline: "Couldn't reach the server, so your answers are still there. Try again.",
    eduPilotEnded: 'The server no longer has you in the pilot: this device stopped sending.',
    statsEduPilot: 'Tester pilot',
    statsEduPilotOn: 'Joined ›',
    saveClearNoteShared: 'Your shared grades stay on the 📚 board until you stop sharing in 📚 Education data.',
    saveClearNotePilot: 'The answers you sent as a tester stay on the server until you withdraw in 📚 Education data.',
    saveClearNoteCards: 'Your 📚 cards on this device go too: back them up first in 📚 Education data.',
    saveWelcome: 'Welcome back, {name} — {scores}',
    saveWelcomeNoScores: 'Welcome back, {name}',
    saveNameRequired: 'Enter a username first (4–16 characters)',
    saveErrorDamaged: 'Save code is damaged or was edited',
    saveErrorUnrecognised: 'Unrecognised save code',
    shareButton: 'Share',
    shareCardPlay: 'Play: {url}',
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
    saveLeaderboardNote: 'Your username, scores, stats and achievements are public',
    loadUserButton: 'Load user',
    versusTitle: '2 PLAYERS',
    versusPlayer: 'P{n}',
    versusJoinPrompt: 'press your flap button',
    versusJoinReady: 'ready!',
    versusJoinHint: 'Keyboard: W / Space or ↑ / Enter · a controller · tap your half',
    versusGo: 'GO!',
    versusWins: '{name} WINS!',
    versusDraw: 'DRAW',
    versusNotSaved: 'Races are not saved to the 🏆 board',
    versusEscaped: 'Made it out!',
    versusWaiting: 'Waiting for {name}…',
    versusTapReady: 'Tap when ready',
    versusReadyWaiting: 'Ready! Waiting for {name}…',
    versusUnreadyHint: 'Tap again to un-ready',
    tournamentContinue: 'Continue',
    tournamentByDeaths: 'Fewer crashes',
    tournamentByLevelWins: 'More finish lines first',
    tournamentByFinalFirst: 'First across the line',
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
      '2 to 8 players race two at a time on this screen, knockout style: win to move on. Two players race one Final.\nAdd each player by pasting their user code, as a guest, or with your own player. Before the first race, drag a player, use ↑ ↓ or 🎲 to choose who meets whom.\nRaces are shorter than a normal run. The higher score wins; a tie goes to fewer crashes, then more finish lines crossed first, then whoever crossed the last line first. When both players wait at a finish line, 🏅 Bracket shows the draw.\nThe winners take the podium 🥇 🥈 (and 🥉 from 3 players). With 3 or more players, those who joined with their user code get their medals on the 🏅 board; guests aren\'t saved.',
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
    dailyBoardTitle: 'DAILY DUMP',
    dailyBoardEmpty: "No one has played today's Daily Dump yet",
    dailyBoardJoin: "Play today's Daily Dump from the 🌞 on the home screen",
    dailyBoardYou: 'You: #{rank} of {total} · {score}',
    tournamentSaving: 'Saving medals…',
    tournamentSaveSent: 'Medals saved to the 🏅 board',
    tournamentSaveLater: 'Medals saved on this device: they post when you\'re online',
    tournamentSaveRejected: 'Couldn\'t save this tournament\'s medals',
    tournamentSaveNone: 'No one joined with a user code: no medals to save',
    tournamentSeedHint: 'Drag a player or use ↑ ↓ to choose who meets whom',
    tournamentShuffle: '🎲 Shuffle',
    tournamentMoveUp: 'Move up',
    tournamentMoveDown: 'Move down',
    tournamentBye: 'bye: goes straight through',
    tournamentBack: 'Back to the race',
    tournamentBracketPill: '🏅 Bracket',
    tournamentSaveTwo: "Two-player tournaments aren't saved to the 🏅 board",
    achScore10: 'Tiny Plop',
    achScore100: 'Century Stool',
    achScore250: 'On a Roll',
    achScore500: 'Express Transit',
    achScore1000: 'Royal Flush',
    achWin: 'Made It Out',
    achToiletWin: 'Porcelain Throne',
    achGames: 'Regular',
    achDeaths: 'Thousand Flushes',
    achFarts: 'Windbreaker',
    achSuperFarts: 'Rainbow Blast',
    achFiber: 'Fiber Fanatic',
    achProbiotic: 'Probiotic Pro',
    achPostbiotic: 'Postbiotic Alchemist',
    achBacteria: 'Germ Magnet',
    achBeans: 'Bean Counter',
    achMystery: 'Unboxer',
    achCoins: 'Corn Hoarder',
    achDescScore: 'Score {n} in one run',
    achDescLevel: 'Reach level {n} in one run',
    achDescWin: 'Clear the rectum and make it out',
    achDescToiletWin: 'Make it out with toilet mode on',
    achDescGames: 'Play {n} runs (Daily Dumps count)',
    achDescDeaths: 'Crash {n} times',
    achDescFarts: 'Fart {n} times',
    achDescSuperFarts: 'Fire {n} super farts',
    achDescCollect: 'Collect {n} {glyph}',
    achDescBacteria: 'Bump into {n} 🦠',
    achDescPostbiotic: 'Make {n} postbiotics ✨',
    achDescMystery: 'Open {n} mystery boxes 📦',
    overBadges: '🏆 New: {badges}',
    overBadgesMore: '+{n}',
    statsSingle: 'Singleplayer',
    statsGames: 'Games played',
    statsWins: 'Made it out',
    statsMaxLevel: 'Highest level',
    statsAvgLevel: 'Average level',
    statsAvgScore: 'Average score',
    statsDaily: 'Daily Dump 🌞',
    statsDumps: 'Daily Dumps played',
    statsPodiums: 'Podiums',
    statsTournament: 'Tournaments 🏅',
    statsEvents: 'Tournaments played',
    statsMedals: 'Medals',
    statsRival: 'Biggest rival',
    statsRivalLine: '{name} · lost {losses} of {meetings}',
    statsCareer: 'Career',
    statsAchievements: 'Achievements {n} / {total}',
    statsAchievementsOther: 'Achievements ({n})',
    statsNoBadges: 'No achievements yet',
    statsTapBadge: 'Tap an emoji or a badge to see what it is',
    statsEarned: 'earned {day}',
    statsQuestOpen: 'open until {day}',
    statsNotFound: 'No stats for {name} yet',
    statsOfflineOwn: "Offline: this device's numbers only",
    saveProfile: '👤 Profile',
    statsBestScore: 'Highest score',
    careerPipes: 'Number of pipes passed',
    careerFarts: 'Every bean power you fired, super farts included',
    careerSuperFarts: 'Super farts (three beans in the bag)',
    careerFiber: 'Fiber eaten',
    careerProbiotic: 'Probiotics picked up',
    careerPostbiotic: 'Postbiotic (Probiotic + Fiber)',
    careerBacteria: 'Bad bacteria bumped into',
    careerBean: 'Beans collected',
    careerMystery: 'Mystery boxes opened',
    careerCoin: 'Corn kernels (coins)',
    careerDeaths: 'Deaths',
    statsCardTotal: 'Total: {n}',
    statsGateTitle: 'Profiles 👤',
    statsGateBody: 'Create a user to see profiles: stats, medals and achievements. Your runs are already counting.',
    // The loading splash (src/splash.js): its labels, then one note card per SPLASH_NOTES entry.
    splashTip: 'TIP',
    splashNew: 'NEW',
    splashLoading: 'Loading…',
    splashContinue: 'Continue',
    splashPrev: 'Previous card',
    splashNext: 'Next card',
    splashProfile: 'Your profile shows your stats and achievements. Tap a name on the leaderboard to see theirs.',
    splashDaily: 'Daily Dump: one try a day on the same course as everyone.',
    splashTournament: 'Tournaments: up to 8 players, one bracket, one device.',
    splashShop: 'Spend corn kernels in the shop between levels.',
    splashFiber: 'Fiber is worth +3. Grab it between pipes.',
    splashBacteria: 'Bad bacteria cost 3 points.',
    splashProbiotic: 'A probiotic blocks one bad bacteria hit for 5 pipes.',
    splashPostbiotic: 'Eat fiber while a probiotic is up: pipes and fiber score ×2.',
    splashBean: 'A bean charges a fart. You can carry three.',
    splashFart: 'Tap the poop or the bean button to fart past 5 pipes.',
    splashSuperFart: 'Three beans make a super fart: 20 pipes, and you cannot die.',
    splashMystery: 'Mystery boxes contain random objects with different probabilities.',
    splashCoin: 'Corn kernels are coins. They last one run, so spend them.',
    splashToilet: 'Playing on the toilet? Turn on Toilet mode. The leaderboard keeps your best on and off the toilet.',
    splashRectum: "Level 7 is the rectum. Cross the finish line to 'make it out'.",
    splashLeaderboard: 'The leaderboard shows the Top 25, with tabs for the Daily Dump 🌞 and tournaments 🏅.',
    splashTwoPlayer: 'Toggle 👥 on to play multiplayer mode up to 8 players.',
    splashUserCode: 'Your user code moves your name and scores to another phone.',
    splashController: 'On desktop, you can play with a game controller.',
    splashLowPower: 'Battery saver mode or low power mode can impact game performance.',
    careerFalls: 'Long falls',
    careerCloseCalls: 'Close calls',
    overCardRun: 'This run: {n}',
    achSkyDiver: 'Sky Diver',
    achCloseShave: 'Close Shave',
    achIbs: 'IBS',
    achConstipated: 'Constipated',
    achIcarus: 'Icarus',
    achFourOfAKind: 'Four of a Kind',
    achGambling: "Let's Go Gambling",
    achDescFalls: 'Free fall {n} times',
    achDescCloseShave: 'In one level, have as many close calls as it has pipes',
    achDescIbs: 'Make it out more than 21 times in 7 days',
    achDescConstipated: 'Play again after a week-long break',
    achDescCeiling: 'Hit the ceiling {n} times',
    achDescFourOfAKind: 'Open four mystery boxes in a row with the same reward',
    achDescBoxesBought: 'Buy {n} mystery boxes in the shop',
    achEduNerd: 'Nerd Alert',
    achEduPerfect: 'Full Marks',
    achEduA: 'A Student',
    achEduB: 'B Student',
    achEduC: "C's Get Degrees",
    achEduDropOut: 'Drop Out',
    achEduAngel: 'Angel Baby',
    achEduPhoenix: 'Phoenix',
    achDescEduNerd: 'Make it out with every answer right and no cards left to review ({min} answers or more)',
    achDescEduPerfect: 'Answer everything right in a run you win from level 1 ({min} answers or more)',
    achDescEduA: 'Get 90% or more right in one run ({min} answers or more, without quitting)',
    achDescEduB: 'Get 80–89% right in one run ({min} answers or more, without quitting)',
    achDescEduC: 'Get 70–79% right in one run ({min} answers or more, without quitting)',
    achDescEduDropOut: 'Quit a run without answering a single question',
    achDescEduRevives: 'Revive yourself {n} times in education mode',
    statsEducation: '📚 Education {n} / {total}',
    statsEduGrade: 'Average grade',
    statsEduRuns: 'Graded runs',
    statsEduStreak: '🔥 Learning streak',
    statsStreakNow: '🔥 Current streak',
    statsStreakBest: '❤️‍🔥 Longest streak',
    statsEduBest: '❤️‍🔥 Longest streak',
    statsEduLevel: 'Highest level unlocked',
    careerDethroned: 'Dethroned: took 1st place from someone',
    tagDev: 'Game dev',
    tagDevDesc: 'Makes Flappy Poop',
    tagOg: 'First month',
    tagOgDesc: "Played in the game's first month, November 2026",
    tagNew: 'New player',
    tagNewDesc: 'Joined in the last 7 days',
  },
  'zh-Hans': {
    readyTitle: 'FLAPPY POOP',
    howToPlay: '玩法说明',
    pauseTitle: '已暂停',
    pauseHint: '点击任意处继续游戏',
    levelBanner: '第 {n} 关',
    levelContinue: '点击继续',
    levelGateTap: '先点 📚 答完这次休息的卡片，才能继续。',
    shopPill: '商店',
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
    'level.super': '挑战题',
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
卡片复习安排：FSRS，Open Spaced Repetition（MIT）
感谢 Tori Schummer 和 Niklas Werner 协助构思和测试
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
    itemCoinDetail: '金黄的玉米粒。玉米粒会进入钱袋，可在商店兑换物品。关卡之间点击横幅下方的玉米粒按钮打开商店。',
    itemMysteryName: '神秘盒子',
    itemMysteryDetail: '神秘盒子里装有随机惊喜道具。',
    itemToiletName: '如厕模式',
    itemToiletDetail: '在马桶上玩？打开主界面便便下方的开关，这些分数旁会显示 🚽。',
    itemLevelsName: '关卡',
    itemLevelsDetail: '肠道分成关卡：胃、十二指肠、空肠……一直到直肠。越过黑白格终点线即可过关；游戏会稍作停顿再进入下一关。通过直肠就赢了！顶部的进度条显示你走到了哪里。',
    itemTwoPlayerName: '双人模式',
    itemTwoPlayerDetail: '在宽屏上，打开马桶开关下方的👥开关，和朋友两两在同一条赛道上并排比赛。撞到只会扣分，不会输掉比赛；率先冲过每条终点线得25分，最后分高者胜。',
    itemTournamentName: '锦标赛',
    itemTournamentDetail: '双人模式总是锦标赛，支持2到8名玩家：两人只比一场决赛，更多玩家进行淘汰赛，第一场比赛前可以调整对阵。胜者登上领奖台（3名或以上玩家时才有🥉）；3名或以上玩家时，用用户码加入的玩家奖牌会记到🏅榜上。',
    itemDailyName: '每日一拉',
    itemDailyDetail: '点首页顶部的🌞：每天一次机会，所有人飞同一条赛道，按当天的关卡一直飞下去，没有玉米粒。分数记到🌞榜上；每天UTC 00:00换新赛道。',
    itemInfoName: '关于',
    itemInfoDetail: 'i按钮打开“关于”：制作名单、本玩法说明和更新说明。按键：I。',
    itemLanguageName: '语言',
    itemLanguageDetail: '在English和简体中文之间切换。按键：L。',
    itemFeedbackName: '反馈',
    itemFeedbackDetail: '在GitHub上报告问题或提出功能建议。按键：F。',
    itemLeaderboardName: '排行榜',
    itemLeaderboardDetail: '前25名的成绩。🌞页是今天的每日一拉，🏅页是锦标赛奖牌榜。点名字可查看该玩家的资料。按键：T。',
    itemSettingsName: '设置',
    itemSettingsDetail: '音效、震动（仅限Android）、横屏时豆子按钮的位置，以及“刷新游戏”获取最新版本。按键：S。',
    itemSoundName: '声音',
    itemSoundDetail: '静音或取消静音。按键：M。 iPhone需关闭静音模式才有声音。',
    itemControlsName: '操作方式',
    itemControlsDetail:
      '单人：点击起飞；按豆子按钮（或便便）放屁。键盘：空格或 ↑ 起飞，B 放屁，P 或 Esc 暂停。手柄：A 起飞，RT 放屁，Menu 暂停。双人模式（👥 开关）：玩家 1 用 W 或空格起飞、E 或左 Shift 放屁；玩家 2 用 ↑ 或回车起飞、右 Shift 或小键盘 0 放屁。也可以用手柄（A、RT）或点击你这一侧。过关休息时，放屁键（B、RT、E 等）可打开或关闭商店。',
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
    quizRight: '答对了！',
    quizRightCoins: '答对了！+{n}',
    quizPaidToday: '🌽 今天已经得过了',
    quizNextSoon: '下次复习：很快',
    quizNextIn: '下次复习：{t}后',
    waitMin: '{n} 分钟',
    waitHours: '{n} 小时',
    waitDay: '1 天',
    waitDays: '{n} 天',
    waitMonth: '1 个月',
    waitMonths: '{n} 个月',
    waitYear: '1 年',
    waitYears: '{n} 年',
    quizPill: '答题',
    reviewPill: '复习',
    quizSkip: '跳过 · {n} 🌽',
    quizSkipFree: '跳过',
    quizSkipWarn: '跳过要花 {n} 🌽，这张卡片会等到明天。再点一次“跳过”。',
    quizSkipWarnDue: '跳过要花 {n} 🌽，这张卡片会推到明天。再点一次“跳过”。',
    quizSkipNoCoins: '跳过要花 {n} 🌽：玉米粒还不够。',
    quizSkipCap: '今天已经跳过 {n} 张到期的卡片：答这一张，或者明天再来。',
    breakQuit: '结束',
    breakQuitSure: '结束？再点一次',
    breakQuitDueSure: '不计成绩结束？再点一次',
    quizWrong: '不太对：正确答案标有 ✓',
    quizWhy: '为什么？',
    quizNext: '下一张',
    quizReturn: '结束复习',
    quizKeepPracticing: '继续练习',
    quizStatsTitle: '本局',
    eduCardsTitle: '你的卡片',
    quizCountsTitle: '本次答题还剩',
    eduCardsNew: '🔵 {n} 张新卡（还没见过）',
    eduCardsMissed: '🔴 {n} 张答错（现在到期）',
    eduCardsReview: '🟢 {n} 张待复习（今天到期）',
    eduCardsSeen: '👁️ 已见过 {n} / {total} 张卡片',
    eduCardsDue: '📚 上的数字 = 待复习的卡片数',
    quizCaughtUp: '全部完成！下一关会有新卡片，旧卡片到期后会再出现。',
    quizCaughtUpPerDay: '全部完成！下一关会有新卡片（每天最多 {n} 张），旧卡片到期后会再出现。',
    quizCaughtUpMoreOne: '这次休息的卡片答完了！还有 {n} 张到期的卡片：点“继续练习”现在回答，或者留到下次休息。',
    quizCaughtUpMore: '这次休息的卡片答完了！还有 {n} 张到期的卡片：点“继续练习”现在回答，或者留到下次休息。',
    quizGeneral: '肠道微生物',
    quizSource: '来源：{source}',
    quizLearnMore: '📄 了解更多 🔗',
    reviveHeader: '撞到了！答对继续飞',
    reviveStreakHeader: '赢回金币和道具',
    reviveBack: '答对了！可以继续飞了。',
    reviveChoice: '再连续答对 {n} 题，赢回金币和道具。',
    reviveContinue: '继续飞',
    reviveStreakGo: '试试看',
    reviveRestored: '金币和道具全部找回！',
    reviveStreakMiss: '没答对，但你仍可继续飞。',
    reviveOver: '机会用完了：游戏结束。',
    reviveEnd: '结束本局',
    reviveQuit: '结束',
    reviveQuitSure: '结束？再点一次',
    reviveQuitWarn: '结束会终止这一局，本局的进度也会丢失。再点一次“结束”即可。',
    reviveFree: '没有题了：可以继续飞了。',
    eduNotSaved: '教育模式的成绩不上 🏆 排行榜',
    saveEduData: '📚 教育数据',
    eduIntroTitle: '📚 教育模式',
    eduIntroBeta: '测试版：卡片仍在核对中。如果发现有误，请点卡片编号旁的 🚩 告诉我们。',
    eduWordRetired: "📚 教育模式现在对所有人开放，就在主屏幕上。",
    eduIntroNotMedical: "这些卡片讲的是肠道和肠道微生物如何运作，不是医疗建议。",
    splashEducation: "教育模式：关卡之间回答关于肠道和肠道微生物的问题。在主页打开 📚。",
    itemEducationName: "教育模式",
    itemEducationDetail: "在主屏幕打开 📚：关卡休息时会问关于肠道和肠道微生物的问题；撞到之后，答对就能继续飞。答错的卡片会再出现，直到你记住；答对能得玉米粒。点 📚 看玩法说明。",
    eduIntroHowTitle: '玩法',
    eduIntroHowSummary: '每次关卡休息时回答卡片，撞到后也靠答对卡片继续。休息时答对能赚 🌽 玉米粒。',
    eduIntroHowLevels: '每次关卡休息时，会问你刚飞过的那段肠道的新卡片（数量在下面选），以及最多 {n} 张到期要复习的卡片。答完才能继续飞；答错的卡片会再出现，直到答对。',
    eduIntroHowLevelsAll: '每次关卡休息时，会问你刚飞过的那段肠道的新卡片（数量在下面选），以及所有到期要复习的卡片。答完才能继续飞；答错的卡片会再出现，直到答对。',
    eduIntroHowRevive: '撞到了？答对卡片就能继续：❤️ 有三次机会答对一张，然后连续答对 ⭐ 三张，就能赢回金币和道具。',
    eduIntroHowSkip: '在休息时卡在一张卡片上？花几个 🌽 跳过它（它会等到明天），或者结束这一局。',
    eduIntroHowCoins: '在关卡休息时答对会得到玉米粒，每张卡片每天一次：新卡片 3 粒，到期复习的卡片 2 粒，练习或答错过的卡片 1 粒。卡片会自动排序，在你快要忘记之前出现。',
    eduIntroChoices: '你的选择',
    eduIntroChoicesSummary: '选择从哪一关开始，以及新卡片怎么出现。',
    eduIntroShow: '显示',
    eduIntroHide: '隐藏',
    eduIntroShowHint: '点击显示更多信息',
    eduIntroHideHint: '点击隐藏信息',
    eduIntroStart: '从这一关开始',
    eduIntroStartLocked: '在教育模式中到达某一关后，下次就能从那里开始。',
    eduIntroOrder: '新卡片',
    eduOrderBefore: '先学新卡',
    eduOrderMixed: '穿插',
    eduOrderAfter: '先复习',
    eduOrderBeforeHint: '新卡片先出现，然后是答错卡和待复习卡。',
    eduOrderMixedHint: '新卡片和答错卡、待复习卡穿插出现。',
    eduOrderAfterHint: '答完答错卡和待复习卡之后，才会出现新卡片。',
    eduIntroPerDay: '每天最多 {n} 张新卡片。',
    eduIntroPerLevel: '每关新卡片',
    eduPerLevelAll: '全部',
    eduPerLevelHint: '每次关卡休息最多问 {n} 张新卡片。',
    eduPerLevelAllHint: '每次关卡休息会问这一关的所有新卡片。',
    eduIntroDevice: '你的数据保存在这台设备的浏览器里，不在我们的服务器上，除非你选择分享。',
    eduIntroKeep: '浏览器可能会清除它（清除网站数据，或 Safari 在几周未访问后），所以请把游戏添加到主屏幕，并不时备份你的卡片：',
    eduBackupTitle: '💾 备份你的卡片',
    eduBackupBody: '你的卡片只保存在这个浏览器里，浏览器可能会清除它们。请不时保存一份副本，可以在这里或另一台设备上恢复。',
    eduBackupCount: '这台设备上有 {n} 张卡片。',
    eduBackupNone: '还没有可备份的内容：先答一张卡片吧。',
    eduBackupSave: '备份我的卡片',
    eduBackupCopy: '复制为文本',
    eduBackupShared: '已备份。',
    eduBackupDownloaded: '已保存到下载文件夹。',
    eduBackupCancelled: '未备份。',
    eduBackupFailed: '这里无法保存文件。试试“复制为文本”。',
    eduBackupCopied: '已复制。请把它粘贴到安全的地方，比如给自己的备忘录。',
    eduBackupCopyHere: '请复制下面框里的文本，保存在安全的地方。',
    eduRestoreFile: '从文件恢复',
    eduRestorePastePlaceholder: '或在这里粘贴备份',
    eduRestorePaste: '恢复粘贴的文本',
    eduRestoreGoHome: '只能在主屏幕恢复：请先关闭这里，回到主屏幕。',
    eduRestoreDone: '已恢复。新卡片：{added}。已更新：{updated}。新徽章：{badges}。',
    eduRestoreNothing: '没有新内容：这台设备已经有这些卡片。',
    eduRestoreProgress: '已恢复：没有新卡片，但你的学习连续天数、关卡或成绩已更新。',
    eduRestoreSkipped: '备份中有 {n} 张卡片无法读取。',
    eduRestoreVisitOnly: '这个浏览器不保存数据，所以这次恢复只在本次访问中有效。',
    eduRestoreBad: '这不是 Flappy Poop 的卡片备份。',
    eduRestoreNewer: '这个备份来自更新版本的游戏。请重新加载游戏后再试。',
    eduRestoreTooBig: '这个文件太大，不是卡片备份。',
    eduIntroPlay: '开始',
    eduIntroClose: '关闭',
    eduDataTitle: '📚 教育数据',
    eduDataIntro: '教育模式的答题记录、成绩和徽章都保存在这台设备上。除非你在下面选择分享，否则不会离开设备。',
    eduDataReport: "报告卡片错误、链接失效，或提出新卡片的想法",
    eduDataInvite: "分享成绩和参加测试者数据都需要邀请。请输入你收到的邀请码，或打开你的邀请链接。",
    eduShareNeedInvite: "分享需要邀请：请在上方输入你收到的邀请码。",
    eduDataAdult: '我已年满 18 岁',
    eduShareTitle: '分享我的成绩',
    eduShareBody: '把你的用户名、平均成绩、计分局数和教育徽章放到 📚 排行榜上，所有玩家都能看到。不会分享你的具体答题，这也不是研究。停止分享会立即从榜上删除。',
    eduShareOn: '正在分享。',
    eduShareOff: '未分享。',
    eduShareStop: '停止分享',
    eduShareNeedName: '请先保存用户名：点首页的用户按钮。',
    eduShareNeedAdult: '仅限成年人分享：如果你已年满 18 岁，请勾选上面的选项。',
    eduShareClosed: '分享功能尚未开放，敬请期待。',
    eduShareNameTaken: '这个用户名已被其他玩家使用。请换一个，或载入你的用户码。',
    eduShareOffline: '无法连接排行榜，请稍后再试。',
    eduShareStarted: '你的成绩正在上传到 📚 排行榜。',
    eduShareStopped: '已停止分享：你的成绩已从榜上删除。',
    eduShareStopOffline: '无法连接排行榜，你的成绩仍在榜上。请再试一次。',
    eduBoardTitle: '教育榜',
    eduBoardGrade: '成绩',
    eduBoardRuns: '局数',
    eduBoardEmpty: '还没有人分享成绩',
    eduBoardYou: '你：第{rank}名 / 共{total}人 · {grade} %',
    eduBoardShare: '分享我的成绩即可上榜 ›',
    eduBoardMore: '再完成 {n} 局计分局即可上榜',
    eduBoardQueued: '你的成绩正在上传',
    statsEduShared: '在 📚 榜上',
    statsEduSharedOn: '已分享 ›',
    statsEduSharedOff: '未分享 ›',
    eduPilotTitle: '🔬 测试数据',
    eduPilotBody: '仅限受邀测试者。这只是在测试工具：不会用它做任何研究。你的答题不会被分析，并会在任何研究开始前删除。加入后，你在教育模式里的每次答题（哪张卡片、你选了什么、对或错、用时多久）都会以随机编号发送，绝不带你的用户名。',
    eduPilotMore: '收集哪些内容，以及如何退出',
    eduPilotCode: '邀请码',
    eduPilotJoin: '加入',
    eduPilotOn: '你已加入测试。',
    eduPilotOff: '你未加入测试。',
    eduPilotStale: '测试说明已更新：重新加入以继续发送，或退出。',
    eduPilotLeave: '退出并删除我的数据',
    eduPilotNeedAdult: '测试仅限成年人：如果你已年满 18 岁，请勾选上面的选项。',
    eduPilotNeedCode: '请输入你收到的邀请码。',
    eduPilotBadCode: '邀请码不正确。',
    eduPilotClosed: '测试目前未开放。',
    eduPilotOffline: '无法连接服务器，请稍后再试。',
    eduPilotJoined: '已加入：从现在起你的答题会被发送。',
    eduPilotLeft: '已退出：你的答题已从服务器删除。',
    eduPilotLeaveOffline: '无法连接服务器，你的答题仍在服务器上。请再试一次。',
    eduPilotEnded: '服务器上已没有你的测试记录：此设备已停止发送。',
    statsEduPilot: '测试计划',
    statsEduPilotOn: '已加入 ›',
    saveClearNoteShared: '你分享的成绩会留在 📚 榜上，除非先在“📚 教育数据”里停止分享。',
    saveClearNotePilot: '你作为测试者发送的答题会留在服务器上，除非先在“📚 教育数据”里退出测试。',
    saveClearNoteCards: '这台设备上的 📚 卡片也会被清除：请先在“📚 教育数据”里备份。',
    saveWelcome: '欢迎回来，{name}——{scores}',
    saveWelcomeNoScores: '欢迎回来，{name}',
    saveNameRequired: '请先输入用户名（4–16 个字符）',
    saveErrorDamaged: '存档码已损坏或被修改',
    saveErrorUnrecognised: '无法识别的存档码',
    shareButton: '分享',
    shareCardPlay: '来玩：{url}',
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
    saveLeaderboardNote: '你的用户名、成绩、统计数据和成就都是公开的',
    loadUserButton: '载入用户',
    versusTitle: '双人模式',
    versusPlayer: '玩家{n}',
    versusJoinPrompt: '按下你的起飞键',
    versusJoinReady: '准备好了！',
    versusJoinHint: '键盘：W / 空格 或 ↑ / 回车 · 手柄 · 点击你这一侧',
    versusGo: '出发！',
    versusWins: '{name} 获胜！',
    versusDraw: '平局',
    versusNotSaved: '比赛分数不会记到 🏆 榜上',
    versusEscaped: '顺利排出！',
    versusWaiting: '等待{name}…',
    versusTapReady: '准备好了就点一下',
    versusReadyWaiting: '已准备！等待{name}…',
    versusUnreadyHint: '再点一次可取消准备',
    tournamentContinue: '继续',
    tournamentByDeaths: '撞得更少',
    tournamentByLevelWins: '率先过线的关卡更多',
    tournamentByFinalFirst: '率先冲过终点线',
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
      '2 到 8 名玩家在这台设备上两两比赛，淘汰制：赢了才能晋级。两名玩家只比一场决赛。\n添加玩家：粘贴他们的用户码、选“访客”，或“用我的玩家”。第一场比赛前，拖动玩家、用 ↑ ↓ 或 🎲 决定谁对谁。\n每场比赛比平常短。得分高者胜；平分时撞得少的胜，再看谁率先过线的关卡更多，最后看谁先冲过最后一条终点线。两人都在终点线等候时，点 🏅 赛程 可查看对阵。\n胜者登上领奖台 🥇 🥈（3 名或以上玩家时还有 🥉）。3 名或以上玩家时，用用户码加入的玩家，奖牌会记到 🏅 榜上；访客不会保存。',
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
    dailyBoardTitle: '每日一拉',
    dailyBoardEmpty: '今天还没有人玩每日一拉',
    dailyBoardJoin: '在首页点🌞玩今天的每日一拉',
    dailyBoardYou: '你：第{rank}名 / 共{total}人 · {score}',
    tournamentSaving: '正在保存奖牌…',
    tournamentSaveSent: '奖牌已记到 🏅 榜',
    tournamentSaveLater: '奖牌已存在本设备：联网后自动上传',
    tournamentSaveRejected: '无法保存这届锦标赛的奖牌',
    tournamentSaveNone: '没有人用用户码加入：没有奖牌要保存',
    tournamentSeedHint: '拖动玩家或用 ↑ ↓ 决定谁对谁',
    tournamentShuffle: '🎲 重新抽签',
    tournamentMoveUp: '上移',
    tournamentMoveDown: '下移',
    tournamentBye: '轮空：直接晋级',
    tournamentBack: '回到比赛',
    tournamentBracketPill: '🏅 赛程',
    tournamentSaveTwo: '双人锦标赛不会记到 🏅 榜上',
    achScore10: '小小一坨',
    achScore100: '百分便便',
    achScore250: '势如破竹',
    achScore500: '一泻千里',
    achScore1000: '王者冲水',
    achWin: '成功脱出',
    achToiletWin: '马桶王座',
    achGames: '规律达人',
    achDeaths: '千次冲走',
    achFarts: '放屁大王',
    achSuperFarts: '彩虹屁',
    achFiber: '纤维狂热',
    achProbiotic: '益生菌达人',
    achPostbiotic: '后生元炼金师',
    achBacteria: '细菌磁铁',
    achBeans: '数豆达人',
    achMystery: '开箱达人',
    achCoins: '玉米囤囤',
    achDescScore: '单局得分达到 {n}',
    achDescLevel: '单局到达第 {n} 关',
    achDescWin: '通过直肠，成功脱出',
    achDescToiletWin: '开启马桶模式并成功脱出',
    achDescGames: '游玩 {n} 局（每日一拉也算）',
    achDescDeaths: '撞毁 {n} 次',
    achDescFarts: '放屁 {n} 次',
    achDescSuperFarts: '放出 {n} 次超级屁',
    achDescCollect: '收集 {n} 个 {glyph}',
    achDescBacteria: '碰到 {n} 个 🦠',
    achDescPostbiotic: '制造 {n} 次后生元 ✨',
    achDescMystery: '打开 {n} 个神秘盒子 📦',
    overBadges: '🏆 新成就：{badges}',
    overBadgesMore: '等另外 {n} 个',
    statsSingle: '单人模式',
    statsGames: '游玩局数',
    statsWins: '成功脱出',
    statsMaxLevel: '最高关卡',
    statsAvgLevel: '平均关卡',
    statsAvgScore: '平均得分',
    statsDaily: '每日一拉 🌞',
    statsDumps: '参加次数',
    statsPodiums: '领奖台',
    statsTournament: '锦标赛 🏅',
    statsEvents: '参赛次数',
    statsMedals: '奖牌',
    statsRival: '最大对手',
    statsRivalLine: '{name} · {meetings} 场输 {losses} 场',
    statsCareer: '生涯',
    statsAchievements: '成就 {n} / {total}',
    statsAchievementsOther: '成就（{n}）',
    statsNoBadges: '还没有成就',
    statsTapBadge: '点击表情或徽章查看说明',
    statsEarned: '获得于 {day}',
    statsQuestOpen: '截止 {day}',
    statsNotFound: '还没有 {name} 的数据',
    statsOfflineOwn: '离线：只显示本设备的数据',
    saveProfile: '👤 个人资料',
    statsBestScore: '最高分',
    careerPipes: '穿过的管道数',
    careerFarts: '放屁次数（超级屁也算）',
    careerSuperFarts: '超级屁（攒满三颗豆子）',
    careerFiber: '吃到的纤维',
    careerProbiotic: '拿到的益生菌',
    careerPostbiotic: '后生元（益生菌 + 纤维）',
    careerBacteria: '碰到的有害细菌',
    careerBean: '收集的豆子',
    careerMystery: '打开的神秘盒子',
    careerCoin: '玉米粒（金币）',
    careerDeaths: '死亡次数',
    statsCardTotal: '累计：{n}',
    statsGateTitle: '个人资料 👤',
    statsGateBody: '创建用户即可查看个人资料：统计、奖牌和成就。你的每一局已经在计数了。',
    splashTip: '小提示',
    splashNew: '新功能',
    splashLoading: '加载中…',
    splashContinue: '继续',
    splashPrev: '上一张',
    splashNext: '下一张',
    splashProfile: '你的个人资料会显示数据和成就。在排行榜上点名字，就能看别人的。',
    splashDaily: '每日一拉：每天一次机会，和所有人飞同一条赛道。',
    splashTournament: '锦标赛：最多 8 名玩家，一张对阵表，一台设备。',
    splashShop: '关卡之间可以在商店花掉玉米粒。',
    splashFiber: '纤维 +3 分，在管道之间吃到它。',
    splashBacteria: '碰到有害细菌扣 3 分。',
    splashProbiotic: '益生菌能挡住一次有害细菌，持续 5 道管道。',
    splashPostbiotic: '益生菌生效时吃到纤维：管道和纤维得分 ×2。',
    splashBean: '一颗豆子可以充能一次放屁，最多带 3 颗。',
    splashFart: '点便便或豆子按钮放屁，冲过 5 道管道。',
    splashSuperFart: '集齐 3 颗豆子放超级屁：冲过 20 道管道，而且不会死。',
    splashMystery: '神秘盒子里装着随机道具，每种的概率不同。',
    splashCoin: '玉米粒就是金币，只在本局有效，记得花掉。',
    splashToilet: '在马桶上玩？打开“如厕模式”。排行榜会分别记录你如厕和不如厕时的最高分。',
    splashRectum: '第 7 关是直肠。冲过终点线，就能“成功脱出”。',
    splashLeaderboard: '排行榜显示前 25 名，还有每日一拉 🌞 和锦标赛 🏅 两个分页。',
    splashTwoPlayer: '打开 👥 开关，就能玩多人模式，最多 8 名玩家。',
    splashUserCode: '用户码能把你的名字和分数带到另一部手机上。',
    splashController: '在电脑上，可以用游戏手柄来玩。',
    splashLowPower: '省电模式或低电量模式可能会影响游戏性能。',
    careerFalls: '长距离下坠',
    careerCloseCalls: '擦身而过',
    overCardRun: '本局：{n}',
    achSkyDiver: '高空跳伞',
    achCloseShave: '千钧一发',
    achIbs: '肠易激',
    achConstipated: '便秘',
    achIcarus: '伊卡洛斯',
    achFourOfAKind: '四条',
    achGambling: '来赌一把',
    achDescFalls: '自由落体 {n} 次',
    achDescCloseShave: '在一关里擦身而过的次数达到这一关的管道数',
    achDescIbs: '7 天内成功脱出超过 21 次',
    achDescConstipated: '隔了一周以上再玩一局',
    achDescCeiling: '撞到顶部 {n} 次',
    achDescFourOfAKind: '连续 4 个神秘盒子开出同样的奖励',
    achDescBoxesBought: '在商店买 {n} 个神秘盒子',
    achEduNerd: '学霸警报',
    achEduPerfect: '满分',
    achEduA: '优等生',
    achEduB: '良好生',
    achEduC: '六十分万岁',
    achEduDropOut: '退学',
    achEduAngel: '小天使',
    achEduPhoenix: '凤凰',
    achDescEduNerd: '全部答对并通关，而且没有待复习的卡片（至少答 {min} 题）',
    achDescEduPerfect: '从第 1 关打到通关，全部答对（至少答 {min} 题）',
    achDescEduA: '一局答对 90% 以上（至少答 {min} 题，中途结束不算）',
    achDescEduB: '一局答对 80–89%（至少答 {min} 题，中途结束不算）',
    achDescEduC: '一局答对 70–79%（至少答 {min} 题，中途结束不算）',
    achDescEduDropOut: '一题没答就结束这一局',
    achDescEduRevives: '在教育模式中复活 {n} 次',
    statsEducation: '📚 教育 {n} / {total}',
    statsEduGrade: '平均成绩',
    statsEduRuns: '计分局数',
    statsEduStreak: '🔥 连续学习',
    statsStreakNow: '🔥 当前连续',
    statsStreakBest: '❤️‍🔥 最长连续',
    statsEduBest: '❤️‍🔥 最长连续',
    statsEduLevel: '已解锁的最高关卡',
    careerDethroned: '夺冠：从别人手里抢下第一名',
    tagDev: '游戏开发者',
    tagDevDesc: 'Flappy Poop 的开发者',
    tagOg: '元老',
    tagOgDesc: '2026 年 11 月，游戏第一个月就来玩了',
    tagNew: '新玩家',
    tagNewDesc: '最近 7 天内加入',
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

/**
 * How to play rows for a locale: pipe first, the pickups, levels, controls, toilet, two players, tournament, the Daily Dump, then the tray buttons left to right (ⓘ 🌐 💬 🏆 🔊 ⚙). key matches a Boot texture name or an emoji row in HowTo.
 * `education: false` leaves out the 📚 row (the off switch; HowTo passes Play.educationAvailable(): plan 28, AUD-044).
 */
export function howToItems(locale, { education = true } = {}) {
  const rows = [
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
    { key: 'education', name: t(locale, 'itemEducationName'), detail: t(locale, 'itemEducationDetail') },
    { key: 'info', name: t(locale, 'itemInfoName'), detail: t(locale, 'itemInfoDetail') },
    { key: 'language', name: t(locale, 'itemLanguageName'), detail: t(locale, 'itemLanguageDetail') },
    { key: 'feedback', name: t(locale, 'itemFeedbackName'), detail: t(locale, 'itemFeedbackDetail') },
    { key: 'leaderboard', name: t(locale, 'itemLeaderboardName'), detail: t(locale, 'itemLeaderboardDetail') },
    { key: 'sound', name: t(locale, 'itemSoundName'), detail: t(locale, 'itemSoundDetail') },
    { key: 'settings', name: t(locale, 'itemSettingsName'), detail: t(locale, 'itemSettingsDetail') },
  ];
  return education ? rows : rows.filter((item) => item.key !== 'education');
}

/**
 * Level-break banner as two lines: "LEVEL 2 · Jejunum" (the segment name is
 * omitted past the named list) and "Tap to continue"; an education run's names the
 * 📚 ("Tap to continue · 📚 review", or "📚 Review to continue" at a gate). The shop
 * is no longer named (plan 26: the 🌽 pill shows itself).
 */
export function levelBannerText(locale, level, levels) {
  const key = levels?.[level - 1]?.key;
  const title = t(locale, 'levelBanner').replace('{n}', String(level));
  const name = key ? t(locale, `level.${key}`) : '';
  // Every break says "Tap to continue" (plan 26, A2): a gate says why only after a tap (levelGateTap, on Play's levelSubHint).
  return `${name ? `${title} · ${name}` : title}\n${t(locale, 'levelContinue')}`;
}

/** A coin count beside the corn kernel (the shop pill, the purse line, every price): the number, or ∞ for a test run's endless purse (Infinity). Locale-free. */
export function countText(n) {
  return Number.isFinite(n) ? String(n) : '∞';
}

/** Short level label for the progress bar and score lines: "LV 2". */
export function levelLabel(locale, level) {
  return t(locale, 'levelShort').replace('{n}', String(level));
}

/** The gap before each count on a tally line: two no-break spaces and a space (a wrapped Phaser text folds a run of plain spaces into one). */
export const TALLY_GAP = '\u00A0\u00A0 ';

/**
 * An education run's answers by level, one line per level answered, in level order:
 * "LV 2 · Duodenum   ✅ 3   ❌ 1" (the gaps are TALLY_GAP). For the "This run" card (the quiz card's
 * tally and the game-over panel's ❔ ✅ ❌ cells open it). `tally` is Play's runQuiz (tallyAnswer);
 * `levels` is config's LEVELS.
 */
export function tallyLines(locale, tally, levels) {
  return Object.entries(tally?.byLevel ?? {})
    .map(([level, row]) => [Number(level), row])
    .filter(([level]) => Number.isInteger(level) && level >= 1)
    .sort((a, b) => a[0] - b[0])
    .map(([level, row]) => `${levelLabel(locale, level)} · ${t(locale, `level.${levels[level - 1]?.key}`)}${TALLY_GAP}✅ ${row?.right ?? 0}${TALLY_GAP}❌ ${row?.wrong ?? 0}`);
}

/**
 * The quiz's caught-up line (plan 28, Stage 3b): with the daily new-card cap held off (`cap` null or not
 * finite: TUNING.education.newPerDay) it names no number; a cap turned back on says how many a day.
 * `more`: due cards past a break's gate (education.duePerBreak), which Keep practicing asks: the line
 * says how many instead.
 */
export function caughtUpText(locale, cap, more = 0) {
  if (more > 0) return t(locale, more === 1 ? 'quizCaughtUpMoreOne' : 'quizCaughtUpMore').replace('{n}', String(more));
  return Number.isFinite(cap) ? t(locale, 'quizCaughtUpPerDay').replace('{n}', String(cap)) : t(locale, 'quizCaughtUp');
}

/**
 * What the three numbers mean (plan 25; plan 26's words): 🔵 new, 🔴 missed, 🟢 to review, each with
 * its count ({ new, missed, review }, cardCounts). "Your cards" (Play.toggleEduCard) and the quiz card's
 * explainer (Quiz.toggleCountsCard) both show these lines.
 */
export function countLines(locale, counts) {
  const line = (key, n) => t(locale, key).replace('{n}', String(n ?? 0));
  return [line('eduCardsNew', counts?.new), line('eduCardsMissed', counts?.missed), line('eduCardsReview', counts?.review)];
}

/**
 * A day streak's two profile rows (plan 34: Singleplayer and the Daily Dump, your own profile), as
 * [label key, value]: 🔥 the streak now, ❤️‍🔥 the longest, in days (the wait line's day words).
 */
export function streakProfileRows(locale, { now = 0, best = 0 } = {}) {
  const days = (n) => (n === 1 ? t(locale, 'waitDay') : t(locale, 'waitDays').replace('{n}', String(n)));
  return [
    ['statsStreakNow', days(now)],
    ['statsStreakBest', days(best)],
  ];
}

/**
 * Your own profile's learning rows (plan 26, A2: Michael's checklist), as [label key, value]: 🔥 the
 * learning streak now, ❤️‍🔥 the longest, in days (the wait line's day words), and the highest level
 * unlocked (LV n). `view` is Stats.eduView's { streak, best, level }.
 */
export function eduProfileRows(locale, { streak = 0, best = 0, level = 1 } = {}) {
  const days = (n) => (n === 1 ? t(locale, 'waitDay') : t(locale, 'waitDays').replace('{n}', String(n)));
  return [
    ['statsEduStreak', days(streak)],
    ['statsEduBest', days(best)],
    ['statsEduLevel', levelLabel(locale, level)],
  ];
}

/**
 * When a card comes back, after an answer (plan 26, as Anki shows it): "Next review: in 2 days" for a wait of
 * `ms`; "Next review: again soon" when it is due within a minute (a missed card is due at once). Rounded to
 * the nearest minute, and a unit that rounds up to the next one moves to it (23 h 59 min reads
 * "1 day", the moments between the answer and its display included): minutes under 60, hours under
 * 24, days up to 30, months (30.44 days) under 12, else years.
 */
export function nextWaitText(locale, ms) {
  const MIN = 60000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const MONTH = 30.44 * DAY;
  const YEAR = 365 * DAY;
  if (!Number.isFinite(ms) || ms < MIN) return t(locale, 'quizNextSoon');
  const unit = (n, one, many) => (n === 1 ? t(locale, one) : t(locale, many).replace('{n}', String(n)));
  let text;
  if (Math.round(ms / MIN) < 60) text = t(locale, 'waitMin').replace('{n}', String(Math.round(ms / MIN)));
  else if (Math.round(ms / HOUR) < 24) text = t(locale, 'waitHours').replace('{n}', String(Math.round(ms / HOUR)));
  else if (Math.round(ms / DAY) <= 30) text = unit(Math.round(ms / DAY), 'waitDay', 'waitDays');
  else if (Math.round(ms / MONTH) < 12) text = unit(Math.round(ms / MONTH), 'waitMonth', 'waitMonths');
  else text = unit(Math.round(ms / YEAR), 'waitYear', 'waitYears');
  return t(locale, 'quizNextIn').replace('{t}', text);
}

/** An achievement's name (ACHIEVEMENTS in achievements.js: its `title` key). */
export function badgeTitle(locale, entry) {
  return entry?.title ? t(locale, entry.title) : '';
}

/** An achievement's requirement: its `desc` template with {n}, {min} (an education badge's answers a run needs to be graded) and {glyph} filled in. */
export function badgeDesc(locale, entry) {
  if (!entry?.desc) return '';
  return t(locale, entry.desc)
    .replace('{n}', String(entry.n ?? ''))
    .replace('{min}', String(entry.min ?? ''))
    .replace('{glyph}', entry.descGlyph ?? entry.glyph ?? '');
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

/** The 📚 board's footer for the player's own row: "You: #3 of 12 · 92.5 %". */
export function eduYouText(locale, { rank, total, grade }) {
  return t(locale, 'eduBoardYou').replace('{rank}', String(rank)).replace('{total}', String(total)).replace('{grade}', Number(grade).toFixed(1));
}

/** The rank on a Daily Dump result: "🏆 #3 of 12". */
export function dailyRankText(locale, { rank, total }) {
  return t(locale, 'dailyRank').replace('{rank}', String(rank)).replace('{total}', String(total));
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
