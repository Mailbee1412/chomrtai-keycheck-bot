import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { config } from '../../config.js';
import { dayKey } from './store.js';
import { postPeriodSummary, weekRange, monthRange } from './handler.js';
import { isStaff } from './priceCommand.js';

export const SUMMARY_COMMAND_NAME = 'สรุปยอด';
export const SUMMARY_PERIODS = ['day', 'week', 'month'];

export function summaryCommandJSON() {
  return new SlashCommandBuilder()
    .setName(SUMMARY_COMMAND_NAME)
    .setDescription('ส่งสรุปออเดอร์ (วัน/สัปดาห์/เดือน) เข้า #แจ้งเตือนออเดอร์ (ทีมงานเท่านั้น)')
    .addStringOption((opt) =>
      opt
        .setName('ช่วง')
        .setDescription('ช่วงเวลาของสรุป (ไม่ใส่ = รายวัน)')
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
export function normalizeSummaryDayKey(input = null) {
  const key = String(input || '').trim() || dayKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key) return null;
  return key;
}

// ช่วงเวลาที่จะส่งจริง (ใช้ในข้อความตอบกลับ)
export function summaryRangeLabel(period, anchorKey) {
  if (period === 'week') {
    const { startKey, endKey } = weekRange(anchorKey);
    return `สัปดาห์ ${startKey} ~ ${endKey}`;
  }
  if (period === 'month') {
    return `เดือน ${monthRange(anchorKey).startKey.slice(0, 7)}`;
  }
  return anchorKey;
}

export async function handleSummaryCommand(interaction) {
  if (!interaction.isChatInputCommand?.() || interaction.commandName !== SUMMARY_COMMAND_NAME) return false;

  if (!isStaff(interaction)) {
    await interaction
      .reply({ content: '❌ เฉพาะทีมงานเท่านั้นที่ดูสรุปย้อนหลังได้', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return true;
  }

  const period = String(interaction.options.getString('ช่วง', false) || 'day').trim();
  if (!SUMMARY_PERIODS.includes(period)) {
    await interaction
      .reply({ content: '❌ ช่วงไม่ถูกต้อง เลือกได้แค่ รายวัน / รายสัปดาห์ / รายเดือน', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return true;
  }

  const key = normalizeSummaryDayKey(interaction.options.getString('วันที่', false));
  if (!key) {
    await interaction
      .reply({ content: '❌ วันที่ไม่ถูกต้อง ใช้รูปแบบ YYYY-MM-DD เช่น 2026-11-05', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  const ok = await postPeriodSummary(interaction.client, { period, anchor: key });
  const logId = config.shop.orderLogChannelId;
  const label = summaryRangeLabel(period, key);
  await interaction
    .editReply({
      content: ok
        ? `✅ ส่งสรุป${label} เข้า ${logId ? `<#${logId}>` : 'ช่องแจ้งเตือนออเดอร์'} แล้ว`
        : '❌ ส่งสรุปไม่สำเร็จ — ตรวจสอบ `SHOP_ORDER_LOG_CHANNEL_ID` และสิทธิ์บอท',
    })
    .catch(() => {});
  return true;
}
