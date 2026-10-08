/* Jasmine Crackers: cart, order form, order confirmation, order saving + WhatsApp message, order tracking.
   No payment. Needs PRODUCTS, PHONE, wa(), money(), priceOf(), esc() from script.js and window.JC_CONFIG.
   Flow: cart (#/cart) -> details (#/checkout) -> confirmation screen (#/summary) -> "Confirm Order" saves it on the server
   and opens WhatsApp -> #/confirmation.  Tracking: #/track (order ID + phone, verified by the server). */
(() => {
const CART_KEY = "jc_cart_v1";   // cart, kept in localStorage so a refresh does not empty it
const DRAFT_KEY = "jc_draft";    // customer details + order ID, kept in sessionStorage (cleared when the tab closes)
const LAST_KEY = "jc_last";      // the order the server just saved
const RID_KEY = "jc_rid";        // idempotency key for the order being submitted (prevents duplicates)
const GENERIC = "Something went wrong. Please try again.";
const MAX_QTY = 99;
const NOTE = "Prices and availability are subject to confirmation. Final order amount and delivery charges will be confirmed by Jasmine Crackers.";
const PAYNOTE = `<div class="nt"><b>Please note:</b> this website is only to <b>showcase our crackers and prices</b> and to <b>place your order request</b>. <b>No payment is taken on this website.</b> To pay for your crackers, please contact the shop directly: <a href="tel:+${PHONE}">call +${PHONE.slice(0, 2)} ${PHONE.slice(2, 7)} ${PHONE.slice(7)}</a> or <a target="_blank" rel="noopener" href="https://wa.me/${PHONE}">WhatsApp us</a>.</div>`;
const IDNOTE = `<div class="nt idn"><b>Important: save your Order ID.</b> After you tap “Confirm Order” you will get an Order ID. <b>Copy it or take a screenshot</b> and keep it together with the phone number you entered. You need both to track your order or check it later.</div>`;
const MY_KEY = "jc_my_orders";
const Q = s => document.querySelector(s);
const find = id => PRODUCTS.find(p => p.id == id);
const hasPrice = p => typeof priceOf(p) === "number";
const read = (store, key, fallback) => { try { return JSON.parse(store.getItem(key)) || fallback } catch (e) { return fallback } };
const write = (store, key, val) => { try { store.setItem(key, JSON.stringify(val)) } catch (e) {} };
const icons = () => window.lucide && lucide.createIcons();
let items = [], flash = null;   // items = [{id, qty}]

// ---------- cart data ----------
function loadCart() {
  if (!PRODUCTS.length) return;   // catalogue not loaded: keep the saved cart untouched
  const saved = read(localStorage, CART_KEY, []);
  items = (Array.isArray(saved) ? saved : [])
    .filter(i => find(i.id) && find(i.id).available !== false && Number.isInteger(i.qty) && i.qty > 0)
    .map(i => ({ id: i.id, qty: Math.min(i.qty, MAX_QTY) }));
  saveCart();
}
const saveCart = () => write(localStorage, CART_KEY, items);
function totals() {
  let qty = 0, total = 0, pending = 0;
  items.forEach(i => { const p = find(i.id); qty += i.qty; hasPrice(p) ? total += priceOf(p) * i.qty : pending++ });
  return { qty, total, pending };
}
const lineTotal = i => { const p = find(i.id); return hasPrice(p) ? money(priceOf(p) * i.qty) : "On request" };
const unitText = i => { const p = find(i.id); return (hasPrice(p) ? money(priceOf(p)) : "Price on request") + " × " + i.qty };
const thumb = p => imgStyle(p);

function change(fn, id) { fn(); flash = id; saveCart(); update(); setTimeout(() => flash = null, 400) }
function add(id, qty = 1) {
  const p = find(id); if (!p || p.available === false) return;
  const i = items.find(x => x.id == id);
  change(() => i ? i.qty = Math.min(MAX_QTY, i.qty + qty) : items.push({ id: p.id, qty: Math.min(MAX_QTY, qty) }), id);
}
function setQty(id, q) { const i = items.find(x => x.id == id); if (i && q >= 1 && q <= MAX_QTY) change(() => i.qty = q, id) }
function remove(id) {
  document.querySelectorAll(`[data-row="${id}"]`).forEach(r => r.classList.add("out"));
  setTimeout(() => change(() => items = items.filter(x => x.id != id)), 260);
}
function clearCart() { if (items.length && confirm("Remove all items from your cart?")) change(() => items = []) }

// ---------- shared HTML pieces ----------
const row = i => { const p = find(i.id); return `<div class="ci2" data-row="${esc(p.id)}"><div class="th" style="${thumb(p)}"></div><div class="in2"><b>${esc(p.name)}</b><small>${unitText(i)}</small><div class="qc"><button data-q="-1" aria-label="Decrease quantity" ${i.qty <= 1 ? "disabled" : ""}>−</button><span class="${flash == p.id ? "fl" : ""}">${i.qty}</span><button data-q="1" aria-label="Increase quantity" ${i.qty >= MAX_QTY ? "disabled" : ""}>+</button><button class="rm" data-rm>Remove</button></div></div><div class="ls">${lineTotal(i)}</div></div>` };
function sumHtml() {
  const t = totals();
  return `<div class="sr"><span>Total quantity</span><span>${t.qty}</span></div><div class="sr"><span>Subtotal</span><span>${money(t.total)}</span></div><div class="sr t"><span>Total</span><b>${money(t.total)}</b></div>` +
    (t.pending ? `<p class="sn">${t.pending} item${t.pending > 1 ? "s" : ""} priced on request. The shop will confirm the final price.</p>` : "") + `<p class="sn">${NOTE}</p>`;
}
const empty = msg => `<div class="em2"><i data-lucide="shopping-cart"></i><h3>Your cart is empty</h3><p>${msg || "Your selected crackers will appear here."}</p><a class="btn pri" href="#categories" data-go>Explore crackers</a></div>`;

// ---------- drawer (quick cart from the navbar icon) ----------
document.body.insertAdjacentHTML("beforeend", `<div id="dov"></div><aside id="drawer" role="dialog" aria-modal="true" aria-label="Shopping cart"></aside><div id="view" role="main"></div>`);
const D = Q("#drawer"), V = Q("#view"), B = Q("#cb");
function drawer() {
  D.innerHTML = `<div class="dh"><h3>Jasmine Crackers Cart</h3><button class="x" data-close aria-label="Close cart">×</button></div><div class="db">${items.length ? items.map(row).join("") : empty()}</div>` +
    (items.length ? `<div class="df">${sumHtml()}<a class="btn pri" href="#/checkout">Proceed to Order</a><button class="btn" data-close>Continue Shopping</button><button class="lnk" data-clear>Clear cart</button></div>` : "");
  icons();
}
const open = () => { drawer(); Q("#dov").classList.add("o"); D.classList.add("o"); document.documentElement.classList.add("lock"); setTimeout(() => D.querySelector(".x").focus(), 50) };
const close = () => { Q("#dov").classList.remove("o"); D.classList.remove("o"); if (!V.classList.contains("o")) document.documentElement.classList.remove("lock") };
function update() {
  const n = totals().qty;
  B.hidden = !n; B.textContent = n;
  B.classList.remove("bump"); void B.offsetWidth; B.classList.add("bump");
  drawer(); pgBar();
  if (V.classList.contains("o") && location.hash == "#/cart") cartPage();
}

// ---------- page 1: cart ----------
function cartPage() {
  V.innerHTML = `<div class="wrap vw"><a class="bk" href="#categories">← Continue Shopping</a><h2>Jasmine Crackers <span class="gold">Cart</span></h2>` +
    (items.length ? `<div class="two"><div class="card2">${items.map(row).join("")}<button class="lnk" data-clear>Clear cart</button></div><div class="card2 stk"><h3>Cart total</h3>${sumHtml()}<a class="btn pri big" href="#/checkout">Proceed to Order</a><a class="btn" href="#categories" data-go>Continue Shopping</a></div></div><div class="sb"><div><small>Total</small><b>${money(totals().total)}</b></div><a class="btn pri" href="#/checkout">Proceed to Order</a></div>`
      : `<div class="card2">${empty()}</div>`) + `</div>`;
  icons();
}

// ---------- page 2: customer details ----------
const fld = (id, label, v, o = {}) => `<div class="f" data-f="${id}"><label for="${id}">${label}</label>${o.ta ? `<textarea id="${id}" rows="3">${esc(v)}</textarea>` : `<input id="${id}" type="${o.t || "text"}" value="${esc(v)}" ${o.m ? `inputmode="${o.m}"` : ""} autocomplete="${o.ac || "off"}">`}<span class="er" role="alert"></span></div>`;
function checkout() {
  if (!items.length) { V.innerHTML = `<div class="wrap vw"><h2>Your <span class="gold">details</span></h2><div class="card2">${empty("Add products to your cart before placing an order request.")}</div></div>`; icons(); return }
  const d = read(sessionStorage, DRAFT_KEY, {}), t = totals();
  V.innerHTML = `<div class="wrap vw"><a class="bk" href="#/cart">← Back to cart</a><h2>Your <span class="gold">details</span></h2>${PAYNOTE}<div class="two"><form id="cf" novalidate class="card2"><fieldset><legend>Delivery details</legend><p class="sn">Name, phone number and delivery address are required to place an order.</p>` +
    fld("name", "Full Name *", d.name || "", { ac: "name" }) + fld("phone", "Phone Number *", d.phone || "", { t: "tel", m: "tel", ac: "tel" }) +
    fld("address", "Delivery Address *", d.address || "", { ta: 1, ac: "street-address" }) +
    fld("instructions", "Additional instructions (optional)", d.instructions || "", { ta: 1 }) + `</fieldset><button class="btn pri big" type="submit">Review Order</button></form>` +
    `<div class="card2 stk"><h3>Your order</h3>${items.map(i => `<div class="sr"><span>${esc(find(i.id).name)} × ${i.qty}</span><span>${lineTotal(i)}</span></div>`).join("")}${sumHtml()}<a class="bk" href="#/cart">Edit cart</a></div></div>` +
    `<div class="sb"><div><small>Total</small><b>${money(t.total)}</b></div><button class="btn pri" type="submit" form="cf">Review Order</button></div></div>`;
  V.querySelectorAll(".f input,.f textarea").forEach(e => e.oninput = () => { const f = e.closest(".f"); f.classList.remove("bad"); f.querySelector(".er").textContent = "" });
  Q("#cf").onsubmit = submitDetails;
  icons();
}
const val = id => (Q("#" + id) || { value: "" }).value.trim();
function submitDetails(e) {
  e.preventDefault();
  const phone = val("phone").replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, ""), err = {};
  if (val("name").length < 2) err.name = "Please enter your name.";
  if (!/^[6-9]\d{9}$/.test(phone)) err.phone = "Please enter a valid 10-digit mobile number.";
  if (val("address").length < 5) err.address = "Please enter your delivery address.";
  document.querySelectorAll(".f").forEach(f => { const m = err[f.dataset.f]; f.classList.toggle("bad", !!m); f.querySelector(".er").textContent = m || "" });
  const first = Object.keys(err)[0]; if (first) { Q("#" + first).focus(); return }
  write(sessionStorage, DRAFT_KEY, { name: val("name"), phone, address: val("address"), instructions: val("instructions") });
  location.hash = "#/summary";
}

// the order as shown on the summary page (built from the cart + saved customer details)
function buildOrder() {
  const d = read(sessionStorage, DRAFT_KEY, null); if (!d || !items.length) return null;
  const t = totals();
  return {
    customer: d, totalQty: t.qty, total: t.total, pending: t.pending,
    items: items.map(i => { const p = find(i.id), ok = hasPrice(p); return { name: p.name, qty: i.qty, unit: ok ? priceOf(p) : null, line: ok ? priceOf(p) * i.qty : null } })
  };
}
// WhatsApp message is built from the order the SERVER saved (server prices), so it always matches the Sheet
function waMessage(d) {
  const L = ["JASMINE CRACKERS — NEW ORDER", "", "Order ID: " + d.orderId, "", "Customer Details:", "Name: " + d.customerName, "Phone: " + d.phone, "Address: " + d.address];
  if (d.instructions) L.push("Instructions: " + d.instructions);
  L.push("", "Order Items:", "", ...d.items.map((i, n) => `${n + 1}. ${i.name} × ${i.qty} — ${money(i.subtotal)}`), "", "Subtotal: " + money(d.subtotal), "Total: " + money(d.total), "", "Order Status:", d.status);
  return L.join("\n");
}
const isComplete = d => d && d.name && d.name.length >= 2 && /^[6-9]\d{9}$/.test(d.phone || "") && d.address && d.address.length >= 5;

// ---------- server calls ----------
async function post(body, ms = 40000) {
  const url = window.JC_CONFIG && JC_CONFIG.GOOGLE_APPS_SCRIPT_URL; if (!url) throw new Error("not-configured");
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { return await (await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), signal: ac.signal })).json() }
  finally { clearTimeout(t) }
}
const netMsg = e => e && e.message === "not-configured" ? "Online ordering is not available right now. Please message us on WhatsApp." : "We could not reach the shop. Your cart is safe. Please check your internet and try again.";

// ---------- page 3: order confirmation screen (NOTHING is saved or sent until "Confirm Order") ----------
function summaryPage() {
  if (!items.length) { location.hash = "#/cart"; return }
  const d = read(sessionStorage, DRAFT_KEY, null);
  if (!isComplete(d)) { location.hash = "#/checkout"; return }   // name, phone and address are required first
  const o = buildOrder(), c = o.customer;
  V.innerHTML = `<div class="wrap vw cf"><a class="bk" href="#/checkout" style="float:left">← Edit Details</a><div style="clear:both"></div><h2><span class="gold">JASMINE CRACKERS</span><br>Order Confirmation</h2>` +
    `<div class="card2"><div class="who"><small>Customer Name</small><div>${esc(c.name)}</div><small>Phone Number</small><div>${esc(c.phone)}</div><small>Delivery Address</small><div>${esc(c.address)}</div>${c.instructions ? `<small>Additional instructions</small><div>${esc(c.instructions)}</div>` : ""}</div>` +
    `<h3 style="margin:18px 0 6px">Order Items</h3>${o.items.map(i => `<div class="sr"><span>${esc(i.name)} × ${i.qty}<br><small style="color:var(--mute)">${i.unit == null ? "Price on request" : money(i.unit) + " each"}</small></span><span>${i.line == null ? "On request" : money(i.line)}</span></div>`).join("")}` +
    `<div class="sr" style="border-top:1px solid var(--line);padding-top:10px"><span>Subtotal</span><span>${money(o.total)}</span></div><div class="sr t"><span>Total Amount</span><b>${money(o.total)}</b></div></div>` +
    `<div class="al"><b>Please check your details.</b> Tapping “Confirm Order” places your order request with Jasmine Crackers. Final availability and delivery charges are confirmed by the shop.</div>` + PAYNOTE + IDNOTE +
    `<label class="ck"><input type="checkbox" id="saveord"><span>Save this order on this phone so I can see it later under “My Orders”.<br><small>Do not tick this on a shared or public device.</small></span></label>` +
    `<div class="al" id="oerr" role="alert" hidden style="margin-top:12px"></div>` +
    `<div class="row" style="margin-top:20px"><a class="btn" href="#/checkout">Edit Details</a><button class="btn pri" id="place"><i data-lucide="send"></i><span>Confirm Order</span></button></div></div>`;
  Q("#place").onclick = () => placeOrder(o);
  icons();
}
let placing = false;
// One request id per (details + cart): a double-click, refresh or retry after a lost response gets the SAME order back from the server.
function requestId(o) {
  const fp = JSON.stringify([o.customer, items]), s = read(sessionStorage, RID_KEY, null);
  if (s && s.fp === fp) return s.id;
  const id = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).replace(/[^\w-]/g, "");
  write(sessionStorage, RID_KEY, { fp, id }); return id;
}
// Saves the order on the server (which PRICES it from the Sheet; browser prices are ignored), then opens WhatsApp.
async function placeOrder(o) {
  if (placing) return; placing = true;
  const keep = !!(Q("#saveord") && Q("#saveord").checked), b = Q("#place"), s = b.querySelector("span"), er = Q("#oerr"); b.disabled = true; s.textContent = "Placing order…"; er.hidden = true;
  const fail = m => { placing = false; b.disabled = false; s.textContent = "Confirm Order"; er.textContent = m; er.hidden = false; };
  try {
    const j = await post({ action: "placeOrder", website: "", requestId: requestId(o), customer: o.customer, items: items.map(i => ({ id: i.id, qty: i.qty })) });
    if (!j.success) { if (j.code === "UNAVAILABLE") { await window.reloadProducts(); loadCart(); update() } return fail(j.message || GENERIC) }
    const d = j.data;
    write(sessionStorage, LAST_KEY, Object.assign({ _t: Date.now() }, d)); window.__jcLast = { orderId: d.orderId };
    if (keep) write(localStorage, MY_KEY, [{ orderId: d.orderId, phone: d.phone, total: d.total, at: d.createdAt || new Date().toISOString(), names: d.items.slice(0, 3).map(i => i.name + " × " + i.qty).join(", ") }].concat(read(localStorage, MY_KEY, []).filter(x => x.orderId !== d.orderId)).slice(0, 20));
    items = []; saveCart(); try { sessionStorage.removeItem(DRAFT_KEY); sessionStorage.removeItem(RID_KEY) } catch (e) {}
    placing = false; update(); location.hash = "#/confirmation";
  } catch (e) { fail(netMsg(e)) }
}

// ---------- page 4: order placed ----------
function confirmPage() {
  const d = read(sessionStorage, LAST_KEY, null); if (!d || Date.now() - (d._t || 0) > 1800000) { try { sessionStorage.removeItem(LAST_KEY) } catch (e) {} location.hash = "#home"; return }
  V.innerHTML = `<div class="wrap vw cf"><i data-lucide="circle-check"></i><h2>Order <span class="gold">placed</span></h2><p class="lead" style="margin:auto">Your order is saved. Please keep your Order ID to track it.</p>` +
    `<div class="idbox"><small>Your Order ID. Copy or screenshot it now.</small><b>${esc(d.orderId)}</b><button class="btn pri" type="button" data-cp="${esc(d.orderId)}">Copy Order ID</button></div><div class="al ok" style="margin-bottom:14px">You need your <b>Order ID + phone number</b> to track this order.</div>${PAYNOTE}<div class="card2"><div class="sr"><span>Order ID</span><b style="color:var(--gold2)">${esc(d.orderId)}</b></div><div class="sr"><span>Status</span><span>${esc(d.status)}</span></div>${d.items.map(i => `<div class="sr"><span>${esc(i.name)} × ${i.qty}</span><span>${money(i.subtotal)}</span></div>`).join("")}<div class="sr t"><span>Total Amount</span><b>${money(d.total)}</b></div><p class="sn">${NOTE}</p></div>` +
    `<div class="al"><b>Tap “Send on WhatsApp” below</b> to send your order message to the shop. Jasmine Crackers will call you on ${esc(d.phone)} to confirm.</div>` +
    `<div class="row" style="margin-top:20px"><a class="btn wa" target="_blank" rel="noopener" href="${wa(waMessage(d))}"><i data-lucide="message-circle"></i>Send on WhatsApp</a><a class="btn" href="#/track"><i data-lucide="package-search"></i>Track this order</a><a class="btn" href="#/my-orders">My Orders</a><a class="btn pri" href="#categories" data-go>Continue Shopping</a></div></div>`;
  icons(); window.jcCelebrate && jcCelebrate();
}

// ---------- page 5: track your order (server checks order ID + phone; shows only that one order) ----------
const STEPS = ["Order Placed", "Order Confirmed", "Preparing", "Ready for Delivery", "Out for Delivery", "Delivered"];
const when = d => new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
function trackHtml(d) {
  const cancelled = d.status === "Cancelled", at = STEPS.indexOf(d.status);
  return `<div class="card2 trk"><h3 style="text-align:center"><span class="gold">JASMINE CRACKERS</span><br>ORDER TRACKING</h3><div class="sr"><span>Order ID</span><b style="color:var(--gold2)">${esc(d.orderId)}</b></div><div class="sr"><span>Customer</span><span>${esc(d.customerName)}</span></div><div class="sr"><span>Placed on</span><span>${when(d.createdAt)}</span></div>` +
    (cancelled ? `<div class="al" style="margin:14px 0">This order was cancelled. Please call the shop if you have any questions.</div>` : "") +
    `<h4 class="tst">Order Status: ${esc(d.status)}</h4><ol class="tsteps${cancelled ? " x" : ""}">${STEPS.map((st, i) => { const on = !cancelled && i <= at; return `<li class="${on ? (i === at ? "cur" : "done") : ""}"><span class="dot" aria-hidden="true">${on ? "✓" : "○"}</span><b>${st}</b><span class="vh">${on ? (i === at ? " (current)" : " (done)") : " (pending)"}</span></li>` }).join("")}</ol>` +
    `<h4 class="tst">Items</h4>${d.items.map(i => `<div class="sr"><span>${esc(i.name)} × ${i.qty}</span><span>${money(i.subtotal)}</span></div>`).join("")}<div class="sr t"><span>Total Amount</span><b>${money(d.total)}</b></div>` +
    `<p class="sn">Last updated ${when(d.updatedAt)}</p><button class="btn" type="button" id="tref">Check again</button></div>`;
}
function trackPage() {
  const l = { orderId: (window.__jcLast && window.__jcLast.orderId) || "" };   // only the ID, only in memory; the phone number is never prefilled
  V.innerHTML = `<div class="wrap vw cf"><a class="bk" href="#home" style="float:left">← Back to home</a><div style="clear:both"></div><h2>Track your <span class="gold">order</span></h2><p class="lead" style="margin:10px auto 0">Enter your Order ID and the phone number you ordered with.</p>` +
    `<form id="tf" novalidate class="card2" style="text-align:left;margin-top:22px">${fld("tid", "Order ID *", l.orderId || "", { ac: "off" })}${fld("tph", "Phone Number *", l.phone || "", { t: "tel", m: "tel", ac: "off" })}` +
    `<div class="al" id="terr" role="alert" hidden style="margin-bottom:12px"></div><button class="btn pri big" type="submit" id="tgo">Track Order</button></form><div id="tres" aria-live="polite" style="margin-top:18px;text-align:left"></div></div>`;
  V.querySelectorAll(".f input").forEach(e => e.oninput = () => { const f = e.closest(".f"); f.classList.remove("bad"); f.querySelector(".er").textContent = "" });
  Q("#tf").onsubmit = async e => {
    e.preventDefault(); const id = val("tid").toUpperCase(), ph = val("tph").replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, ""), err = {}, te = Q("#terr"), go = Q("#tgo");
    if (!/^JC-[A-Z0-9]{6}$/.test(id)) err.tid = "Enter your Order ID, for example JC-A1B2C3.";
    if (!/^[6-9]\d{9}$/.test(ph)) err.tph = "Enter the 10-digit phone number you ordered with.";
    V.querySelectorAll(".f").forEach(f => { const m = err[f.dataset.f]; f.classList.toggle("bad", !!m); f.querySelector(".er").textContent = m || "" });
    te.hidden = true; if (Object.keys(err).length) { Q("#" + Object.keys(err)[0]).focus(); return }
    go.disabled = true; go.textContent = "Checking…"; Q("#tres").innerHTML = "";
    try {
      const j = await post({ action: "trackOrder", orderId: id, phone: ph }, 30000);
      if (!j.success) { te.textContent = j.message || GENERIC; te.hidden = false }
      else { Q("#tres").innerHTML = trackHtml(j.data); Q("#tref").onclick = () => Q("#tf").requestSubmit(); Q("#tres").scrollIntoView({ behavior: "smooth", block: "start" }) }
    } catch (x) { te.textContent = netMsg(x); te.hidden = false }
    go.disabled = false; go.textContent = "Track Order";
  };
  icons();
}
function newOrder() { items = []; saveCart(); update(); location.hash = "#categories" }

const PAGES = { "#/products": productsPage, "#/my-orders": myOrdersPage, "#/cart": cartPage, "#/checkout": checkout, "#/summary": summaryPage, "#/confirmation": confirmPage, "#/track": trackPage };
const FRESH = { "#/checkout": 1, "#/summary": 1 };   // these pages re-check live prices/availability first
let routeSeq = 0;
function route() {
  if (location.hash !== "#/confirmation") try { sessionStorage.removeItem(LAST_KEY) } catch (e) {}   // never keep order details once the customer leaves the confirmation screen
  const h = location.hash, page = PAGES[h];
  if (!page) { V.classList.remove("o"); document.body.classList.remove("vo"); if (!D.classList.contains("o")) document.documentElement.classList.remove("lock"); return }
  close(); V.classList.add("o"); V.scrollTop = 0; document.body.classList.add("vo"); document.documentElement.classList.add("lock");
  if (!FRESH[h]) { page(); return }
  const seq = ++routeSeq, before = items.length;
  V.innerHTML = `<div class="wrap vw"><p class="lead">Checking current prices and availability…</p></div>`;
  window.reloadProducts().then(ok => {
    if (seq !== routeSeq || location.hash !== h) return;
    if (!ok) { V.innerHTML = `<div class="wrap vw cf"><h2>Could not <span class="gold">confirm prices</span></h2><p class="lead" style="margin:12px auto 20px">We could not load the latest prices, so the order cannot be prepared yet. Your cart is safe.</p><div class="row"><button class="btn pri" data-fresh>Try again</button><a class="btn" href="#/cart">Back to cart</a></div></div>`; return }
    loadCart(); update(); page();
    if (items.length < before) { const w = V.querySelector(".wrap"); w && w.insertAdjacentHTML("afterbegin", '<div class="al" style="margin-bottom:14px">Some items are no longer available and were removed from your cart. Prices shown are current.</div>') }
  });
}
window.cartReload = () => { loadCart(); update(); if (location.hash === "#/products") productsPage() };
addEventListener("hashchange", route);
document.addEventListener("click", e => {
  const t = e.target, a = t.closest("[data-add]"), r = t.closest("[data-row]"), q = t.closest("[data-q]");
  if (a && !a.disabled) {
    const inModal = a.closest("#pm"), qty = inModal ? (+Q("#dq").textContent || 1) : 1;
    add(a.dataset.add, qty);
    const s = a.querySelector("span"), orig = s.textContent;
    a.classList.add("ok"); s.textContent = "Added to Cart";
    setTimeout(() => { a.classList.remove("ok"); s.textContent = orig; pgBar() }, 1300);
  }
  else if (q && r) { const i = items.find(x => x.id == r.dataset.row); i && setQty(i.id, i.qty + Number(q.dataset.q)) }
  else if (t.closest("[data-rm]") && r) remove(r.dataset.row);
  else if (t.closest("[data-clear]")) clearCart();
  else if (t.closest("[data-new]")) newOrder();
  else if (t.closest("[data-fresh]")) route();
  else if (t.closest("#cartbtn")) open();
  else if (t.closest("[data-close]") || t.id == "dov") close();
  else if (t.closest("[data-go]")) { close(); if (location.hash.startsWith("#/")) location.hash = "#categories" }
});
addEventListener("keydown", e => e.key == "Escape" && close());
(window.productsReady || Promise.resolve()).then(() => { loadCart(); update(); route() });
// ---------- v3: All Products page ----------
let pgCat = "All", pgTerm = "";
function productsPage() {
  if (!PRODUCTS.length) { V.innerHTML = `<div class="wrap vw"><a class="bk" href="#home">← Back to home</a><h2>All <span class="gold">crackers</span></h2><p class="lead">Loading crackers…</p></div>`; return }
  V.innerHTML = `<div class="wrap vw"><a class="bk" href="#home">← Back to home</a><h2>All <span class="gold">crackers &amp; prices</span></h2>${PAYNOTE}<div class="srch pgs"><i data-lucide="search"></i><input id="pgq" type="search" placeholder="Search crackers" aria-label="Search crackers" autocomplete="off" value="${esc(pgTerm)}"></div><div class="chips" id="pgc" role="group" aria-label="Filter by category"></div><div class="pgl" id="pgl"></div></div><div class="pgbar" id="pgbar"></div>`;
  Q("#pgq").oninput = e => { pgTerm = e.target.value.trim(); pgPaint() };
  pgPaint(); icons();
}
function pgPaint() {
  const t = pgTerm.toLowerCase(), list = PRODUCTS.filter(p => (pgCat === "All" || p.category === pgCat) && (!t || (p.name + " " + p.category + " " + p.description).toLowerCase().includes(t)));
  Q("#pgc").innerHTML = ["All", ...CATEGORIES].map(c => `<button class="chip ${c === pgCat ? "on" : ""}" data-pgc="${esc(c)}">${esc(c)}</button>`).join("");
  Q("#pgl").innerHTML = list.length ? list.map(p => `<div class="pgr" data-pid="${esc(p.id)}"><div class="pgt" data-view="${esc(p.id)}" style="${imgStyle(p)}" role="img" aria-label="${esc(p.name)}">${p.image ? `<img data-pg src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer">` : ""}${offPct(p) ? `<span class="off">${offPct(p)}% OFF</span>` : ""}${p.available === false ? '<span class="soldout">Unavailable</span>' : ""}</div><div class="pgm"><small>${esc(p.category)}</small><b>${esc(p.name)}</b><span class="pgp">${priceHtml(p)}</span></div><div class="pga">${p.available === false ? "" : `<button class="btn pri" data-add="${esc(p.id)}"><span>Add</span></button>`}</div></div>`).join("") : `<p class="sn">No crackers found. Try another word or category.</p>`;
  pgBar();
}
function pgBar() {
  const bar = location.hash === "#/products" && Q("#pgbar"); if (!bar) return;
  const t = totals();
  bar.innerHTML = t.qty ? `<span><b>${t.qty}</b> item${t.qty > 1 ? "s" : ""} in your cart${t.total ? " · " + money(t.total) : ""}</span><a class="btn pri" href="#/cart">View cart &amp; place order</a>` : `<span>Tap “Add” on any cracker to start your order.</span>`;
  document.querySelectorAll(".pgr").forEach(r => { const it = items.find(i => i.id == r.dataset.pid), b = r.querySelector("[data-add]"); const sp = b && b.querySelector("span"); if (sp && !b.classList.contains("ok")) sp.textContent = it ? "Added (" + it.qty + ") +" : "Add" });
}
document.addEventListener("error", e => { if (e.target.tagName === "IMG" && e.target.dataset.pg) e.target.remove() }, true);   // broken picture: the shop photo behind it shows instead
document.addEventListener("click", e => { const c = e.target.closest("[data-pgc]"); if (c) { pgCat = c.dataset.pgc; pgPaint() } });
// copy the Order ID
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-cp]"); if (!b) return; const id = b.dataset.cp; let ok = false;
  try { await navigator.clipboard.writeText(id); ok = true } catch (x) { try { const r = document.createRange(); r.selectNodeContents(b.parentNode.querySelector("b")); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r); ok = document.execCommand("copy") } catch (y) {} }
  b.textContent = ok ? "Copied ✓" : "Press and hold the ID to copy"; setTimeout(() => b.textContent = "Copy Order ID", 2500);
});
// ---------- v3: My Orders (only orders the customer chose to save on THIS device) ----------
function myOrdersPage() {
  const list = read(localStorage, MY_KEY, []);
  V.innerHTML = `<div class="wrap vw cf"><a class="bk" href="#home">← Back to home</a><h2>My <span class="gold">orders</span></h2>` + (list.length
    ? `<p class="lead">Orders you saved on this device. Tap “Check status” for the latest update.</p>${list.map(o => `<div class="card2 mo" data-mo="${esc(o.orderId)}"><div class="sr"><span>Order ID</span><b style="color:var(--gold2)">${esc(o.orderId)}</b></div><div class="sr"><span>Placed on</span><span>${when(o.at)}</span></div><div class="sr"><span>Total</span><span>${money(o.total)}</span></div><small style="color:var(--mute)">${esc(o.names || "")}</small><div class="row"><button class="btn pri" data-mchk="${esc(o.orderId)}">Check status</button><button class="btn" data-mrm="${esc(o.orderId)}">Remove</button></div><div class="mres"></div></div>`).join("")}<div class="row"><button class="btn" id="mocl">Remove all from this device</button></div>`
    : `<div class="card2"><p>No saved orders on this device.</p><p class="sn" style="margin:8px 0 14px">When you place an order you can choose to save it here. Orders are never saved without your choice. You can also track any order with its Order ID and phone number.</p><a class="btn pri" href="#/track">Track an order</a></div>`) + `${PAYNOTE}</div>`;
  const c = Q("#mocl"); if (c) c.onclick = () => { write(localStorage, MY_KEY, []); myOrdersPage() };
  icons();
}
document.addEventListener("click", async e => {
  const rm = e.target.closest("[data-mrm]"), ck = e.target.closest("[data-mchk]");
  if (rm) { write(localStorage, MY_KEY, read(localStorage, MY_KEY, []).filter(x => x.orderId !== rm.dataset.mrm)); myOrdersPage(); return }
  if (!ck) return; const o = read(localStorage, MY_KEY, []).find(x => x.orderId === ck.dataset.mchk), box = ck.closest(".mo").querySelector(".mres"); if (!o) return;
  ck.disabled = true; ck.textContent = "Checking…";
  try { const j = await post({ action: "trackOrder", orderId: o.orderId, phone: o.phone }); box.innerHTML = j.success ? trackHtml(j.data) : `<div class="al">${esc(j.message || GENERIC)}</div>`; const rf = box.querySelector("#tref"); if (rf) rf.remove(); icons() }
  catch (x) { box.innerHTML = `<div class="al">${esc(netMsg(x))}</div>` }
  ck.disabled = false; ck.textContent = "Check status";
});
})();
