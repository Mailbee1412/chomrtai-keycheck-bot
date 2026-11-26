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
const SHEET_ID = '1WApHCUOQhDx4t9TJZSL4LI8QMnYJkzprnWj4CWO8LL4';

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
    ['SAMPLE-0002', '0002', '2026-11-26', '19:50', '19:52', '1234567890', 'ลูกค้าตัวอย่าง',
      '🍷 ◦ Cosmo [ โมเดลรวม Gemini / Claude ]', 'api-key-cosmo', 200, 79, 100, 158, 79,
      '⚠️ ไม่ตรง', 'ไม่ตรง', 'ตัวอย่าง: จ่ายไม่ตรงที่ควรได้', 'SAMPLE-REF-002', '', 'ไม่', '2026-11-26T12:10:00.000Z'],
    ['SAMPLE-0003', '0003', '2026-11-26', '20:05', '', '1234567890', 'ลูกค้าตัวอย่าง',
      '🥃 ◦ Long Island [ Gemini Pro / Flash ]', 'api-key-long-island', 100, 49, 100, 49, '',
      '🕓 ยังไม่แนบสลิป', '', '', '', '', 'ไม่', '2026-11-26T12:15:00.000Z'],
    ['SAMPLE-0004', '0004', '2026-11-26', '20:18', '20:21', '1234567890', 'ลูกค้าตัวอย่าง',
      '🍸 ◦ Angel Shot [ Claude ]', 'api-key-angel-shot', 100, 139, 100, 139, 139,
      '🔎 รอตรวจ', '', 'ตัวอย่าง: รอทีมตรวจสลิป', 'SAMPLE-REF-004', '', 'ไม่', '2026-11-26T12:20:00.000Z'],
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

// จัดรูปแบบชีตให้คนเช็คอ่านง่าย (เรียกครั้งเดียวจาก Apps Script editor)
// ตั้ง Conditional Formatting ไว้ด้วย → แถวออเดอร์ใหม่จะระบายสีตามผลตรวจเองอัตโนมัติ
function beautifySheet() {
  const ss = getSpreadsheet();

  function styleHeader(sheet, count) {
    if (sheet.getLastRow() < 1) return;
    sheet.getRange(1, 1, 1, count)
      .setFontWeight('bold')
      .setFontColor('#ffffff')
      .setBackground('#3c3c3c')
      .setWrap(true);
    sheet.setFrozenRows(1);
  }

  function setWidths(sheet, widths) {
    widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  }

  function colorRules(sheet, lastCol) {
    const range = sheet.getRange(2, 1, 1000, lastCol);
    const rule = (formula, bg) => SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(formula)
      .setRanges([range])
      .setBackground(bg)
      .build();
    sheet.setConditionalFormatRules([
      rule('=AND($O2<>"",ISNUMBER(SEARCH("ไม่ตรง",$O2)))', '#f4cccc'),
      rule('=AND($O2<>"",ISNUMBER(SEARCH("รอตรวจ",$O2)))', '#fce5cd'),
      rule('=AND($O2<>"",ISNUMBER(SEARCH("ยังไม่แนบ",$O2)))', '#fff2cc'),
      rule('=AND($O2<>"",ISNUMBER(SEARCH("ตรง",$O2)),NOT(ISNUMBER(SEARCH("ไม่ตรง",$O2))))', '#d9ead3'),
    ]);
  }

  // ระบายสีจริงลงแถวตัวอย่าง (คนเปิดชีตเห็นสีทันที ไม่ต้องรอ conditional rule)
  function paintSample(sheet) {
    const last = sheet.getLastRow();
    if (last < 2) return;
    const palette = [
      { test: /ไม่ตรง/, row: '#f4cccc', cell: '#ea9999', name: '⚠️ ไม่ตรง' },
      { test: /รอตรวจ/, row: '#fce5cd', cell: '#f9cb9c', name: '🔎 รอตรวจ' },
      { test: /ยังไม่แนบ/, row: '#fff2cc', cell: '#ffe599', name: '🕓 ยังไม่แนบสลิป' },
      { test: /ตรง/, row: '#d9ead3', cell: '#b6d7a8', name: '✅ ตรง' },
    ];
    const statuses = sheet.getRange(2, 15, last - 1, 1).getValues().flat();
    statuses.forEach((value, i) => {
      const text = String(value || '');
      if (!text) return;
      const hit = palette.find((p) => p.test.test(text));
      if (!hit) return;
      const r = i + 2;
      sheet.getRange(r, 1, 1, ORDER_HEADERS.length).setBackground(hit.row);
      sheet.getRange(r, 15, 1, 2).setBackground(hit.cell).setFontWeight('bold');
      sheet.getRange(r, 15, 1, 2).setNote(hit.name);
      const no = String(i + 1).padStart(4, '0');
      sheet.getRange(r, 1, 1, 2).setValues([['SAMPLE-' + no, no]]);
    });
  }

  // คำอธิบายการใช้งาน + เฉลยสี วางไว้ด้านล่างแถวตัวอย่างในแท็บเดียวกัน
  // ลบของเก่าก่อนทุกครั้ง → รันซ้ำไม่ซ้อนกัน
  function writeGuide(sheet) {
    let last = sheet.getLastRow();
    for (let r = 2; r <= last; r += 1) {
      if (String(sheet.getRange(r, 1).getValue() || '').indexOf('วิธีใช้ชีต') >= 0) {
        sheet.deleteRows(r, last - r + 1);
        break;
      }
    }
    last = sheet.getLastRow();
    const start = last + 2;

    const title = sheet.getRange(start, 1, 1, ORDER_HEADERS.length);
    title.merge();
    title.setValue('📖 วิธีใช้ชีต (อ่านก่อนตรวจ)')
      .setBackground('#3c3c3c').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setRowHeight(start, 32);

    const colors = [
      ['✅ ตรง', '#d9ead3', '#b6d7a8', 'ยอดจริงตรงกับยอดที่ควรได้ → ส่งคีย์ให้ลูกค้าได้เลย'],
      ['⚠️ ไม่ตรง', '#f4cccc', '#ea9999', 'ยอดไม่ตรง → แจ้งลูกค้า/ตรวจสลิปก่อนส่งคีย์'],
      ['🕓 ยังไม่แนบสลิป', '#fff2cc', '#ffe599', 'ยังไม่ได้สลิป → รอแนบก่อน ยังไม่ต้องส่งคีย์'],
      ['🔎 รอตรวจ', '#fce5cd', '#f9cb9c', 'แนบสลิปแล้วแต่ต้องให้ทีมตรวจเพิ่ม'],
    ];
    colors.forEach((c, i) => {
      const r = start + 1 + i;
      const label = sheet.getRange(r, 1, 1, 2);
      label.merge().setValue(c[0]).setBackground(c[2]).setFontWeight('bold');
      const detail = sheet.getRange(r, 3, 1, ORDER_HEADERS.length - 2);
      detail.merge().setValue(c[3]).setBackground(c[1]).setWrap(true);
      sheet.setRowHeight(r, 28);
    });

    const noteStart = start + 6;
    const noteHead = sheet.getRange(noteStart, 1, 1, ORDER_HEADERS.length);
    noteHead.merge().setValue('💡 อ่านยังไง / กฎของบอท')
      .setBackground('#d4af37').setFontWeight('bold');
    sheet.setRowHeight(noteStart, 28);

    const notes = [
      'คอลัมน์ O = ผลตรวจ · P = ตรง/ไม่ตรง · Q = ข้อสังเกต · S = ลิงก์สลิป · T = ปิดห้อง',
      'แถวออเดอร์ใหม่จะระบายสีเองอัตโนมัติตามผลตรวจ (ไม่ต้องมาจัดสีซ้ำ)',
      'ลูกค้าแจ้งปิดห้องได้ / ปุ่มปิดห้องเป็นของทีมงานเท่านั้น',
      'สรุปยอดดูที่แท็บ สรุปรายวัน · สรุปรายสัปดาห์ · สรุปรายเดือน (บอทอัปเดตเวลา 00:05)',
      'กดไอคอนกรองที่แถวหัวตารางเพื่อเรียง/กรอง · ช่องผลตรวจ/ตรง-ไม่ตรง/ปิดห้องมี dropdown ให้เลือก',
    ];
    notes.forEach((text, i) => {
      const r = noteStart + 1 + i;
      const cell = sheet.getRange(r, 1, 1, ORDER_HEADERS.length);
      cell.merge().setValue('• ' + text).setBackground('#f3f3f3').setWrap(true);
      sheet.setRowHeight(r, 24);
    });
  }

  function dataLastBeforeGuide(sheet) {
    const last = sheet.getLastRow();
    for (let r = 2; r <= last; r += 1) {
      if (String(sheet.getRange(r, 1).getValue() || '').indexOf('วิธีใช้ชีต') >= 0) return r - 1;
    }
    return last;
  }

  function applyFilter(sheet, last) {
    const old = sheet.getFilter();
    if (old) old.remove();
    if (last >= 1) sheet.getRange(1, 1, last, ORDER_HEADERS.length).createFilter();
  }

  function applyValidation(sheet, fromRow, toRow) {
    if (toRow < fromRow) return;
    const rules = [
      { col: 15, values: ['✅ ตรง', '⚠️ ไม่ตรง', '🕓 ยังไม่แนบสลิป', '🔎 รอตรวจ'] },
      { col: 16, values: ['ตรง', 'ไม่ตรง'] },
      { col: 20, values: ['ใช่', 'ไม่'] },
    ];
    rules.forEach((rule) => {
      sheet.getRange(fromRow, rule.col, toRow - fromRow + 1, 1)
        .setDataValidation(SpreadsheetApp.newDataValidation()
          .requireValueInList(rule.values, true)
          .setAllowInvalid(true)
          .setHelpText('เลือกจากรายการที่กำหนด เพื่อให้สี/การกรองทำงานถูกต้อง')
          .build());
    });
  }

  function trimEmptyOrderRows(sheet) {
    const last = sheet.getLastRow();
    if (last < 2) return;
    const values = sheet.getRange(2, 1, last - 1, ORDER_HEADERS.length).getValues();
    let lastData = 1;
    values.forEach((row, i) => {
      if (row.some((v) => v !== '' && v !== null)) lastData = i + 2;
    });
    if (last > lastData) sheet.deleteRows(lastData + 1, last - lastData);
  }

  function cleanSummaryTestRows(sheet) {
    const last = sheet.getLastRow();
    if (last < 2) return 0;
    const labels = sheet.getRange(2, 2, last - 1, 1).getValues();
    let removed = 0;
    for (let i = labels.length - 1; i >= 0; i -= 1) {
      if (String(labels[i][0]) === 'เช็คระบบ (ลบได้)') {
        sheet.deleteRow(i + 2);
        removed += 1;
      }
    }
    return removed;
  }

  const orderWidths = [130, 60, 100, 90, 90, 120, 130, 240, 150, 80, 90, 90, 90, 90, 110, 80, 240, 150, 260, 70, 150];
  ['ตัวอย่าง', TAB_ORDERS].forEach((name) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    if (name === TAB_ORDERS) trimEmptyOrderRows(sheet);
    sheet.setTabColor('#d4af37');
    styleHeader(sheet, ORDER_HEADERS.length);
    setWidths(sheet, orderWidths);
    sheet.getRange(1, 15).setNote('สีแถวอัตโนมัติ: เขียว=ตรง / แดง=ไม่ตรง / เหลือง=ยังไม่แนบสลิป / ส้ม=รอตรวจ');
    const n = sheet.getLastRow() - 1;
    if (n > 0) {
      sheet.getRange(2, 8, n, 1).setWrap(true);
      sheet.getRange(2, 17, n, 3).setWrap(true);
      sheet.getRange(2, 10, n, 5).setNumberFormat('#,##0.00');
    }
    colorRules(sheet, ORDER_HEADERS.length);
    if (name === 'ตัวอย่าง') {
      paintSample(sheet);
      writeGuide(sheet);
      const dataLast = dataLastBeforeGuide(sheet);
      applyFilter(sheet, dataLast);
      applyValidation(sheet, 2, dataLast);
    } else {
      const last = sheet.getLastRow();
      applyFilter(sheet, Math.max(last, 1));
      if (last > 1) applyValidation(sheet, 2, last);
    }
  });

  const tabColors = { day: '#6fa8dc', week: '#8e7cc3', month: '#0b5394' };
  Object.keys(TAB_SUMMARY).forEach((key) => {
    const sheet = ss.getSheetByName(TAB_SUMMARY[key]);
    if (!sheet) return;
    cleanSummaryTestRows(sheet);
    sheet.setTabColor(tabColors[key]);
    styleHeader(sheet, SUMMARY_HEADERS.length);
    setWidths(sheet, [90, 180, 140, 140, 110, 110, 90, 110, 90, 90, 90, 100, 340, 150]);
    const n = Math.max(sheet.getLastRow() - 1, 1);
    sheet.getRange(2, 1, n, SUMMARY_HEADERS.length).setFontWeight('bold');
    sheet.getRange(2, 13, n, 1).setWrap(true);
    sheet.getRange(2, 5, n, 8).setNumberFormat('#,##0.00');
  });

  return 'beautified';
}

// ลบ Midnight Kiss ออกจากชีตทั้งหมด (แท็บตัวอย่าง/ออเดอร์) แล้วจัดรูปแบบให้ด้วย
// เรียกครั้งเดียวจาก Apps Script editor — ไม่ต้อง Deploy
function removeMidnightKiss() {
  const ss = getSpreadsheet();
  let removed = 0;
  ['ตัวอย่าง', TAB_ORDERS].forEach((name) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    const n = sheet.getLastRow() - 1;
    const keys = sheet.getRange(2, 1, n, 2).getValues();
    const products = sheet.getRange(2, 8, n, 2).getValues();
    for (let i = n - 1; i >= 0; i -= 1) {
      const text = [keys[i][0], keys[i][1], products[i][0], products[i][1]].join(' ');
      if (/midnight/i.test(text)) {
        sheet.deleteRow(i + 2);
        removed += 1;
      }
    }
  });
  const formatted = beautifySheet();
  Logger.log('removeMidnightKiss removed=' + removed + ' format=' + formatted);
  return 'ลบ Midnight Kiss ' + removed + ' แถว / ' + formatted;
}

// สร้างตัวอย่างครบ 4 สี แล้วจัดรูปแบบให้ในขั้นตอนเดียว
function refreshSample() {
  const made = createSampleSheet();
  beautifySheet();
  return made + ' / beautified';
}
