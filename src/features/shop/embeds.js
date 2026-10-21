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

function formatDateTime(iso) {
  try {
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: config.shop.timezone,
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
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
export function buildDailySummary({ dayKey, orders = [] }) {
  const lines = ['✦ สรุปยอดร้านค้า · DAILY ✦', DIVIDER, '', `✦ วันที่ : ${dayKey}`];

  const paid = orders.filter((o) => o.amount != null);
  const pending = orders.length - paid.length;
  const total = paid.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

  lines.push(`${BULLET}จำนวนออเดอร์ : ${orders.length}`);
  lines.push(`${BULLET}ยอดเงินรวม (จากสลิป) : ${formatMoney(total)}`);
  if (pending > 0) lines.push(`${BULLET}ยังไม่แนบสลิป : ${pending} ออเดอร์`);

  lines.push('', '✦ แยกตามบริการ');
  if (orders.length) {
    const byService = new Map();
    for (const o of orders) {
      const key = o.productName || o.productId || 'ไม่ระบุ';
      const cur = byService.get(key) || { count: 0, sum: 0 };
      cur.count += 1;
      cur.sum += Number(o.amount) || 0;
      byService.set(key, cur);
    }
    for (const [name, v] of byService) {
      lines.push(`${BULLET}${name} × ${v.count} = ${formatMoney(v.sum)}`);
    }
  } else {
    lines.push(`${BULLET}— ไม่มีออเดอร์ —`);
  }

  lines.push('', '✦ รายชื่อผู้ซื้อ');
  if (orders.length) {
    for (const o of orders) {
      const amt = o.amount == null ? 'ยังไม่แนบสลิป' : formatMoney(o.amount);
      lines.push(`${BULLET}<@${o.userId}> — ${o.productName || o.productId || 'ไม่ระบุ'} — ${amt}`);
    }
  } else {
    lines.push(`${BULLET}— ไม่มีออเดอร์ —`);
  }

  lines.push('', DIVIDER, 'ขอบคุณที่ใช้บริการ ♡');
  return lines.join('\n').slice(0, 2000);
}
