/**
 * Google Sheet สำหรับสรุปยอด ChomRtai
 * ------------------------------------------------------------
 * วิธีติดตั้ง (ครั้งเดียว):
 * วิธี A (ปกติ): เปิดชีต → Extensions → Apps Script → วางโค้ด → Deploy
 * วิธี B (ถ้ากด Apps Script แล้วขึ้น "unable to open the file"):
 *   1. เปิด https://script.google.com → New project → วางโค้ดไฟล์นี้ → บันทึก
 *   2. แก้ค่า SHEET_ID ด้านล่างให้เป็น ID ของชีต (ตัวกลางระหว่าง /d/ กับ /edit)
 *   3. Deploy → New deployment → Web app (Execute as: Me / Who has access: Anyone)
 *      → เอา URL /exec ใส่ SHOP_GSHEET_WEBHOOK_URL ใน .env
 *   ※ วิธี B ใช้ได้แม้เปิด Apps Script จากในชีตไม่ได้ (สคริปต์จะ openById แทน)
 *
 * ขั้นตอนร่วม:
 *   - ตั้ง SHOP_GSHEET_SECRET ให้ตรงกับบรรทัด SECRET ด้านล่าง (ปล่อยว่าง = ไม่ตรวจ)
 *   - ใส่ลิงก์ชีตใน SHOP_GSHEET_SHEET_URL เพื่อให้บอทส่งลิงก์เข้าแชท
 *   - แชร์ชีต: Anyone with the link → Viewer (คนในแชทต้องเปิดได้)
 *   - ทดสอบ: เปิด URL Web app ในเบราว์เซอร์ ต้องเห็น {"ok":true,...}
 *
 * หมายเหตุ: ID ชีตและรหัสลับไม่ได้ฝังมาในไฟล์นี้ (ใส่ตอนติดตั้งเอง)
 */

const SECRET = ''; // ใส่รหัสเดียวกับ SHOP_GSHEET_SECRET (ปล่อยว่าง = ไม่ตรวจรหัส)

// ใช้เฉพาะกรณีสร้างโปรเจกต์ standalone ที่ script.google.com (วิธี B)
// ตัวอย่าง: https://docs.google.com/spreadsheets/d/<ใส่ตรงนี้>/edit
const SHEET_ID = '1mK1Yk3gz5ZppihYTBfHFusRM7CfHDlFD8GTHX6nJ0Uw';

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

function getSpreadsheet() {
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('ไม่พบชีต — ใส่ SHEET_ID ในสคริปต์ หรือเปิด Apps Script จากในชีต');
  return ss;
}

function getSheet(name, headers) {
  const ss = getSpreadsheet();
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

// ลบข้อมูลออเดอร์เทสออกจากชีต (เรียกครั้งเดียวจาก Apps Script editor)
// วิธีใช้: เปิดโปรเจกต์ → เลือกฟังก์ชัน deleteTestRows ในช่อง dropdown → กด Run
function deleteTestRows() {
  const TEST_ROOM = '1569709679251296299';
  const TEST_LABEL = '2026-11-10';
  const ss = getSpreadsheet();
  let removed = 0;

  const orders = ss.getSheetByName(TAB_ORDERS);
  if (orders && orders.getLastRow() > 1) {
    const keys = orders.getRange(2, 1, orders.getLastRow() - 1, 1).getValues();
    for (let i = keys.length - 1; i >= 0; i -= 1) {
      if (String(keys[i][0]) === TEST_ROOM) {
        orders.deleteRow(i + 2);
        removed += 1;
      }
    }
  }

  const day = ss.getSheetByName(TAB_SUMMARY.day);
  if (day && day.getLastRow() > 1) {
    const labels = day.getRange(2, 2, day.getLastRow() - 1, 1).getValues();
    for (let i = labels.length - 1; i >= 0; i -= 1) {
      if (String(labels[i][0]) === TEST_LABEL) {
        day.deleteRow(i + 2);
        removed += 1;
      }
    }
  }

  Logger.log('deleteTestRows removed=' + removed);
  return removed;
}

// สร้างตารางตัวอย่างไว้ในแท็บแรก (ชื่อ "ตัวอย่าง") — เรียกครั้งเดียวจาก Apps Script editor
function createSampleSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('ตัวอย่าง');
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName('ตัวอย่าง');
  }
  sheet.clear();

  const headers = ORDER_HEADERS;
  const sample = [
    ['SAMPLE-0001', '0001', '2026-11-26', '19:30', '19:35', '1234567890', 'ลูกค้าตัวอย่าง',
      '🍹 ◦ Margarita [ Gemini Flash ล้วน ]', 'api-key-margarita', 100, 39, 100, 39, 39,
      '✅ ตรง', 'ตรง', '', 'SAMPLE-REF-001', '', 'ไม่', '2026-11-26T12:00:00.000Z'],
    ['SAMPLE-0002', '0002', '2026-11-26', '19:42', '', '1234567890', 'ลูกค้าตัวอย่าง',
      '🌙 ◦ Midnight Kiss [ Gemini Flash High ]', 'api-key-midnight-kiss', 100, 39, 100, 39, '',
      '🕓 ยังไม่แนบสลิป', '', '', '', '', 'ไม่', '2026-11-26T12:05:00.000Z'],
    ['SAMPLE-0003', '0003', '2026-11-26', '19:50', '19:52', '1234567890', 'ลูกค้าตัวอย่าง',
      '🍷 ◦ Cosmo [ โมเดลรวม Gemini / Claude ]', 'api-key-cosmo', 200, 79, 100, 158, 79,
      '⚠️ ไม่ตรง', 'ไม่ตรง', 'ตัวอย่าง: จ่ายไม่ตรงที่ควรได้', 'SAMPLE-REF-003', '', 'ไม่', '2026-11-26T12:10:00.000Z'],
  ];

  const lastCol = headers.length;
  sheet.getRange(1, 1, 1, lastCol).setValues([headers]);
  sheet.getRange(2, 1, sample.length, lastCol).setValues(sample);
  sheet.getRange(1, 1, 1, lastCol)
    .setFontWeight('bold')
    .setBackground('#fff4cc')
    .setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setTabColor('#d4af37');
  sheet.getRange(2, 10, sample.length, 5).setNumberFormat('#,##0.00');
  sheet.autoResizeColumns(1, lastCol);
  return 'sample created: ' + sample.length + ' rows';
}
