import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, config } from '../../config.js';

const PRODUCTS_FILE = path.join(DATA_DIR, 'shop-products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'shop-room-orders.json');
const SLIPS_FILE = path.join(DATA_DIR, 'shop-used-slips.json');

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
    name: '🧸 ◦ Commission Bot',
    category: 'commission-bot',
    type: 'bot',
    description: 'รับทำ/คอมมิชชันบอทดิสคอร์ดตามโจทย์ อธิบายความต้องการเพิ่มเติมในห้องได้เลย',
    enabled: true,
  },
  {
    id: 'vertex-email',
    name: '💌 ◦ Email สำหรับ Vertex',
    category: 'vertex-email',
    type: 'email',
    description: 'อีเมลสำหรับสมัคร/ใช้งาน Google Vertex AI แจ้งจำนวนที่ต้องการได้ในห้อง',
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
export function ensureSeeded() {
  if (!fs.existsSync(PRODUCTS_FILE)) writeJson(PRODUCTS_FILE, DEFAULT_PRODUCTS);
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
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: config.shop.timezone }).format(date);
  } catch {
    return new Date(date).toISOString().slice(0, 10);
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

export function listOrders({ dayKey: key = null, openOnly = false } = {}) {
  return readOrders().filter((o) => {
    if (openOnly && o.closedAt) return false;
    if (key && o.dayKey !== key) return false;
    return true;
  });
}

export function getOrder(roomId) {
  return readOrders().find((o) => o.roomId === roomId) || null;
}

export function setOrderAmount(roomId, amount, slipUrls = [], transfer = null, priceInfo = {}) {
  const list = readOrders();
  const order = list.find((o) => o.roomId === roomId);
  if (!order) return null;
  order.amount = amount == null ? null : Number(amount) || 0;
  order.slipUrls = slipUrls;
  order.transfer = transfer || null;
  order.paidAt = new Date().toISOString();
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
  if (priceInfo.slipWarnings !== undefined) order.slipWarnings = priceInfo.slipWarnings;
  writeJson(ORDERS_FILE, list);
  return order;
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
