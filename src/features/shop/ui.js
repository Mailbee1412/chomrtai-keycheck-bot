import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  FileUploadBuilder,
} from 'discord.js';
import { formatMoney } from './embeds.js';

const PREFIX = 'shop';
export const SHOP_PRODUCT_SELECT = `${PREFIX}:product`;
export const SHOP_CLOSE_BTN = `${PREFIX}:close`;
export const SHOP_SLIP_BTN = `${PREFIX}:slip`;
export const SHOP_SLIP_MODAL = `${PREFIX}:slipModal`;

export const SLIP_FIELD_IDS = { amount: 'amount', slip: 'slip', quantity: 'quantity' };

// ตัวคูณแพ็ก (เช่น เรต/100 → 100, 200, 300, 400, 500)
export const PACKAGE_MULTIPLIERS = [1, 2, 3, 4, 5];

// รายการแพ็กของบริการ (ว่าง = บริการนี้ไม่มีเรตเป็นแพ็ก)
export function buildPackageOptions(product) {
  const per = Number(product?.pricePer) > 0 ? Number(product.pricePer) : 1;
  if (!product || product.price == null) return [];
  return PACKAGE_MULTIPLIERS.map((m) => ({
    qty: per * m,
    price: Number(product.price) * m,
    label: `${per * m} ข้อความ — ${formatMoney(Number(product.price) * m)}`,
  }));
}

// ปุ่มในห้องออเดอร์: แนบสลิป (ถ้ามี) + ปิดห้อง
export function buildRoomButtons({ withSlip = true } = {}) {
  const row = new ActionRowBuilder();
  if (withSlip) {
    row.addComponents(
      new ButtonBuilder().setCustomId(SHOP_SLIP_BTN).setLabel('แนบสลิป').setStyle(ButtonStyle.Success),
    );
  }
  row.addComponents(
    new ButtonBuilder().setCustomId(SHOP_CLOSE_BTN).setLabel('ปิดห้อง').setStyle(ButtonStyle.Danger),
  );
  return row;
}

export function buildSlipModal(product = null) {
  const modal = new ModalBuilder().setCustomId(SHOP_SLIP_MODAL).setTitle('แนบสลิปการชำระเงิน');

  const packages = buildPackageOptions(product);
  if (packages.length) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(SLIP_FIELD_IDS.quantity)
      .setPlaceholder('เลือกจำนวนที่ซื้อ')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        packages.map((p) => new StringSelectMenuOptionBuilder().setLabel(p.label).setValue(String(p.qty))),
      );
    modal.addLabelComponents(
      new LabelBuilder().setLabel('จำนวนที่ซื้อ').setStringSelectMenuComponent(select),
    );
  } else {
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel('จำนวนที่ซื้อ')
        .setDescription('ใส่จำนวนที่ซื้อ (เว้นว่าง = 1)')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(SLIP_FIELD_IDS.quantity)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('1')
            .setRequired(false),
        ),
    );
  }

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('รูปสลิป')
      .setFileUploadComponent(
        new FileUploadBuilder().setCustomId(SLIP_FIELD_IDS.slip).setRequired(true).setMaxValues(3),
      ),
  );

  return modal;
}

export function buildProductSelect(products, placeholder = 'เลือกบริการที่ต้องการ') {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(SHOP_PRODUCT_SELECT)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(1);
  for (const p of products.slice(0, 25)) {
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(String(p.name).slice(0, 100))
      .setValue(p.id);
    menu.addOptions(option);
  }
  return new ActionRowBuilder().addComponents(menu);
}
