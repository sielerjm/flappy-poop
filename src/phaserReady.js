// The Phaser gate (plan 35, 1.2). index.html loads Phaser from the CDN, or the vendored copy in
// assets/vendor/ when the CDN fails or stalls, and resolves __flappyBoot.phaser once the global exists.
// main.js and every scene import this module first: a module waits on its own imports' top-level await
// (siblings do not), so no `extends Phaser.Scene` and no `new Phaser.Game` runs before Phaser is there,
// while the browser still fetches the whole module graph alongside the Phaser download. In Node (the
// tests) there is no __flappyBoot and it resolves at once.
await globalThis.__flappyBoot?.phaser;
