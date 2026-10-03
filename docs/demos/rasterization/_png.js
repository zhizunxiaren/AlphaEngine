/* ==================================================================
   最小 PNG 编码器（无依赖）
   ------------------------------------------------------------------
   为什么需要它：本会话沙箱不允许创建子进程，起不了浏览器，
   截图工具一律不可用。但「看不到画面」不等于「不用验画面」——
   页面里所有像素本来就是 JS 算出来再上屏的，那些帧缓冲 / 上屏快照
   可以直接编码成 PNG 拿来看。

   _preview.js（导出各节真实帧缓冲）与 _probe1.js（导出各画布上屏像素）
   共用这一份，免得两处各抄一遍、日子久了悄悄长歪。
   ================================================================== */
const fs = require('fs');
const zlib = require('zlib');

const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function writePNG(file, w, h, rgb) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = rgb[y * w * 3 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

/* ---------- 画布：往大图里贴小图（最近邻放大）+ 边框 ---------- */
const enc = (v) => { const c = Math.max(0, Math.min(1, v)); return Math.round(255 * Math.pow(c, 1 / 2.2)); };

function makeCanvas(W, H, bg) {
  const c = { W, H, px: new Float32Array(W * H * 3) };
  for (let i = 0; i < W * H; i++) { c.px[i * 3] = bg[0]; c.px[i * 3 + 1] = bg[1]; c.px[i * 3 + 2] = bg[2]; }
  return c;
}
function paste(c, src, sw, sh, dx, dy, scale) {
  for (let y = 0; y < sh * scale; y++) {
    const sy = Math.floor(y / scale), ty = dy + y;
    if (ty < 0 || ty >= c.H) continue;
    for (let x = 0; x < sw * scale; x++) {
      const sx = Math.floor(x / scale), tx = dx + x;
      if (tx < 0 || tx >= c.W) continue;
      const s = (sy * sw + sx) * 3, d = (ty * c.W + tx) * 3;
      c.px[d] = src[s]; c.px[d + 1] = src[s + 1]; c.px[d + 2] = src[s + 2];
    }
  }
}
function border(c, x, y, w, h, col) {
  const put = (px, py) => {
    if (px < 0 || py < 0 || px >= c.W || py >= c.H) return;
    const d = (py * c.W + px) * 3;
    c.px[d] = col[0]; c.px[d + 1] = col[1]; c.px[d + 2] = col[2];
  };
  for (let i = 0; i < w; i++) { put(x + i, y); put(x + i, y + h - 1); }
  for (let j = 0; j < h; j++) { put(x, y + j); put(x + w - 1, y + j); }
}
/* 把 float 帧缓冲（线性 RGB）转成 0..1 的显示值 */
function fbToRGB(fb) {
  const n = fb.W * fb.H, out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = enc(fb.col[i * 3]) / 255;
    out[i * 3 + 1] = enc(fb.col[i * 3 + 1]) / 255;
    out[i * 3 + 2] = enc(fb.col[i * 3 + 2]) / 255;
  }
  return out;
}
/* 把上屏快照（RGBA 字节）转成 0..1 的显示值 */
function rgbaToRGB(snap) {
  const n = snap.width * snap.height, out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = snap.data[i * 4] / 255;
    out[i * 3 + 1] = snap.data[i * 4 + 1] / 255;
    out[i * 3 + 2] = snap.data[i * 4 + 2] / 255;
  }
  return out;
}
function saveCanvas(file, canvas) {
  const rgb = new Uint8Array(canvas.W * canvas.H * 3);
  for (let i = 0; i < canvas.W * canvas.H * 3; i++) rgb[i] = Math.round(canvas.px[i] * 255);
  writePNG(file, canvas.W, canvas.H, rgb);
}

module.exports = { writePNG, makeCanvas, paste, border, enc, fbToRGB, rgbaToRGB, saveCanvas };
