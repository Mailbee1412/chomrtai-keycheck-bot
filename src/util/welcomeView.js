import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { COLORS } from './embeds.js';

export function buildWelcomeEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setAuthor({ name: config.shopName })
    .setTitle('🐱 เหมียว~ สมฤทัยเองจ้า')
    .setDescription(
      [
        'อยากรู้ว่าคีย์เหลือกี่ข้อความ?',
        `แปะคีย์ \`sk-...\` ในห้องนี้ได้เลย สมฤทัยเช็คให้ 🐾`,
        'ผลจะส่งใน **private thread** ส่วนตัว เฉพาะคุณเท่านั้น 🔒',
      ].join('\n'),
    )
    .addFields({ name: '🔑 วิธีเช็ค', value: 'แปะคีย์ `sk-...` → รอผลใน thread ส่วนตัว' })
    .setFooter({ text: 'สมฤทัยลบข้อความที่มีคีย์ให้เอง ปลอดภัยหายห่วง 🐱' })
    .setTimestamp();
}
