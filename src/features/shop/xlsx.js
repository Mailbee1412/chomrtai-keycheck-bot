import ExcelJS from 'exceljs';
import { config } from '../../config.js';
import { formatDateTime } from './embeds.js';

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
    { header: `ยอดจากสลิป (${currency})`, key: 'amount', width: 18 },
    { header: 'สถานะ', key: 'status', width: 12 },
  ];

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFB810' } };

  for (const order of orders) {
    const row = sheet.addRow({
      no: order.orderNo ? String(order.orderNo).padStart(4, '0') : '',
      createdAt: formatDateTime(order.createdAt),
      userName: order.userName || '',
      userId: order.userId || '',
      product: order.productName || order.productId || '',
      amount: order.amount == null ? null : Number(order.amount) || 0,
      status: order.closedAt ? 'ปิดแล้ว' : 'ยังเปิด',
    });
    row.getCell('amount').numFmt = amountFormat;
  }

  sheet.autoFilter = { from: 'A1', to: 'G1' };

  const paid = orders.filter((o) => o.amount != null);
  const total = paid.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
  const totalRow = sheet.addRow({ product: 'รวม', amount: total });
  totalRow.font = { bold: true };
  totalRow.getCell('amount').numFmt = amountFormat;

  // ชีตสรุปสำหรับทำบัญชี
  const summary = workbook.addWorksheet('สรุป');
  summary.columns = [{ width: 26 }, { width: 22 }];
  summary.addRow(['สรุปยอดร้าน', dayKey]).font = { bold: true };
  summary.addRow(['จำนวนออเดอร์', orders.length]);
  summary.addRow(['ยอดรวม (จากสลิป)', total]).getCell(2).numFmt = amountFormat;
  summary.addRow(['ยังไม่แนบสลิป', orders.length - paid.length]);
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
