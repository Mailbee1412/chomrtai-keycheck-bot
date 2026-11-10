import ExcelJS from 'exceljs';
import { config } from '../../config.js';
import { formatDateTime, slipCheckStatus, transferDetails } from './embeds.js';

// สีของช่อง "ผลตรวจ" แยกตามสถานะ (พื้นหลัง / ตัวอักษร)
const RESULT_STYLES = {
  ok: { fill: 'FFD1FAE5', font: 'FF047857' }, // เขียว
  mismatch: { fill: 'FFFEE2E2', font: 'FFB91C1C' }, // แดง
  review: { fill: 'FFFEF3C7', font: 'FFB45309' }, // เหลือง/ส้ม
  pending: { fill: 'FFE5E7EB', font: 'FF4B5563' }, // เทา
};

function paintResult(cell, key) {
  const style = RESULT_STYLES[key] || RESULT_STYLES.review;
  cell.font = { bold: true, color: { argb: style.font } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
}

// สร้างไฟล์ Excel (.xlsx) ของสรุปออเดอร์รายวัน — เปิดใน Excel/มือถือได้ทันที
export async function buildDailySummaryXlsx({ dayKey, orders = [], title = null }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Chomrthai Bot';
  workbook.created = new Date();

  const currency = config.shop.currencySymbol || '฿';
  const amountFormat = `#,##0 "${currency}"`;

  const sheet = workbook.addWorksheet('ออเดอร์');
  sheet.columns = [
    { header: 'เลขที่', key: 'no', width: 8 },
    { header: 'วันที่เปิด', key: 'createdAt', width: 19 },
    { header: 'ผู้ซื้อ', key: 'userName', width: 16 },
    { header: 'ผู้ซื้อ (ID)', key: 'userId', width: 16 },
    { header: 'บริการ', key: 'product', width: 40 },
    { header: 'จำนวน', key: 'quantity', width: 8 },
    { header: `ยอดที่ควรได้ (${currency})`, key: 'expected', width: 16 },
    { header: `ยอดจากสลิป (${currency})`, key: 'amount', width: 16 },
    { header: 'ผลตรวจ', key: 'result', width: 10 },
    { header: 'เวลาที่โอน', key: 'paidAt', width: 19 },
    { header: 'ผู้โอน', key: 'senderName', width: 18 },
    { header: 'ผู้รับ', key: 'receiverName', width: 18 },
    { header: 'ธนาคาร', key: 'bank', width: 24 },
    { header: 'เลขอ้างอิง', key: 'transRef', width: 22 },
    { header: 'หมายเหตุ', key: 'warnings', width: 36 },
    { header: 'สลิป', key: 'slip', width: 10 },
    { header: 'สถานะ', key: 'status', width: 10 },
  ];

  // ตรึงแถวหัวตาราง (เลื่อนดูข้อมูลด้านล่างได้โดยหัวตารางยังอยู่)
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.properties.defaultRowHeight = 22;
  const headerRow = sheet.getRow(1);
  headerRow.height = 26;
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFB810' } };

  for (const order of orders) {
    const transfer = transferDetails(order);
    const check = slipCheckStatus(order);
    const row = sheet.addRow({
      no: order.orderNo ? String(order.orderNo).padStart(4, '0') : '',
      createdAt: formatDateTime(order.createdAt),
      userName: order.userName || '',
      userId: order.userId || '',
      product: order.productName || order.productId || '',
      quantity: order.quantity == null ? null : Number(order.quantity) || null,
      expected: order.expected == null ? null : Number(order.expected) || 0,
      amount: order.amount == null ? null : Number(order.amount) || 0,
      result: check.label,
      paidAt: transfer.paidAt ? formatDateTime(transfer.paidAt) : '',
      senderName: transfer.senderName,
      receiverName: transfer.receiverName,
      bank: transfer.bank,
      transRef: transfer.transRef,
      warnings: check.warnings.join(' | '),
      slip: transfer.slipUrl ? { text: 'เปิดสลิป', hyperlink: transfer.slipUrl } : '',
      status: order.closedAt ? 'ปิดแล้ว' : 'ยังเปิด',
    });
    row.height = 22;
    for (const key of ['no', 'quantity', 'result', 'slip', 'status']) {
      row.getCell(key).alignment = { vertical: 'middle', horizontal: 'center' };
    }
    const warningsCell = row.getCell('warnings');
    warningsCell.alignment = { vertical: 'middle', wrapText: true };
    if (check.warnings.length) {
      const len = check.warnings.join(' | ').length;
      row.height = Math.max(22, 16 * Math.ceil(len / 34) + 6);
    }
    row.getCell('expected').numFmt = amountFormat;
    row.getCell('amount').numFmt = amountFormat;
    paintResult(row.getCell('result'), check.key);
    if (check.key === 'mismatch') {
      row.getCell('amount').font = { bold: true, color: { argb: 'FFB91C1C' } };
    }
    if (transfer.slipUrl) row.getCell('slip').font = { color: { argb: 'FF0563C1' }, underline: true };
  }

  // เปิดตัวกรองที่หัวตาราง ครอบเฉพาะแถวข้อมูล (ไม่รวมแถวรวมท้ายตาราง)
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1 + orders.length, column: 17 },
  };

  const paid = orders.filter((o) => o.amount != null);
  const total = paid.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
  const totalRow = sheet.addRow({ product: 'รวม', amount: total });
  totalRow.font = { bold: true };
  totalRow.height = 22;
  totalRow.getCell('amount').numFmt = amountFormat;
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4CC' } };

  // ชีตสรุปสำหรับทำบัญชี
  const summary = workbook.addWorksheet('สรุป');
  summary.columns = [{ width: 30 }, { width: 16 }, { width: 20 }];
  summary.addRow(['สรุปยอดร้าน', title || dayKey]).font = { bold: true };
  summary.addRow(['สร้างเมื่อ', formatDateTime(new Date().toISOString())]);
  summary.addRow(['จำนวนออเดอร์', orders.length]);
  summary.addRow(['ยอดรวม (จากสลิป)', total]).getCell(2).numFmt = amountFormat;
  summary.addRow(['ยังไม่แนบสลิป', orders.length - paid.length]);

  const checks = orders.map((order) => slipCheckStatus(order));
  const count = (key) => checks.filter((check) => check.key === key).length;
  summary.addRow([]);
  const checkHeader = summary.addRow(['ผลตรวจสลิป', 'จำนวน']);
  checkHeader.font = { bold: true };
  const okRow = summary.addRow(['ตรง', count('ok')]);
  const mismatchRow = summary.addRow(['ไม่ตรง', count('mismatch')]);
  const reviewRow = summary.addRow(['รอตรวจ', count('review')]);
  paintResult(okRow.getCell(1), 'ok');
  paintResult(mismatchRow.getCell(1), 'mismatch');
  paintResult(reviewRow.getCell(1), 'review');

  summary.addRow([]);
  const byServiceHeader = summary.addRow(['บริการ', 'จำนวน', `ยอดรวม (${currency})`]);
  byServiceHeader.font = { bold: true };
  const byService = new Map();
  for (const order of orders) {
    const name = order.productName || order.productId || 'ไม่ระบุ';
    const current = byService.get(name) || { count: 0, sum: 0 };
    current.count += 1;
    current.sum += Number(order.amount) || 0;
    byService.set(name, current);
  }
  for (const [name, value] of byService) {
    const row = summary.addRow([name, value.count, value.sum]);
    row.getCell(3).numFmt = amountFormat;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
