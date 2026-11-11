// What's new: one entry per shipped version, newest first. Pure data, Node-safe:
// the Changelog overlay renders it and tests/changelog.test.js keeps it honest
// (the first entry must be VERSION, so a bump without notes fails npm test and
// therefore npm run push). Dates are the push day, written like LAST_UPDATED.
// Work that shipped between two bumps is listed under the version it shipped as.

import { LOCALES } from './i18n.js';

export const CHANGELOG = [
  {
    version: '0.13.1',
    date: '11 Nov 2026',
    notes: {
      en: [
        'Coins are now a spinning golden corn kernel, a little bigger in the field.',
      ],
      'zh-Hans': [
        '金币现在是一颗旋转的金色玉米粒，在场上也稍大了一些。',
      ],
    },
  },
  {
    version: '0.13.0',
    date: '10 Nov 2026',
    notes: {
      en: [
        'Two players is now always a tournament, for 2 to 8 players: two players race one Final, and more play a knockout bracket.',
        'Before the first race, choose who meets whom: drag a player, use ↑ ↓, or 🎲 to reshuffle.',
        'When both players wait at a finish line, 🏅 Bracket shows the draw mid-race. After a race, Continue goes straight to the next one.',
        'Bracket on a race\'s result panel now records the result, so the bronze match and the Final come up as they should.',
        'A controller can set up the tournament: move with the d-pad, A to press, B to go back.',
      ],
      'zh-Hans': [
        '双人模式现在总是锦标赛，支持 2 到 8 名玩家：两名玩家只比一场决赛，更多玩家进行淘汰赛。',
        '第一场比赛前可以决定谁对谁：拖动玩家、用 ↑ ↓，或点 🎲 重新抽签。',
        '两人都在终点线等候时，点 🏅 赛程 可在比赛中查看对阵。比赛结束后，“继续”直接进入下一场。',
        '比赛结果面板上的“赛程”现在会记录结果，铜牌赛和决赛会正常进行。',
        '可以用手柄设置锦标赛：方向键移动，A 确认，B 返回。',
      ],
    },
  },
  {
    version: '0.12.0',
    date: '10 Nov 2026',
    notes: {
      en: [
        'Game over has Play again: straight into the next run. Beat your best and the panel says "New personal best!".',
        "Sharing sends the picture of your run with just the game's link.",
        'Moving pipes rest for a moment at the top and bottom of each swing.',
        'The ? and Load user buttons pulse until you have used them, like the 🌞.',
        'New usernames: 4–16 characters (2+ in Chinese, Japanese or Korean), no spaces, emoji or rude words. Existing names keep working.',
      ],
      'zh-Hans': [
        '游戏结束新增“再玩一次”：直接开始下一局。打破个人纪录时会显示“新的个人最佳！”。',
        '分享时只附上游戏链接和这局的图片。',
        '移动的管道在每次摆动的最高点和最低点会停一下。',
        '“?”和“载入用户”按钮在你用过之前会跳动提示，就像🌞一样。',
        '新用户名：4–16 个字符（中文、日文或韩文至少 2 个），不能有空格、表情符号或不雅词。已有的用户名照常可用。',
      ],
    },
  },
  {
    version: '0.11.2',
    date: '10 Nov 2026',
    notes: {
      en: [
        "The Daily Dump is one try per player, not per device: a phone or browser signed in with your user code shows today's result if you already played elsewhere.",
        "Today's result no longer starts a run behind it: its leaderboard link, a tap outside it and Home all behave.",
      ],
      'zh-Hans': [
        '每日一拉是每位玩家每天一次，而不是每台设备一次：用同一用户码登录的手机或浏览器，如果你已经在别处玩过，会直接显示今天的成绩。',
        '查看今日成绩时，后台不会再开始新的一局：排行榜链接、点面板外和“返回主页”都正常了。',
      ],
    },
  },
  {
    version: '0.11.1',
    date: '10 Nov 2026',
    notes: {
      en: [
        'Your Daily Dump rank reads 🏆 #n of n; tap it (or your score) for the 🌞 leaderboard.',
        "The 🏆 leaderboard marks all of your rows on every device, even the kind (🚽 or not) you never played on this one.",
        'The Daily Dump popup: 🌞 💩 🛌 🔁, and a new course every day at midnight UTC.',
        "What's new always opens on the newest version, even after you looked at an older one.",
      ],
      'zh-Hans': [
        '每日一拉的排名显示为 🏆 第n名；点它（或你的分数）即可打开🌞排行榜。',
        '🏆 排行榜在每台设备上都会标出你的所有成绩，包括这台设备上没玩过的那一类（🚽 或非 🚽）。',
        '每日一拉弹窗：🌞 💩 🛌 🔁；每天UTC午夜换一条新赛道。',
        '“更新说明”现在总是打开最新版本，即使你之前看过旧版本。',
      ],
    },
  },
  {
    version: '0.11.0',
    date: '10 Nov 2026',
    notes: {
      en: [
        "Daily Dump 🌞: tap the sun at the top of the home screen. Once a day everyone flies the same endless course at one level, with one try. No kernels, no shop: go as far as you can.",
        'Your result shows your rank for the day, a countdown to the next course (00:00 UTC) and Share. Tap your score for the new 🌞 board.',
        'The leaderboard now has three tabs: 🏆 Top 25, 🌞 today\'s Daily Dump and 🏅 medals. How to play has a Daily Dump row.',
      ],
      'zh-Hans': [
        '每日一拉 🌞：点首页顶部的太阳。每天所有人飞同一条无尽赛道，按当天的关卡，只有一次机会。没有玉米粒，也没有商店：能飞多远就飞多远。',
        '成绩页会显示你今天的排名、到下一条赛道（UTC 00:00）的倒计时，还能分享。点你的分数即可查看新的🌞榜。',
        '排行榜现在有三个标签页：🏆 前25名、🌞 今天的每日一拉、🏅 奖牌榜。玩法说明新增每日一拉一行。',
      ],
    },
  },
  {
    version: '0.10.1',
    date: '10 Nov 2026',
    notes: {
      en: ['A tap on the floor lifts you again in test mode with Invincible on, and just after a fart: one tap is a whole flap, not a tiny hop.'],
      'zh-Hans': ['测试模式开启无敌时，以及刚放完屁时，贴着地面点击也能正常起飞：点一下就是完整的一次起飞，不再只跳一小下。'],
    },
  },
  {
    version: '0.10.0',
    date: '9 Nov 2026',
    notes: {
      en: [
        'The 🏅 medal board: when a tournament ends, everyone who joined with their user code (and you, with Use my player) gets their medals on a new board behind the 🏆 button. Flip the 🏆 ⟷ 🏅 switch under the title; players rank by gold, then silver, bronze and their best race. Guests are never saved.',
        'Offline at the podium? The medals wait on this device and post the next time the board can be reached.',
        'How to play explains 👥 Two players, 🏅 Tournament and every button in the bottom row, and the 🚽 toilet row now follows Controls.',
        "Tap the version number at the bottom of any panel to see What's new.",
      ],
      'zh-Hans': [
        '🏅 奖牌榜：锦标赛结束后，用用户码加入的玩家（以及选“用我的玩家”的你）都会把奖牌记到 🏆 按钮里的新榜单上。点标题下的 🏆 ⟷ 🏅 切换；按金牌、银牌、铜牌和单场最佳排名。访客不会保存。',
        '领奖台时没联网？奖牌会先存在本设备，等能连上排行榜时再上传。',
        '玩法说明新增 👥 双人模式、🏅 锦标赛和底部每个按钮的说明；🚽 如厕模式一行移到操作方式之后。',
        '点任意面板底部的版本号即可查看更新说明。',
      ],
    },
  },
  {
    version: '0.9.0',
    date: '9 Nov 2026',
    notes: {
      en: [
        'Tournament (🏅): 3–8 players on one device race two at a time in a knockout bracket, with a bronze match, a Final and a podium. Tap 🏅 Tournament on the two-player screen; add players by pasting their user code, as a guest, or as yourself.',
        'Tournament races are shorter (225 pipe pairs) and never end in a draw: after points and crashes, the player who crossed more finish lines first, then the last line first, wins.',
      ],
      'zh-Hans': [
        '锦标赛（🏅）：3–8 位玩家在同一台设备上两两对决，进行淘汰赛，设有铜牌赛、决赛和领奖台。在双人模式页面点“🏅 锦标赛”；可以粘贴用户码、以访客身份或用自己的玩家加入。',
        '锦标赛的比赛更短（225 对管道），而且不会平局：分数和撞击次数相同时，率先过线次数更多者胜，再相同则率先冲过终点线者胜。',
      ],
    },
  },
  {
    version: '0.8.5',
    date: '9 Nov 2026',
    notes: {
      en: ['One button for your user on the home screen: Load user until you pick a name, then your name and best. It always opens Save / Load. The separate High scores page is gone; your best is on that button and on the 🏆 board.'],
      'zh-Hans': ['首页只剩一个用户按钮：设置用户名前显示“载入用户”，之后显示你的名字和最高分，点它总会打开“存档 / 载入用户”。单独的最高分页面已移除；你的最高分显示在这个按钮和 🏆 排行榜上。'],
    },
  },
  {
    version: '0.8.4',
    date: '9 Nov 2026',
    notes: {
      en: ['Moving pipes are a lighter pink, and they move up and down faster with every level after level 4.'],
      'zh-Hans': ['移动的管道现在是更浅的粉色，并且从第 4 关之后每一关都上下移动得更快。'],
    },
  },
  {
    version: '0.8.3',
    date: '9 Nov 2026',
    notes: {
      en: ['Change your username once: every phone and browser that uses your user code picks up the new name on its own. Save / Load User explains it as a fourth step.'],
      'zh-Hans': ['用户名只需改一次：使用你用户码的每台手机和浏览器都会自动换成新名字。“存档 / 载入用户”新增第四步说明。'],
    },
  },
  {
    version: '0.8.2',
    date: '9 Nov 2026',
    notes: {
      en: [
        'One player across devices: load your user code on another phone or browser and the leaderboard joins both into one player, so your best counts once wherever you play. Save / Load User now lists the three steps.',
        'A username belongs to the player who holds it on the board: typing a name that is taken points you at your user code instead. A new Clear button signs a device out (copy your code first).',
        "Two players: only the first one over each finish line (the rectum's too) earns the 25 points; the second still gets the level's coins.",
      ],
      'zh-Hans': [
        '跨设备同一位玩家：在其他手机或浏览器上载入你的用户码，排行榜会把两边合并为同一位玩家，你的最高分在哪里玩都只算一次。“存档 / 载入用户”现在列出了三个步骤。',
        '用户名归榜上持有它的玩家所有：输入一个已被使用的名字时，游戏会提示你改用用户码。新增“清除”按钮可让设备退出（请先复制你的用户码）。',
        '双人模式：只有最先越过每条终点线（包括直肠）的玩家才能得到 25 分；后到的玩家仍能拿到本关的金币。',
      ],
    },
  },
  {
    version: '0.8.1',
    date: '8 Nov 2026',
    notes: {
      en: [
        'Twice as many coins from level 2, as extras that only fill empty gaps, and every finish line pays the level\'s number in coins. In two players a level without a crash adds 3; a postbiotic now doubles every kernel you pick up.',
        'A mystery box bought in the shop spins a little slot machine of rewards before it lands on your prize.',
        'A single-bean fart now rips through its five pipes in about 2.5 s; the three-bean super fart is unchanged.',
        'Two players: both tap ready before the next level (tap again to take it back). The race starts the moment GO appears, with a toilet flush; tap right on GO for a fart-powered head start. The result panel counts each player\'s level wins (🏁).',
        'A sharper kernel, a new tagline in About ("The #1 game to play while going #2!"), and a shorter How to play with the iPhone Silent-mode tip in its own 🔊 row.',
      ],
      'zh-Hans': [
        '从第 2 关起金币多了一倍，只出现在空着的位置；每过一关都能得到与关卡编号相同的金币。双人模式中本关没有撞车再加 3 枚；后生元生效时，拾取的玉米粒翻倍。',
        '在商店买神秘盒子时，会先转动一台小老虎机，最后停在你抽中的奖励上。',
        '一颗豆子的屁现在约 2.5 秒就冲过 5 道管道；三颗豆子的超级屁不变。',
        '双人模式：两人都点击准备后才开始下一关（再点一次可取消）。"出发！"出现的瞬间比赛开始，还伴随冲马桶声；在"出发！"时点击可获得放屁加速。结算面板会显示每位玩家赢下的关卡数（🏁）。',
        '玉米粒更清晰了，关于页面换上新标语："上大号时必玩的头号游戏！"；玩法说明更简洁，iPhone 静音模式提示移到单独的 🔊 一栏。',
      ],
    },
  },
  {
    version: '0.8.0',
    date: '8 Nov 2026',
    notes: {
      en: [
        'Coins: one golden corn kernel waits on every level (on level 1 just past the last pipe), more turn up between the pipes from level 2, and mystery boxes can now pay out 5, 10 or 15. They collect in a purse above your bean count for the run; the game-over panel counts them.',
        'A shop in every level break: tap 💰 to spend your coins on fiber (+3, 1 coin), a bean, a super fart (the bean bag filled) or a mystery box. Tap anywhere else to keep going and hold on to your coins.',
        'Two players: each of you shops in your own break, and an open shop holds the shared start until it closes. A crash keeps 90 % of your coins and clears your power-ups.',
        "About now puts How to play and the feedback link first, with the credits below; it scrolls like What's new.",
        'A death clears your coins and every power-up (beans, probiotic, postbiotic), and pickups that hold still now pulse gently (their hitbox stays the same).',
      ],
      'zh-Hans': [
        '金币：每一关都有一粒金黄的玉米粒（第 1 关在最后一道管道之后），从第 2 关起管道之间还会偶尔多出几粒，神秘盒子现在也可能开出 5、10 或 15 枚。金币显示在豆子计数上方，只在本局有效，结算面板会显示收集数量。',
        '每个关卡间歇都有商店：点击 💰 用金币购买纤维（+3，1 枚金币）、一颗豆子、超级屁（装满豆袋）或神秘盒子。点击其他地方则继续前进，金币留着下次用。',
        '双人模式：各自在自己的间歇里进商店；有人的商店还开着时，双方的出发会等它关闭。撞车会保留 90% 的金币并清空道具。',
        '关于页面现在先列出玩法说明和反馈链接，致谢放在下面；页面可以像「更新说明」一样滚动。',
        '死亡会清空金币和所有道具（豆子、益生菌、后生元）；静止不动的道具现在会轻轻地一张一缩（判定范围不变）。',
      ],
    },
  },
  {
    version: '0.7.1',
    date: '8 Nov 2026',
    notes: {
      en: [
        'Two players: levels now start together. Reach a finish line first and you wait for the other player; once you are both there, either of you taps to continue and a 3-2-1-GO starts the next level for both.',
        'The other player\'s ghost stays by the pipes they are actually at. Before, a fart, a crash or a skip could push it out of sight for the rest of the race.',
        'While you wait at a finish line, a controller\'s B button no longer pauses the other player.',
      ],
      'zh-Hans': [
        '双人模式：现在两人同时开始每一关。先到终点线的一方会等待对方；两人都到之后，任意一方点击继续，3-2-1-出发！同时开始下一关。',
        '对手的影子现在会停在对方真正所在的管道旁。以前放屁、撞车或跳关之后，影子可能在本局剩下的时间里都看不到。',
        '在终点线等待时，手柄的 B 键不会再让对手暂停。',
      ],
    },
  },
  {
    version: '0.7.0',
    date: '8 Nov 2026',
    notes: {
      en: [
        'Two players, Mario Kart style: a crash no longer ends the race. Your half pauses for the tumble, the poop is carried back to mid-screen, blinks a few times, and you play on with a clear screen.',
        'Points decide the race: a crash costs 2 × your level (never below 0) and clearing a level earns 25. The match ends once both players are out of the rectum; equal points go to the player with fewer crashes.',
        'The result panel shows each player\'s crashes, and the first one out waits under "Made it out!" while the other finishes.',
      ],
      'zh-Hans': [
        '双人模式更像马里奥赛车：撞车不再结束比赛。你的半边会停顿一下，便便被送回屏幕中央、闪烁几下，然后在清空的画面上继续。',
        '比赛由分数决定：撞车扣 2 × 当前关卡的分数（最低为 0），过一关得 25 分。两人都通过直肠后比赛结束；分数相同时撞车少的一方获胜。',
        '结算面板会显示每位玩家的撞车次数；先出来的一方会在"顺利排出！"下等待对方完成。',
      ],
    },
  },
  {
    version: '0.6.1',
    date: '7 Nov 2026',
    notes: {
      en: [
        'The probiotic / postbiotic icon beside its pipe count breathes gently while the count runs.',
        'In landscape (and on a desktop window) the bean button sits by your right thumb at the edge of the screen. A 👈 👉 row in Settings moves it to the left; your save code carries the choice.',
        'Resuming from a pause gives a gentle half-flap bounce instead of a full flap, so the poop no longer jumps into the pipe above.',
      ],
      'zh-Hans': [
        '益生菌 / 后生元图标在倒数期间会轻轻地一张一缩。',
        '横屏（以及电脑窗口）下，豆子按钮移到屏幕边缘、靠近右手拇指的位置。设置里新增 👈 👉 一行，可切换到左侧；你的存档码会记住这个选择。',
        '暂停后继续时只会轻轻弹起半次起飞的高度，而不是整次，便便不会再撞上上方的管道。',
      ],
    },
  },
  {
    version: '0.6.0',
    date: '7 Nov 2026',
    notes: {
      en: [
        'Two players: on a desktop or a tablet in landscape, a 👥 toggle under the toilet toggle starts a side-by-side race on the same course. Keyboard (W / Space and ↑ / Enter), controllers or a thumb on each half; the first death ends it and the higher score wins.',
        'In a race the other poop shows in your lumen as a faded ghost when it is near, and your progress bar marks where it is.',
        'A trailing player\'s mystery box helps: 10 pipes behind doubles the bean draws, 25 behind gives three beans at once.',
        'Two-player runs are not saved and never reach the leaderboard.',
        'How to play ends with a 🎮 Controls row: which buttons flap, fart and pause for one player and for two.',
      ],
      'zh-Hans': [
        '双人模式：在电脑或横屏平板上，如厕开关下方新增 👥 开关，可在同一条肠道上并排竞速。支持键盘（W / 空格 和 ↑ / 回车）、手柄，或各自点击自己的半边；一方出局即结束，得分高者获胜。',
        '竞速时，对手靠近你时会以半透明的影子出现在你的肠道里，进度条上也会标出对手的位置。',
        '落后的玩家会从神秘盒子获得帮助：落后 10 道管道时豆子的几率翻倍，落后 25 道时直接获得三颗豆子。',
        '双人模式的分数不会保存，也不会进入排行榜。',
        '玩法说明新增 🎮 操作方式一栏：单人和双人各用哪些按键起飞、放屁和暂停。',
      ],
    },
  },
  {
    version: '0.5.17',
    date: '7 Nov 2026',
    notes: {
      en: [
        'The scroll speed stops rising after level 3; levels 3 to 7 share one pace.',
        'From level 4 some pipe pairs drift slowly up and down, more of them and farther on later levels. The pair after a fart holds still.',
      ],
      'zh-Hans': [
        '滚动速度在第 3 关后不再增加；第 3 到 7 关保持同一节奏。',
        '从第 4 关起，有些管道会缓缓上下漂移，关卡越高漂移的管道越多、幅度越大。放屁后的第一道管道保持不动。',
      ],
    },
  },
  {
    version: '0.5.16',
    date: '7 Nov 2026',
    notes: {
      en: [
        'The top villi now pass in front of the pipes at pipe speed, like the floor; the poop cannot fly above them.',
        'Every version line says beta.',
        'This What\'s new page, from the Updated line in About.',
        'The leaderboard shows the top 25: scroll past the first ten.',
      ],
      'zh-Hans': [
        '顶部的绒毛现在像地面一样从管道前面以管道速度掠过；便便飞不到它们上面去。',
        '每处版本号后面都加上了“测试版”。',
        '新增这个“更新说明”页面，从“关于”里的“更新于”一行打开。',
        '排行榜显示前 25 名：滚动即可看到前十名之后的玩家。',
      ],
    },
  },
  {
    version: '0.5.15',
    date: '6 Nov 2026',
    notes: {
      en: ['The cream wall behind the villi fades only over its last sliver, so the colour stays solid elsewhere.'],
      'zh-Hans': ['绒毛后面的奶油色肠壁只在最靠近肠腔的一小段渐隐，其余部分保持实色。'],
    },
  },
  {
    version: '0.5.14',
    date: '6 Nov 2026',
    notes: {
      en: ['The cream wall behind the villi fades toward the open gut instead of ending on a hard line.'],
      'zh-Hans': ['绒毛后面的奶油色肠壁朝肠腔方向渐隐，不再以一条硬边结束。'],
    },
  },
  {
    version: '0.5.13',
    date: '6 Nov 2026',
    notes: {
      en: ['The back villi are a third shorter, so the middle of the gut stays clear.'],
      'zh-Hans': ['后排绒毛缩短了三分之一，肠道中部更加通畅。'],
    },
  },
  {
    version: '0.5.12',
    date: '6 Nov 2026',
    notes: {
      en: ['A cream wall behind the villi at the top and bottom; every villus tip reaches past its bar.'],
      'zh-Hans': ['顶部和底部的绒毛后面有了一道奶油色肠壁；每根绒毛的尖端都越过了它的横条。'],
    },
  },
  {
    version: '0.5.11',
    date: '6 Nov 2026',
    notes: {
      en: [
        'Controller support: A flaps, RT farts, Menu pauses, B backs out, the d-pad walks the buttons with a focus ring.',
        'Desktop gets a wider field with the first pipes already in view; rotating a phone mid-run pauses.',
        'A scared falling face on long drops, a new app icon, and villi that run off the screen edges with wavy tips.',
      ],
      'zh-Hans': [
        '支持手柄：A 拍翅，RT 放屁，Menu 暂停，B 返回，方向键配合焦点框在按钮间移动。',
        '桌面端视野更宽，开局就能看到前几根管道；游戏中旋转手机会暂停。',
        '长距离下落时露出惊恐表情，新的应用图标，绒毛延伸出屏幕边缘并带有起伏的尖端。',
      ],
    },
  },
  {
    version: '0.5.10',
    date: '3 Nov 2026',
    notes: {
      en: [
        'Levels: the gut comes in segments with a finish line, its own speed and colour, and a progress bar; clear the rectum to win.',
        'Fiber is worth +3, and eating it with a probiotic up makes a postbiotic that doubles your points for a while.',
        'Mystery boxes from level 3, a run summary on game over, score popups, and a Share button with a picture of your score.',
        'The leaderboard shows the level, with separate bests on and off the toilet; Reload game in Settings fetches the latest build.',
      ],
      'zh-Hans': [
        '关卡：肠道分成多段，各有终点线、速度、颜色和进度条；通过直肠即获胜。',
        '纤维值 +3；在益生菌生效时吃下它会生成后生元，让你的得分在一段时间内翻倍。',
        '第 3 关起出现神秘盒子，游戏结束有本局总结和得分弹窗，还有带得分图片的分享按钮。',
        '排行榜显示关卡，坐便与否分别记录最高分；设置里的“重新加载游戏”会获取最新版本。',
      ],
    },
  },
  {
    version: '0.5.9',
    date: '3 Nov 2026',
    notes: {
      en: ['Bad bacteria costs 3 points now that probiotics stack.'],
      'zh-Hans': ['既然益生菌可以叠加，坏细菌现在扣 3 分。'],
    },
  },
  {
    version: '0.5.8',
    date: '3 Nov 2026',
    notes: {
      en: ['Reload game link in Settings, so home-screen installs pick up a new build.'],
      'zh-Hans': ['设置里新增“重新加载游戏”链接，添加到主屏幕的版本也能更新。'],
    },
  },
  {
    version: '0.5.7',
    date: '3 Nov 2026',
    notes: {
      en: ['The bean power button sits in the middle of the tray and pulses with the glow.'],
      'zh-Hans': ['豆子能量按钮移到托盘中央，并随光晕一起脉动。'],
    },
  },
  {
    version: '0.5.6',
    date: '3 Nov 2026',
    notes: {
      en: ['The first pipe after a fart opens its gap at the height the poop floats.'],
      'zh-Hans': ['放屁结束后的第一根管道，缺口正好开在便便漂浮的高度。'],
    },
  },
  {
    version: '0.5.5',
    date: '3 Nov 2026',
    notes: {
      en: ['Pipes hold off late in a fart so the screen is clear when it ends.'],
      'zh-Hans': ['放屁快结束时暂停生成管道，结束时画面保持畅通。'],
    },
  },
  {
    version: '0.5.4',
    date: '3 Nov 2026',
    notes: {
      en: ['A fart floats the poop through the middle and clears the pipes ahead.'],
      'zh-Hans': ['放屁时便便漂浮在中间穿行，前方的管道会被清除。'],
    },
  },
  {
    version: '0.5.3',
    date: '3 Nov 2026',
    notes: {
      en: ['Probiotic pickups stack; a bacteria hit clears them all.'],
      'zh-Hans': ['益生菌可以叠加；撞上细菌会一次清空。'],
    },
  },
  {
    version: '0.5.2',
    date: '3 Nov 2026',
    notes: {
      en: ['A bigger speech-bubble poop on the ready screen; a bean is guaranteed by pipe 20.'],
      'zh-Hans': ['开始画面的气泡便便更大了；第 20 根管道前必定出现一颗豆子。'],
    },
  },
  {
    version: '0.5.1',
    date: '3 Nov 2026',
    notes: {
      en: ['The speech-bubble poop replaces the tap-to-flap button; single beans are rarer.'],
      'zh-Hans': ['带气泡的便便取代了“点击起飞”按钮；单颗豆子更稀有了。'],
    },
  },
  {
    version: '0.5.0',
    date: '3 Nov 2026',
    notes: {
      en: ['Beans bob between the pipes: eat one, then tap the poop to fart through the gut.'],
      'zh-Hans': ['豆子在管道之间上下漂浮：吃一颗，再点便便就能放屁冲过肠道。'],
    },
  },
  {
    version: '0.4.0',
    date: '3 Nov 2026',
    notes: {
      en: ['A toilet toggle on the ready screen; toilet scores get a 🚽 beside them.'],
      'zh-Hans': ['开始画面新增马桶开关；坐便得分旁会显示 🚽。'],
    },
  },
  {
    version: '0.3.3',
    date: '3 Nov 2026',
    notes: {
      en: ['The poop sits under the title, the buttons are reordered, and the start slides into play.'],
      'zh-Hans': ['便便位于标题下方，按钮重新排序，开始时滑入游戏。'],
    },
  },
  {
    version: '0.3.2',
    date: '3 Nov 2026',
    notes: {
      en: ['A profile button, a pipe row in How to play, and Settings without the music row.'],
      'zh-Hans': ['新增个人资料按钮，玩法说明里加入管道一行，设置里去掉了音乐一行。'],
    },
  },
  {
    version: '0.3.1',
    date: '3 Nov 2026',
    notes: {
      en: ['Button chrome, a Save / Load User button, a profile line, and a High scores overlay.'],
      'zh-Hans': ['按钮外观、“存档 / 载入用户”按钮、个人资料一行和最高分页面。'],
    },
  },
  {
    version: '0.3.0',
    date: '3 Nov 2026',
    notes: {
      en: ['Save codes: copy a code to keep your username and top scores, and load it on another device.'],
      'zh-Hans': ['存档码：复制一段代码保存用户名和最高分，可在其他设备上载入。'],
    },
  },
  {
    version: '0.2.8',
    date: '2 Nov 2026',
    notes: {
      en: ['Pipes and the background always cover the whole playfield.'],
      'zh-Hans': ['管道和背景始终覆盖整个游戏区域。'],
    },
  },
  {
    version: '0.2.7',
    date: '2 Nov 2026',
    notes: {
      en: ['Simplified Chinese with a language picker; a feedback button that opens GitHub issue forms.'],
      'zh-Hans': ['新增简体中文和语言选择；反馈按钮可打开 GitHub 问题表单。'],
    },
  },
  {
    version: '0.2.6',
    date: '2 Nov 2026',
    notes: {
      en: ['How to play mentions the iPhone Silent switch; tap outside a panel to close it.'],
      'zh-Hans': ['玩法说明提到了 iPhone 静音开关；点击面板外部即可关闭。'],
    },
  },
  {
    version: '0.2.5',
    date: '2 Nov 2026',
    notes: {
      en: ['Sharper player and item art, with hitboxes scaled to match.'],
      'zh-Hans': ['更清晰的角色和道具图像，碰撞范围同步缩放。'],
    },
  },
  {
    version: '0.2.4',
    date: '2 Nov 2026',
    notes: {
      en: ['How to play opens from About; an Updated stamp under the version.'],
      'zh-Hans': ['可从“关于”打开玩法说明；版本号下方显示更新时间。'],
    },
  },
  {
    version: '0.2.3',
    date: '2 Nov 2026',
    notes: {
      en: ['A How to play overlay; a small bounce on unpause; iOS audio fixes.'],
      'zh-Hans': ['新增玩法说明页面；取消暂停时轻轻弹起；修复 iOS 音频。'],
    },
  },
  {
    version: '0.2.2',
    date: '2 Nov 2026',
    notes: {
      en: ['Tray buttons respond where they are drawn; sound unlocks on the first tap on iOS.'],
      'zh-Hans': ['托盘按钮在绘制位置准确响应；iOS 上首次点击即可解锁声音。'],
    },
  },
  {
    version: '0.2.1',
    date: '2 Nov 2026',
    notes: {
      en: ['An About overlay; a paused run waits for a tap.'],
      'zh-Hans': ['新增“关于”页面；暂停的游戏等待点击后继续。'],
    },
  },
  {
    version: '0.2.0',
    date: '1 Nov 2026',
    notes: {
      en: ['Fiber, probiotic and bad bacteria pickups, the button tray, and credits.'],
      'zh-Hans': ['纤维、益生菌和坏细菌道具，按钮托盘和致谢。'],
    },
  },
  {
    version: '0.1.0',
    date: '1 Nov 2026',
    notes: {
      en: ['First playable: flap a poop through the gut.'],
      'zh-Hans': ['首个可玩版本：操控便便在肠道里拍翅飞行。'],
    },
  },
];

/** The entry for a version, or undefined. */
export function changelogEntry(version) {
  return CHANGELOG.find((e) => e.version === version);
}

/** One version's bullets as one block of text for a locale (English when the locale has none). */
export function changelogNotes(entry, locale) {
  const lines = entry.notes[LOCALES.includes(locale) ? locale : 'en'] ?? entry.notes.en;
  return lines.map((line) => `• ${line}`).join('\n');
}
