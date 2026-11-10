import { EmbedBuilder, SlashCommandBuilder, MessageFlags } from 'discord.js';
import { config } from '../../config.js';
import { dayKey, listOrdersInRange } from './store.js';
import { weekRange, monthRange } from './handler.js';
import { slipCheckStatus, transferDetails } from './embeds.js';
import { isStaff } from './priceCommand.js';

export const AUDIT_COMMAND_NAME = 'ตรวจยอด';
export const AUDIT_PERIODS = ['day', 'week', 'month'];

export function auditCommandJSON() {
  return new SlashCommandBuilder()
    .setName(AUDIT_COMMAND_NAME)
    .setDescription('ตรวจความถูกต้องของยอดและข้อมูลออเดอร์ (ทีมงานเท่านั้น)')
    .addStringOption((opt) =>
      opt
        .setName('ช่วง')
        .setDescription('ช่วงเวลาที่ต้องการตรวจ (ไม่ใส่ = รายวัน)')
        .setRequired(false)
        .addChoices(
          { name: 'รายวัน', value: 'day' },
          { name: 'รายสัปดาห์ (จันทร์–อาทิตย์)', value: 'week' },
          { name: 'รายเดือน', value: 'month' },
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName('วันที่')
        .setDescription('วันที่ภายในช่วงที่ต้องการ เช่น 2026-11-05 (ไม่ใส่ = วันนี้)')
        .setRequired(false),
    )
    .toJSON();
}

// ตรวจรูปแบบวันที่และคืน dayKey (YYYY-MM-DD) หรือ null
export function normalizeAuditDayKey(input = null) {
  const key = String(input || '').trim() || dayKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key) return null;
  return key;
}

// ตรวจข้อมูลออเดอร์ชุดหนึ่ง — เป็นฟังก์ชันบริสุทธิ์ (pure) ใช้เทสต์ได้โดยไม่ต้องต่อ Discord
export function analyzeOrders(orders = []) {
  const list = Array.isArray(orders) ? orders : [];
  let totalAmount = 0;
  let expectedSum = 0;
  let paidCount = 0;
  const results = { ok: 0, mismatch: 0, review: 0, pending: 0 };
  const missingDate = [];
  const missingExpected = [];
  const amountMismatch = [];
  const orderNoSeen = new Map();
  const transRefSeen = new Map();

  for (const order of list) {
    const no = order.orderNo == null ? '' : String(order.orderNo).padStart(4, '0');
    const amount = order.amount == null ? null : Number(order.amount);
    const expected = order.expected == null ? null : Number(order.expected);

    if (amount == null) {
      // นับ "ยังไม่แนบสลิป" จากผลตรวจด้านล่างแทน เพื่อไม่ให้นับซ้ำ
    } else {
      paidCount += 1;
      totalAmount += Number.isFinite(amount) ? amount : 0;
    }
    if (expected != null && Number.isFinite(expected)) expectedSum += expected;

    const created = order.createdAt ? new Date(order.createdAt) : null;
    if (!created || Number.isNaN(created.getTime())) {
      missingDate.push(no || '(ไม่มีเลขที่)');
    }
    if (expected == null) {
      missingExpected.push(no || '(ไม่มีเลขที่)');
    }
    if (amount != null && expected != null && Number.isFinite(amount) && Number.isFinite(expected) && amount !== expected) {
      amountMismatch.push(no || '(ไม่มีเลขที่)');
    }

    const check = slipCheckStatus(order);
    if (Object.prototype.hasOwnProperty.call(results, check.key)) results[check.key] += 1;

    if (order.orderNo != null) {
      const key = String(order.orderNo);
      orderNoSeen.set(key, (orderNoSeen.get(key) || 0) + 1);
    }
    const transfer = transferDetails(order);
    const ref = String(transfer.transRef || '').trim();
    if (ref) transRefSeen.set(ref, (transRefSeen.get(ref) || 0) + 1);
  }

  const duplicateOrderNos = [...orderNoSeen.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => String(key).padStart(4, '0'));
  const duplicateTransRefs = [...transRefSeen.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => `${key} (×${count})`);

  return {
    count: list.length,
    paidCount,
    totalAmount,
    expectedSum,
    results,
    missingDate,
    missingExpected,
    amountMismatch,
    duplicateOrderNos,
    duplicateTransRefs,
    hasProblems:
      missingDate.length > 0 ||
      missingExpected.length > 0 ||
      amountMismatch.length > 0 ||
      duplicateOrderNos.length > 0 ||
      duplicateTransRefs.length > 0,
  };
}

function joinList(items, limit = 8) {
  if (!items.length) return '— ไม่พบ —';
  const shown = items.slice(0, limit).join(', ');
  return items.length > limit ? `${shown} … (+${items.length - limit})` : shown;
}

export function buildAuditEmbed({ label, report }) {
  const embed = new EmbedBuilder()
    .setColor(report.hasProblems ? 0xf59e0b : 0x22c55e)
    .setTitle(`🔎 ตรวจยอด · ${label}`)
    .setFooter({ text: `${config.shopName || 'ร้านค้า'} • AUDIT` })
    .setTimestamp(new Date());

  embed.addFields(
    { name: 'จำนวนออเดอร์', value: `${report.count}`, inline: true },
    { name: 'มีสลิป', value: `${report.paidCount}`, inline: true },
    { name: 'ยังไม่แนบสลิป', value: `${report.results.pending}`, inline: true },
    { name: 'ยอดรวมจากสลิป', value: `${report.totalAmount.toLocaleString('en-US')} ${config.shop.currencySymbol}`, inline: true },
    {
      name: 'ยอดที่ควรได้',
      value: `${report.expectedSum.toLocaleString('en-US')} ${config.shop.currencySymbol}`,
      inline: true,
    },
    {
      name: 'ผลตรวจ',
      value: `ตรง ${report.results.ok} · ไม่ตรง ${report.results.mismatch} · รอตรวจ ${report.results.review}`,
      inline: false,
    },
    { name: 'ออเดอร์ไม่มียอดที่ควรได้', value: joinList(report.missingExpected), inline: false },
    { name: 'ยอดไม่ตรงกับที่ควรได้', value: joinList(report.amountMismatch), inline: false },
    { name: 'รายการไม่มีวันที่', value: joinList(report.missingDate), inline: false },
    { name: 'เลขออเดอร์ซ้ำ', value: joinList(report.duplicateOrderNos), inline: false },
    { name: 'เลขอ้างอิงซ้ำ', value: joinList(report.duplicateTransRefs), inline: false },
  );

  embed.addFields({
    name: 'สรุป',
    value: report.hasProblems
      ? '⚠️ พบรายการที่ควรตรวจทาน — ดูรายละเอียดด้านบน'
      : '✅ ข้อมูลครบถ้วน ไม่พบรายการผิดปกติ',
  });
  return embed;
}

export async function handleAuditCommand(interaction) {
  if (!interaction.isChatInputCommand?.() || interaction.commandName !== AUDIT_COMMAND_NAME) return false;

  if (!isStaff(interaction)) {
    await interaction
      .reply({ content: '❌ เฉพาะทีมงานเท่านั้นที่ใช้คำสั่งนี้ได้', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return true;
  }

  const period = String(interaction.options.getString('ช่วง', false) || 'day').trim();
  if (!AUDIT_PERIODS.includes(period)) {
    await interaction
      .reply({ content: '❌ ช่วงไม่ถูกต้อง เลือกได้แค่ รายวัน / รายสัปดาห์ / รายเดือน', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return true;
  }

  const key = normalizeAuditDayKey(interaction.options.getString('วันที่', false));
  if (!key) {
    await interaction
      .reply({ content: '❌ วันที่ไม่ถูกต้อง ใช้รูปแบบ YYYY-MM-DD เช่น 2026-11-05', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return true;
  }

  let startKey = key;
  let endKey = key;
  let label = key;
  if (period === 'week') {
    ({ startKey, endKey } = weekRange(key));
    label = `สัปดาห์ ${startKey} ~ ${endKey}`;
  } else if (period === 'month') {
    ({ startKey, endKey } = monthRange(key));
    label = `เดือน ${startKey.slice(0, 7)}`;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  const orders = listOrdersInRange(startKey, endKey);
  const report = analyzeOrders(orders);
  await interaction
    .editReply({ embeds: [buildAuditEmbed({ label, report })] })
    .catch(() => {});
  return true;
}
