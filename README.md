# Jasmine Crackers: storefront + admin dashboard

Static website on **Vercel** · storage on **Google Sheets** · backend on **Google Apps Script** · product images on **Google Drive**.
No database, no build step, no external libraries beyond the icon font already used.

| File | Purpose |
|---|---|
| `index.html`, `css/style.css`, `css/cart.css`, `js/script.js`, `js/cart.js` | Customer storefront, cart, checkout, order confirmation, order tracking |
| `admin.html`, `css/admin.css`, `js/admin.js` | Admin login + dashboard (`/admin`) |
| `js/site-config.js` | **The only file you edit** (2 public values) |
| `apps-script/Code.gs` | Whole backend. Paste into Apps Script |
| `vercel.json` | Security headers (admin page gets a strict Content-Security-Policy) |

## How security works
- The Google Sheet is **private**. Apps Script runs as you; browsers never get access to the Sheet.
- The web app URL must be set to "Anyone" so customers can load products and place orders. That is why **every admin action is checked on the server**: no valid session token = rejected, whatever the browser sends.
- **Admin login:** the browser sends username + password to Apps Script over HTTPS. The server compares a *salted, iterated SHA-256 hash*. The plain password is never stored in the code, the Sheet, GitHub, or the browser. After login the server issues a random session token (kept server-side, 2 h idle / 8 h max). Logout and password change invalidate it.
- **Prices:** the browser sends only product IDs + quantities. The server looks up current prices in `PRODUCTS`, rejects inactive/out-of-stock items, and calculates the total.
- **Customers can only:** read active products, place an order, and track *one* order when Order ID **and** phone both match. There is no public API that lists orders.
- **Duplicate orders:** the Confirm button locks while sending, and a per-order request ID makes the server return the same order if a request is repeated.

## Setup (about 20 minutes)

### 1. Google Sheet
Go to sheets.google.com, create a blank sheet (e.g. "Jasmine Crackers"). **Do not share it with anyone.**

### 2. Backend code
In the Sheet: **Extensions → Apps Script**. Delete the sample code, paste all of `apps-script/Code.gs`, click **Save**.

### 3. Create the tabs
Select function **`setup`** → **Run** → accept the permissions (Sheets and Drive). This creates the tabs `PRODUCTS`, `ORDERS`, `ORDER_ITEMS` with the exact columns below. (If you used the earlier version of this site, use a new Sheet or delete its old `Products`/`Orders` tabs first; the column layout changed.)

```
PRODUCTS:    id | name | category | price | originalPrice | description | imageUrl | stockStatus | isActive | createdAt | updatedAt
ORDERS:      orderId | customerName | phone | address | instructions | totalAmount | orderStatus | createdAt | updatedAt
ORDER_ITEMS: orderId | productId | productName | quantity | price | subtotal
```

### 4. Admin account (server-side only)
Apps Script → **Project Settings** (gear) → **Script properties** → **Add script property**:

| Property | Value |
|---|---|
| `ADMIN_USERNAME` | the admin username the client chose |
| `ADMIN_INITIAL_PASSWORD` | the initial password (temporary) |
| `DRIVE_FOLDER_ID` | *optional.* ID of a Drive folder for product images (the part after `/folders/` in its URL). If empty, a folder "Jasmine Crackers Product Images" is created automatically |

Then select function **`setupAdminCredentials`** → **Run**. It stores only the hash and **deletes `ADMIN_INITIAL_PASSWORD`** from the properties. Check that it is gone.
Forgot the password later? Add the two properties again and run `setupAdminCredentials` again.

### 5. Deploy the backend
**Deploy → New deployment →** type **Web app** → *Execute as:* **Me** → *Who has access:* **Anyone** → **Deploy** → authorise → copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`).
After **any** later change to `Code.gs`: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** (the URL stays the same).

### 6. Website configuration
Edit **`js/site-config.js`**:
```js
GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/XXXX/exec",   // from step 5
WHATSAPP_NUMBER: "918807030143"                                           // already set to +91 88070 30143
```
Both values are public and safe to commit. **Do not** put passwords or your Sheet ID anywhere in the website files; the Sheet ID is not needed (the script is bound to the Sheet).

### 7. Vercel
Push this folder to GitHub → vercel.com → **Add New Project** → import → Framework **Other**, no build command, output directory `public` (already set in `vercel.json`; this keeps `apps-script/` and the README off the public website) → **Deploy**. (Or `npx vercel --prod`.) The admin page is at `https://YOUR-SITE.vercel.app/admin`.

## Using it
- **Log in:** open `/admin`, enter the username and password. Wrong details are refused; 5 wrong tries lock that login for 15 minutes. **Change the initial password straight away** in *Account* (min. 10 characters, a long phrase is best).
- **Add the first product:** *Add product* → name, category, selling price, optional original price (shows a discount), description, **choose an image file** (resized in the browser, uploaded to your Drive folder), stock status, active → *Add Product*. It is on the website immediately.
- **Edit / price / stock / hide / delete:** *Products*. Delete asks for confirmation; deleting also removes the product's uploaded image from Drive.
- **Test customer order:** on the website add items → *Proceed to Order* → enter name, phone, address → *Order Confirmation* screen → **Confirm Order**. The order is saved (status *Order Placed*) and WhatsApp opens with the message. If the browser blocks the pop-up, the next screen has a **Send on WhatsApp** button.
- **Update status:** *Orders* → change the status dropdown (Order Placed → Order Confirmed → Preparing → Ready for Delivery → Out for Delivery → Delivered, or Cancelled).
- **Customer tracking:** *Track Order* in the menu → Order ID + phone → live progress from the Sheet. They see changes when they check again.
- **Dashboard counts:** *Pending* = every order not yet Delivered or Cancelled.

## Security notes (v2)
- Customers never see stored order data: the confirmation screen is cleared when they leave it (or after 30 min), the tracking form is never prefilled, and tracking shows only a shortened name (e.g. "Ravi K.").
- Tracking needs the Order ID **and** the phone number. Order IDs are random, and wrong guesses are rate-limited.
- Customer text is neutralised before it is written to the Sheet (no spreadsheet formula injection).
- Only `public/` is deployed. Admin credentials exist only in Apps Script Script properties (`ADMIN_USERNAME`, `ADMIN_INITIAL_PASSWORD`), never in the website files. After first login, change the password in *Account* to a long, unique passphrase.

## Known limits (please read)
- **Session token location:** Apps Script cannot set HttpOnly cookies for another domain, so the session token lives in the tab's `sessionStorage` (cleared when the tab closes, never the password). The admin page runs under a strict CSP and escapes all data to limit XSS risk.
- **Password hashing:** Apps Script has no bcrypt, so iterated salted SHA-256 is used. A strong password matters.
- **Rate limiting is best-effort:** Apps Script cannot see IP addresses. Limits are per username / order ID / phone using a cache that Google may clear. Side effect: someone who keeps guessing can lock the admin login for 15 minutes.
- **Product images:** Drive files must be "anyone with the link can view" to show on the website. They are not listed anywhere public. Google may throttle Drive image links under heavy traffic; if an image fails to load, the storefront shows the shop photo instead.
- **Duplicate-order memory** lasts about 6 hours. **Order list** in the dashboard shows the latest 500 orders (counts cover all).
- Customer data lives in your Google account: protect it with a strong Google password and 2-step verification.

## v3 update: speed + new features
**Redeploy the backend (important):** open Apps Script, replace `Code.gs` with the new one, then *Deploy > Manage deployments > pencil icon > Version: New version > Deploy*. The web app URL stays the same. Then run `setupKeepWarm()` once from the editor (optional, keeps the server warm, runs every 5 minutes).
**Why the admin was slow:** the password check ran 2000 separate Google service calls (several seconds), every admin action waited in a queue (lock) even when only reading, and the dashboard re-read the whole order history. All three are fixed, sign-in now returns the dashboard in the same request, and the page wakes the server while the login form is being filled in.
**New for customers:** sideways-scrolling product list, an *All Products* page with prices and quick add-to-cart, *My Orders* (only for orders the customer chooses to save on their own device), a copy button for the Order ID, and notices that payment is made directly with the shop, not on the website.
