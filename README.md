# TableTap: restaurant QR ordering

Node.js + Express backend (data saved in `data.json`), plain HTML/JS frontend. No build step.

## Run
    npm install
    npm start        # http://localhost:3000

## Screens
- `/table/3`  customer view for table 3 (browse, add to cart, notes, place order, live status and bill)
- `/kitchen`  orders by table moving New, Preparing, Ready, Served (auto-refresh every 3s)
- `/cashier`  per-table bill (subtotal, 5% GST, total), Mark paid frees the table, plus today's sales by item
- `/admin`    categories, items, price, veg flag, Available toggle (unavailable items cannot be ordered)

Seed data: 4 categories, 20 items, 8 tables. Delete `data.json` to reset.

## Demo flow (5 min)
1. Open `/table/3`, add items (with a note like "less spicy"), place order
2. `/kitchen`: advance the order New, Preparing, Ready, Served
3. `/cashier`: select Table 3, show the bill, click Mark paid
4. `/admin`: mark an item unavailable and show it cannot be ordered

## Deploy (Render)
Push to GitHub, create a Web Service, Build: `npm install`, Start: `npm start`.
Note: free hosts have temporary disk, so data resets on redeploy. Fine for a demo; use a DB for production.
