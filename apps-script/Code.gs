/**
 * Jasmine Crackers backend (Google Apps Script, bound to the Google Sheet).
 * Storage: Google Sheet tabs PRODUCTS, ORDERS, ORDER_ITEMS. Images: a Google Drive folder.
 *
 * PUBLIC (no login):   GET ?action=products | POST placeOrder | POST trackOrder (order ID + phone must match)
 * ADMIN (session token required on EVERY call): login -> token, then dashboard, productAdd, productUpdate,
 *                      productPatch, productDelete, uploadImage, orderStatus, changePassword, logout
 *
 * Admin password: never stored in plain text. Only a salted hash is kept in Script Properties.
 * First-time setup: see README.txt (run setup(), then setupAdminCredentials()).
 * Responses: { success: true, message, data }  or  { success: false, message, code }
 */
const SH = { P: 'PRODUCTS', O: 'ORDERS', I: 'ORDER_ITEMS' };
const PCOLS = ['id','name','category','price','originalPrice','description','imageUrl','stockStatus','isActive','createdAt','updatedAt'];
const OCOLS = ['orderId','customerName','phone','address','instructions','totalAmount','orderStatus','createdAt','updatedAt'];
const ICOLS = ['orderId','productId','productName','quantity','price','subtotal'];
const STATUSES = ['Order Placed','Order Confirmed','Preparing','Ready for Delivery','Out for Delivery','Delivered','Cancelled'];
const STOCK = ['In Stock','Out of Stock'];
const HASH_ROUNDS = 2000;          // salted, iterated SHA-256 (Apps Script has no bcrypt)
const SESSION_IDLE = 7200;         // seconds of inactivity before the admin session expires (2 h)
const SESSION_MAX = 8 * 3600 * 1000; // absolute session lifetime (8 h)
const MAX_LOGIN_FAILS = 5, LOCK_SECONDS = 900;
const MAX_BODY = 2800000, MAX_IMAGE_BYTES = 2000000;
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ================= one-time setup (run from the Apps Script editor) =================
function setup() {
  const ss = SpreadsheetApp.getActive();
  [[SH.P, PCOLS, ['A:C','F:H','J:K']], [SH.O, OCOLS, ['A:E','G:I']], [SH.I, ICOLS, ['A:C']]].forEach(function (t) {
    const name = t[0], cols = t[1];
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() > 0) {
      const have = sh.getRange(1, 1, 1, cols.length).getValues()[0].map(String).join();
      if (have !== cols.join()) throw new Error('Tab ' + name + ' already exists with different columns. Delete or rename it, then run setup() again.');
    } else sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.getRange(1, 1, 1, cols.length).setFontWeight('bold'); sh.setFrozenRows(1);
    t[2].forEach(function (r) { sh.getRange(r).setNumberFormat('@'); });   // plain text: input can never run as a formula
  });
  console.log('Sheets ready: PRODUCTS, ORDERS, ORDER_ITEMS');
}

/** Reads ADMIN_USERNAME + ADMIN_INITIAL_PASSWORD from Script Properties, stores only a salted hash, then deletes the plain password. Run again any time to reset a forgotten password. */
function setupAdminCredentials() {
  const sp = PropertiesService.getScriptProperties();
  const user = str(sp.getProperty('ADMIN_USERNAME')).toLowerCase(), pw = sp.getProperty('ADMIN_INITIAL_PASSWORD') || '';
  if (!user || pw.length < 8) throw new Error('Add Script properties ADMIN_USERNAME and ADMIN_INITIAL_PASSWORD (min 8 characters) first.');
  const salt = Utilities.getUuid();
  sp.setProperties({ ADMIN_USERNAME: user, ADMIN_SALT: salt, ADMIN_HASH: hashPw(pw, salt), SESSION_EPOCH: String(num(sp.getProperty('SESSION_EPOCH')) + 1) });
  sp.deleteProperty('ADMIN_INITIAL_PASSWORD');
  console.log('Admin credentials saved (hash only). ADMIN_INITIAL_PASSWORD has been deleted. All old sessions are now invalid.');
}

// ================= helpers =================
const prop = k => PropertiesService.getScriptProperties().getProperty(k);
const cache = () => CacheService.getScriptCache();
const str = v => String(v == null ? '' : v).trim();
const num = v => Number(v) || 0;
const r2 = n => Math.round(n * 100) / 100;
const toBool = v => v === true || String(v).toLowerCase() === 'true';
const safeCell = v => { v = str(v); return /^[=+\-@\t\r]/.test(v) ? "'" + v : v; };   // stops spreadsheet formula injection from customer text
const maskName = v => { const p = str(v).split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[1].charAt(0) + '.' : p[0]; };
const toIso = v => v instanceof Date ? v.toISOString() : String(v || '');
function hex(bytes) { return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join(''); }
const SHA_K = (function () { const k = [], pr = []; for (let n = 2; pr.length < 64; n++) { let p = true; for (let d = 2; d * d <= n; d++) if (n % d === 0) { p = false; break; } if (p) pr.push(n); }
  pr.forEach(function (p) { k.push(Math.floor((Math.pow(p, 1 / 3) % 1) * 4294967296) | 0); }); return k; })();
const SHA_H0 = (function () { const h = [2, 3, 5, 7, 11, 13, 17, 19]; return h.map(function (p) { return Math.floor((Math.sqrt(p) % 1) * 4294967296) | 0; }); })();
/** SHA-256 in plain JavaScript (UTF-8 input, hex output). ~100x faster here than calling Utilities.computeDigest 2000 times, and gives identical hashes. */
function sha(s) {
  const b = unescape(encodeURIComponent(String(s))), l = b.length, nw = (((l + 8) >> 6) + 1) * 16, w = new Array(nw).fill(0);
  for (let i = 0; i < l; i++) w[i >> 2] |= b.charCodeAt(i) << (24 - (i % 4) * 8);
  w[l >> 2] |= 0x80 << (24 - (l % 4) * 8); w[nw - 1] = l * 8;
  const H = SHA_H0.slice(), x = new Array(64);
  for (let o = 0; o < nw; o += 16) {
    for (let t = 0; t < 64; t++) {
      if (t < 16) x[t] = w[o + t];
      else { const a = x[t - 15], c = x[t - 2]; x[t] = (x[t - 16] + (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + x[t - 7] + (((c >>> 17) | (c << 15)) ^ ((c >>> 19) | (c << 13)) ^ (c >>> 10))) | 0; }
    }
    let a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + SHA_K[t] + x[t]) | 0;
      const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
}
function hashPw(pw, salt) { let h = salt + ':' + pw; for (let i = 0; i < HASH_ROUNDS; i++) h = sha(h + salt); return h; }
function safeEq(a, b) { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; }
/** Errors created with fail() are safe to show to users. Any other error is logged and replaced by a generic message. */
function fail(msg, code) { const e = new Error(msg); e.pub = true; e.code = code || 'BAD_REQUEST'; return e; }
function out(ok, data, message, code) {
  const body = ok ? { success: true, message: message || 'OK', data: data === undefined ? {} : data } : { success: false, message: message, code: code || 'ERROR' };
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
function errOut(err) {
  if (err && err.pub) return out(false, null, err.message, err.code);
  console.error(err && err.stack ? err.stack : String(err));
  return out(false, null, 'Something went wrong. Please try again.', 'SERVER');
}
function tab(name) { const sh = SpreadsheetApp.getActive().getSheetByName(name); if (!sh) throw new Error('Missing tab ' + name + '. Run setup().'); return sh; }
function genId(prefix, taken) {
  for (let n = 0; n < 20; n++) {
    const h = Utilities.getUuid().replace(/-/g, ''); let s = '';
    for (let i = 0; i < 6; i++) s += ID_CHARS[parseInt(h.substr(i * 2, 2), 16) % 32];
    if (!taken[prefix + s]) return prefix + s;
  }
  throw new Error('Could not generate a unique ID');
}
function count(key, sec, add) { const c = cache(), n = num(c.get(key)); if (add) c.put(key, String(n + 1), sec); return n; }
const normPhone = v => str(v).replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');

// ================= products =================
function readProducts() {
  const sh = tab(SH.P), n = sh.getLastRow(); if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, PCOLS.length).getValues().map(function (r) {
    const o = {}; PCOLS.forEach(function (c, i) { o[c] = r[i]; });
    return { id: str(o.id), name: str(o.name), category: str(o.category), price: Number(o.price),
      originalPrice: o.originalPrice === '' || o.originalPrice == null ? null : Number(o.originalPrice),
      description: str(o.description), imageUrl: str(o.imageUrl), stockStatus: str(o.stockStatus) === 'In Stock' ? 'In Stock' : 'Out of Stock',
      isActive: toBool(o.isActive), createdAt: toIso(o.createdAt), updatedAt: toIso(o.updatedAt) };
  }).filter(function (p) { return p.id && p.name && isFinite(p.price) && p.price > 0; });
}
function publicProduct(p) { return { id: p.id, name: p.name, category: p.category, price: p.price, originalPrice: p.originalPrice, description: p.description, imageUrl: p.imageUrl, stockStatus: p.stockStatus }; }

function clean(p, partial) {
  const o = {}, has = function (k) { return p[k] !== undefined; };
  const text = function (k, min, max, label) {
    if (!has(k)) { if (!partial) throw fail(label + ' is required'); return; }
    const v = str(p[k]); if (v.length < min || v.length > max) throw fail(label + ' must be ' + min + '-' + max + ' characters'); o[k] = v;
  };
  text('name', 2, 80, 'Name'); text('category', 2, 40, 'Category');
  if (has('description')) { const d = str(p.description); if (d.length > 300) throw fail('Description is too long (max 300)'); o.description = d; } else if (!partial) o.description = '';
  if (has('price')) { const n = Number(p.price); if (!isFinite(n) || n <= 0 || n > 10000000) throw fail('Price must be a positive number'); o.price = r2(n); } else if (!partial) throw fail('Price is required');
  if (has('originalPrice')) { if (p.originalPrice === null || p.originalPrice === '') o.originalPrice = ''; else { const n = Number(p.originalPrice); if (!isFinite(n) || n <= 0) throw fail('Original price must be a positive number'); o.originalPrice = r2(n); } } else if (!partial) o.originalPrice = '';
  if (has('imageUrl')) { const u = str(p.imageUrl); if (u && !/^https:\/\/[^\s"'()<>]{4,500}$/i.test(u)) throw fail('Image link must be a valid https link'); o.imageUrl = u; } else if (!partial) o.imageUrl = '';
  if (has('stockStatus')) { if (STOCK.indexOf(p.stockStatus) < 0) throw fail('Invalid stock status'); o.stockStatus = p.stockStatus; } else if (!partial) o.stockStatus = 'In Stock';
  if (has('isActive')) o.isActive = toBool(p.isActive); else if (!partial) o.isActive = true;
  return o;
}
function checkPrices(rec) { if (rec.originalPrice !== '' && rec.originalPrice != null && Number(rec.originalPrice) <= Number(rec.price)) throw fail('Original price must be higher than the selling price (or leave it empty).'); }
function productRow(sh, id) {
  const n = sh.getLastRow(); if (n < 2) return -1;
  const i = sh.getRange(2, 1, n - 1, 1).getValues().map(function (r) { return String(r[0]); }).indexOf(String(id));
  return i < 0 ? -1 : i + 2;
}
function productAdd(req) {
  const sh = tab(SH.P), now = new Date().toISOString(), p = clean(req.product || {}, false); checkPrices(p);
  const taken = {}; readProducts().forEach(function (x) { taken[x.id] = 1; });
  p.id = genId('P-', taken); p.createdAt = now; p.updatedAt = now;
  sh.appendRow(PCOLS.map(function (c) { return p[c]; })); return p;
}
function productSave(req, partial) {
  const sh = tab(SH.P), row = productRow(sh, req.id); if (row < 0) throw fail('Product not found', 'NOT_FOUND');
  const src = partial ? req.changes || {} : req.product || {};
  const changes = clean(partial ? { price: src.price, stockStatus: src.stockStatus, isActive: src.isActive } : src, partial);   // quick edits may only touch price / stock / visibility
  const cur = sh.getRange(row, 1, 1, PCOLS.length).getValues()[0], rec = {}; PCOLS.forEach(function (c, i) { rec[c] = cur[i]; });
  const oldImage = rec.imageUrl; Object.assign(rec, changes, { updatedAt: new Date().toISOString() }); checkPrices(rec);
  sh.getRange(row, 1, 1, PCOLS.length).setValues([PCOLS.map(function (c) { return rec[c]; })]);
  if (changes.imageUrl !== undefined && changes.imageUrl !== str(oldImage)) trashIfOurs(oldImage);
  return rec;
}
function productDelete(req) {
  const sh = tab(SH.P), row = productRow(sh, req.id); if (row < 0) throw fail('Product not found', 'NOT_FOUND');
  const img = sh.getRange(row, 7).getValue(); sh.deleteRow(row); trashIfOurs(img); return { id: req.id };
}

// ================= images (Google Drive) =================
function imageFolder() {
  const sp = PropertiesService.getScriptProperties(), custom = sp.getProperty('DRIVE_FOLDER_ID'), auto = sp.getProperty('DRIVE_FOLDER_ID_AUTO');
  if (custom) { try { return DriveApp.getFolderById(custom); } catch (e) { throw new Error('DRIVE_FOLDER_ID is wrong or not accessible'); } }
  if (auto) { try { return DriveApp.getFolderById(auto); } catch (e) { /* recreate below */ } }
  const f = DriveApp.createFolder('Jasmine Crackers Product Images'); sp.setProperty('DRIVE_FOLDER_ID_AUTO', f.getId()); return f;
}
function sniff(b) {
  const h = function (i) { return (b[i] || 0) & 0xff; };
  if (h(0) === 0xFF && h(1) === 0xD8 && h(2) === 0xFF) return ['image/jpeg', 'jpg'];
  if (h(0) === 0x89 && h(1) === 0x50 && h(2) === 0x4E && h(3) === 0x47) return ['image/png', 'png'];
  if (h(0) === 0x47 && h(1) === 0x49 && h(2) === 0x46) return ['image/gif', 'gif'];
  if (h(0) === 0x52 && h(1) === 0x49 && h(2) === 0x46 && h(8) === 0x57 && h(9) === 0x45 && h(10) === 0x42 && h(11) === 0x50) return ['image/webp', 'webp'];
  return null;
}
function uploadImage(req) {
  const b64 = str(req.dataBase64); if (!b64 || b64.length > MAX_BODY) throw fail('Image is missing or too large.');
  let bytes; try { bytes = Utilities.base64Decode(b64); } catch (e) { throw fail('Image could not be read.'); }
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw fail('Image must be under 2 MB.');
  const kind = sniff(bytes); if (!kind) throw fail('Only JPG, PNG, WEBP or GIF images are allowed.');
  const f = imageFolder().createFile(Utilities.newBlob(bytes, kind[0], 'product-' + Date.now() + '.' + kind[1]));
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { imageUrl: 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w1000' };
}
/** Deletes a replaced/removed product image from Drive, but only if it is a file this system uploaded into its own folder. */
function trashIfOurs(url) {
  try {
    const m = /^https:\/\/drive\.google\.com\/thumbnail\?id=([\w-]{10,})/.exec(str(url)); if (!m) return;
    const file = DriveApp.getFileById(m[1]), folderId = imageFolder().getId(), it = file.getParents();
    while (it.hasNext()) if (it.next().getId() === folderId) { file.setTrashed(true); return; }
  } catch (e) { console.warn('Could not remove old image: ' + e); }
}

// ================= orders =================
function readOrders(limit) {
  const os = tab(SH.O), n = os.getLastRow(); if (n < 2) return { orders: [], total: 0, pending: 0, done: 0 };
  const rows = os.getRange(2, 1, n - 1, OCOLS.length).getValues().filter(function (r) { return r[0]; });
  let pending = 0, done = 0;
  rows.forEach(function (r) { const st = str(r[6]); if (st === 'Delivered') done++; else if (st !== 'Cancelled') pending++; });
  const show = rows.slice().reverse().slice(0, limit || rows.length), items = {};
  const is = tab(SH.I), m = is.getLastRow();                                 // only the newest part of ORDER_ITEMS is read when a limit is set
  if (m >= 2) {
    const first = limit ? Math.max(2, m - limit * 30 + 1) : 2;
    is.getRange(first, 1, m - first + 1, ICOLS.length).getValues().forEach(function (r) { (items[r[0]] = items[r[0]] || []).push({ productId: str(r[1]), name: str(r[2]), qty: Number(r[3]), price: Number(r[4]), subtotal: Number(r[5]) }); });
  }
  return { total: rows.length, pending: pending, done: done, orders: show.map(function (r) {
    return { orderId: str(r[0]), customerName: str(r[1]), phone: str(r[2]), address: str(r[3]), instructions: str(r[4]), totalAmount: Number(r[5]),
      orderStatus: str(r[6]), createdAt: toIso(r[7]), updatedAt: toIso(r[8]), items: items[r[0]] || [] };
  }) };
}
/** Finds ONE order by ID + phone without reading the whole history (fast tracking). */
function findOrder(id, phone) {
  const os = tab(SH.O), n = os.getLastRow(); if (n < 2) return null;
  const ids = os.getRange(2, 1, n - 1, 1).getValues(); let row = -1;
  for (let i = ids.length - 1; i >= 0; i--) { if (String(ids[i][0]) === id) { row = i + 2; break; } }
  if (row < 0) return null;
  const r = os.getRange(row, 1, 1, OCOLS.length).getValues()[0]; if (str(r[2]) !== phone) return null;
  const is = tab(SH.I), m = is.getLastRow(), items = [];
  if (m >= 2) {
    const col = is.getRange(2, 1, m - 1, 1).getValues(); let a = -1, b = -1;
    col.forEach(function (x, i) { if (String(x[0]) === id) { if (a < 0) a = i; b = i; } });
    if (a >= 0) is.getRange(a + 2, 1, b - a + 1, ICOLS.length).getValues().forEach(function (x) { if (String(x[0]) === id) items.push({ productId: str(x[1]), name: str(x[2]), qty: Number(x[3]), price: Number(x[4]), subtotal: Number(x[5]) }); });
  }
  return { orderId: str(r[0]), customerName: str(r[1]), phone: str(r[2]), orderStatus: str(r[6]), createdAt: toIso(r[7]), updatedAt: toIso(r[8]), items: items, totalAmount: Number(r[5]) };
}
function placeOrder(req) {
  if (req.website) throw fail('Rejected');                                // honeypot: real customers leave this empty
  const c = req.customer || {};
  const name = str(c.name), phone = normPhone(c.phone), address = str(c.address), instructions = str(c.instructions), reqId = str(req.requestId);
  if (name.length < 2 || name.length > 80) throw fail('Please enter your name.');
  if (!/^[6-9]\d{9}$/.test(phone)) throw fail('Please enter a valid 10-digit mobile number.');
  if (address.length < 5 || address.length > 300) throw fail('Please enter your delivery address.');
  if (instructions.length > 300) throw fail('Additional instructions are too long (max 300).');
  if (!/^[\w-]{8,64}$/.test(reqId)) throw fail('Invalid request. Please refresh and try again.');
  const done = cache().get('req_' + reqId); if (done) return JSON.parse(done);   // duplicate submission: return the SAME order
  const list = Array.isArray(req.items) ? req.items : [];
  if (!list.length || list.length > 30) throw fail('Your cart is empty or too large.');
  if (count('ord_' + phone, 3600) >= 5) throw fail('Too many orders from this number in the last hour. Please call the shop.', 'RATE');
  const products = readProducts(), seen = {}, lines = [];
  list.forEach(function (i) {                                             // prices come ONLY from the PRODUCTS sheet
    const p = products.filter(function (x) { return x.id === str(i && i.id); })[0], q = Number(i && i.qty);
    if (!p || !p.isActive || p.stockStatus !== 'In Stock') throw fail((p ? p.name : 'An item in your cart') + ' is not available any more. Please review your cart.', 'UNAVAILABLE');
    if (!Number.isInteger(q) || q < 1 || q > 99 || seen[p.id]) throw fail('Invalid quantity.');
    seen[p.id] = 1; lines.push({ productId: p.id, name: p.name, qty: q, price: p.price, subtotal: r2(p.price * q) });
  });
  const total = r2(lines.reduce(function (a, l) { return a + l.subtotal; }, 0));
  const os = tab(SH.O), taken = {}, n = os.getLastRow();
  if (n >= 2) os.getRange(2, 1, n - 1, 1).getValues().forEach(function (r) { taken[r[0]] = 1; });
  const orderId = genId('JC-', taken), now = new Date().toISOString();
  os.appendRow([orderId, safeCell(name), phone, safeCell(address), safeCell(instructions), total, 'Order Placed', now, now]);
  try {
    const is = tab(SH.I), rows = lines.map(function (l) { return [orderId, l.productId, l.name, l.qty, l.price, l.subtotal]; });
    is.getRange(is.getLastRow() + 1, 1, rows.length, ICOLS.length).setValues(rows);
  } catch (e) { os.deleteRow(os.getLastRow()); throw e; }                 // never leave an order without its items
  const result = { orderId: orderId, status: 'Order Placed', customerName: name, phone: phone, address: address, instructions: instructions, items: lines, subtotal: total, total: total, createdAt: now };
  cache().put('req_' + reqId, JSON.stringify(result), 21600); count('ord_' + phone, 3600, true);
  return result;
}
/** Public, but only returns an order when BOTH order ID and phone match. One generic error for every mismatch. */
function trackOrder(req) {
  const id = str(req.orderId).toUpperCase().slice(0, 20), phone = normPhone(req.phone), bad = fail('We could not find an order with these details. Please check the Order ID and phone number.', 'NOT_FOUND');
  if (!/^JC-[A-Z0-9]{6}$/.test(id) || !/^[6-9]\d{9}$/.test(phone)) throw bad;
  const k1 = 'trk_' + sha(id), k2 = 'trp_' + phone;
  if (count(k1, LOCK_SECONDS) >= 5 || count(k2, LOCK_SECONDS) >= 10) throw fail('Too many attempts. Please wait a few minutes and try again.', 'RATE');
  const o = findOrder(id, phone);
  if (!o) { count(k1, LOCK_SECONDS, true); count(k2, LOCK_SECONDS, true); throw bad; }
  return { orderId: o.orderId, customerName: maskName(o.customerName), status: o.orderStatus, createdAt: o.createdAt, updatedAt: o.updatedAt, items: o.items, total: o.totalAmount };
}
function orderStatus(req) {
  if (STATUSES.indexOf(req.status) < 0) throw fail('Invalid status');
  const os = tab(SH.O), n = os.getLastRow(); if (n < 2) throw fail('Order not found', 'NOT_FOUND');
  const i = os.getRange(2, 1, n - 1, 1).getValues().map(function (r) { return String(r[0]); }).indexOf(String(req.orderId));
  if (i < 0) throw fail('Order not found', 'NOT_FOUND');
  os.getRange(i + 2, 7, 1, 3).setValues([[req.status, os.getRange(i + 2, 8).getValue(), new Date().toISOString()]]);
  return { orderId: req.orderId, status: req.status };
}
function dashboard() {
  const products = readProducts(), ro = readOrders(300);                    // newest 300 orders are listed; the counts cover ALL orders
  return { products: products, orders: ro.orders, stats: {
    totalProducts: products.length, activeProducts: products.filter(function (p) { return p.isActive; }).length,
    outOfStock: products.filter(function (p) { return p.stockStatus !== 'In Stock'; }).length,
    totalOrders: ro.total, pendingOrders: ro.pending, completedOrders: ro.done } };
}

// ================= admin authentication =================
function login(req) {
  const user = str(req.username).toLowerCase().slice(0, 100), pw = String(req.password == null ? '' : req.password).slice(0, 200);
  const fk = 'lf_' + sha(user), fa = 'lf_all';
  if (count(fk, LOCK_SECONDS) >= MAX_LOGIN_FAILS || count(fa, LOCK_SECONDS) >= MAX_LOGIN_FAILS * 6) throw fail('Too many failed attempts. Please wait 15 minutes and try again.', 'RATE');
  const au = prop('ADMIN_USERNAME'), salt = prop('ADMIN_SALT'), hash = prop('ADMIN_HASH');
  if (!au || !salt || !hash) throw fail('Admin login is not set up yet. See README step 5.', 'SETUP');
  const okU = safeEq(user, au), okP = safeEq(hashPw(pw, salt), hash);     // both always evaluated
  if (!(okU && okP)) { count(fk, LOCK_SECONDS, true); count(fa, LOCK_SECONDS, true); console.warn('Failed admin login attempt'); Utilities.sleep(700); throw fail('Incorrect username or password.', 'LOGIN'); }
  cache().remove(fk);
  return { token: newSession(au), username: au, expiresInMinutes: SESSION_IDLE / 60 };
}
function newSession(user) {
  const token = Utilities.getUuid() + Utilities.getUuid();                 // two random UUIDs from a secure generator
  cache().put('s_' + sha(token), JSON.stringify({ u: user, c: Date.now(), e: prop('SESSION_EPOCH') || '0' }), SESSION_IDLE);
  return token;
}
function requireAdmin(token) {
  if (typeof token !== 'string' || token.length < 60 || token.length > 100) throw fail('Please sign in.', 'AUTH');
  const c = cache(), k = 's_' + sha(token), raw = c.get(k);
  if (!raw) throw fail('Your session has expired. Please sign in again.', 'AUTH');
  const s = JSON.parse(raw);
  if (s.e !== (prop('SESSION_EPOCH') || '0') || Date.now() - s.c > SESSION_MAX) { c.remove(k); throw fail('Your session has expired. Please sign in again.', 'AUTH'); }
  c.put(k, raw, SESSION_IDLE);                                             // sliding expiry
  return s.u;
}
function logout(token) { if (typeof token === 'string' && token) cache().remove('s_' + sha(token)); }
function changePassword(req, user) {
  const cur = String(req.currentPassword == null ? '' : req.currentPassword).slice(0, 200), next = String(req.newPassword == null ? '' : req.newPassword);
  if (next.length < 10 || next.length > 100) throw fail('New password must be 10-100 characters.');
  if (next === cur) throw fail('New password must be different from the current one.');
  const fk = 'lf_' + sha(user); if (count(fk, LOCK_SECONDS) >= MAX_LOGIN_FAILS) throw fail('Too many failed attempts. Please wait 15 minutes.', 'RATE');
  if (!safeEq(hashPw(cur, prop('ADMIN_SALT') || ''), prop('ADMIN_HASH') || '')) { count(fk, LOCK_SECONDS, true); Utilities.sleep(700); throw fail('Current password is incorrect.', 'BAD_PASSWORD'); }
  const salt = Utilities.getUuid(), sp = PropertiesService.getScriptProperties();
  sp.setProperties({ ADMIN_SALT: salt, ADMIN_HASH: hashPw(next, salt), SESSION_EPOCH: String(num(sp.getProperty('SESSION_EPOCH')) + 1) });  // signs out every other session
  return { token: newSession(user) };
}

// ================= HTTP entry points =================
const PUB_KEY = 'pub_products_v1';
function publicProducts() {
  const c = cache().get(PUB_KEY); if (c) { try { return JSON.parse(c); } catch (x) { /* rebuild below */ } }
  const list = readProducts().filter(function (p) { return p.isActive; }).map(publicProduct);
  try { cache().put(PUB_KEY, JSON.stringify(list), 300); } catch (x) { /* too big for cache: fine */ }
  return list;
}
function bustPublic() { try { cache().remove(PUB_KEY); } catch (x) { /* ignore */ } }
function doGet(e) {
  try {
    const act = ((e && e.parameter) || {}).action;
    if (act === 'ping') { tab(SH.O); return out(true, { t: Date.now() }, 'OK'); }   // wakes the server before the admin signs in
    if (act !== 'products') throw fail('Unknown action');
    return out(true, publicProducts(), 'OK');
  } catch (err) { return errOut(err); }
}
const ADMIN = {
  dashboard: function () { return dashboard(); },
  productAdd: function (r) { const v = productAdd(r); bustPublic(); return v; },
  productUpdate: function (r) { const v = productSave(r, false); bustPublic(); return v; },
  productPatch: function (r) { const v = productSave(r, true); bustPublic(); return v; },
  productDelete: function (r) { const v = productDelete(r); bustPublic(); return v; },
  uploadImage: function (r) { return uploadImage(r); },
  orderStatus: function (r) { return orderStatus(r); },
  changePassword: function (r, u) { return changePassword(r, u); }
};
function doPost(e) {
  const lock = LockService.getScriptLock(); let locked = false;
  const take = function () { try { lock.waitLock(15000); locked = true; } catch (x) { throw fail('The shop is busy right now. Please try again in a moment.', 'BUSY'); } };
  try {
    const raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > MAX_BODY) throw fail('Request too large');
    let req; try { req = JSON.parse(raw); } catch (x) { throw fail('Malformed request'); }
    if (!req || typeof req !== 'object' || Array.isArray(req)) throw fail('Malformed request');
    const a = req.action;
    if (a !== 'uploadImage' && raw.length > 20000) throw fail('Request too large');
    if (a === 'login') { const lr = login(req); lr.dashboard = dashboard(); return out(true, lr, 'Signed in.'); }   // one round trip: sign in + first dashboard
    if (a === 'logout') { logout(req.token); return out(true, {}, 'Signed out.'); }
    if (a === 'trackOrder') return out(true, trackOrder(req), 'OK');
    if (a === 'placeOrder') { take(); return out(true, placeOrder(req), 'Order placed.'); }   // the only public write
    if (typeof a === 'string' && Object.prototype.hasOwnProperty.call(ADMIN, a)) {
      const user = requireAdmin(req.token);                                // EVERY admin action is authorised here
      if (a !== 'dashboard') take();                                          // reading never waits for the lock
      return out(true, ADMIN[a](req, user), 'OK');
    }
    throw fail('Unknown action');
  } catch (err) { return errOut(err); }
  finally { if (locked) { try { lock.releaseLock(); } catch (x) { /* ignore */ } } }
}

// ================= speed: optional keep-warm trigger (run setupKeepWarm() ONCE from the editor) =================
function keepWarm() { tab(SH.P); tab(SH.O); tab(SH.I); publicProducts(); }
function setupKeepWarm() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'keepWarm') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('keepWarm').timeBased().everyMinutes(5).create();
  console.log('Keep-warm trigger created (runs every 5 minutes).');
}
