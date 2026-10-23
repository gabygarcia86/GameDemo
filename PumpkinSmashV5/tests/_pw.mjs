// Resolves Playwright whether it is installed locally or globally (override with PLAYWRIGHT_MODULE_DIR).
import { createRequire } from 'module';
const dirs = [process.env.PLAYWRIGHT_MODULE_DIR, process.cwd() + '/', '/opt/npm-tools/node_modules/'].filter(Boolean);
let pw = null;
for (const d of dirs) {
  try { pw = createRequire(d.endsWith('/') ? d : d + '/')('playwright'); break; } catch (_) { /* try next */ }
}
if (!pw) throw new Error('Playwright not found. Run `npm i -D playwright` or set PLAYWRIGHT_MODULE_DIR.');
export const chromium = pw.chromium;
export const LAUNCH_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle'];
