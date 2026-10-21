import { EmbedBuilder, SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { config } from '../../config.js';
import { listProducts, getProduct, setProductPrice, ensureSeeded } from './store.js';
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
    .setDescription('ตั้งหรือดูราคาต่อหน่วยของบริการ (ทีมงานเท่านั้น)')
    .addNumberOption((opt) =>
      opt.setName('price').setDescription('ราคาต่อหน่วย (บาท) — ไม่ใส่ = ดูราคา').setRequired(false).setMinValue(0),
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

function isStaff(interaction) {
  const member = interaction.member;
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.ManageChannels)) return true;
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
