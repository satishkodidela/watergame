// Inline every module into one self-contained dist/index.html (for artifact
// previews and single-file platform uploads). No dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const order = ['gl', 'rng', 'worlds', 'levels', 'skeletons', 'shaders', 'water', 'renderer', 'input', 'audio', 'game', 'main'];
let js = '';
for (const name of order) {
  let src = fs.readFileSync(path.join(root, 'src', name + '.js'), 'utf8');
  src = src.replace(/^import\s[^;]*;\s*$/gm, '');          // drop imports (all local)
  src = src.replace(/^export\s*\{[^}]*\};?\s*$/gm, '');      // drop re-exports
  src = src.replace(/^export\s+(?=(const|let|class|function)\b)/gm, '');
  if (/^(import|export)\b/m.test(src)) throw new Error(`unhandled import/export in ${name}.js`);
  js += `\n// ---- src/${name}.js ----\n${src}\n`;
}
if (js.includes('</script')) throw new Error('script terminator inside source');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tag = '<script type="module" src="src/main.js"></script>';
if (!html.includes(tag)) throw new Error('script tag not found in index.html');
html = html.replace(tag, `<script type="module">${js}</script>`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
console.log(`dist/index.html: ${(html.length / 1024).toFixed(0)} KB`);

// Optional: a CrazyGames build (same bundle plus their SDK script tag):
//   node tools/bundle.mjs --crazygames dist/crazygames/index.html
const ci = process.argv.indexOf('--crazygames');
if (ci > 0 && process.argv[ci + 1]) {
  const cg = html.replace('<script type="module">', '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n<script type="module">');
  fs.mkdirSync(path.dirname(process.argv[ci + 1]), { recursive: true });
  fs.writeFileSync(process.argv[ci + 1], cg);
  console.log(`${process.argv[ci + 1]}: ${(cg.length / 1024).toFixed(0)} KB`);
}

// Optional second output: a body-only fragment for hosts that wrap the page in
// their own document skeleton (e.g. claude.ai artifacts). Usage:
//   node tools/bundle.mjs --fragment path/to/out.html
const fi = process.argv.indexOf('--fragment');
if (fi > 0 && process.argv[fi + 1]) {
  const pick = (re) => (html.match(re) || ['', ''])[0];
  const title = pick(/<title>[\s\S]*?<\/title>/);
  const style = pick(/<style>[\s\S]*?<\/style>/);
  const body = (html.match(/<body>([\s\S]*)<\/body>/) || ['', ''])[1];
  const frag = `${title}\n<style>:root{color-scheme:dark}</style>\n${style}\n${body}`;
  fs.writeFileSync(process.argv[fi + 1], frag);
  console.log(`${process.argv[fi + 1]}: ${(frag.length / 1024).toFixed(0)} KB`);
}
