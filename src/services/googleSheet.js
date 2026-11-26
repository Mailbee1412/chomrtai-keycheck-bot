import { config } from '../config.js';
import { slipCheckStatus, formatMoney } from '../features/shop/embeds.js';

// ให้เทสต์สลับ fetch ได้ (ไม่แตะ global)
let fetchImpl = (...args) => globalThis.fetch(...args);
export function __setFetch(fn) {
  fetchImpl = fn ? (...args) => fn(...args) : (...args) => globalThis.fetch(...args);
}

// เปิดใช้เมื่อตั้งค่า URL ของ Apps Script Web app ไว้
export function isSheetEnabled() {
  return Boolean(config.shop.gsheetWebhookUrl);
}

// ลิงก์ชีตที่ใส่ในข้อความสรุป (แยกแท็บได้ ถ้าตั้งค่าไว้)
export function getSheetLink(period = 'day') {
  const specific = {
    day: config.shop.gsheetLinkDay,
    week: config.shop.gsheetLinkWeek,
    month: config.shop.gsheetLinkMonth,
  }[period];
  return specific || config.shop.gsheetSheetUrl || '';
}

// ข้อความลิงก์สำหรับแนบท้ายการ์ดสรุป
export function buildSheetLinkField(period = 'day') {
  const url = getSheetLink(period);
  if (!url) return null;
  const tabs = { day: 'สรุปรายวัน + ออเดอร์', week: 'สรุปรายสัปดาห์ + ออเดอร์', month: 'สรุปรายเดือน + ออเดอร์' };
  return { name: '📊 Google Sheet', value: `[เปิดข้อมูลล่าสุด](${url}) · แท็บ ${tabs[period] || tabs.day}` };
}

const TZ = () => config.shop.timezone || 'Asia/Bangkok';

function timeOfDay(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ(),
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return '';
  }
}

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// แถวออเดอร์ 1 แถว = 1 ออเดอร์ (ใช้ rooms + ผลตรวจชุดเดียวกับ Excel)
export function buildSheetOrderRow(order = {}) {
  const check = slipCheckStatus(order);
  const slipUrls = (Array.isArray(order.slipUrls) ? order.slipUrls : []).filter(Boolean);
  const notes = [];
  if (order.expectedSource === 'agreed') notes.push('ราคาที่ตกลง (ทีมตั้ง)');
  if (Array.isArray(check.warnings)) notes.push(...check.warnings.filter(Boolean));
  return {
    roomId: order.roomId || '',
    orderNo: order.orderNo ? String(order.orderNo).padStart(4, '0') : '',
    dayKey: order.dayKey || '',
    opentime: timeOfDay(order.createdAt),
    createdAt: order.createdAt || '',
    closedAt: order.closedAt || '',
    userName: order.userName || '',
    userId: order.userId || '',
    productName: order.productName || order.productId || '',
    productId: order.productId || '',
    quantity: num(order.quantity),
    unitPrice: num(order.unitPrice),
    pricePer: num(order.pricePer),
    expected: num(order.expected),
    amount: num(order.amount),
    priceMatch: order.priceMatch === true ? 'ตรง' : order.priceMatch === false ? 'ไม่ตรง' : '',
    checkKey: check.key,
    checkLabel: `${check.mark} ${check.label}`,
    warnings: notes.join(' | '),
    transRef: order.transfer?.transRef || '',
    paidAt: order.transfer?.paidAt || '',
    slipCount: slipUrls.length,
    slipUrl: slipUrls[0] || '',
  };
}

// สรุปยอดของช่วงเวลาหนึ่ง (ใช้ตัวเลขชุดเดียวกับ embed/Excel)
export function buildSheetSummary(orders = []) {
  const checks = orders.map((o) => slipCheckStatus(o));
  const count = (key) => checks.filter((c) => c.key === key).length;
  const paid = orders.filter((o) => o.amount != null);
  const total = paid.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
  const byService = new Map();
  for (const o of orders) {
    const key = o.productName || o.productId || 'ไม่ระบุ';
    const cur = byService.get(key) || { name: key, count: 0, sum: 0 };
    cur.count += 1;
    cur.sum += Number(o.amount) || 0;
    byService.set(key, cur);
  }
  return {
    total,
    orderCount: orders.length,
    paidCount: paid.length,
    noSlip: orders.length - paid.length,
    ok: count('ok'),
    mismatch: count('mismatch'),
    review: count('review'),
    pending: count('pending'),
    byService: [...byService.values()].sort((a, b) => b.sum - a.sum || b.count - a.count),
  };
}

export function formatByService(byService = []) {
  return byService
    .map((s) => `${s.name} × ${s.count} = ${formatMoney(s.sum)}`)
    .join('\n');
}

// payload ที่ส่งให้ Apps Script (ไม่ใส่ secret ที่นี่ — ตัวส่งเป็นคนเติม)
export function buildSheetPayload({ period = 'day', label = '', startKey = '', endKey = '', orders = [], now = new Date() }) {
  const summary = buildSheetSummary(orders);
  return {
    type: 'summary',
    period,
    label,
    startKey,
    endKey,
    generatedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
    summary,
    byServiceText: formatByService(summary.byService),
    orders: orders.map((o) => buildSheetOrderRow(o)),
  };
}

// ส่งข้อมูลขึ้น Google Sheet — ไม่ throw เด็ดขาด (ชีตพังต้องไม่กระทบการส่ง Excel/Discord)
export async function syncSummaryToSheet({ period, label, startKey, endKey, orders = [], timeoutMs = 15000 }) {
  if (!isSheetEnabled()) return { ok: false, skipped: true, reason: 'ยังไม่ได้ตั้งค่า SHOP_GSHEET_WEBHOOK_URL' };

  const payload = buildSheetPayload({ period, label, startKey, endKey, orders });
  const body = { ...payload, secret: config.shop.gsheetSecret || '' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(config.shop.gsheetWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => '');
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* Apps Script อาจตอบ HTML ตอน deploy ผิด */
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: json?.error || text.slice(0, 200) || `HTTP ${res.status}` };
    }
    if (json && json.ok === false) {
      return { ok: false, status: res.status, error: json.error || 'Apps Script ตอบ ok=false' };
    }
    return { ok: true, status: res.status, written: json?.orders ?? null, updated: json?.updated ?? null };
  } catch (err) {
    return { ok: false, error: err?.name === 'AbortError' ? 'หมดเวลารอ Google Sheet' : err?.message || 'เชื่อมต่อ Google Sheet ไม่ได้' };
  } finally {
    clearTimeout(timer);
  }
}
