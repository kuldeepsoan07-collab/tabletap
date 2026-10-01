const express = require('express'), fs = require('fs'), path = require('path');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

const FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const GST = 0.05, r2 = x => Math.round(x * 100) / 100;
let db;

function seed() {
  const cats = ['Starters', 'Mains', 'Breads & Rice', 'Drinks & Desserts'];
  const m = [
    [0, 'Paneer Tikka', 220, 1], [0, 'Veg Spring Roll', 150, 1], [0, 'Chicken 65', 260, 0], [0, 'Hara Bhara Kebab', 180, 1], [0, 'Fish Fingers', 280, 0],
    [1, 'Paneer Butter Masala', 260, 1], [1, 'Dal Makhani', 220, 1], [1, 'Veg Biryani', 240, 1], [1, 'Butter Chicken', 320, 0], [1, 'Mutton Rogan Josh', 380, 0],
    [2, 'Butter Naan', 50, 1], [2, 'Tandoori Roti', 25, 1], [2, 'Garlic Naan', 60, 1], [2, 'Jeera Rice', 120, 1], [2, 'Steamed Rice', 100, 1],
    [3, 'Masala Chai', 40, 1], [3, 'Fresh Lime Soda', 70, 1], [3, 'Mango Lassi', 90, 1], [3, 'Gulab Jamun', 80, 1], [3, 'Brownie with Ice Cream', 140, 1],
  ];
  db = {
    cats: cats.map((name, i) => ({ id: i + 1, name })),
    items: m.map((x, i) => ({ id: i + 1, catId: x[0] + 1, name: x[1], price: x[2], veg: !!x[3], available: true })),
    orders: [], nextItem: 21, nextCat: 5, nextOrder: 1, tables: 8,
  };
}
try { db = JSON.parse(fs.readFileSync(FILE)); } catch { seed(); }
const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(db)); } catch {} };
const find = (a, id) => a.find(x => x.id == id);
const bad = (r, msg, code = 400) => r.status(code).json({ error: msg });
const validTable = t => Number.isInteger(+t) && +t >= 1 && +t <= db.tables;

// ---- Menu ----
app.get('/api/menu', (q, r) => r.json({ cats: db.cats, items: db.items, tables: db.tables }));
app.post('/api/categories', (q, r) => {
  const name = String(q.body.name || '').trim();
  if (!name) return bad(r, 'Category name is required');
  const c = { id: db.nextCat++, name }; db.cats.push(c); save(); r.json(c);
});
app.post('/api/items', (q, r) => {
  const { name, price, catId, veg } = q.body;
  if (!String(name || '').trim() || !(price >= 0) || !find(db.cats, catId)) return bad(r, 'Name, price and category are required');
  const it = { id: db.nextItem++, catId: +catId, name: name.trim(), price: +price, veg: !!veg, available: true };
  db.items.push(it); save(); r.json(it);
});
app.put('/api/items/:id', (q, r) => {
  const it = find(db.items, q.params.id);
  if (!it) return bad(r, 'Item not found', 404);
  for (const k of ['name', 'price', 'veg', 'available', 'catId']) if (k in q.body) it[k] = q.body[k];
  save(); r.json(it);
});
app.delete('/api/items/:id', (q, r) => {
  db.items = db.items.filter(i => i.id != q.params.id); save(); r.json({ ok: true });
});

app.post('/api/tables', (q, r) => {
  const n = parseInt(q.body.count);
  if (!(n >= 1 && n <= 50)) return bad(r, 'Tables must be between 1 and 50');
  if (db.orders.some(o => !o.paid && o.table > n)) return bad(r, 'Some removed tables still have unpaid orders');
  db.tables = n; save(); r.json({ tables: n });
});

// ---- Orders ----
app.post('/api/orders', (q, r) => {
  const t = +q.body.table;
  if (!validTable(t)) return bad(r, 'Invalid table number');
  const lines = [];
  for (const l of q.body.items || []) {
    const it = find(db.items, l.itemId), qty = Math.floor(l.qty);
    if (!it || !(qty > 0)) return bad(r, 'Invalid item in order');
    if (!it.available) return bad(r, `${it.name} is not available right now`);
    lines.push({ itemId: it.id, name: it.name, price: it.price, qty, note: String(l.note || '').slice(0, 100) });
  }
  if (!lines.length) return bad(r, 'Your cart is empty');
  const o = { id: db.nextOrder++, table: t, items: lines, status: 'New', createdAt: Date.now(), paid: false };
  db.orders.push(o); save(); r.json(o);
});
app.get('/api/kitchen', (q, r) =>
  r.json(db.orders.filter(o => !o.paid && o.status !== 'Served').sort((a, b) => a.createdAt - b.createdAt)));
const FLOW = ['New', 'Preparing', 'Ready', 'Served'];
app.post('/api/orders/:id/advance', (q, r) => {
  const o = find(db.orders, q.params.id);
  if (!o) return bad(r, 'Order not found', 404);
  const i = FLOW.indexOf(o.status);
  if (i < FLOW.length - 1) o.status = FLOW[i + 1];
  save(); r.json(o);
});

// ---- Billing ----
function bill(t) {
  const orders = db.orders.filter(o => o.table == t && !o.paid), m = {};
  orders.forEach(o => o.items.forEach(i => {
    const l = m[i.itemId] || (m[i.itemId] = { name: i.name, price: i.price, qty: 0 });
    l.qty += i.qty;
  }));
  const lines = Object.values(m).map(l => ({ ...l, amount: r2(l.price * l.qty) }));
  const subtotal = r2(lines.reduce((s, l) => s + l.amount, 0)), gst = r2(subtotal * GST);
  return { table: +t, orders, lines, subtotal, gst, total: r2(subtotal + gst) };
}
app.get('/api/tables', (q, r) =>
  r.json(Array.from({ length: db.tables }, (_, i) => ({ table: i + 1, total: bill(i + 1).total }))));
app.get('/api/tables/:n/bill', (q, r) => validTable(q.params.n) ? r.json(bill(q.params.n)) : bad(r, 'Invalid table', 404));
app.post('/api/tables/:n/pay', (q, r) => {
  if (!validTable(q.params.n)) return bad(r, 'Invalid table', 404);
  db.orders.filter(o => o.table == q.params.n && !o.paid).forEach(o => { o.paid = true; o.paidAt = Date.now(); });
  save(); r.json({ ok: true });
});

// ---- Day's sales report (stretch) ----
app.get('/api/report', (q, r) => {
  const day = new Date().toDateString(), m = {};
  db.orders.filter(o => o.paid && new Date(o.paidAt).toDateString() === day)
    .forEach(o => o.items.forEach(i => {
      const l = m[i.name] || (m[i.name] = { name: i.name, qty: 0, revenue: 0 });
      l.qty += i.qty; l.revenue = r2(l.revenue + i.qty * i.price);
    }));
  const items = Object.values(m).sort((a, b) => b.revenue - a.revenue);
  r.json({ items, total: r2(items.reduce((s, i) => s + i.revenue, 0)) });
});

// ---- Pages ----
app.get(/^\/(table\/\d+|kitchen|cashier|admin)?$/, (q, r) => r.sendFile(path.join(__dirname, 'public/index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TableTap running on http://localhost:${PORT}`));