import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, config } from '../../config.js';

const PRODUCTS_FILE = path.join(DATA_DIR, 'shop-products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'shop-room-orders.json');
const SLIPS_FILE = path.join(DATA_DIR, 'shop-used-slips.json');
const COUNTER_FILE = path.join(DATA_DIR, 'shop-counter.json');
const MIGRATIONS_FILE = path.join(DATA_DIR, 'shop-migrations.json');

// เลขลำดับออเดอร์เริ่มที่ 0 (ตัวแรกที่ออกคือ 0001)
const ORDER_NUMBER_START = 0;

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

const DEFAULT_PRODUCTS = [
  {
    id: 'api-key',
    name: '🔑 ◦ API Key',
    category: 'api-key',
    type: 'group',
    description: 'คีย์ API หลายโมเดล เลือกประเภทที่ต้องการ',
    enabled: true,
  },
  {
    id: 'api-key-long-island',
    parent: 'api-key',
    name: '🥃 ◦ Long Island [ Gemini Pro / Flash ]',
    category: 'api-key',
    type: 'key',
    description: 'คีย์ API โมเดล Gemini Pro / Flash พร้อมใช้งาน แจ้งทีมงานหลังชำระเงินเพื่อรับคีย์',
    price: 49,
    pricePer: 100,
    enabled: true,
  },
  {
    id: 'api-key-margarita',
    parent: 'api-key',
    name: '🍹 ◦ Margarita [ Gemini Flash ล้วน ]',
    category: 'api-key',
    type: 'key',
    description: 'คีย์ API โมเดล Gemini Flash ล้วน พร้อมใช้งาน แจ้งทีมงานหลังชำระเงินเพื่อรับคีย์',
    price: 39,
    pricePer: 100,
    enabled: true,
  },
  {
    id: 'api-key-angel-shot',
    parent: 'api-key',
    name: '🍸 ◦ Angel Shot [ Claude ]',
    category: 'api-key',
    type: 'key',
    description: 'คีย์ API โมเดล Claude พร้อมใช้งาน แจ้งทีมงานหลังชำระเงินเพื่อรับคีย์',
    price: 139,
    pricePer: 100,
    enabled: true,
  },
  {
    id: 'api-key-cosmo',
    parent: 'api-key',
    name: '🍷 ◦ Cosmo [ โมเดลรวม Gemini / Claude ]',
    category: 'api-key',
    type: 'key',
    description: 'คีย์ API โมเดลรวม Gemini / Claude พร้อมใช้งาน แจ้งทีมงานหลังชำระเงินเพื่อรับคีย์',
    price: 79,
    pricePer: 100,
    enabled: true,
  },
  {
    id: 'theme',
    name: '🎨 ◦ Theme',
    category: 'theme',
    type: 'theme',
    description: 'ออกแบบ/ติดตั้ง Theme ตามที่ต้องการ แจ้งรายละเอียดสไตล์ที่ต้องการในห้องได้เลย',
    enabled: true,
  },
  {
    id: 'nitro-boost',
    name: '💎 ◦ Nitro & Boost',
    category: 'nitro-boost',
    type: 'nitro',
    description: 'บริการ Nitro และ Boost เซิร์ฟเวอร์ แจ้งลิงก์/ไอดีที่ต้องการในห้องได้เลย',
    enabled: true,
  },
  {
    id: 'commission-bot',
    name: '🧸 ◦ Commission Bot Sillytarvern',
    category: 'commission-bot',
    type: 'group',
    description: 'เลือกเจ้าของงาน/ประเภทคอมมิชชันที่ต้องการ แต่ละรายการมีบัญชีรับเงินของตัวเอง',
    enabled: true,
  },
  {
    id: 'commission-bot-1',
    parent: 'commission-bot',
    name: '👤 ◦ คอมมิชชัน 1',
    category: 'commission-bot',
    type: 'bot',
    description: 'งานคอมมิชชันของผู้ให้บริการคนที่ 1 — โอนตาม QR ของบริการนี้ในห้องออเดอร์',
    qrImage: '',
    enabled: true,
  },
  {
    id: 'commission-bot-2',
    parent: 'commission-bot',
    name: '👤 ◦ คอมมิชชัน 2',
    category: 'commission-bot',
    type: 'bot',
    description: 'งานคอมมิชชันของผู้ให้บริการคนที่ 2 — โอนตาม QR ของบริการนี้ในห้องออเดอร์',
    qrImage: '',
    enabled: true,
  },
  {
    id: 'commission-bot-3',
    parent: 'commission-bot',
    name: '👤 ◦ คอมมิชชัน 3',
    category: 'commission-bot',
    type: 'bot',
    description: 'งานคอมมิชชันของผู้ให้บริการคนที่ 3 — โอนตาม QR ของบริการนี้ในห้องออเดอร์',
    qrImage: '',
    enabled: true,
  },
  {
    id: 'commission-bot-4',
    parent: 'commission-bot',
    name: '👤 ◦ คอมมิชชัน 4',
    category: 'commission-bot',
    type: 'bot',
    description: 'งานคอมมิชชันของผู้ให้บริการคนที่ 4 — โอนตาม QR ของบริการนี้ในห้องออเดอร์',
    qrImage: '',
    enabled: true,
  },
  {
    id: 'inquiry',
    name: '💬 ◦ สอบถามเพิ่มเติม',
    category: 'inquiry',
    type: 'inquiry',
    description: 'มีคำถามหรือต้องการปรึกษาเพิ่มเติม พิมพ์สอบถามทีมงานในห้องนี้ได้เลย',
    enabled: true,
  },
];

function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.warn(`[shop] อ่านไฟล์ไม่สำเร็จ (${path.basename(file)}): ${err.message}`);
  }
  return fallback;
}

function writeJson(file, data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  } catch (err) {
    console.warn(`[shop] บันทึกไฟล์ไม่สำเร็จ (${path.basename(file)}): ${err.message}`);
  }
}

// ---------- สินค้า / บริการ ----------
// ไม่มีสินค้าที่ต้องเติมทีหลังในตอนนี้ (Midnight Kiss ถูกลบออกจากร้านแล้ว)
const PRODUCT_MIGRATIONS = [];

function applyProductMigrations() {
  const done = readJson(MIGRATIONS_FILE, []);
  const applied = Array.isArray(done) ? done : [];
  const pending = PRODUCT_MIGRATIONS.filter((m) => !applied.includes(m.key));
  if (!pending.length) return;

  const list = readJson(PRODUCTS_FILE, null);
  if (!Array.isArray(list)) return; // ยังไม่มีไฟล์ → ensureSeeded สร้างครบให้แล้ว

  let changed = false;
  for (const m of pending) {
    const existing = list.find((p) => p.id === m.product.id);
    if (!existing) {
      list.push({ ...m.product });
      changed = true;
    } else if (m.priceIfEmpty != null && existing.price == null) {
      existing.price = m.priceIfEmpty;
      changed = true;
    }
    applied.push(m.key);
  }
  if (changed) writeJson(PRODUCTS_FILE, list);
  writeJson(MIGRATIONS_FILE, applied);
}

export function ensureSeeded() {
  if (!fs.existsSync(PRODUCTS_FILE)) writeJson(PRODUCTS_FILE, DEFAULT_PRODUCTS);
  applyProductMigrations();
}

export function readProducts() {
  const list = readJson(PRODUCTS_FILE, null);
  if (Array.isArray(list)) return list;
  writeJson(PRODUCTS_FILE, DEFAULT_PRODUCTS);
  return [...DEFAULT_PRODUCTS];
}

export function listProducts({ category = null, onlyEnabled = false } = {}) {
  return readProducts().filter((p) => {
    if (onlyEnabled && p.enabled === false) return false;
    if (category && p.category !== category) return false;
    return true;
  });
}

export function getProduct(id) {
  return readProducts().find((p) => p.id === id) || null;
}

// บริการระดับบนสุด (ไม่มี parent) — ใช้กับเมนูหลัก/แผงร้าน
export function listTopProducts({ onlyEnabled = false } = {}) {
  return readProducts().filter((p) => !p.parent && (!onlyEnabled || p.enabled !== false));
}

// ตัวเลือกย่อยของบริการ (เช่น ประเภทของ Api key)
export function getChildren(parentId) {
  return readProducts().filter((p) => p.parent === parentId && p.enabled !== false);
}

// ตั้งราคาต่อหน่วยของบริการ (null = ไม่กำหนด)
export function setProductPrice(id, price) {
  const list = readProducts();
  const product = list.find((p) => p.id === id);
  if (!product) return null;
  product.price = price == null ? null : Math.max(0, Number(price) || 0);
  writeJson(PRODUCTS_FILE, list);
  return product;
}

export function upsertProduct(product) {
  const list = readProducts();
  const idx = list.findIndex((p) => p.id === product.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...product };
  else list.push(product);
  writeJson(PRODUCTS_FILE, list);
  return product;
}

export function deleteProduct(id) {
  const list = readProducts().filter((p) => p.id !== id);
  writeJson(PRODUCTS_FILE, list);
}

// ---------- ออเดอร์ในห้อง ----------
export function dayKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: config.shop.timezone }).format(value);
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

export function readOrders() {
  const list = readJson(ORDERS_FILE, null);
  return Array.isArray(list) ? list : [];
}

export function addOrder(order) {
  const list = readOrders();
  list.push(order);
  writeJson(ORDERS_FILE, list);
  return order;
}

// ออกเลขลำดับออเดอร์ถัดไป (เก็บถาวรใน data/shop-counter.json)
export function nextOrderNumber() {
  const data = readJson(COUNTER_FILE, null);
  const last = Number(data?.order);
  const base = Number.isFinite(last) && last >= ORDER_NUMBER_START ? last : ORDER_NUMBER_START;
  const next = base + 1;
  writeJson(COUNTER_FILE, { order: next });
  return next;
}

export function listOrders({ dayKey: key = null, openOnly = false } = {}) {
  return readOrders().filter((o) => {
    if (openOnly && o.closedAt) return false;
    if (key && o.dayKey !== key) return false;
    return true;
  });
}

// ออเดอร์ในช่วงวันที่ (YYYY-MM-DD แบบรวมหัวท้าย) — ใช้ทำสรุปรายสัปดาห์/รายเดือน
export function listOrdersInRange(startKey, endKey) {
  const inRange = (key) => key != null && key >= startKey && key <= endKey;
  return readOrders().filter((o) => {
    const key = o.dayKey || (o.createdAt ? dayKey(new Date(o.createdAt)) : null);
    if (inRange(key)) return true;
    // ออเดอร์ที่จ่ายเป็นงวด: ให้โผล่ในทุกวันที่มีสลิปโอน (แม้เปิดห้องคนละวัน)
    return (Array.isArray(o.payments) ? o.payments : []).some((p) =>
      inRange(p?.dayKey || (p?.paidAt ? dayKey(new Date(p.paidAt)) : null)),
    );
  });
}

export function getOrder(roomId) {
  return readOrders().find((o) => o.roomId === roomId) || null;
}

export function setOrderAmount(roomId, amount, slipUrls = [], transfer = null, priceInfo = {}) {
  const list = readOrders();
  const order = list.find((o) => o.roomId === roomId);
  if (!order) return null;
  const value = amount == null ? null : Number(amount) || 0;
  const urls = (Array.isArray(slipUrls) ? slipUrls : []).filter(Boolean);
  const now = new Date().toISOString();

  // ออเดอร์คอมมิชชันจ่ายเป็น 2 งวด → amount เก็บ "ยอดรวมที่จ่ายแล้ว" (ใช้ทำสรุปยอด)
  // lastAmount/payments เก็บยอดของสลิปใบล่าสุด/ประวัติทุกใบ
  const isDeposit = Number(order.depositPercent) > 0 && Boolean(priceInfo.stage);
  if (isDeposit) {
    const paidBefore = Number(order.amount) || 0;
    order.lastAmount = value;
    order.amount = money(paidBefore + (value || 0));
    order.slipUrls = [...(Array.isArray(order.slipUrls) ? order.slipUrls : []), ...urls];
    order.transfer = transfer || null;
    order.paidAt = now;
    order.payments = Array.isArray(order.payments) ? order.payments : [];
    const paidAt = priceInfo.paidAt || now;
    order.payments.push({
      stage: priceInfo.stage,
      amount: value,
      expected: priceInfo.expected == null ? null : Number(priceInfo.expected) || 0,
      match: priceInfo.priceMatch ?? null,
      slipUrl: urls[0] || null,
      transfer: transfer || null,
      paidAt,
      // วันที่โอนจากสลิป (ไม่ใช่วันที่แนบ/วันเปิดห้อง) — ใช้ทำสรุปยอดแยกงวด
      dayKey: priceInfo.dayKey || (paidAt ? dayKey(new Date(paidAt)) : dayKey()),
    });
    if (priceInfo.stage === 'deposit' && priceInfo.priceMatch === true) order.depositPaid = true;
    if (priceInfo.stage === 'balance' && priceInfo.priceMatch === true) order.balancePaid = true;
  } else {
    order.amount = value;
    order.lastAmount = value;
    order.slipUrls = urls;
    order.transfer = transfer || null;
    order.paidAt = now;
  }

  if (priceInfo.unitPrice !== undefined) {
    order.unitPrice = priceInfo.unitPrice == null ? null : Number(priceInfo.unitPrice) || 0;
  }
  if (priceInfo.pricePer !== undefined) {
    order.pricePer = Number(priceInfo.pricePer) > 0 ? Number(priceInfo.pricePer) : 1;
  }
  if (priceInfo.quantity !== undefined) order.quantity = Math.max(1, Number(priceInfo.quantity) || 1);
  if (priceInfo.expected !== undefined) {
    order.expected = priceInfo.expected == null ? null : Number(priceInfo.expected) || 0;
  }
  if (priceInfo.priceMatch !== undefined) order.priceMatch = priceInfo.priceMatch;
  if (priceInfo.expectedSource !== undefined) order.expectedSource = priceInfo.expectedSource;
  if (priceInfo.slipWarnings !== undefined) {
    const old = Array.isArray(order.slipWarnings) ? order.slipWarnings.filter(Boolean) : [];
    order.slipWarnings = [...new Set([...old, ...(priceInfo.slipWarnings || []).filter(Boolean)])];
  }

  if (Number(order.depositPercent) > 0 && Number(order.agreedPrice) > 0) {
    const price = Number(order.agreedPrice);
    if ((Number(order.amount) || 0) >= price - 0.01) {
      order.fullyPaid = true;
      order.depositPaid = true;
      order.balancePaid = true;
      order.expected = price;
      order.priceMatch = true;
      order.expectedSource = 'agreed';
    }
  }
  writeJson(ORDERS_FILE, list);
  return order;
}

// ตั้ง "ราคาที่ตกลง" เฉพาะห้อง (บริการที่ไม่มีเรตคงที่ เช่น Theme / Commission Bot)
// ถ้าแนบสลิปไปแล้วให้เทียบทันที ไม่ต้องให้ลูกค้าแนบสลิปซ้ำ
export function setOrderAgreedPrice(roomId, price) {
  const list = readOrders();
  const order = list.find((o) => o.roomId === roomId);
  if (!order) return null;
  order.agreedPrice = price == null ? null : money(Math.max(0, Number(price) || 0));

  const percent = Number(order.depositPercent) || 0;
  if (order.agreedPrice != null && percent > 0) {
    order.depositAmount = money((order.agreedPrice * percent) / 100);
    order.balanceAmount = money(order.agreedPrice - order.depositAmount);
    const paid = Number(order.amount) || 0;
    const deposit = order.depositAmount;
    if (paid >= order.agreedPrice - 0.01) {
      order.depositPaid = true;
      order.balancePaid = true;
      order.fullyPaid = true;
      order.expected = order.agreedPrice;
      order.priceMatch = true;
    } else if (paid >= deposit - 0.01) {
      order.depositPaid = true;
      order.balancePaid = false;
      order.fullyPaid = false;
      order.expected = money(price - paid);
      order.priceMatch = Math.abs(paid - deposit) < 0.01;
    } else {
      order.depositPaid = false;
      order.balancePaid = false;
      order.fullyPaid = false;
      order.expected = deposit;
      order.priceMatch = paid > 0 ? Math.abs(paid - deposit) < 0.01 : null;
    }
    order.expectedSource = 'agreed';
  } else if (order.agreedPrice != null) {
    order.expected = order.agreedPrice;
    order.expectedSource = 'agreed';
    order.priceMatch =
      order.amount == null ? null : Math.abs(Number(order.amount) - order.agreedPrice) < 0.01;
    order.fullyPaid = false;
  } else {
    order.expected = null;
    order.expectedSource = null;
    order.priceMatch = null;
    order.depositAmount = null;
    order.balanceAmount = null;
    order.depositPaid = false;
    order.balancePaid = false;
    order.fullyPaid = false;
  }
  writeJson(ORDERS_FILE, list);
  return order;
}

// แยกยอดมัดจำ/คงเหลือของออเดอร์คอมมิชชัน (บริการอื่นจะได้ null)
export function depositParts(order = {}) {
  const percent = Number(order.depositPercent) || 0;
  const price = Number(order.agreedPrice);
  if (!(percent > 0) || !(price > 0)) return null;
  const deposit = Number(order.depositAmount) || money((price * percent) / 100);
  return { percent, deposit, balance: money(price - deposit) };
}

// งวดที่ลูกค้าต้องจ่าย "ตอนนี้" — ใช้ทั้งตอนแนบสลิปและตอนโชว์ราคาในห้อง
// จ่ายเต็มรอบเดียวได้: ถ้ายอดรวม (จ่ายแล้ว + สลิปนี้) ครบราคา → ถือว่าชำระครบ
export function paymentStage(order = {}, incomingAmount = null) {
  const parts = depositParts(order);
  if (!parts) return null;
  const price = Number(order.agreedPrice);
  const paid = Number(order.amount) || 0;
  const value = incomingAmount == null ? null : Number(incomingAmount) || 0;

  if (paid >= price - 0.01) return { key: 'complete', label: 'ชำระครบแล้ว', expected: price };
  if (paid >= parts.deposit - 0.01) {
    return { key: 'balance', label: `งวดที่เหลือ ${parts.percent}%`, expected: money(price - paid) };
  }
  // ยังไม่จ่ายมัดจำ แต่โอนครบราคาในสลิปเดียว → ถือว่าชำระครบ
  if (value != null && paid + value >= price - 0.01) {
    return { key: 'full', label: 'จ่ายเต็มรอบเดียว', expected: money(price - paid) };
  }
  return { key: 'deposit', label: `มัดจำ ${parts.percent}%`, expected: parts.deposit };
}

// แยกออเดอร์ที่จ่ายหลายงวดเป็น "1 งวด = 1 แถว" สำหรับสรุปยอด/รายการออเดอร์
// วันที่ของแถว = วันที่โอนจากสลิป (ไม่ใช่วันเปิดห้อง) — บริการอื่นได้แถวเดิมไม่เปลี่ยน
export function expandOrdersByPaymentDay(orders = [], { startKey = null, endKey = null } = {}) {
  const inRange = (key) =>
    Boolean(key) && (!startKey || key >= startKey) && (!endKey || key <= endKey);
  return orders.flatMap((order) => {
    const payments = (Array.isArray(order.payments) ? order.payments : []).filter((p) => {
      if (!p) return false;
      const key = p.dayKey || (p.paidAt ? dayKey(new Date(p.paidAt)) : order.dayKey);
      return inRange(key);
    });
    if (!(Number(order.depositPercent) > 0) || !payments.length) {
      // บริการที่จ่ายเต็ม/ยังไม่แนบสลิป: วันที่ของแถวคือวันเปิดห้อง
      if ((startKey || endKey) && !inRange(order.dayKey)) return [];
      return [order];
    }
    return payments.map((p) => {
      const stage = p.stage || null;
      const installmentLabel =
        stage === 'deposit'
          ? `มัดจำ ${order.depositPercent}%`
          : stage === 'balance'
            ? 'งวดที่เหลือ'
            : stage === 'full'
              ? 'จ่ายเต็มรอบเดียว'
              : '';
      return {
        ...order,
        dayKey: p.dayKey || (p.paidAt ? dayKey(new Date(p.paidAt)) : order.dayKey),
        amount: p.amount == null ? null : Number(p.amount) || 0,
        lastAmount: p.amount,
        slipUrls: p.slipUrl ? [p.slipUrl] : [],
        expected: p.expected,
        priceMatch: p.match,
        transfer: p.transfer || null,
        paidAt: p.paidAt || null,
        slipWarnings: order.slipWarnings || [],
        payments: [p],
        // ใช้สถานะของ "งวดนี้" ไม่ใช่สถานะรวมของห้อง
        fullyPaid: stage === 'full',
        depositPaid: stage !== 'deposit',
        balancePaid: stage === 'balance' || stage === 'full',
        installment: stage,
        installmentLabel,
      };
    });
  });
}

// ---------- สลิปที่เคยใช้ (กันสลิปซ้ำ/สลิปเก่า) ----------
export function readUsedSlips() {
  const list = readJson(SLIPS_FILE, null);
  return Array.isArray(list) ? list : [];
}

// หาสลิปที่เคยบันทึกไว้ จาก hash รูป หรือเลขอ้างอิง
export function findUsedSlip({ transRef = null, hash = null } = {}) {
  const ref = transRef ? String(transRef).trim().toLowerCase() : null;
  if (!ref && !hash) return null;
  return (
    readUsedSlips().find((s) => {
      if (hash && s.hash && s.hash === hash) return true;
      if (ref && s.transRef && String(s.transRef).trim().toLowerCase() === ref) return true;
      return false;
    }) || null
  );
}

export function addUsedSlip(entry) {
  const list = readUsedSlips();
  list.push({ ...entry, at: new Date().toISOString() });
  writeJson(SLIPS_FILE, list);
  return entry;
}

export function markOrderClosed(roomId) {
  const list = readOrders();
  const order = list.find((o) => o.roomId === roomId);
  if (order && !order.closedAt) {
    order.closedAt = new Date().toISOString();
    writeJson(ORDERS_FILE, list);
  }
  return order || null;
}

// ผู้ซื้อกด "แจ้งปิดห้อง" — บันทึกเวลาไว้กันกดรัว ๆ (ไม่ปิดออเดอร์จริง)
export function requestOrderClose(roomId, cooldownMs = 5 * 60 * 1000) {
  const list = readOrders();
  const order = list.find((o) => o.roomId === roomId);
  if (!order) return { order: null, recent: false };

  const now = Date.now();
  const last = order.closeRequestedAt ? Date.parse(order.closeRequestedAt) : 0;
  if (last && now - last < cooldownMs) return { order, recent: true };

  order.closeRequestedAt = new Date(now).toISOString();
  writeJson(ORDERS_FILE, list);
  return { order, recent: false };
}
