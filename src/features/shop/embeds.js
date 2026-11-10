import { EmbedBuilder } from 'discord.js';
import { config } from '../../config.js';

const DIVIDER = '✧ ───────────── ✧';
const BULLET = '◦ ';

// การ์ดหน้าร้าน (embed) — รายการบริการ + โลโก้เซิร์ฟเวอร์
export function buildCatalogEmbed(products, { thumbnail = null } = {}) {
  const list = products.length
    ? products.map((p) => p.name).join('\n')
    : '⚠️ ขณะนี้ยังไม่มีบริการเปิดขาย';
  const description = [
    '⋆｡°✩ ยินดีต้อนรับ ✩°｡⋆',
    'เลือกบริการที่ต้องการจากเมนูด้านล่าง ระบบจะสร้างห้องส่วนตัวให้อัตโนมัติ ♡',
    '',
    '**✦ บริการทั้งหมด**',
    list,
    '',
    '✦ โอนชำระแล้วแนบสลิปในห้องได้เลย',
  ].join('\n');

  const embed = new EmbedBuilder()
    .setTitle('🛒 ร้านค้า · SHOP')
    .setDescription(description)
    .setColor(0xefb810)
    .setFooter({ text: `${config.shopName || 'ร้านค้า'} • SHOP` });

  if (thumbnail) embed.setThumbnail(thumbnail);
  return embed;
}

// ข้อความในห้องออเดอร์ที่สร้างให้ผู้ซื้อ
export function buildServiceRoomContent(product, user, { withQr = false } = {}) {
  const isInquiry = product?.type === 'inquiry';
  const lines = [
    isInquiry ? '✦ สอบถามทีมงาน · SHOP ✦' : '✦ ใบสั่งซื้อ · SHOP ✦',
    isInquiry ? 'SHOP · INQUIRY' : 'SHOP · ORDER',
    '',
    DIVIDER,
    '',
    '✦ ข้อมูลผู้ซื้อ',
    `${BULLET}ผู้ซื้อ : <@${user?.id}>`,
    '',
    isInquiry ? '✦ หัวข้อ' : '✦ บริการที่เลือก',
    `${BULLET}${product.name}`,
    '',
    '✦ รายละเอียด',
    product.description || '—',
    '',
  ];
  if (isInquiry) {
    lines.push(
      '✦ สอบถามเพิ่มเติม',
      `${BULLET}พิมพ์คำถามหรือรายละเอียดที่ต้องการปรึกษาในห้องนี้ได้เลย`,
      `${BULLET}ทีมงานจะตอบกลับโดยเร็วที่สุด`,
    );
  } else {
    if (product.price != null) {
      const per = Number(product.pricePer) > 0 ? Number(product.pricePer) : 1;
      const unit = per > 1 ? 'ข้อความ' : 'หน่วย';
      lines.push('✦ ราคา');
      for (const m of [1, 2, 3, 4, 5]) {
        lines.push(`${BULLET}${per * m} ${unit} : ${formatMoney(Number(product.price) * m)}`);
      }
      lines.push('');
    }
    lines.push(
      '✦ วิธีชำระเงิน',
      ...(withQr ? [`${BULLET}สแกน QR ด้านล่างเพื่อโอนชำระเงิน`] : []),
      `${BULLET}กดปุ่ม "แนบสลิป" ด้านล่าง กรอกจำนวนที่ซื้อ + แนบรูปสลิป`,
      `${BULLET}บอทจะอ่านยอดจากสลิปและตรวจสอบให้อัตโนมัติ`,
      `${BULLET}ทีมงานจะตรวจสอบและดำเนินการให้เร็วที่สุด`,
    );
  }
  lines.push('', DIVIDER, '', 'ขอบคุณที่ใช้บริการ ♡');
  return lines.join('\n').slice(0, 2000);
}

export function formatMoney(amount) {
  return `${Number(amount || 0).toLocaleString('en-US')} ${config.shop.currencySymbol}`;
}

const THAI_MONTHS = {
  'ม.ค.': 1,
  'ก.พ.': 2,
  'มี.ค.': 3,
  'เม.ย.': 4,
  'พ.ค.': 5,
  'มิ.ย.': 6,
  'ก.ค.': 7,
  'ส.ค.': 8,
  'ก.ย.': 9,
  'ต.ค.': 10,
  'พ.ย.': 11,
  'ธ.ค.': 12,
};

// อ่านวันที่แบบไทย เช่น "15 ต.ค. 69 20:39 น." (พ.ศ. 2 หลัก/4 หลัก) — คืน null ถ้าไม่เข้ารูปแบบ
export function parseThaiDateTime(input) {
  const match = String(input || '').match(/^(\d{1,2})\s+(\S+?)\s+(\d{2,4})\s+(\d{1,2}):(\d{2})/u);
  if (!match) return null;
  const [, dd, monthText, yy, hh, mi] = match;
  const wanted = monthText.replace(/\./g, '');
  const month = Object.entries(THAI_MONTHS).find(([name]) => name.replace(/\./g, '') === wanted)?.[1];
  if (!month) return null;
  const day = Number(dd);
  const hour = Number(hh);
  const minute = Number(mi);
  if (day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  let year = Number(yy);
  if (year < 100) year += 2500;
  if (year > 2400) year -= 543;
  // ข้อความไทยถือเป็นเวลาไทย (UTC+7) เสมอ
  const epoch = Date.UTC(year, month - 1, day, hour, minute) - 7 * 3600000;
  const date = new Date(epoch);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(iso) {
  const parsed = iso instanceof Date ? iso : new Date(iso);
  const date = Number.isNaN(parsed.getTime()) ? parseThaiDateTime(iso) : parsed;
  if (!date) return String(iso);
  try {
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: config.shop.timezone,
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return String(iso);
  }
}

// แจ้งเตือนเมื่อปิดห้องออเดอร์ (ส่งเข้าช่อง log)
export function buildOrderClosedNotice(order, closerId) {
  const amount = order.amount == null ? 'ยังไม่แนบสลิป' : formatMoney(order.amount);
  const lines = [
    '✦ ปิดออเดอร์ · SHOP ✦',
    'SHOP · ORDER CLOSED',
    '',
    DIVIDER,
    '',
    '✦ รายละเอียดออเดอร์',
    ...(order.orderNo ? [`${BULLET}เลขที่ออเดอร์ : ${String(order.orderNo).padStart(4, '0')}`] : []),
    `${BULLET}ผู้ซื้อ : <@${order.userId}>`,
    `${BULLET}บริการ : ${order.productName || order.productId || 'ไม่ระบุ'}`,
    `${BULLET}ยอดจากสลิป : ${amount}`,
  ];
  const transfer = formatTransferLines(order.transfer);
  if (transfer.length) lines.push('', '✦ ข้อมูลการโอน', ...transfer);
  lines.push(
    `${BULLET}เวลาเปิด : ${formatDateTime(order.createdAt)}`,
    `${BULLET}เวลาปิด : ${formatDateTime(new Date().toISOString())}`,
    `${BULLET}ปิดโดย : <@${closerId}>`,
    '',
    DIVIDER,
    'ขอบคุณที่ใช้บริการ ♡',
  );
  return lines.join('\n');
}

// แปลงข้อมูลการโอน (จากผลอ่านสลิป) เป็นบรรทัดข้อความ
export function formatTransferLines(transfer) {
  if (!transfer) return [];
  const lines = [];
  const banks = [transfer.sendingBank, transfer.receivingBank].filter(Boolean);
  if (banks.length) lines.push(`${BULLET}ธนาคาร : ${banks.join(' → ')}`);
  if (transfer.senderName) lines.push(`${BULLET}ผู้โอน : ${transfer.senderName}`);
  if (transfer.receiverName) lines.push(`${BULLET}ผู้รับ : ${transfer.receiverName}`);
  if (transfer.paidAt) lines.push(`${BULLET}เวลาโอน : ${formatDateTime(transfer.paidAt)}`);
  if (transfer.transRef) lines.push(`${BULLET}เลขอ้างอิง : ${transfer.transRef}`);
  return lines;
}

// ข้อความยืนยันหลังบันทึกสลิป
export function buildSlipRecordedContent(amount, userId, transfer = null) {
  const lines = [
    '✦ บันทึกการชำระเงิน ✦',
    DIVIDER,
    `${BULLET}ผู้ชำระ : <@${userId}>`,
    `${BULLET}ยอดจากสลิป : ${amount == null ? 'รอทีมงานตรวจสอบ' : formatMoney(amount)}`,
  ];
  const t = formatTransferLines(transfer);
  if (t.length) lines.push('', '✦ ข้อมูลการโอน', ...t);
  lines.push(DIVIDER, 'ทีมงานจะตรวจสอบและดำเนินการต่อ ♡');
  return lines.join('\n');
}

// แจ้งทีมงานเมื่อยอดจากสลิปไม่ตรงกับราคาสินค้า (ราคาต่อหน่วย × จำนวน)
export function buildSlipAlertNotice({
  order,
  amount,
  expected,
  unitPrice,
  pricePer = 1,
  quantity,
  roomId,
  warnings = [],
  priceMatch = null,
  transRef = null,
  paidAt = null,
}) {
  const per = Number(pricePer) > 0 ? Number(pricePer) : 1;
  const unit = per > 1 ? `${per} ข้อความ` : 'หน่วย';
  const title = priceMatch === false ? '⚠️ ยอดสลิปไม่ตรงกับราคา · SHOP' : '⚠️ สลิปต้องตรวจสอบ · SHOP';
  const lines = [
    title,
    DIVIDER,
    '',
    '✦ รายละเอียด',
    `${BULLET}ห้อง : ${roomId ? `<#${roomId}>` : 'ไม่ระบุ'}`,
    `${BULLET}ผู้ซื้อ : <@${order.userId}>`,
    `${BULLET}บริการ : ${order.productName || order.productId || 'ไม่ระบุ'}`,
    `${BULLET}ราคา : ${formatMoney(unitPrice)} / ${unit}`,
    `${BULLET}จำนวน : ${quantity} ${unit}`,
    `${BULLET}ยอดที่ควรได้ : ${expected == null ? 'ไม่ระบุราคา' : formatMoney(expected)}`,
    `${BULLET}ยอดจากสลิป : ${amount == null ? 'อ่านยอดไม่ได้' : formatMoney(amount)}`,
  ];
  if (transRef) lines.push(`${BULLET}เลขอ้างอิง : ${transRef}`);
  if (paidAt) lines.push(`${BULLET}เวลาที่โอน : ${paidAt}`);
  if (warnings.length) lines.push('', '✦ ข้อสังเกต', ...warnings.map((w) => `${BULLET}${w}`));
  lines.push('', DIVIDER, 'กรุณาตรวจสอบความถูกต้อง ♡');
  return lines.join('\n');
}

// คงชื่อเดิมไว้ใช้ต่อ (ยอดไม่ตรงราคา)
export function buildPriceMismatchNotice(args) {
  return buildSlipAlertNotice({ ...args, priceMatch: false });
}

// สรุปยอดขายรายวัน (ส่งเข้าช่องแจ้งเตือนออเดอร์อัตโนมัติ) — ยอดมาจากสลิปที่ผู้ซื้อกรอก
function shortProductName(name) {
  const text = String(name || 'ไม่ระบุ');
  const withoutEmoji = text.replace(/^\S+\s*◦\s*/, '');
  const base = withoutEmoji.split('[')[0].trim();
  return base || text;
}

// สถานะการตรวจสลิปของออเดอร์ (ใช้ร่วมกันทั้ง embed, Excel และ CSV)
export function slipCheckStatus(order = {}) {
  const warnings = Array.isArray(order.slipWarnings) ? order.slipWarnings.filter(Boolean) : [];
  if (order.amount == null) {
    const hasSlip = Array.isArray(order.slipUrls) && order.slipUrls.filter(Boolean).length > 0;
    if (hasSlip) {
      // แนบสลิปแล้วแต่บอทอ่านยอดไม่ได้ → ต้องให้คนตรวจ ไม่ใช่ "ยังไม่แนบสลิป"
      return {
        key: 'review',
        label: 'รอตรวจ',
        mark: '🔎',
        warnings: [...warnings, 'แนบสลิปแล้วแต่อ่านยอดไม่ได้'],
      };
    }
    return { key: 'pending', label: 'ยังไม่แนบสลิป', mark: '🕓', warnings };
  }
  if (order.priceMatch === false) {
    return { key: 'mismatch', label: 'ไม่ตรง', mark: '⚠️', warnings };
  }
  if (warnings.length) {
    return { key: 'review', label: 'รอตรวจ', mark: '🔎', warnings };
  }
  if (order.priceMatch === true) {
    // "ตรง" ต้องมีข้อมูลจากการอ่านสลิปจริง (ธนาคาร/เวลาโอน/เลขอ้างอิง)
    const verified = Boolean(order.transfer && Object.keys(order.transfer).length);
    if (!verified) {
      return {
        key: 'review',
        label: 'รอตรวจ',
        mark: '🔎',
        warnings: [...warnings, 'ยังไม่ได้ยืนยันจากสลิป (ใช้ยอดที่ผู้ซื้อกรอก)'],
      };
    }
    return { key: 'ok', label: 'ตรง', mark: '✅', warnings };
  }
  return { key: 'review', label: 'รอตรวจ', mark: '🔎', warnings };
}

// ข้อมูลการโอนแบบย่อสำหรับ Excel/CSV
export function transferDetails(order = {}) {
  const transfer = order.transfer || {};
  const banks = [transfer.sendingBank, transfer.receivingBank].filter(Boolean);
  return {
    bank: banks.join(' → '),
    senderName: transfer.senderName || '',
    receiverName: transfer.receiverName || '',
    paidAt: transfer.paidAt || '',
    transRef: transfer.transRef || '',
    slipUrl: Array.isArray(order.slipUrls) && order.slipUrls.length ? order.slipUrls[0] : '',
  };
}

// ตัดรายการให้พอดี limit ของ embed field แล้วบอกจำนวนที่ตัดออก
function clipLines(lines, limit = 1024) {
  const out = [];
  let len = 0;
  let dropped = 0;
  for (const line of lines) {
    if (len + line.length + 1 > limit) {
      dropped += 1;
      continue;
    }
    out.push(line);
    len += line.length + 1;
  }
  if (!dropped) return out.join('\n');

  // ต้องเหลือที่ให้บรรทัดสรุปท้ายเสมอ ไม่งั้น field จะเกิน 1024 แล้วส่งไม่สำเร็จ
  let tail = `◦ …และอีก ${dropped} รายการ (ดูรายละเอียดในไฟล์ CSV)`;
  while (out.length && len + tail.length + 1 > limit) {
    const removed = out.pop();
    len -= removed.length + 1;
    dropped += 1;
    tail = `◦ …และอีก ${dropped} รายการ (ดูรายละเอียดในไฟล์ CSV)`;
  }
  out.push(tail);
  return out.join('\n');
}

export function buildDailySummaryEmbed({ dayKey, orders = [], title = null, footerTag = 'DAILY' }) {
  const paid = orders.filter((o) => o.amount != null);
  const pending = orders.length - paid.length;
  const total = paid.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

  const embed = new EmbedBuilder()
    .setColor(0xefb810)
    .setTitle(title || `📊 สรุปยอดร้าน · ${dayKey}`)
    .setFooter({ text: `${config.shopName || 'ร้านค้า'} • ${footerTag}` })
    .setTimestamp(new Date())
    .addFields(
      { name: 'ยอดรวม (จากสลิป)', value: formatMoney(total), inline: true },
      { name: 'จำนวนออเดอร์', value: `${orders.length}`, inline: true },
      { name: 'ยังไม่แนบสลิป', value: `${pending}`, inline: true },
      { name: 'ข้อมูล ณ', value: formatDateTime(new Date().toISOString()), inline: true },
    );

  if (!orders.length) {
    embed.addFields({ name: 'รายการออเดอร์', value: `${BULLET}— ไม่มีออเดอร์ —` });
    return embed;
  }
  const checks = orders.map((order) => slipCheckStatus(order));
  const count = (key) => checks.filter((check) => check.key === key).length;
  embed.addFields({
    name: 'ผลตรวจสลิป',
    value: `${BULLET}✅ ตรง : ${count('ok')} · ⚠️ ไม่ตรง : ${count('mismatch')} · 🔎 รอตรวจ : ${count('review')}`,
  });
  embed.addFields({
    name: 'รายการออเดอร์',
    value: `${BULLET}ครบทั้ง ${orders.length} รายการ อยู่ในการ์ดด้านล่าง (และไฟล์ Excel/CSV)`,
  });

  const byService = new Map();
  for (const o of orders) {
    const key = shortProductName(o.productName || o.productId);
    const cur = byService.get(key) || { count: 0, sum: 0 };
    cur.count += 1;
    cur.sum += Number(o.amount) || 0;
    byService.set(key, cur);
  }
  const serviceLines = [...byService.entries()].map(
    ([name, v]) => `${BULLET}${name} × ${v.count} = ${formatMoney(v.sum)}`,
  );
  embed.addFields({ name: 'แยกตามบริการ', value: clipLines(serviceLines) });

  return embed;
}

// หนึ่งบรรทัดต่อหนึ่งออเดอร์ (ใช้ทั้งการ์ดรายการและเทสต์)
export function buildOrderLine(order) {
  const no = order.orderNo ? `#${String(order.orderNo).padStart(4, '0')}` : '#—';
  const status = slipCheckStatus(order);
  const amount = order.amount == null ? 'ยังไม่แนบสลิป' : formatMoney(order.amount);
  let checkNote = '';
  if (status.key === 'mismatch' && order.expected != null) {
    checkNote = ` · ควรได้ ${formatMoney(order.expected)}`;
  } else if (status.key === 'review') {
    checkNote = ' · รอตรวจ';
  }
  return `${status.mark} ${no} · <@${order.userId}> · ${shortProductName(order.productName || order.productId)} · ${amount}${checkNote}`;
}

// การ์ดรายการออเดอร์ — แบ่งหลายใบเมื่อรายการยาว แต่ "ไม่ตัดทิ้ง" ทุกรายการอยู่ใน embed
export function buildOrderListEmbeds({ dayKey, orders = [], maxChars = 3600, title = null }) {
  if (!orders.length) return [];

  const chunks = [];
  let current = [];
  let length = 0;
  for (const order of orders) {
    const line = buildOrderLine(order);
    if (current.length && length + line.length + 1 > maxChars) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(line);
    length += line.length + 1;
  }
  if (current.length) chunks.push(current);

  const heading = title || `🧾 รายการออเดอร์ · ${dayKey}`;
  return chunks.map((lines, index) =>
    new EmbedBuilder()
      .setColor(0xefb810)
      .setTitle(`${heading}${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ''}`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `ทั้งหมด ${orders.length} รายการ` }),
  );
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// ไฟล์ CSV สำหรับทำบัญชี (เปิดใน Excel ได้)
export function buildDailySummaryCsv(orders = []) {
  const header = [
    'เลขที่',
    'วันที่เปิด',
    'ผู้ซื้อ',
    'ผู้ซื้อ(ID)',
    'บริการ',
    'จำนวน',
    'ยอดที่ควรได้',
    'ยอดจากสลิป',
    'ผลตรวจ',
    'เวลาที่โอน',
    'ผู้โอน',
    'ผู้รับ',
    'ธนาคาร',
    'เลขอ้างอิง',
    'หมายเหตุ',
    'สลิป',
    'สถานะ',
  ];
  const rows = orders.map((o) => {
    const transfer = transferDetails(o);
    return [
      o.orderNo ? String(o.orderNo).padStart(4, '0') : '',
      formatDateTime(o.createdAt),
      o.userName || '',
      o.userId || '',
      o.productName || o.productId || '',
      o.quantity == null ? '' : o.quantity,
      o.expected == null ? '' : Number(o.expected) || 0,
      o.amount == null ? '' : Number(o.amount) || 0,
      slipCheckStatus(o).label,
      transfer.paidAt ? formatDateTime(transfer.paidAt) : '',
      transfer.senderName,
      transfer.receiverName,
      transfer.bank,
      transfer.transRef,
      slipCheckStatus(o).warnings.join(' | '),
      transfer.slipUrl,
      o.closedAt ? 'ปิดแล้ว' : 'ยังเปิด',
    ];
  });
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
