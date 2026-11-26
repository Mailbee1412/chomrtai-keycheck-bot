import { EmbedBuilder, SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { config } from '../../config.js';
import {
  listProducts,
  getProduct,
  setProductPrice,
  ensureSeeded,
  getOrder,
  setOrderAgreedPrice,
  depositParts,
  paymentStage,
} from './store.js';
import { formatMoney } from './embeds.js';

export const PRICE_COMMAND_NAME = 'ตั้งราคา';

const SHOP_GOLD = 0xefb810;
const DIVIDER = '✧ ───────────── ✧';
const BULLET = '◦ ';

// สินค้าที่ตั้งราคาได้ (ไม่รวมกลุ่มย่อย/อินควายรี)
function selectableProducts() {
  ensureSeeded();
  return listProducts({ onlyEnabled: true }).filter((p) => p.type !== 'group' && p.type !== 'inquiry');
}

export function priceCommandJSON() {
  const builder = new SlashCommandBuilder()
    .setName(PRICE_COMMAND_NAME)
    .setDescription('ตั้งราคาบริการ หรือราคาที่ตกลงของห้องออเดอร์ (ทีมงานเท่านั้น)')
    .addNumberOption((opt) =>
      opt.setName('price').setDescription('ราคา (บาท) — ไม่ใส่ = ดูราคา').setRequired(false).setMinValue(0),
    )
    .addChannelOption((opt) =>
      opt
        .setName('room')
        .setDescription('ห้องออเดอร์ — ใส่เพื่อตั้งราคาที่ตกลงเฉพาะห้องนี้')
        .setRequired(false),
    );

  const products = selectableProducts().slice(0, 25);
  if (products.length) {
    builder.addStringOption((opt) => {
      opt.setName('product').setDescription('เลือกบริการ').setRequired(false);
      for (const p of products) {
        opt.addChoices({ name: p.name.slice(0, 100), value: p.id });
      }
      return opt;
    });
  }
  return builder.toJSON();
}

export function isStaff(interaction) {
  const member = interaction.member;
  if (!member) return false;
  // discord.js ไม่ขยายสิทธิ์ Administrator ให้ครบทุกบิต ต้องเช็คเอง
  const perms = interaction.memberPermissions ?? member.permissions;
  if (perms?.has?.(PermissionFlagsBits.Administrator)) return true;
  if (perms?.has?.(PermissionFlagsBits.ManageChannels)) return true;
  const staff = config.shop.staffRoleIds || [];
  return staff.length > 0 && member.roles?.cache?.some?.((r) => staff.includes(r.id));
}

function unitLabel(product) {
  const per = Number(product?.pricePer) > 0 ? Number(product.pricePer) : 1;
  return per > 1 ? `${per} ข้อความ` : 'หน่วย';
}

function replyWithEmbed(interaction, title, lines) {
  const embed = new EmbedBuilder()
    .setColor(SHOP_GOLD)
    .setTitle(title)
    .setDescription([DIVIDER, ...lines, DIVIDER].join('\n'))
    .setTimestamp();
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// แสดงรายละเอียดมัดจำ/คงเหลือ (เฉพาะคอมมิชชันที่ตั้ง depositPercent)
function depositLines(order) {
  const parts = depositParts(order);
  if (!parts) return [];
  const stage = paymentStage(order);
  const paid = Number(order.amount) || 0;
  const price = Number(order.agreedPrice);
  const lines = [
    `${BULLET}มัดจำ ${parts.percent}% : ${formatMoney(parts.deposit)}`,
    `${BULLET}คงเหลือ : ${formatMoney(parts.balance)}`,
  ];
  if (stage) lines.push(`${BULLET}งวดที่ต้องจ่ายตอนนี้ : ${stage.label} · ${formatMoney(stage.expected)}`);
  if (paid >= price - 0.01) lines.push(`${BULLET}ชำระแล้วทั้งสิ้น : ${formatMoney(paid)}`);
  return lines;
}

function priceStatus(order) {
  const parts = depositParts(order);
  if (!parts) {
    return order.priceMatch == null ? 'รอแนบสลิป' : order.priceMatch ? '✅ ยอดตรง' : '⚠️ ยอดไม่ตรง';
  }
  const paid = Number(order.amount) || 0;
  const price = Number(order.agreedPrice);
  if (paid >= price - 0.01) return '✅ ชำระครบแล้ว';
  if (order.priceMatch === false) return '⚠️ ยอดไม่ตรง';
  if (paid >= parts.deposit - 0.01) return `✅ มัดจำแล้ว · คงเหลือ ${formatMoney(price - paid)}`;
  if (order.priceMatch === true) return '✅ มัดจำตรง';
  return `รอแนบสลิปมัดจำ ${formatMoney(parts.deposit)}`;
}

// โพสต์ราคาที่ตกลงให้ลูกค้าเห็นในห้องออเดอร์ (Discord ส่ง modal ให้คนกดได้คนเดียว → ใช้ข้อความแทน)
function customerPriceEmbed(order) {
  return new EmbedBuilder()
    .setColor(SHOP_GOLD)
    .setTitle('🏷️ แจ้งราคาสำหรับออเดอร์นี้')
    .setDescription(
      [
        DIVIDER,
        `${BULLET}บริการ : ${order.productName || order.productId || '—'}`,
        `${BULLET}ราคาที่ตกลง : ${formatMoney(order.agreedPrice)}`,
        ...depositLines(order),
        `${BULLET}สถานะ : ${priceStatus(order)}`,
        DIVIDER,
        'กดปุ่ม "แนบสลิป" ด้านล่างได้เลยครับ',
      ].join('\n'),
    )
    .setTimestamp();
}

async function notifyCustomerPrice(interaction, order) {
  try {
    const channel = await interaction.client?.channels?.fetch?.(order.roomId);
    if (!channel?.send) return false;
    await channel.send({
      ...(order.userId ? { content: `<@${order.userId}>` } : {}),
      embeds: [customerPriceEmbed(order)],
    });
    return true;
  } catch (err) {
    console.warn(`[price] โพสต์แจ้งราคาในห้องไม่สำเร็จ: ${err.message}`);
    return false;
  }
}

export async function handlePriceCommand(interaction) {
  if (!interaction.isChatInputCommand?.() || interaction.commandName !== PRICE_COMMAND_NAME) return false;

  if (!isStaff(interaction)) {
    await interaction
      .reply({ content: '❌ เฉพาะทีมงานเท่านั้นที่ตั้งราคาได้', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return true;
  }

  const productId = interaction.options.getString('product', false);
  const priceArg = interaction.options.getNumber('price', false);
  const room = interaction.options.getChannel?.('room', false) || null;

  // โหมดตั้งราคาต่อห้อง — ใช้กับบริการที่ไม่มีเรตคงที่ (Theme / Commission Bot)
  if (room) {
    const order = getOrder(room.id);
    if (!order) {
      await interaction
        .reply({ content: '❌ ไม่พบออเดอร์ในห้องนี้ (ต้องเป็นห้องที่บอทสร้างให้)', flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return true;
    }
    if (priceArg == null) {
      await replyWithEmbed(interaction, `🏷️ ราคาที่ตกลง · ${order.productName || order.productId || 'ออเดอร์'}`, [
        `${BULLET}ห้อง : <#${room.id}>`,
        `${BULLET}ราคาที่ตกลง : ${order.agreedPrice == null ? '— ยังไม่ตั้ง' : formatMoney(order.agreedPrice)}`,
        ...depositLines(order),
        `${BULLET}ยอดจากสลิป : ${order.amount == null ? '— ยังไม่แนบ' : formatMoney(order.amount)}`,
        `${BULLET}ผลตรวจตอนนี้ : ${priceStatus(order)}`,
      ]).catch(() => {});
      return true;
    }
    const updated = setOrderAgreedPrice(room.id, priceArg);
    const notified = await notifyCustomerPrice(interaction, updated);
    await replyWithEmbed(interaction, '✅ ตั้งราคาที่ตกลงให้ห้องนี้แล้ว', [
      `${BULLET}ห้อง : <#${room.id}>`,
      `${BULLET}บริการ : ${updated.productName || updated.productId || '—'}`,
      `${BULLET}ราคาที่ตกลง : ${formatMoney(updated.agreedPrice)}`,
      ...depositLines(updated),
      `${BULLET}ผลตรวจตอนนี้ : ${priceStatus(updated)}`,
      `${BULLET}แจ้งลูกค้าในห้อง : ${notified ? '✅ แล้ว' : '⚠️ ไม่สำเร็จ (ตรวจสิทธิ์บอทในห้อง)'}`,
      `${BULLET}ถ้าแนบสลิปไปแล้ว บอทเทียบยอดให้ทันที (ไม่ต้องแนบใหม่)`,
    ]).catch(() => {});
    return true;
  }

  if (!productId) {
    const lines = selectableProducts().map(
      (p) =>
        `${BULLET}${p.name} : ${
          p.price == null ? '— ยังไม่ตั้งราคา' : `${formatMoney(p.price)} / ${unitLabel(p)}`
        }`,
    );
    await replyWithEmbed(interaction, '🏷️ ราคาบริการทั้งหมด', lines).catch(() => {});
    return true;
  }

  const product = getProduct(productId);
  if (!product) {
    await interaction
      .reply({ content: '❌ ไม่พบบริการนี้', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return true;
  }

  if (priceArg == null) {
    await replyWithEmbed(interaction, `🏷️ ราคาของ ${product.name}`, [
      `${BULLET}เรต : ${product.price == null ? '— ยังไม่ตั้งราคา' : `${formatMoney(product.price)} / ${unitLabel(product)}`}`,
    ]).catch(() => {});
    return true;
  }

  setProductPrice(productId, priceArg);
  await replyWithEmbed(interaction, `✅ ตั้งราคา ${product.name} แล้ว`, [
    `${BULLET}เรต : ${formatMoney(priceArg)} / ${unitLabel(product)}`,
    `${BULLET}วิธีใช้ : ผู้ซื้อใส่จำนวนข้อความตอนแนบสลิป บอทจะคูณราคาแล้วเทียบกับยอดสลิป`,
    `${BULLET}ถ้ายอดไม่ตรง บอทจะแจ้งทีมงานในห้องแจ้งเตือนออเดอร์`,
  ]).catch(() => {});
  return true;
}
