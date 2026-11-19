// The phone link for a two-phone check on a test project (plan 39, item 38). Online play talks to the
// live project unless, on a dev host, the page was opened once with ?onlinetest=<code>: the browser then
// keeps that test project (src/onlineNet.js onlineProjectConfig) until ?onlinetest=off. This prints the
// link for each of this Mac's LAN addresses (npm start serves the game on port 8000), to send to the
// phones on the same Wi-Fi. The URL and key come from the env file, kept outside the repo.
//
//   node tools/online_test_link.mjs --env <file> [--port 8000]   <file> is {"url": "https://<ref>.supabase.co", "key": "sb_publishable_..."}
//
// The publishable key is public by design, but the link carries it: send it only to the phones testing.

import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { DEV_PROJECT_PARAM, devProjectFrom, encodeDevProject } from '../src/onlineNet.js';

const argv = process.argv.slice(2);
const at = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};
const envFile = at('--env');
const port = Number(at('--port') ?? 8000);
if (!envFile || !Number.isInteger(port)) {
  console.error('usage: node tools/online_test_link.mjs --env <file> [--port 8000]');
  process.exit(2);
}
let project;
try {
  project = devProjectFrom(JSON.parse(readFileSync(envFile, 'utf8')));
} catch (e) {
  console.error(`cannot read ${envFile}: ${e.message}`);
  process.exit(2);
}
if (!project) {
  console.error(`${envFile} needs {"url": "https://<ref>.supabase.co", "key": "..."}`);
  process.exit(2);
}
const code = encodeDevProject(project);
const lan = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a.address);
console.log(`Test project ${project.url}. Open once on each phone (the browser keeps it; ?${DEV_PROJECT_PARAM}=off forgets it):`);
for (const host of lan.length ? lan : ['localhost']) console.log(`  http://${host}:${port}/?${DEV_PROJECT_PARAM}=${code}`);
