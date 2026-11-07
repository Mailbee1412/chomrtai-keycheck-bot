import ExcelJS from 'exceljs';
import { config } from '../../config.js';
import { formatDateTime, slipCheckStatus, transferDetails } from './embeds.js';

// สร้างไฟล์ Excel (.xlsx) ของสรุปออเดอร์รายวัน — เปิดใน Excel/มือถือได้ทันที
export async function buildDailySummaryXlsx({ dayKey, orders = [] }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Chomrthai Bot';
  workbook.created = new Date();

  const currency = config.shop.currencySymbol || '฿';
  const amountFormat = `#,##0 "${currency}"`;

  const sheet = workbook.addWorksheet('ออเดอร์');
  sheet.columns = [
    { header: 'เลขที่', key: 'no', width: 10 },
    { header: 'วันที่เปิด', key: 'createdAt', width: 20 },
    { header: 'ผู้ซื้อ', key: 'userName', width: 18 },
    { header: 'ผู้ซื้อ (ID)', key: 'userId', width: 20 },
    { header: 'บริการ', key: 'product', width: 44 },
    { header: 'จำนวน', key: 'quantity', width: 10 },
    { header: `ยอดที่ควรได้ (${currency})`, key: 'expected', width: 18 },
    { header: `ยอดจากสลิป (${currency})`, key: 'amount', width: 18 },
    { header: 'ผลตรวจ', key: 'result', width: 14 },
    { header: 'เวลาที่โอน', key: 'paidAt', width: 20 },
    { header: 'ผู้โอน', key: 'senderName', width: 20 },
    { header: 'ธนาคาร', key: 'bank', width: 24 },
    { header: 'เลขอ้างอิง', key: 'transRef', width: 24 },
    { header: 'หมายเหตุ', key: 'warnings', width: 40 },
    { header: 'สลิป', key: 'slip', width: 14 },
    { header: 'สถานะ', key: 'status', width: 12 },
  ];

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
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
      bank: transfer.bank,
      transRef: transfer.transRef,
      warnings: check.warnings.join(' | '),
      slip: transfer.slipUrl ? { text: 'เปิดสลิป', hyperlink: transfer.slipUrl } : '',
      status: order.closedAt ? 'ปิดแล้ว' : 'ยังเปิด',
    });
    row.getCell('expected').numFmt = amountFormat;
    row.getCell('amount').numFmt = amountFormat;
    if (transfer.slipUrl) row.getCell('slip').font = { color: { argb: 'FF0563C1' }, underline: true };
  }

  sheet.autoFilter = { from: 'A1', to: 'P1' };

  const paid = orders.filter((o) => o.amount != null);
  const total = paid.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
  const totalRow = sheet.addRow({ product: 'รวม', amount: total });
  totalRow.font = { bold: true };
  totalRow.getCell('amount').numFmt = amountFormat;

  // ชีตสรุปสำหรับทำบัญชี
  const summary = workbook.addWorksheet('สรุป');
  summary.columns = [{ width: 28 }, { width: 24 }];
  summary.addRow(['สรุปยอดร้าน', dayKey]).font = { bold: true };
  summary.addRow(['จำนวนออเดอร์', orders.length]);
  summary.addRow(['ยอดรวม (จากสลิป)', total]).getCell(2).numFmt = amountFormat;
  summary.addRow(['ยังไม่แนบสลิป', orders.length - paid.length]);

  const checks = orders.map((order) => slipCheckStatus(order));
  const count = (key) => checks.filter((check) => check.key === key).length;
  summary.addRow([]);
  const checkHeader = summary.addRow(['ผลตรวจสลิป', 'จำนวน']);
  checkHeader.font = { bold: true };
  summary.addRow(['ตรง', count('ok')]);
  summary.addRow(['ไม่ตรง', count('mismatch')]);
  summary.addRow(['รอตรวจ', count('review')]);

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
