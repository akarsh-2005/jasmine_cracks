/* Jasmine Crackers admin dashboard.
   Nothing here grants any permission: the browser only holds a random session token issued by the Apps Script server after
   it verified the username/password. The server re-checks that token on EVERY admin request. */
(() => {
const $ = s => document.querySelector(s), URL_ = (window.JC_CONFIG || {}).GOOGLE_APPS_SCRIPT_URL, TK = "jc_admin_session";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = n => "₹" + new Intl.NumberFormat("en-IN").format(n);
const when = d => new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const STAT = ["Order Placed", "Order Confirmed", "Preparing", "Ready for Delivery", "Out for Delivery", "Delivered", "Cancelled"];
const slug = s => "s-" + s.toLowerCase().replace(/\s+/g, "-");
let token = null, D = { products: [], orders: [], stats: {} }, view = "dash", editing = null, loadState = "idle", PF = { q: "", cat: "", stock: "", active: "" }, OF = { q: "", st: "" };
try { token = sessionStorage.getItem(TK) } catch (e) {}

function toast(m, e) { const t = $("#toast"); t.textContent = m; t.className = "o" + (e ? " e" : ""); clearTimeout(t.t); t.t = setTimeout(() => t.className = "", 3800) }
try { fetch(URL_ + (URL_.includes("?") ? "&" : "?") + "action=ping&t=" + Date.now(), { mode: "no-cors" }) } catch (e) {}   // wake the server while the login form is being filled in
function waking(n) { const b = $("#lb"), m = document.querySelector("#app .msg"); const t = "The server is waking up. Please wait a moment…"; if (b && b.disabled) b.textContent = t; if (m && loadState === "loading") m.innerHTML = '<span class="spin"></span>' + t }
async function api(action, data = {}, ms = 45000) {
  const safe = action === "dashboard" || action === "login"; let last;      // reads and sign-in can be repeated safely; writes are never repeated
  for (let n = 0; n < (safe ? 3 : 1); n++) {
    try { return await api1(action, data, safe ? 30000 : ms) } catch (e) { last = e; if (!e.net) throw e; waking(n + 1) }
  }
  throw last;
}
async function api1(action, data = {}, ms = 45000) {
  if (!URL_) throw new Error("The Google Apps Script URL is not set in js/site-config.js.");
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms); let j;
  try { j = await (await fetch(URL_, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, token, ...data }), signal: ac.signal })).json() }
  catch (e) { const x = new Error("Could not reach the server. Check your internet connection and try again."); x.net = 1; throw x }
  finally { clearTimeout(t) }
  if (!j.success) { if (j.code === "AUTH") toLogin(j.message); const e = new Error(j.message || "Something went wrong. Please try again."); e.code = j.code; throw e }
  return j.data;
}
const save = t => { token = t; try { t ? sessionStorage.setItem(TK, t) : sessionStorage.removeItem(TK) } catch (e) {} };

// ---------- login / logout ----------
function toLogin(msg) { save(null); D = { products: [], orders: [], stats: {} }; $("#shell").hidden = true; $("#login").hidden = false; $("#lp").value = ""; $("#le").textContent = msg || ""; closeDlg() }
function toShell() { $("#login").hidden = true; $("#shell").hidden = false }
$("#lf").onsubmit = async e => {
  e.preventDefault(); const b = $("#lb"), er = $("#le"); er.textContent = "";
  if (!$("#lu").value.trim() || !$("#lp").value) { er.textContent = "Enter your username and password."; return }
  b.disabled = true; b.textContent = "Signing in…";
  try { const r = await api("login", { username: $("#lu").value.trim(), password: $("#lp").value }); save(r.token); $("#lp").value = ""; toShell(); if (r.dashboard) { D = r.dashboard; loadState = "ok"; show("dash") } else { show("dash"); await load() } }
  catch (x) { er.textContent = x.message } b.disabled = false; b.textContent = "Sign in";
};
document.addEventListener("click", async e => { if (e.target.closest("[data-out]")) { try { await api("logout", {}, 8000) } catch (x) {} toLogin("You have been signed out.") } });

// ---------- data ----------
async function load(quiet) {
  if (!quiet) { loadState = "loading"; render() }
  try { D = await api("dashboard"); loadState = "ok" } catch (e) { if (!token) return; loadState = "error"; if (quiet) toast(e.message, 1) }
  render();
}
function show(v) { view = v; document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("on", b.dataset.v === v)); render(); window.scrollTo(0, 0) }
$("#nav").onclick = e => { const b = e.target.closest("button"); if (b) { if (b.dataset.v === "form") editing = null; show(b.dataset.v) } };
function render() {
  const a = $("#app");
  if (view === "form" || view === "account") return ({ form: vForm, account: vAccount })[view]();
  if (loadState === "loading" && !D.products.length && !D.orders.length) { a.innerHTML = '<p class="msg"><span class="spin"></span>Loading…</p>'; return }
  if (loadState === "error" && !D.products.length && !D.orders.length) { a.innerHTML = '<p class="msg err">Could not load your data.</p><p class="msg"><button class="btn p" id="retry">Try again</button></p>'; $("#retry").onclick = () => load(); return }
  ({ dash: vDash, orders: vOrders, products: vProducts })[view]();
}
const thumb = p => /^https:\/\//i.test(p.imageUrl) ? `<img class="thumb" src="${esc(p.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-img>` : '<span class="ph"></span>';
const badge = s => `<span class="badge ${slug(s)}">${esc(s)}</span>`;
const stSel = o => `<select class="sel ${slug(o.orderStatus)}" data-st="${esc(o.orderId)}" aria-label="Order status for ${esc(o.orderId)}">${STAT.map(s => `<option ${s === o.orderStatus ? "selected" : ""}>${s}</option>`).join("")}</select>`;
const itemsText = o => o.items.map(i => `${i.name} × ${i.qty}`).join(", ");
function ordersTable(list, edit) {
  return `<div class="tw"><table><thead><tr><th>Order</th><th>Customer</th><th>Address</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>${list.map(o => `<tr class="clk" data-oid="${esc(o.orderId)}"><td><b>${esc(o.orderId)}</b><small>${when(o.createdAt)}</small></td><td><b>${esc(o.customerName)}</b><small>${esc(o.phone)}</small></td><td><div class="clip" title="${esc(o.address)}">${esc(o.address)}</div></td><td><div class="clip" title="${esc(itemsText(o))}">${esc(itemsText(o))}</div></td><td><b>${inr(o.totalAmount)}</b></td><td>${edit ? stSel(o) : badge(o.orderStatus)}</td></tr>`).join("")}</tbody></table></div>`;
}

// ---------- dashboard ----------
function vDash() {
  const s = D.stats, c = (l, v, w) => `<div class="card${w ? " warn" : ""}"><small>${l}</small><b>${v == null ? 0 : v}</b></div>`;
  $("#app").innerHTML = `<h2>Dashboard</h2><p class="lead">A quick look at your shop.</p>
  <div class="cards">${c("Total Products", s.totalProducts)}${c("Active Products", s.activeProducts)}${c("Out of Stock", s.outOfStock, s.outOfStock > 0)}${c("Total Orders", s.totalOrders)}${c("Pending Orders", s.pendingOrders, s.pendingOrders > 0)}${c("Completed Orders", s.completedOrders)}</div>
  <div class="panel"><h3>Quick Actions</h3><div class="row"><button class="btn p" data-go="form">+ Add Product</button><button class="btn s" data-go="products">Manage Products</button><button class="btn s" data-go="orders">Manage Orders</button></div></div>
  <div class="panel"><div class="row"><h3 style="margin:0">Recent Orders</h3><button class="btn s sm sp" id="rf">Refresh</button></div>${D.orders.length ? ordersTable(D.orders.slice(0, 8), false) : '<p class="msg">No orders yet. New customer orders will appear here.</p>'}</div>`;
  $("#rf").onclick = async () => { await load(true); toast("Refreshed.") };
}
document.addEventListener("click", e => { const g = e.target.closest("[data-go]"); if (g) { if (g.dataset.go === "form") editing = null; show(g.dataset.go) } });

// ---------- orders ----------
function vOrders() {
  $("#app").innerHTML = `<h2>Orders</h2><p class="lead">Orders placed on your website. Changing a status updates what the customer sees when they track.</p>
  <div class="panel"><div class="tools" style="grid-template-columns:2fr 1fr auto"><input id="oq" type="search" placeholder="Search name, phone or order ID" value="${esc(OF.q)}" aria-label="Search orders"><select id="ost" aria-label="Filter by status"><option value="">All statuses</option>${STAT.map(s => `<option ${OF.st === s ? "selected" : ""}>${s}</option>`).join("")}</select><button class="btn s" id="orf">Refresh</button></div><div id="ot"></div></div>`;
  const upd = () => { OF = { q: $("#oq").value, st: $("#ost").value }; orderRows() }; $("#oq").oninput = upd; $("#ost").oninput = upd;
  $("#orf").onclick = async () => { await load(true); toast("Orders refreshed.") }; orderRows();
}
function orderRows() {
  const q = OF.q.toLowerCase(), L = D.orders.filter(o => (!q || (o.customerName + " " + o.phone + " " + o.orderId).toLowerCase().includes(q)) && (!OF.st || o.orderStatus === OF.st)), t = $("#ot"); if (!t) return;
  t.innerHTML = L.length ? ordersTable(L, true) : `<p class="msg">${D.orders.length ? "No orders match your search." : "No orders yet. New customer orders will appear here."}</p>`;
}
async function setStatus(id, status, sel) {
  const o = D.orders.find(x => x.orderId === id); sel.disabled = true;
  try { await api("orderStatus", { orderId: id, status }); o.orderStatus = status; sel.className = "sel " + slug(status); sel.disabled = false; toast(`Order ${id} is now “${status}”.`); load(true) }
  catch (e) { toast(e.message, 1); sel.value = o.orderStatus; sel.disabled = false }
}
document.addEventListener("change", e => { const s = e.target.closest("[data-st]"); if (s) setStatus(s.dataset.st, s.value, s) });
document.addEventListener("click", e => { const r = e.target.closest("tr[data-oid]"); if (r && !e.target.closest("select")) orderDetail(D.orders.find(x => x.orderId === r.dataset.oid)) });
function orderDetail(o) {
  if (!o) return;
  dlg(`Order ${esc(o.orderId)}`, `<p style="color:var(--mute);margin-bottom:8px">${when(o.createdAt)}</p>${o.items.map(i => `<div class="dr"><span>${esc(i.name)} × ${i.qty} <small style="color:var(--mute)">(${inr(i.price)} each)</small></span><b>${inr(i.subtotal)}</b></div>`).join("")}<div class="dr tot"><span>Total</span><span>${inr(o.totalAmount)}</span></div>
  <h3 style="margin-top:14px">Customer</h3><div class="dr"><span>Name</span><b>${esc(o.customerName)}</b></div><div class="dr"><span>Phone</span><span><a href="tel:+91${esc(o.phone)}">${esc(o.phone)}</a> · <a target="_blank" rel="noopener" href="https://wa.me/91${esc(o.phone)}">WhatsApp</a></span></div><div class="dr"><span>Address</span><span>${esc(o.address)}</span></div>${o.instructions ? `<div class="dr"><span>Instructions</span><span>${esc(o.instructions)}</span></div>` : ""}
  <div class="row" style="margin-top:16px;justify-content:space-between"><label style="grid-auto-flow:column;align-items:center;gap:10px">Status ${stSel(o)}</label><button class="btn s" data-dclose>Close</button></div>`);
}

// ---------- products ----------
function vProducts() {
  const cats = [...new Set(D.products.map(p => p.category))].sort(), opt = (arr, cur) => arr.map(o => `<option value="${esc(o[0])}" ${cur === o[0] ? "selected" : ""}>${esc(o[1])}</option>`).join("");
  $("#app").innerHTML = `<h2>Products</h2><p class="lead">Everything shown on your website. Changes go live straight away.</p><div class="panel"><div class="row"><button class="btn p" data-go="form">+ Add Product</button><button class="btn s sp" id="prf">Refresh</button></div>
  <div class="tools"><input id="pq" type="search" placeholder="Search products" value="${esc(PF.q)}" aria-label="Search products"><select id="pc" aria-label="Category">${opt([["", "All categories"], ...cats.map(c => [c, c])], PF.cat)}</select><select id="ps" aria-label="Stock">${opt([["", "All stock"], ["In Stock", "In Stock"], ["Out of Stock", "Out of Stock"]], PF.stock)}</select><select id="pa" aria-label="Active">${opt([["", "Active & inactive"], ["1", "Active"], ["0", "Inactive"]], PF.active)}</select></div><div id="pt"></div></div>`;
  const upd = () => { PF = { q: $("#pq").value, cat: $("#pc").value, stock: $("#ps").value, active: $("#pa").value }; productRows() }; ["#pq", "#pc", "#ps", "#pa"].forEach(i => $(i).oninput = upd);
  $("#prf").onclick = async () => { await load(true); toast("Products refreshed.") }; productRows();
}
function productRows() {
  const q = PF.q.toLowerCase(), L = D.products.filter(p => (!q || (p.name + " " + p.category).toLowerCase().includes(q)) && (!PF.cat || p.category === PF.cat) && (!PF.stock || p.stockStatus === PF.stock) && (!PF.active || (PF.active === "1") === p.isActive)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), t = $("#pt"); if (!t) return;
  t.innerHTML = !L.length ? `<p class="msg">${D.products.length ? "No products match your filters." : "No products yet. Add your first cracker."}</p>` :
    `<div class="tw"><table><thead><tr><th></th><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>${L.map(p => `<tr data-id="${esc(p.id)}"><td>${thumb(p)}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.category)}</td><td>${inr(p.price)}${p.originalPrice ? ` <s>${inr(p.originalPrice)}</s>` : ""}</td><td><button class="pill ${p.stockStatus === "In Stock" ? "ok" : "no"}" data-t="stock" title="Click to change stock">${p.stockStatus}</button></td><td><button class="pill ${p.isActive ? "ok" : "no"}" data-t="active" title="Click to show/hide on website">${p.isActive ? "Active" : "Inactive"}</button></td><td><div class="row" style="flex-wrap:nowrap"><button class="btn s sm" data-e>Edit</button><button class="btn s sm" data-p>Price</button><button class="btn d sm" data-d>Delete</button></div></td></tr>`).join("")}</tbody></table></div>`;
  document.querySelectorAll("#pt [data-img]").forEach(i => i.onerror = () => { const s = document.createElement("span"); s.className = "ph"; i.replaceWith(s) });
}
document.addEventListener("click", async e => {
  const r = e.target.closest("#pt tr[data-id]"); if (!r) return; const p = D.products.find(x => x.id === r.dataset.id), t = e.target.closest("[data-t]"); if (!p) return;
  if (e.target.closest("[data-e]")) { editing = p; show("form") }
  else if (t) { t.disabled = true; const ch = t.dataset.t === "stock" ? { stockStatus: p.stockStatus === "In Stock" ? "Out of Stock" : "In Stock" } : { isActive: !p.isActive };
    try { await api("productPatch", { id: p.id, changes: ch }); Object.assign(p, ch); toast("Updated."); render(); load(true) } catch (x) { toast(x.message, 1); t.disabled = false } }
  else if (e.target.closest("[data-p]")) priceDialog(p)
  else if (e.target.closest("[data-d]")) confirmDelete(p);
});
function priceDialog(p) {
  dlg("Change price", `<p style="color:var(--mute);margin-bottom:12px">${esc(p.name)}</p><label>Selling price (₹)<input id="np" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(p.price)}"></label><p class="er" id="ne" role="alert"></p><div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn s" data-dclose>Cancel</button><button class="btn p" id="nsv">Save price</button></div>`);
  $("#np").focus(); $("#nsv").onclick = async () => { const v = Number($("#np").value); if (!(v > 0)) { $("#ne").textContent = "Enter a price greater than 0."; return }
    $("#nsv").disabled = true; try { await api("productPatch", { id: p.id, changes: { price: v } }); p.price = v; closeDlg(); toast("Price updated."); render(); load(true) } catch (x) { $("#ne").textContent = x.message; $("#nsv").disabled = false } };
}
function confirmDelete(p) {
  dlg(`Delete “${esc(p.name)}”?`, `<p style="color:var(--mute);margin-bottom:16px">This removes it from your website and the sheet. Past orders keep their details. This cannot be undone.</p><div class="row" style="justify-content:flex-end"><button class="btn s" data-dclose>Cancel</button><button class="btn dd" id="ddy">Delete product</button></div>`);
  $("#ddy").onclick = async () => { $("#ddy").disabled = true; try { await api("productDelete", { id: p.id }); closeDlg(); D.products = D.products.filter(x => x.id !== p.id); render(); toast("Product deleted."); load(true) } catch (x) { closeDlg(); toast("Could not delete the product. " + x.message, 1) } };
}

// ---------- add / edit product ----------
const fl = (id, l, h) => `<div data-f="${id}"><label>${l}${h}</label><span class="er"></span></div>`;
function vForm() {
  const p = editing || { name: "", category: "", price: "", originalPrice: "", imageUrl: "", description: "", stockStatus: "In Stock", isActive: true }, cats = [...new Set(D.products.map(x => x.category))];
  $("#app").innerHTML = `<h2>${editing ? "Edit product" : "Add New Product"}</h2><p class="lead">${editing ? "Changes are saved to the same product." : "The product appears on your website straight away. No redeploy needed."}</p><div class="panel"><form id="f" novalidate class="form">
  ${fl("name", "Product Name *", `<input id="name" maxlength="80" value="${esc(p.name)}">`)}${fl("category", "Category *", `<input id="category" list="cl" maxlength="40" value="${esc(p.category)}"><datalist id="cl">${cats.map(c => `<option value="${esc(c)}">`).join("")}</datalist>`)}
  ${fl("price", "Selling Price (₹) *", `<input id="price" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(p.price)}">`)}${fl("originalPrice", "Original Price (₹), optional, shows a discount", `<input id="originalPrice" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(p.originalPrice == null ? "" : p.originalPrice)}">`)}
  <div class="w">${fl("description", "Description (max 300). Pack size can go here, e.g. “Box of 10”", `<textarea id="description" rows="3" maxlength="300">${esc(p.description)}</textarea>`)}</div>
  <div class="w" data-f="image"><label>Product Image (JPG, PNG or WEBP)<input id="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><div class="prev" id="prev">${/^https:\/\//i.test(p.imageUrl) ? `<img src="${esc(p.imageUrl)}" alt="" referrerpolicy="no-referrer">` : "No image selected"}</div>
   ${p.imageUrl ? '<label class="chk" style="margin-top:8px"><input type="checkbox" id="rmimg">Remove current image</label>' : ""}<span class="er"></span></div>
  <label>Stock Status<select id="stockStatus"><option ${p.stockStatus === "In Stock" ? "selected" : ""}>In Stock</option><option ${p.stockStatus !== "In Stock" ? "selected" : ""}>Out of Stock</option></select></label>
  <label class="chk" style="align-self:end;min-height:44px"><input type="checkbox" id="isActive" ${p.isActive ? "checked" : ""}>Active (visible on website)</label>
  <div class="w row"><button class="btn p" id="sv" type="submit">${editing ? "Save changes" : "Add Product"}</button><button class="btn s" type="button" id="cancel">Cancel</button></div></form></div>`;
  $("#image").onchange = () => { const f = $("#image").files[0], b = $("#prev"); if (!f) return; if (!/^image\//.test(f.type)) { b.textContent = "That file is not an image."; return } const u = URL.createObjectURL(f); b.innerHTML = `<img src="${u}" alt="">` };
  $("#cancel").onclick = () => { editing = null; show(D.products.length ? "products" : "dash") }; $("#f").onsubmit = saveProduct;
}
// shrink the photo in the browser (max 1000px JPEG) so uploads are fast and always within the server limit
function shrink(file) {
  return new Promise((res, rej) => { const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      c.toBlob(b => { if (!b) return rej(new Error("bad")); const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(new Error("bad")); r.readAsDataURL(b) }, "image/jpeg", .85) };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error("bad")) }; img.src = u });
}
async function saveProduct(e) {
  e.preventDefault(); const v = id => $("#" + id).value.trim(), err = {}, price = Number(v("price")), op = v("originalPrice"), file = $("#image").files[0];
  if (v("name").length < 2) err.name = "Enter the product name."; if (v("category").length < 2) err.category = "Enter a category.";
  if (!(price > 0)) err.price = "Enter a price greater than 0."; if (op && !(Number(op) > price)) err.originalPrice = "Original price must be higher than the selling price.";
  if (file && (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || file.size > 15e6)) err.image = "Choose a JPG, PNG or WEBP image under 15 MB.";
  document.querySelectorAll("#f [data-f]").forEach(f => { f.classList.toggle("bad", !!err[f.dataset.f]); f.querySelector(".er").textContent = err[f.dataset.f] || "" });
  const k = Object.keys(err)[0]; if (k) { $("#" + k).focus(); return }
  const b = $("#sv"); b.disabled = true; let imageUrl = editing ? editing.imageUrl : "";
  try {
    if (file) { b.textContent = "Uploading image…"; try { imageUrl = (await api("uploadImage", { dataBase64: await shrink(file) }, 90000)).imageUrl } catch (x) { if (x.code === "AUTH") return; throw new Error("Image upload failed, so the product was not saved. " + (x.message === "bad" ? "That file could not be read as an image." : x.message)) } }
    else if ($("#rmimg") && $("#rmimg").checked) imageUrl = "";
    b.textContent = "Saving…";
    const product = { name: v("name"), category: v("category"), price, originalPrice: op ? Number(op) : null, description: v("description"), imageUrl, stockStatus: $("#stockStatus").value, isActive: $("#isActive").checked };
    const saved = await api(editing ? "productUpdate" : "productAdd", editing ? { id: editing.id, product } : { product });
    const rec = Object.assign({}, editing || {}, product, { id: (saved && saved.id) || (editing && editing.id) });
    D.products = editing ? D.products.map(x => x.id === rec.id ? rec : x) : D.products.concat([rec]);
    toast(editing ? "Product updated." : "Product added. It is now on your website" + (product.isActive ? "." : " (inactive).")); editing = null; show("products"); load(true);
  } catch (x) { if (token) toast(x.message, 1); b.disabled = false; b.textContent = editing ? "Save changes" : "Add Product" }
}

// ---------- account ----------
function vAccount() {
  $("#app").innerHTML = `<h2>Account</h2><p class="lead">Change your admin password. You will stay signed in on this device and be signed out everywhere else.</p><div class="panel" style="max-width:480px"><form id="pf" novalidate class="form" style="grid-template-columns:1fr">
  <label>Current password<input id="cp" type="password" autocomplete="current-password"></label><label>New password (at least 10 characters)<input id="n1" type="password" autocomplete="new-password"></label><label>Repeat new password<input id="n2" type="password" autocomplete="new-password"></label>
  <p class="er" id="pe" role="alert"></p><div><button class="btn p" id="pb" type="submit">Change password</button></div></form></div>`;
  $("#pf").onsubmit = async e => { e.preventDefault(); const er = $("#pe"), b = $("#pb"); er.textContent = "";
    if (!$("#cp").value) { er.textContent = "Enter your current password."; return } if ($("#n1").value.length < 10) { er.textContent = "New password must be at least 10 characters."; return } if ($("#n1").value !== $("#n2").value) { er.textContent = "The new passwords do not match."; return }
    b.disabled = true; try { const r = await api("changePassword", { currentPassword: $("#cp").value, newPassword: $("#n1").value }); save(r.token); $("#pf").reset(); toast("Password changed.") } catch (x) { er.textContent = x.message } b.disabled = false };
}

// ---------- dialog helpers ----------
function dlg(title, html) { $("#dt").innerHTML = title; $("#db").innerHTML = html; const d = $("#dlg"); if (!d.open) d.showModal() }
function closeDlg() { const d = $("#dlg"); if (d.open) d.close() }
document.addEventListener("click", e => { if (e.target.closest("[data-dclose]")) closeDlg() });
setInterval(() => { if (token && view === "orders" && !$("#dlg").open && document.activeElement.tagName !== "SELECT" && document.activeElement.id !== "oq") load(true) }, 60000);

// ---------- start: resume an existing session if the server still accepts it ----------
(async () => {
  if (!URL_) { $("#login").hidden = false; $("#le").textContent = "Setup needed: set GOOGLE_APPS_SCRIPT_URL in js/site-config.js (see README.txt)."; $("#lb").disabled = true; return }
  if (!token) { $("#login").hidden = false; return }
  toShell(); show("dash"); await load();
  if (loadState === "error" && token) toast("Could not load your data. Check your internet connection.", 1);
})();
})();
