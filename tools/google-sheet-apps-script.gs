/**
 * Google Sheet สำหรับสรุปยอด ChomRtai
 * ------------------------------------------------------------
 * วิธีติดตั้ง (ครั้งเดียว):
 *   1. เปิด Google Sheet เปล่า → เมนู Extensions → Apps Script
 *   2. ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดไฟล์นี้ลงไป → บันทึก
 *   3. ถ้าตั้ง SHOP_GSHEET_SECRET ใน .env ให้ใส่รหัสเดียวกันในบรรทัด SECRET ด้านล่าง
 *      (ถ้าไม่ตั้ง ให้ปล่อย SECRET = '' ไว้)
 *   4. Deploy → New deployment → Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *      → คัดลอก URL ที่ได้ไปใส่ SHOP_GSHEET_WEBHOOK_URL ใน .env
 *   5. เอา URL หน้าชีต (https://docs.google.com/spreadsheets/d/...) ไปใส่
 *      SHOP_GSHEET_SHEET_URL เพื่อให้บอทส่งลิงก์เข้าแชท
 *   6. แชร์ชีต: Anyone with the link → Viewer (คนในแชทต้องเปิดได้)
 *   7. ทดสอบ: เปิด URL Web app ในเบราว์เซอร์ ต้องเห็น {"ok":true,...}
 *
 * หมายเหตุ: ไฟล์นี้ไม่มีความลับฝังอยู่ (รหัสใส่ตอนติดตั้งเอง)
 */

const SECRET = ''; // ใส่รหัสเดียวกับ SHOP_GSHEET_SECRET (ปล่อยว่าง = ไม่ตรวจรหัส)

const TAB_ORDERS = 'ออเดอร์';
const TAB_SUMMARY = {
  day: 'สรุปรายวัน',
  week: 'สรุปรายสัปดาห์',
  month: 'สรุปรายเดือน',
};

const ORDER_HEADERS = [
  'roomId', 'เลขที่', 'วันที่', 'เวลาเปิด', 'เวลาโอน', 'ผู้ใช้ (ID)', 'ชื่อผู้ใช้',
  'สินค้า', 'รหัสสินค้า', 'จำนวน', 'ราคา/หน่วย', 'ต่อกี่หน่วย', 'ควรได้',
  'ยอดจริง', 'ผลตรวจ', 'ตรง/ไม่ตรง', 'ข้อสังเกต', 'เลขอ้างอิง', 'ลิงก์สลิป',
  'ปิดห้อง', 'อัปเดตเมื่อ',
];

const SUMMARY_HEADERS = [
  'ช่วง', 'ป้าย', 'วันเริ่ม', 'วันสิ้นสุด', 'ยอดรวม', 'จำนวนออเดอร์', 'มีสลิป',
  'ไม่มีสลิป', 'ตรง', 'ไม่ตรง', 'รอตรวจ', 'ยังไม่แนบ', 'แยกตามบริการ', 'สร้างเมื่อ',
];

function doGet() {
  return jsonResponse({ ok: true, message: 'Google Sheet summary webhook พร้อมใช้งาน' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (SECRET && body.secret !== SECRET) return jsonResponse({ ok: false, error: 'รหัสไม่ถูกต้อง' }, 403);
    if (body.type !== 'summary') return jsonResponse({ ok: false, error: 'รองรับเฉพาะ type=summary' });

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const updatedAt = new Date().toISOString();
      const orders = upsertOrders(body.orders || [], updatedAt);
      const summary = upsertSummary(body);
      return jsonResponse({ ok: true, orders: orders.added + orders.updated, updated: summary.updated });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: String((err && err.message) || err) });
  }
}

function jsonResponse(obj, status) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function n(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  return Number.isFinite(num) ? num : '';
}

function thaiTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, 'Asia/Bangkok', 'dd/MM/yy HH:mm');
}

function getSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0 || sheet.getRange(1, 1).getValue() === '') {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#fff4cc')
      .setWrap(true);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }
  return sheet;
}

// อัปเดตแถวเดิมตามคีย์ (คอลัมน์ A) หรือเพิ่มแถวใหม่ — กันแถวซ้ำตอนรันซ้ำ
function upsertRows(sheet, headers, rows, keyOf) {
  const last = sheet.getLastRow();
  const keys = last > 1 ? sheet.getRange(2, 1, last - 1, 1).getValues().flat() : [];
  const indexByKey = new Map();
  keys.forEach((k, i) => {
    if (k !== '') indexByKey.set(String(k), i + 2);
  });

  const fresh = [];
  let updated = 0;
  for (const row of rows) {
    const values = headers.map((_, i) => row[i] === undefined || row[i] === null ? '' : row[i]);
    const key = String(keyOf(values) || '');
    if (!key) continue;
    const at = indexByKey.get(key);
    if (at) {
      sheet.getRange(at, 1, 1, headers.length).setValues([values]);
      updated += 1;
    } else {
      fresh.push(values);
      indexByKey.set(key, last + fresh.length);
    }
  }
  if (fresh.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, fresh.length, headers.length).setValues(fresh);
  }
  return { added: fresh.length, updated };
}

function orderValues(o, updatedAt) {
  return [
    o.roomId || '', o.orderNo || '', o.dayKey || '', o.opentime || '', thaiTime(o.paidAt),
    o.userId || '', o.userName || '', o.productName || '', o.productId || '',
    n(o.quantity), n(o.unitPrice), n(o.pricePer), n(o.expected), n(o.amount),
    o.checkLabel || '', o.priceMatch || '', o.warnings || '', o.transRef || '',
    o.slipUrl || '', o.closedAt ? 'ใช่' : 'ไม่', updatedAt,
  ];
}

function upsertOrders(orders, updatedAt) {
  const sheet = getSheet(TAB_ORDERS, ORDER_HEADERS);
  const result = upsertRows(sheet, ORDER_HEADERS, orders.map((o) => orderValues(o, updatedAt)), (v) => v[0]);
  const last = sheet.getLastRow();
  if (last > 1) {
    sheet.getRange(2, 10, last - 1, 5).setNumberFormat('#,##0.00'); // จำนวน..ยอดจริง
    sheet.getRange(2, 17, last - 1, 3).setWrap(true);              // ข้อสังเกต/อ้างอิง/ลิงก์
  }
  return result;
}

function summaryValues(body) {
  const s = body.summary || {};
  return [
    body.period || 'day', body.label || '', body.startKey || '', body.endKey || '',
    n(s.total), n(s.orderCount), n(s.paidCount), n(s.noSlip), n(s.ok), n(s.mismatch),
    n(s.review), n(s.pending), body.byServiceText || '', body.generatedAt || '',
  ];
}

function upsertSummary(body) {
  const name = TAB_SUMMARY[body.period] || TAB_SUMMARY.day;
  const sheet = getSheet(name, SUMMARY_HEADERS);
  const result = upsertRows(sheet, SUMMARY_HEADERS, [summaryValues(body)], (v) => v[1]);
  const last = sheet.getLastRow();
  if (last > 1) {
    sheet.getRange(2, 5, last - 1, 8).setNumberFormat('#,##0.00');
    sheet.getRange(2, 13, last - 1, 1).setWrap(true);
    sheet.autoResizeColumns(13, 1);
  }
  return result;
}
