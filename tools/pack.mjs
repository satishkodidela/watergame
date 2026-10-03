// Minimal zip writer (deflate), no dependencies: node tools/pack.mjs <dir> <out.zip>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [, , dir, out] = process.argv;
if (!dir || !out) { console.error('usage: node tools/pack.mjs <dir> <out.zip>'); process.exit(1); }

const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
const dosDate = (d) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;

const files = [];
(function walk(rel) {
  for (const name of fs.readdirSync(path.join(dir, rel))) {
    const r = rel ? rel + '/' + name : name;
    const st = fs.statSync(path.join(dir, r));
    if (st.isDirectory()) walk(r); else files.push(r);
  }
})('');

const parts = [], central = [];
let offset = 0;
const now = new Date();
for (const rel of files) {
  const data = fs.readFileSync(path.join(dir, rel));
  const comp = zlib.deflateRawSync(data, { level: 9 });
  const name = Buffer.from(rel.replace(/\\/g, '/'), 'utf8');
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
  local.writeUInt16LE(dosTime(now), 10); local.writeUInt16LE(dosDate(now), 12); local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8); cd.writeUInt16LE(8, 10);
  cd.writeUInt16LE(dosTime(now), 12); cd.writeUInt16LE(dosDate(now), 14); cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(name.length, 28);
  cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32); cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36); cd.writeUInt32LE(0, 38); cd.writeUInt32LE(offset, 42);
  parts.push(local, name, comp);
  central.push(cd, name);
  offset += local.length + name.length + comp.length;
}
const cdBuf = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([...parts, cdBuf, eocd]));
console.log(`${out}: ${files.length} file(s), ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
