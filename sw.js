// Flappy Poop's service worker (plan 35, Stage 3; AGENTS.md "Service worker"). A classic script with no
// imports, at the site root, so its scope is the game's folder (registration.scope).
//
// `npm run push` stamps BUILD and FILES below (tools/sw_stamp.mjs): FILES pairs every URL a build needs,
// exactly as the page asks for it, with the SHA-256 of its bytes. Modules carry their content hash (?h=,
// through index.html's import map), art and sounds ?v=<VERSION>, the vendored Phaser and supabase-js
// their own pins; a ?h= or ?v= URL's bytes never change, so a cached copy is right for any build.
// Unstamped (BUILD ''), the worker answers nothing and clears its caches.
//
// install: every file stored in flappy-poop-<BUILD>, hash-checked (copied from the previous build's
//   cache when its bytes are the same); a mismatch is retried once past the HTTP cache, and a second one
//   fails the install, so the old worker stays and the next launch tries again. Then skipWaiting.
// activate: deletes our older caches but the previous build's (a page still running it gets its own
//   files), never a cache it did not name; then claims the open pages.
// fetch: index.html network first (no-cache, 3 s), else this build's copy; a listed file from this
//   build's cache, then the previous build's, else the network. Everything else (another origin: the
//   online race's REST, auth and realtime, the Phaser CDN; a POST; a Range; outside the scope; ?nosw; an
//   unlisted URL) is not answered at all: the browser fetches it as if there were no worker.
// The kill switch is tools/sw-off.js (copy it over this file and push); ?nosw on the page removes the
// worker for that browser (src/swClient.js).

// --- stamp (tools/sw_stamp.mjs; written by npm run push, empty in the committed file) ---
const BUILD = '0.37.0-d6ac8c4c12';
const FILES = [
  ["index.html","b2abc37bcaa4c526c8051f743e530e182f27fc3c09acece5f26554d13a7c568d"],
  ["src/achievements.js?h=7fb0bd43b1","7fb0bd43b162c0ba34a6dc13a6c40128147cfaf7ceaf8366f036f4edc5f4969b"],
  ["src/advent.js?h=36d4b4f5e0","36d4b4f5e00401bf283701b80c6dded3543ba647dd4ff40d4b716dae1b0d8385"],
  ["src/changelog.js?h=82815f6f04","82815f6f04ce05ea6103157fc75f54bce41e9265584e576628ea9825c634e7d9"],
  ["src/config.js?h=a4529dd94f","a4529dd94fa8fd784cd78bff44f105c7fc4e0cb00f59ea6941268b2580883aff"],
  ["src/education.js?h=ef29b1fb5e","ef29b1fb5e65b55ea67aedc50d457ff45b1d61c10d0afd3cf19ec629586e8d7b"],
  ["src/fsrs.js?h=d8492a1fbe","d8492a1fbe36e9f7b47da10b0b4df6b9c26a8eee4e52b9f19c18dac003a1fa66"],
  ["src/i18n.js?h=3b00efa61c","3b00efa61c48bc7b9da7c09749a3e6ead6d1367198dc3c6af7a0a3e4266d8407"],
  ["src/input/pad.js?h=e5def632b0","e5def632b0facc1e20e02b24c55d2b36e15ab42724c384e69fe60d6d677ae485"],
  ["src/leaderboard.js?h=8eca0fe41f","8eca0fe41f85a5579ebbe6a6bc7f99c09376d966af77328a3b20da39508ec922"],
  ["src/logic.js?h=8245c175c4","8245c175c49831e2364434626bceba62ec1b8b8f5f5889de99bf7a310ca9d833"],
  ["src/main.js?h=03595257a9","03595257a9c6b112b05f6f107338bfeb2cf49cf924d4f9ade3091d8fa3f358fe"],
  ["src/online.js?h=2fed66a7f9","2fed66a7f9645056a723cfc3e9f514f0c3c96fbae24d2be5c74c396a462d830a"],
  ["src/onlineAccount.js?h=08f891661f","08f891661fb487b888e9e96a43e2484181dd22cb0b16f54e5986a751a7f7f4b8"],
  ["src/onlineFriends.js?h=2a90f8cee7","2a90f8cee7ce80e736441cb1c8c4c9d926dfe83e1f2ed757c81d39b5b5194b71"],
  ["src/onlineInvites.js?h=0d82279272","0d82279272dcc13af93b771ab746067446077231872924c0393f9b2e22f2bd26"],
  ["src/onlineLobby.js?h=a20fe76554","a20fe7655495ee6d890a894500432bf6eeddf67201875160370b9050b8eec03e"],
  ["src/onlineNet.js?h=5d3f5b5c67","5d3f5b5c67865d8b8439d76e88a82c5a9a5c73ef95c993c644427dd9c997f95d"],
  ["src/onlineRace.js?h=c78f078810","c78f0788105157c585945f52ef3387844d5a33998a8009596c70059014ade14e"],
  ["src/phaserReady.js?h=d559e89fb3","d559e89fb39306b32742ac169280deaf4ea920e2d1a09f4e13d6a7a6db94b3b2"],
  ["src/questionAudits.js?h=a69641a809","a69641a809967fc756041dab811f7ab342a2f583c9bd219c79e51a0a5f12bacf"],
  ["src/questions.js?h=ff0c236e3a","ff0c236e3a4b4c879e4e76105d741827c41f7b715db020bb357b867244d1a77f"],
  ["src/research.js?h=e497843352","e497843352985756b68e24ca35774590577d5d0cc6dea1c2b70c58658bf6ff7f"],
  ["src/richText.js?h=efde72973e","efde72973ed6761b333bbcc490c66500eed958626252611b15fac586e868a515"],
  ["src/runStats.js?h=ef858080aa","ef858080aae06bb1ef32847a94fe3c206b004d115f999ab64b3c247d1db23b5a"],
  ["src/save.js?h=e67c038e61","e67c038e61908ae63d998365dc3520ebf47c1ab6a231633bfd7ae742f3748cc7"],
  ["src/scenes/About.js?h=d3d29a16f7","d3d29a16f75a33fd45ca55606994e20535dd7f44492b4c7d11e04235a2a084e0"],
  ["src/scenes/Advent.js?h=7ac2a09895","7ac2a09895f3ea5f371c0f0a9ed16f3cac7436eb0f3fb35b4e94f479c6940cd3"],
  ["src/scenes/Boot.js?h=7b5151e34c","7b5151e34c4a0ed668a410a247bcde301db2ab4a45f064a7a5da1275d3723e69"],
  ["src/scenes/Changelog.js?h=e374a9be1a","e374a9be1a177e67e8b96d34bd9eac7f580ed4babc89235afd553f39cf8db0dc"],
  ["src/scenes/Daily.js?h=88f19ad7ae","88f19ad7aec2016ed54c9a6be4a12d7b749159f94005f6e19648cf27d28a7fde"],
  ["src/scenes/Feedback.js?h=43ea1849ff","43ea1849ff98037577370a75d595c8d67bc6742e80b26476583a1345a7b69d0e"],
  ["src/scenes/HowTo.js?h=9a70a29590","9a70a2959005ca81656ea18ba312467c5f9575f9185b6965e9c979652d285803"],
  ["src/scenes/Language.js?h=2c018fa559","2c018fa5595d689a29b04e3c3c153ae7e7d0504d46dad4f0af5e8f7ecb882ca7"],
  ["src/scenes/Leaderboard.js?h=91b436e0c7","91b436e0c71997b5a9f17dbb3741c9e2178777414f83c74447453f8ed39a4c06"],
  ["src/scenes/OnlineRace.js?h=b07d0886eb","b07d0886ebc0e426d132132a027f4967456229cf7c4001e8bae35c957625896f"],
  ["src/scenes/Over.js?h=5845a2ff7f","5845a2ff7fea1efd8442d939b1195da6b154f2745ec1f0a5b85e71a16033ce4e"],
  ["src/scenes/Play.js?h=d399009cb7","d399009cb72234be6027dd0e1011a3ff5f65cf944b1b9a756562d6c242b43d0d"],
  ["src/scenes/Quiz.js?h=7fdea351f0","7fdea351f08166807dacd50114e03526ab8a72a88da5f7db9e3f8658c758d857"],
  ["src/scenes/SantaPicker.js?h=3ddb68ac6e","3ddb68ac6e993daa172960e052c0cd584b5bbb42945a85de3213522793beb288"],
  ["src/scenes/Settings.js?h=efcc0be240","efcc0be240b92ede4b9c03b1733684b91a265fd7e0a5f75b4cedf032018a6479"],
  ["src/scenes/Stats.js?h=8ce8fdbb5c","8ce8fdbb5cd16e7c8f48a999e636b1cc1b6fdf5fab82fabd07ac8bb8a75e5c86"],
  ["src/scenes/Versus.js?h=c7546c36c4","c7546c36c4c8187feb123272b11c9c0ac7e493aa884f4f0ebcd000eacf7be88a"],
  ["src/sha256.js?h=5bc5d3593c","5bc5d3593c158228a57f0889049127b7621396e8d3e282bd4914b4a816590aaa"],
  ["src/share.js?h=ff59feb661","ff59feb66107b06391caae4ee49897d6b8d58ec24aff4842bde72b9f024bb29c"],
  ["src/sound.js?h=cb51f44f53","cb51f44f53cc48fd81907a71051e13d74018693d5993b5900aad8df57d7676e9"],
  ["src/splash.js?h=ce861cb659","ce861cb659aafb449bf7f3e3841fbd48af322d87cbd5dd483528b14740149fac"],
  ["src/store.js?h=67671e2d0d","67671e2d0daac1b2ac46b80bc543ef95e65d8fb66dd88b19d46318b9cfd8fa50"],
  ["src/streak.js?h=943c841bb1","943c841bb1ad78600e8cf3ef5f3469472bf203ed4d83573c19b09b3ef9459a4e"],
  ["src/supabaseLoader.js?h=58e0bad0a9","58e0bad0a9899bd06c30263640d6d391e56637b20e0bea223d4c70c8f8ca238b"],
  ["src/swClient.js?h=60e3a93ff4","60e3a93ff44f9cf97f1be9a1e941c0dc8a3ed3e538e0288133f00ae89ef47ca9"],
  ["src/tournament.js?h=cfa5bae95b","cfa5bae95ba405adcd6f7e163ed65a883b6401343c0e5b962d777453e2e0f5cf"],
  ["src/tournamentNames.js?h=23cf850fb8","23cf850fb81f97c47c38beda133452eed49a335a45682d8e70183422e48d6551"],
  ["src/ui/button.js?h=0766137007","0766137007731a2641a749c06f53c2fa84cd3befdc6eb8b08eddf97d22a0ef19"],
  ["src/ui/coinText.js?h=e583d76b98","e583d76b9848839564c5669e8def5f9c5347658ad3b7670a3aabafbd2a82d3e3"],
  ["src/ui/countLine.js?h=a8a80aeea6","a8a80aeea69cf43d7db372297dbbc76f494a39edf6892c2354e09dd74727844e"],
  ["src/ui/eduDataPanel.js?h=9da7017fd9","9da7017fd9fd7236bc19391047bec5cea2dcd3b7e325e2d2da04d44de175b1d3"],
  ["src/ui/eduIntroPanel.js?h=56025c2c69","56025c2c69c57452de146206cdd3855f4024fe5145806e417bb14bd2b1d6918d"],
  ["src/ui/errorCard.js?h=7f58bec2a5","7f58bec2a584c3edacb60042b5a9138ac8dc83ba06cea006df1a6900b3892d49"],
  ["src/ui/finish.js?h=d83b89bc1c","d83b89bc1c6de61f87a27c4aa0d79d907d75df22acc1256501ab90202bf55fa9"],
  ["src/ui/focus.js?h=b203382f71","b203382f717de193d2f9fe8813f8604ed7636c72bdc92d3894bfd59c0fceedf2"],
  ["src/ui/glow.js?h=4e661e8c26","4e661e8c26cfce8abb4361af201bcfa01adc48a2bfe241af4733e5e340efd72e"],
  ["src/ui/helpCard.js?h=a9965fe1d5","a9965fe1d56b050678613676c99b31af9d31ea56409970681881f26c9dd42390"],
  ["src/ui/infoCard.js?h=dcce51a5b0","dcce51a5b02481893e4ea04c52be4d95ad4c70b765bd3366b1e012617b4230fb"],
  ["src/ui/levelBar.js?h=e624aac51c","e624aac51c7e724f652c9eb4bedd1eddc6fb98cec12942cbad6245ad2614bc04"],
  ["src/ui/onlineAccountViews.js?h=2f4502be26","2f4502be265fe9c3e97b4047ba0ea5700078e351b89b024e6881674287c6e8e9"],
  ["src/ui/onlineFriendsViews.js?h=d4608026d3","d4608026d3cda8ffce92edbdeb445cb6b2d5c12e5e74bb382bb1d3ee1d528706"],
  ["src/ui/onlineLobbyViews.js?h=5a819cf468","5a819cf4689097e06abe856b3c4ee1162752b44f7c0cb84333645e039e984f49"],
  ["src/ui/overlayStack.js?h=524d08631f","524d08631fbcd52abef7f363f800b8e5e6f1fba684dc7f01fd237773e38a8712"],
  ["src/ui/pager.js?h=795223e508","795223e508772851aabed115290e04098c484884dc2c8b633d36ac09fa9bba50"],
  ["src/ui/panelFrame.js?h=a192f53fbe","a192f53fbe8b1ddde144f280799ed0d8e297d6c4194487b45e84cdee1805dcee"],
  ["src/ui/perfMeter.js?h=215d26bfda","215d26bfda96c4b0abb5f93f014f02c19a48ea720ba912474c0a4587d5f4c36c"],
  ["src/ui/pipeShade.js?h=9662ccd908","9662ccd9080d961a8ddac7cf46816f7c8d19c665259ab978e723ede2fd1044ef"],
  ["src/ui/savePanel.js?h=52af9d874d","52af9d874df6deccd9570e95c3f246f622afdad8096b2821d02fdf82ef7d76c5"],
  ["src/ui/scrollView.js?h=0fa9865e8a","0fa9865e8afe4521e46ff291e1a8aa370036b6c7c72a0d107170e89289da274e"],
  ["src/ui/shareCard.js?h=1a8cb854b0","1a8cb854b0ac246b0d29ac8f2f9c7d806c773819a77add3884f3aa0cdf3b1495"],
  ["src/ui/snowfall.js?h=2d54bfeb37","2d54bfeb37cb028b6ab4cae943f39e1385ef26d1bbbf253ddf3d1fe33786e182"],
  ["src/ui/tabs.js?h=dbda91317c","dbda91317cb48cec7e58fcc2ec519dd20d482cbbdbbf44826e6b2cd07c10f89e"],
  ["src/ui/toggle.js?h=30040abc11","30040abc11e06ca169de91e87b9454d56796805c1b3e3a5cce0b233ac4cc5531"],
  ["src/ui/tournamentPanel.js?h=5715a22ac3","5715a22ac3a9b023cfb9f5fe29169aadf56b45bccce4ba4701804141b67d95c6"],
  ["src/ui/tray.js?h=874120a491","874120a491843832503796e5ec2bc12f2935aeab87b6673958009aae092f7ba8"],
  ["src/versus.js?h=32d4a16c4f","32d4a16c4fc0e9818b2beb55ed8a9d357851ef8181460dcb8b36f3b4ebd8f68b"],
  ["assets/advent/advent-puzzle.png?v=0.37.0","d36dac532ab62cb6d8ae38af0d254012e74620b92f1b2edb6e8c90575ec06377"],
  ["assets/advent/advent.png?v=0.37.0","68cc27113b43af31f3e3ea920cbb99c3b1f557bdbc72d1ece437d641a4c42a63"],
  ["assets/advent/bacteria-santa.png?v=0.37.0","f418d648508d13fb9f484c778f219aaea35dc2a0d28497a4cceaebdc7fd8eeae"],
  ["assets/advent/bean-holly.png?v=0.37.0","b0867a63a4f8a11361855bf8090a6d3d51b13f3254b2cf5613958ace30c32ca0"],
  ["assets/advent/bowelidays.png?v=0.37.0","374f25d4c7b271c57cb5e5ce74f2cdb6ee31fedc0c84abdeb0d0c3a116ef5c56"],
  ["assets/advent/candy-cane.png?v=0.37.0","fa1708f80d317078da254e350652f8f37edf56bc5e10153bbe0de4ca69405329"],
  ["assets/advent/fairy-lights.png?v=0.37.0","7075e5f544abda70f820c756eb6cfd7f1f5e14e3bd52b2272aeec853125d83ba"],
  ["assets/advent/gingerbread.png?v=0.37.0","db8cdd90aaf03f1703a0ca0e26fa8781810dcf6522fd59187c1b3ca11bbb26d3"],
  ["assets/advent/pipe-snow.png?v=0.37.0","12fc7419ad38d871774431903e33cc373bb2c5daa092ae4f16a25766f2333a6b"],
  ["assets/advent/poop-dead-santa.png?v=0.37.0","bcf87c8e14e69ee2ee21e19bf19050f26359435e411cac85926e428314171eef"],
  ["assets/advent/poop-falling-santa.png?v=0.37.0","9b2387a2590c01e363f942ede6b76caad8cf4da38f7e8b0a71344afd62aaddfe"],
  ["assets/advent/poop-fart-santa1.png?v=0.37.0","e10849057fc7cf3bf70a010572af6e83a6aa163a21db6096a44f990e16fb8bf7"],
  ["assets/advent/poop-fart-santa2.png?v=0.37.0","30f7800a9b4474eb58af6feb5f882e88393fc6694ffe4800bb569930202e83f2"],
  ["assets/advent/poop-santa.png","ecf775cd1cd05edd7367a6d0b0339b5f63a5da8d5e0a291f4da185e886067541"],
  ["assets/advent/poop-santa.png?v=0.37.0","ecf775cd1cd05edd7367a6d0b0339b5f63a5da8d5e0a291f4da185e886067541"],
  ["assets/advent/poop-scared-santa.png?v=0.37.0","6300af1c896b715a2551b22fda405a5cbd9a67f0e7dd4ae9e1807153bd7b7086"],
  ["assets/advent/poop-speech-santa.png?v=0.37.0","276833bb5d4df21cae41998afa5d50050f95e59901f65ddc2b7d6350285ce6c3"],
  ["assets/advent/poop-stink-falling1-santa.png?v=0.37.0","b39baf3d109ee18cf3efaa5be9ca4d126da0e1f99d383f5450c7279d75ba10fe"],
  ["assets/advent/poop-stink-falling2-santa.png?v=0.37.0","d5a2bc6cf364f987d825bd7b7a5c28aebf0f1d356b3db25fb4e7f298f54a4188"],
  ["assets/advent/poop-stink-scared1-santa.png?v=0.37.0","fbbfdb05047d816781b16bb7342353993eecd7a560a5fab44f3ca2a74f353744"],
  ["assets/advent/poop-stink-scared2-santa.png?v=0.37.0","0d3f94f8b191b0793f2841ccc244110f8e630a02b884c5fa4bc3c23b78edb4fe"],
  ["assets/advent/poop-stink1-santa.png?v=0.37.0","f64c5004a6ab2b2b341fadaf7725f1501e316b1600a5eb79c51507cd3de09fdb"],
  ["assets/advent/poop-stink2-santa.png?v=0.37.0","20382cb4409e939b496c1ae2e15751dd41e312045f6d5ef3b40f3dea193028ed"],
  ["assets/bacteria.png?v=0.37.0","f5688bb81068fd31356a5d4404b377581174770166f1189aade94ac9dc0ab080"],
  ["assets/bean.png?v=0.37.0","4a0349c04470d95650559e06f10feeae00cd5117adfab20a1eb9dd6292e80eac"],
  ["assets/ceiling.png?v=0.37.0","3407d8ea265c4b5a9b5df9356cc9b725e68f35594d5cea2e04d1e82458206653"],
  ["assets/coin.png?v=0.37.0","aa7a521d563ab58fa228d63286bffef7b5f011dbd67e802ceffe79302d08118b"],
  ["assets/fiber.png?v=0.37.0","2356cd0e5651cdf9145b5bdbd4cdde66cb93d55d7ba53928b39f7d6ab35cffe3"],
  ["assets/ground.png?v=0.37.0","875352131418c708a30a0f2acb95dd2317dd991b2745a7c8eebf97c7151dc439"],
  ["assets/mystery-icon.png?v=0.37.0","912c2aa1260fadc247ff4800b86bf3dead8533f3802e4c15e3659db2c86f79a1"],
  ["assets/mystery.png?v=0.37.0","90ad3f07a4693a6305e76f4161655c3f747be6ecd734ba0c7a0e1bfdb25280ee"],
  ["assets/pipe.png?v=0.37.0","768541fbb67a8af6edd27d006a6bc1b9974f9454d4e28f4ff326681e26f35539"],
  ["assets/poop-dead.png?v=0.37.0","1e6ab4a6a9e46046d26881d3e08dfd03d4798b68b8690cd342ad41b949d127d5"],
  ["assets/poop-falling.png?v=0.37.0","08128bf4dce96ad81dd25c3a6e94dfadacea3b8bb8467b9c5605a86036d27523"],
  ["assets/poop-fart.png?v=0.37.0","9a92545b80f6b86b0afa769c5ee6062d9499e124c656f5690a3d02d3e641d0c5"],
  ["assets/poop-scared.png?v=0.37.0","f607079ad15c950916ca951cf02e58f5bedffc8f0c006f7ea1c239e1e5ea4901"],
  ["assets/poop-speech.png?v=0.37.0","8bd4c4c25f4b5a50c487fc3b2bce6eae1a92c6d9e8c50f5d0d0ef390bf02fbc3"],
  ["assets/poop-stink-falling1.png?v=0.37.0","a8b382cc0087dbc57675c59d90263696258a298356a99daa019fe236367dba55"],
  ["assets/poop-stink-falling2.png?v=0.37.0","e9eb7b3d2b2b0ac9969a3d1b80ac10e20e5673b623d99110de0888c6896e0094"],
  ["assets/poop-stink-scared1.png?v=0.37.0","353fc7e040bd2ac518f1279c788da6c86304b1758876a5c60f38436d01df2c22"],
  ["assets/poop-stink-scared2.png?v=0.37.0","1c4c81a5e9ad73c31f5617ef222de10388db9a4fcb2cf1b36ecd2793dda3a4b4"],
  ["assets/poop-stink1.png?v=0.37.0","03ae09b0ddd9d5b4d7ac915edeba9a1bf0edd5780ced86813872e3ff1a1d5845"],
  ["assets/poop-stink2.png?v=0.37.0","99ddf3abea5082a2c931d8ecfc7f11d812975e386d6fa3973a670ece30373739"],
  ["assets/poop.png","34a8b394dca48ec6d8a1b55abae46f8be9cc499c63a71c88292a8a8bd1a85afa"],
  ["assets/poop.png?v=0.37.0","34a8b394dca48ec6d8a1b55abae46f8be9cc499c63a71c88292a8a8bd1a85afa"],
  ["assets/postbiotic.png?v=0.37.0","958141238bbf946486af85c1114102dd85b440e62ce2a9954267a62c6885bf94"],
  ["assets/probiotic.png?v=0.37.0","539cd9fe523da3ffe13fa76274477b4ff860ddb988536c945d2ad1787efd61d8"],
  ["assets/question.png?v=0.37.0","1cbd5bd2bda370e1a8be561d12094eb7b2f37cfa90a70af0a190730f7780c194"],
  ["assets/sfx/Advent_Blizzard.mp3?v=0.37.0","b1d064c849d5ca21688fe33f02ca5d7bfb663eba32b92cd8abcf94c3b52c2789"],
  ["assets/sfx/Advent_PieceAdd.mp3?v=0.37.0","5eaf8bee06307943441bc9e37aec0f5b3fa95c9e413c8f12e790cb4c88c31edc"],
  ["assets/sfx/Advent_PieceFound.mp3?v=0.37.0","206098e3b38858e5e53e0122eaf1d81f76198f25d7bbb797d1dbab44d7a95f74"],
  ["assets/sfx/Advent_PieceLock.mp3?v=0.37.0","69d792a912294e29159d16013af300bb38f4907814b01ea57a2d57ee5893bc27"],
  ["assets/sfx/Book_Close.mp3?v=0.37.0","4b024ae4d49d6532b5415c88c0438754d7b0aa4dcb1d7b93e4d688a8e15f7a77"],
  ["assets/sfx/Book_Open.mp3?v=0.37.0","137b6b7a15b5415671589c5094394ff9e343000bec42650e04917b0541045ded"],
  ["assets/sfx/Book_PageTurn.mp3?v=0.37.0","c5183ae858446001cd6761b28ccc66ad15dd0c562c1828e675d5dfb7778f497f"],
  ["assets/sfx/Bubble_Pop.mp3?v=0.37.0","bb2b4b4514f3f5793a3fa04a8552812f2564f98c99da7a2b1e4d168c184dad28"],
  ["assets/sfx/Coin_Pickup.mp3?v=0.37.0","fa8ac6d3d7b33c926dd1043432298612f8a7f27f8ec0edb92e1d282bcc663269"],
  ["assets/sfx/Coin_Spend.mp3?v=0.37.0","af8a9ec4d8b718703980c28b58c851aacf515da9fc1e2d90ac592d1295d0ef76"],
  ["assets/sfx/NewLevel.mp3?v=0.37.0","4645c4f92274855c6c93c3165a20c22f33220d6f7b44ed952ccf8e83d37fef69"],
  ["assets/sfx/ShopOpenClose.mp3?v=0.37.0","58ba4a2696bf79eeb208ce768f9922856247d11c0b9f98c9cbcbd0bad35cecd0"],
  ["assets/sfx/Sparkle_Restore.mp3?v=0.37.0","7ef89d2e8bbc02e558b0bdbad3e0ae67b171ff8759e59a24bcd69ba0124f71e8"],
  ["assets/sfx/ToiletFlush_Win.mp3?v=0.37.0","9dc15566e2dfd8133e61fb40abcf270d21893138ebdbbd5f9677da256c2620c9"],
  ["assets/sfx/fart.mp3?v=0.37.0","9874fb9954bc1ccb7c115822eb6e45ecbe25c2fe6e27f761dc4c9cd22a016a01"],
  ["assets/sfx/fart_accelerate.mp3?v=0.37.0","1cd97c47133cfa31fea6ff01be87a628b7b7fdac35812cd0343e7a5eea162ff4"],
  ["assets/vendor/phaser.min.js?v=4.2.1","66348b1b5141e49b7d5ebbe688cddcb502eab1cb00f21c538686a5b2c5abe4de"],
  ["assets/vendor/supabase.js?v=2.119.0","a867edbcfb029370aeec7223dd6180b560b621fbe3bc64c6584fb0369d1b7bce"],
  ["assets/villi.png?v=0.37.0","1c6ae49da1d7180d1118cc4359efec9d0565d715859ffa515d6b7ae8eb6cf4b0"]
];
// --- end of stamp ---

const PREFIX = 'flappy-poop-';
const NAME = PREFIX + BUILD;
const INDEX = 'index.html';
const INDEX_WAIT_MS = 3000; // a slow network shows the cached build instead of a blank screen
const INSTALL_POOL = 6; // files fetched at once during an install

const scope = () => self.registration.scope;
const abs = (url) => new URL(url, scope()).href;

let listed = null; // absolute URL → hash, for every file but index.html (which answers navigations only)
const files = () => {
  if (!listed) listed = new Map(FILES.filter(([u]) => u !== INDEX).map(([u, h]) => [abs(u), h]));
  return listed;
};

async function sha256(buffer) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Our caches other than this build's, oldest first (Cache Storage keeps creation order). */
async function otherCaches() {
  return (await caches.keys()).filter((n) => n.startsWith(PREFIX) && n !== NAME);
}

/** A response the cache or a navigation can take: a redirected one is rebuilt (a navigation refuses it). */
function plain(res, body = res.body) {
  return res.redirected ? new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers }) : res;
}

/** One file into this build's cache, hash-checked. Throws when it cannot be had (the install fails). */
async function store(cache, others, url, hash) {
  if (await cache.match(url)) return; // an install run again: stored and checked the first time
  for (const name of others) {
    const old = await caches.match(url, { cacheName: name });
    if (old && (await sha256(await old.clone().arrayBuffer())) === hash) {
      await cache.put(url, old);
      return;
    }
  }
  for (const mode of ['default', 'reload']) {
    const res = await fetch(url, { cache: mode }); // offline: rejects, and the install fails
    if (!res.ok) continue;
    const body = await res.clone().arrayBuffer();
    if ((await sha256(body)) !== hash) continue; // a stale HTTP or CDN copy: once more past the HTTP cache
    await cache.put(url, plain(res, body));
    return;
  }
  throw new Error(`sw.js: ${url} does not match its hash in build ${BUILD}`);
}

async function install() {
  if (!BUILD) return;
  const cache = await caches.open(NAME);
  const others = (await otherCaches()).reverse(); // the newest first: most likely to hold the same bytes
  const queue = FILES.map(([u, h]) => [abs(u), h]);
  const worker = async () => {
    while (queue.length) {
      const [url, hash] = queue.shift();
      await store(cache, others, url, hash);
    }
  };
  await Promise.all(Array.from({ length: INSTALL_POOL }, worker));
}

async function activate() {
  const older = await otherCaches();
  const keep = BUILD ? older.slice(-1) : []; // the previous build's; unstamped, none of ours is any use
  await Promise.all(older.filter((n) => !keep.includes(n)).map((n) => caches.delete(n)));
  await self.clients.claim();
}

/** index.html: the network's copy when it answers in time and ok, else this build's, else the network's answer as it is. */
async function page(request) {
  let timer = null;
  const net = fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' });
  const late = new Promise((resolve) => {
    timer = setTimeout(resolve, INDEX_WAIT_MS, null);
  });
  const first = await Promise.race([net.catch(() => null), late]);
  clearTimeout(timer);
  if (first && first.ok) return plain(first);
  const copy = await caches.match(abs(INDEX), { cacheName: NAME });
  if (copy) return copy;
  return plain(await net);
}

/** A listed file: this build's cache, then the previous build's, then the network. A refetch (Reload) asks the network first. */
async function file(request, url) {
  if (request.cache === 'reload' || request.cache === 'no-cache' || request.cache === 'no-store') {
    try {
      const res = await fetch(request);
      if (res.ok) return res;
    } catch {
      /* offline: the cache below */
    }
  }
  for (const name of [NAME, ...(await otherCaches()).reverse()]) {
    const hit = await caches.match(url, { cacheName: name });
    if (hit) return hit;
  }
  return fetch(request);
}

/** The answer to a request, or null to leave it to the browser. */
function route(request) {
  if (!BUILD || request.method !== 'GET') return null;
  if (request.headers.has('range') || (request.headers.get('upgrade') ?? '').toLowerCase() === 'websocket') return null;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(scope())) return null;
  if (request.mode === 'navigate') {
    const path = url.origin + url.pathname;
    if (url.searchParams.has('nosw') || (path !== scope() && path !== abs(INDEX))) return null;
    return page(request).catch(() => fetch(request));
  }
  url.hash = '';
  if (!files().has(url.href)) return null;
  return file(request, url.href).catch(() => fetch(request));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    install().then(
      () => self.skipWaiting(),
      (err) => {
        console.error(`sw.js: build ${BUILD} not installed: ${err?.message ?? err}`); // the old worker stays
        throw err;
      },
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(activate());
});

self.addEventListener('fetch', (event) => {
  const answer = route(event.request);
  if (answer) event.respondWith(answer);
});
