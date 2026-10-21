import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { COLORS } from './embeds.js';

const DIVIDER = '✧ ───────────── ✧';
const BULLET = '◦ ';

export function buildWelcomeEmbed({ thumbnail = null } = {}) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.gold)
    .setAuthor({ name: config.shopName })
    .setTitle('🐱 เหมียว~ ให้สมฤทัยเช็คคีย์ให้ไหม?')
    .setDescription(
      [
        DIVIDER,
        '',
        '✦ อยากรู้ว่าคีย์เหลือกี่ข้อความ?',
        `${BULLET}กดปุ่ม 🔑 ตรวจสอบคีย์ ด้านล่าง แล้ววางคีย์ที่ขึ้นต้นด้วย \`sk-...\` ได้เลย`,
        `${BULLET}ใส่หลายคีย์พร้อมกันได้ สมฤทัยเช็คให้ทีเดียว 🐾`,
        '',
        '✦ มั่นใจได้เลย',
        `${BULLET}ผลการเช็คเห็นเฉพาะคุณเท่านั้น 🔒`,
        `${BULLET}คีย์ของคุณจะไม่ถูกเปิดเผยให้ใครเห็น`,
        '',
        DIVIDER,
      ].join('\n'),
    )
    .addFields({ name: '🔑 วิธีเช็ค', value: 'กดปุ่มด้านล่าง → วางคีย์ `sk-...` → ดูผลทันที (เห็นคนเดียว)' })
    .setFooter({ text: `${config.shopName} • เช็คได้ตลอด 24 ชม. 🐱` })
    .setTimestamp();
  if (thumbnail) embed.setThumbnail(thumbnail);
  return embed;
}
