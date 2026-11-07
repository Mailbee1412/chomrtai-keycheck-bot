import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { AttachmentBuilder, ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { config, DATA_DIR, ROOT_DIR } from '../../config.js';
import {
  ensureSeeded,
  listTopProducts,
  getChildren,
  getProduct,
  addOrder,
  listOrders,
  listOrdersInRange,
  markOrderClosed,
  getOrder,
  setOrderAmount,
  findUsedSlip,
  addUsedSlip,
  dayKey,
  nextOrderNumber,
  requestOrderClose,
} from './store.js';
import {
  buildCatalogEmbed,
  buildServiceRoomContent,
  buildOrderClosedNotice,
  buildSlipRecordedContent,
  buildSlipAlertNotice,
  buildDailySummaryEmbed,
  buildDailySummaryCsv,
  buildOrderListEmbeds,
  formatMoney,
} from './embeds.js';
import {
  buildProductSelect,
  buildRoomButtons,
  buildSlipModal,
  SHOP_PRODUCT_SELECT,
  SHOP_CLOSE_BTN,
  SHOP_REQUEST_CLOSE_BTN,
  SHOP_SLIP_BTN,
  SHOP_SLIP_MODAL,
  SLIP_FIELD_IDS,
} from './ui.js';
import { isSlipVerifyEnabled, verifySlip, fetchAttachment } from './slip.js';
import { buildDailySummaryXlsx } from './xlsx.js';

const STATE_FILE = path.join(DATA_DIR, 'shop-state.json');

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    /* เก็บสถานะไม่ได้ ไม่กระทบการโพสต์ */
  }
}

function buildStaffMention() {
  if (config.shop.mentionStaff === false) return '';
  return (config.shop.staffRoleIds || []).map((id) => `<@&${id}>`).join(' ');
}

// ชื่อย่อของสินค้า ใช้ในชื่อห้อง (อ่านง่ายกว่า id เต็ม)
const SHORT_PRODUCT_IDS = {
  'api-key-long-island': 'long-island',
  'api-key-margarita': 'margarita',
  'api-key-midnight-kiss': 'midnight-kiss',
  'api-key-angel-shot': 'angel-shot',
  'api-key-cosmo': 'cosmo',
  'api-key': 'api-key',
};

function shortProductId(product) {
  const id = String(product?.id || '');
  return SHORT_PRODUCT_IDS[id] || id;
}

function channelPart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ชื่อห้อง: order-<เลขลำดับ 4 หลัก>-<ชื่อย่อสินค้า>-<ผู้ใช้>
function buildChannelName(product, user, seq) {
  const orderNo = String(Math.max(0, Number(seq) || 0)).padStart(4, '0');
  const productPart = channelPart(shortProductId(product));
  const userPart = channelPart(user?.username) || String(user?.id || '');
  const base = `order-${orderNo}${productPart ? `-${productPart}` : ''}-${userPart}`;
  const safe = base
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100)
    .replace(/-$/, '');
  return safe || `order-${orderNo}-${user?.id}`;
}

const ROOM_ALLOW = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory];

export async function postShopPanel(client) {
  const channelId = config.shop.channelId;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.() || channel.isThread?.()) return;

  ensureSeeded();

  const products = listTopProducts({ onlyEnabled: true });
  const thumbnail =
    channel.guild?.iconURL?.({ size: 256 }) || client.user?.displayAvatarURL?.({ size: 256 }) || null;
  const embed = buildCatalogEmbed(products, { thumbnail });
  const components = products.length ? [buildProductSelect(products)] : [];
  const state = readState();

  if (state.messageId && state.channelId === channelId) {
    const existing = await channel.messages.fetch(state.messageId).catch(() => null);
    if (existing) {
      await existing.edit({ content: '', embeds: [embed], components }).catch(() => {});
      return;
    }
  }

  const sent = await channel.send({ embeds: [embed], components }).catch(() => null);
  if (sent) writeState({ channelId, messageId: sent.id });
}

// หาไฟล์รูป QR ร้าน (ถ้าตั้งค่า SHOP_QR_IMAGE_PATH ไว้และไฟล์มีจริง)
// path สัมพัทธ์จะลองหาจากโฟลเดอร์ที่รันบอทก่อน แล้วค่อยหาจากโฟลเดอร์โปรเจกต์ (กันกรณีรันจากที่อื่นบนเซิร์ฟ)
let qrMissingWarned = false;
function resolveQrImage() {
  const p = config.shop.qrImagePath;
  if (!p) return null;
  const candidates = path.isAbsolute(p)
    ? [p]
    : [path.join(process.cwd(), p), path.join(ROOT_DIR, p)];
  for (const abs of candidates) {
    try {
      if (fs.existsSync(abs)) return abs;
    } catch {
      /* ลองตัวถัดไป */
    }
  }
  if (!qrMissingWarned) {
    qrMissingWarned = true;
    console.warn(
      `[shop] ไม่พบไฟล์รูป QR: ${p} — ห้องออเดอร์จะไม่แนบรูป (ตรวจ SHOP_QR_IMAGE_PATH ใน .env)`,
    );
  }
  return null;
}

// สร้างห้องออเดอร์แบบส่วนตัว (เห็นเฉพาะผู้ซื้อ + role ทีมงาน)
async function createServiceRoom(interaction, product) {
  const guild = interaction.guild;
  if (!guild?.channels?.create) return null;

  const shopChannel = await interaction.client.channels.fetch(config.shop.channelId).catch(() => null);
  const parentId = config.shop.categoryId || shopChannel?.parentId || null;

  const overwrites = [
    { id: guild.roles?.everyone?.id || guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: ROOM_ALLOW },
  ];
  for (const roleId of config.shop.staffRoleIds || []) {
    overwrites.push({ id: roleId, allow: ROOM_ALLOW });
  }

  const orderNo = nextOrderNumber();
  const channel = await guild.channels
    .create({
      name: buildChannelName(product, interaction.user, orderNo),
      type: ChannelType.GuildText,
      parent: parentId || undefined,
      permissionOverwrites: overwrites,
      reason: 'Shop order',
    })
    .catch((err) => {
      console.warn(`[shop] create room failed: ${err.message}`);
      return null;
    });
  if (!channel) return null;

  const mention = buildStaffMention();
  const withSlip = product.type !== 'inquiry';
  const qrPath = withSlip ? resolveQrImage() : null;
  const body = buildServiceRoomContent(product, interaction.user, { withQr: Boolean(qrPath) });
  const payload = {
    content: `${mention ? mention + '\n' : ''}${body}`,
    components: [buildRoomButtons({ withSlip })],
  };
  if (qrPath) payload.files = [new AttachmentBuilder(qrPath, { name: 'shop-qr.png' })];
  await channel.send?.(payload).catch((err) => console.warn(`[shop] send room failed: ${err.message}`));

  addOrder({
    roomId: channel.id,
    orderNo,
    userId: interaction.user.id,
    userName: interaction.user.username || null,
    productId: product.id,
    productName: product.name,
    unitPrice: product.price == null ? null : Math.max(0, Number(product.price) || 0),
    pricePer: Number(product.pricePer) > 0 ? Number(product.pricePer) : 1,
    amount: null,
    slipUrls: [],
    dayKey: dayKey(),
    createdAt: new Date().toISOString(),
    closedAt: null,
  });

  return channel;
}

async function handleProductSelect(interaction) {
  const productId = interaction.values?.[0];
  const product = getProduct(productId);
  if (!product || product.enabled === false) {
    await interaction
      .reply({ content: '❌ ไม่พบบริการนี้แล้ว กรุณาเลือกใหม่', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return true;
  }

  // บริการที่มีตัวเลือกย่อย (เช่น Api key) → เปิดเมนูย่อยแบบส่วนตัว ไม่แตะแผง
  const children = getChildren(productId);
  if (children.length) {
    await interaction
      .reply({
        content: `${product.name}\nเลือกประเภทที่ต้องการ`,
        components: [buildProductSelect(children, 'เลือกประเภท')],
        flags: MessageFlags.Ephemeral,
      })
      .catch((err) => console.warn(`[shop] submenu failed: ${err.message}`));
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  const room = await createServiceRoom(interaction, product).catch((err) => {
    console.warn(`[shop] createServiceRoom failed: ${err.message}`);
    return null;
  });

  const content = room
    ? `✅ สร้างห้องสำหรับ "${product.name}" แล้ว\nไปที่ห้องได้เลย: <#${room.id}>\nโอนชำระแล้วแนบสลิปในห้องได้เลยครับ`
    : '❌ สร้างห้องไม่สำเร็จ กรุณาแจ้งทีมงาน';
  await interaction.editReply({ content }).catch(() => {});
  return true;
}

// ปิดห้องได้เฉพาะทีมงาน/แอดมิน (ไม่ให้ผู้ซื้อลบห้องเอง เพื่อกันการลบหลักฐาน/หนีการติดตาม)
function hasClosePermission(interaction) {
  const member = interaction.member;
  if (!member) return false;
  // member.permissions ของ discord.js ไม่ขยายสิทธิ์ Administrator ให้ครบทุกบิต ต้องเช็คเอง
  const perms = interaction.memberPermissions ?? member.permissions;
  if (perms?.has?.(PermissionFlagsBits.Administrator)) return true;
  if (perms?.has?.(PermissionFlagsBits.ManageChannels)) return true;
  const staff = config.shop.staffRoleIds || [];
  return staff.length > 0 && member.roles?.cache?.some?.((r) => staff.includes(r.id)) === true;
}

// ผู้ซื้อกด "แจ้งปิดห้อง" → แจ้งทีมงานเท่านั้น ไม่ปิดห้องจริง
async function handleRequestClose(interaction) {
  if (hasClosePermission(interaction)) {
    await interaction
      .reply({ content: 'ℹ️ คุณเป็นทีมงาน — กดปุ่ม "ปิดห้อง (ทีมงาน)" เพื่อปิดห้องได้เลย', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return true;
  }

  const roomId = interaction.channel?.id ?? interaction.channelId;
  const { order, recent } = requestOrderClose(roomId);

  if (recent) {
    await interaction
      .reply({ content: 'ℹ️ แจ้งทีมงานไปแล้ว กรุณารอสักครู่', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return true;
  }

  await interaction
    .reply({ content: '✅ แจ้งทีมงานแล้ว — ทีมงานจะเข้ามาปิดห้องให้ครับ', flags: MessageFlags.Ephemeral })
    .catch(() => {});

  const mention = buildStaffMention();
  const lines = ['🔔 ลูกค้าแจ้งว่าสามารถปิดห้องได้แล้ว', `◦ ผู้แจ้ง : <@${interaction.user.id}>`];
  if (order?.orderNo) lines.push(`◦ เลขที่ออเดอร์ : ${String(order.orderNo).padStart(4, '0')}`);
  if (order?.productName) lines.push(`◦ บริการ : ${order.productName}`);
  lines.push('◦ สถานะ : รอทีมงานกด "ปิดห้อง (ทีมงาน)"');
  const text = `${mention ? mention + '\n' : ''}${lines.join('\n')}`;

  const room = interaction.channel ?? (await interaction.client.channels.fetch(roomId).catch(() => null));
  if (room?.send) {
    await room
      .send({ content: text })
      .catch((err) => console.warn(`[shop] close request failed: ${err.message}`));
  }

  const logId = config.shop.orderLogChannelId;
  if (logId) {
    const log = await interaction.client.channels.fetch(logId).catch(() => null);
    if (log?.send) {
      await log
        .send({ content: text })
        .catch((err) => console.warn(`[shop] close request log failed: ${err.message}`));
    }
  }
  return true;
}

async function handleCloseRoom(interaction) {
  const channel = interaction.channel;
  if (!hasClosePermission(interaction)) {
    await interaction
      .reply({ content: '❌ เฉพาะทีมงานเท่านั้นที่ปิดห้องได้', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

  // interaction.channel อาจเป็น null ถ้าห้องไม่ได้อยู่ใน cache — ดึงจาก id แทน
  const room =
    channel ?? (await interaction.client.channels.fetch(interaction.channelId).catch(() => null));
  const roomId = room?.id ?? interaction.channelId;

  const order = getOrder(roomId);
  markOrderClosed(roomId);

  const logId = config.shop.orderLogChannelId;
  if (logId && order) {
    const log = await interaction.client.channels.fetch(logId).catch(() => null);
    if (log?.send) {
      await log
        .send({ content: buildOrderClosedNotice(order, interaction.user.id) })
        .catch((err) => console.warn(`[shop] close notice failed: ${err.message}`));
    }
  }

  // ลบห้องก่อน แล้วค่อยแจ้งผล (ถ้าลบไม่สำเร็จต้องบอกจริง ๆ ไม่ใช่ขึ้นว่าสำเร็จ)
  if (!room?.delete) {
    console.warn(`[shop] close: ไม่พบห้อง ${roomId} สำหรับลบ`);
    await interaction
      .editReply({ content: '⚠️ ปิดออเดอร์แล้ว แต่ลบห้องไม่สำเร็จ (ไม่พบห้อง) — กรุณาลบห้องเอง' })
      .catch(() => {});
    return true;
  }

  try {
    await room.delete('ปิดห้องออเดอร์');
  } catch (err) {
    console.warn(`[shop] delete room failed: ${err.message}`);
    await interaction
      .editReply({ content: `⚠️ ปิดออเดอร์แล้ว แต่ลบห้องไม่สำเร็จ (${err.message}) — กรุณาลบห้องเอง` })
      .catch(() => {});
    return true;
  }

  // ลบสำเร็จ: ห้องหายไปแล้ว ข้อความยืนยันจะหายตามห้อง (ตั้งใจ)
  await interaction.editReply({ content: '✅ ปิดห้องและลบห้องเรียบร้อย' }).catch(() => {});
  return true;
}

// เปิดฟอร์มแนบสลิป (จำนวนเงิน + รูป)
async function handleSlipButton(interaction) {
  const order = getOrder(interaction.channel?.id);
  const product = order ? getProduct(order.productId) : null;
  try {
    await interaction.showModal(buildSlipModal(product));
  } catch (err) {
    console.warn(`[shop] showModal(slip) failed: ${err.message}`);
    await interaction
      .reply({ content: '❌ เปิดฟอร์มแนบสลิปไม่สำเร็จ กรุณาลองใหม่', flags: MessageFlags.Ephemeral })
      .catch(() => {});
  }
  return true;
}

function readUploads(interaction, id) {
  try {
    const collection = interaction.fields.getUploadedFiles(id);
    if (!collection) return [];
    if (typeof collection.values === 'function') return [...collection.values()];
    if (Array.isArray(collection)) return collection;
  } catch {
    /* ไม่มีไฟล์ */
  }
  return [];
}

// รับสลิป: อ่านยอด/ข้อมูลโอน (ถ้าตั้งค่าไว้) + บันทึก + โพสต์สลิปในห้อง
async function handleSlipSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

  let typedAmount = 0;
  try {
    typedAmount = Number(String(interaction.fields.getTextInputValue(SLIP_FIELD_IDS.amount)).replace(/[^0-9.]/g, '')) || 0;
  } catch {
    typedAmount = 0;
  }
  const uploads = readUploads(interaction, SLIP_FIELD_IDS.slip);
  const files = uploads.map((a) => new AttachmentBuilder(a.url, { name: a.name || 'slip.png' }));

  // ดึงรูปสลิป (ใช้ทั้งคำนวณลายนิ้วมือ + อ่านยอด) แล้วอ่านสลิปอัตโนมัติ (ถ้าตั้งค่าคีย์ไว้)
  let verified = null;
  let verifyError = null;
  let slipHash = null;
  if (uploads.length) {
    const fetched = await fetchAttachment(uploads[0]).catch((err) => {
      verifyError = err?.message || 'ดึงไฟล์สลิปไม่ได้';
      return null;
    });
    if (fetched) {
      slipHash = createHash('sha256').update(fetched.buffer).digest('hex');
      if (isSlipVerifyEnabled()) {
        const result = await verifySlip(fetched.buffer, { mime: fetched.mime });
        if (result.ok) verified = result;
        else verifyError = result.error;
      }
    }
  } else if (isSlipVerifyEnabled()) {
    verifyError = 'ไม่พบรูปสลิป';
  }

  const amount = verified ? verified.amount : typedAmount > 0 ? typedAmount : null;
  const transfer = verified
    ? {
        sendingBank: verified.sendingBank,
        receivingBank: verified.receivingBank,
        senderName: verified.senderName,
        receiverName: verified.receiverName,
        paidAt: verified.paidAt,
        transRef: verified.transRef,
        duplicate: verified.duplicate,
      }
    : null;

  const channel = interaction.channel;
  const order = getOrder(channel?.id);
  const product = order ? getProduct(order.productId) : null;

  // อ่านจำนวน (เมนูเลือกแพ็ก หรือช่องกรอก) → ยอดที่ควรได้ = "ราคา ÷ ต่อกี่หน่วย × จำนวน"
  let quantity = null;
  try {
    const selected = interaction.fields.getStringSelectValues?.(SLIP_FIELD_IDS.quantity);
    if (selected && selected.length) quantity = Number(String(selected[0]).replace(/[^0-9]/g, ''));
  } catch {
    /* ไม่ใช่เมนูเลือก */
  }
  if (quantity == null) {
    try {
      quantity = Number(
        String(interaction.fields.getTextInputValue(SLIP_FIELD_IDS.quantity) || '1').replace(/[^0-9]/g, ''),
      );
    } catch {
      /* ไม่มีช่องจำนวน */
    }
  }
  if (!(quantity > 0)) quantity = 1;
  quantity = Math.min(quantity, 99999);
  const unitPrice = order?.unitPrice ?? product?.price ?? null;
  const pricePer =
    Number(order?.pricePer) > 0 ? Number(order.pricePer) : Number(product?.pricePer) > 0 ? Number(product.pricePer) : 1;
  const expected = unitPrice != null ? (unitPrice / pricePer) * quantity : null;
  const priceMatch = expected != null && amount != null ? Math.abs(amount - expected) < 0.01 : null;

  // ตรวจสลิปปลอม/ซ้ำ/เก่า → เก็บเป็นข้อสังเกตให้ทีมงาน (ไม่บอกผู้ซื้อ)
  const warnings = [];
  const transRef = verified?.transRef || null;
  if (verified?.duplicate) warnings.push('ผู้ให้บริการตรวจพบว่าสลิปนี้ซ้ำ');
  const used = slipHash || transRef ? findUsedSlip({ hash: slipHash, transRef }) : null;
  if (used && used.roomId !== channel?.id) {
    warnings.push(`สลิปนี้เคยถูกใช้แล้ว${used.roomId ? ` (ห้อง <#${used.roomId}>)` : ''}`);
  }
  const maxAgeHours = Number(config.shop.slipMaxAgeHours) > 0 ? Number(config.shop.slipMaxAgeHours) : 0;
  const paidAtDate = verified?.paidAt ? new Date(verified.paidAt) : null;
  if (maxAgeHours > 0 && paidAtDate && !Number.isNaN(paidAtDate.getTime())) {
    const ageHours = (Date.now() - paidAtDate.getTime()) / 3600000;
    if (ageHours > maxAgeHours) {
      warnings.push(`สลิปเก่า (โอนเมื่อ ${Math.floor(ageHours)} ชม. ที่แล้ว เกิน ${maxAgeHours} ชม.)`);
    }
  }
  if (uploads.length && slipHash && !used) {
    addUsedSlip({ hash: slipHash, transRef, roomId: channel?.id, userId: interaction.user.id, amount });
  }

  if (channel?.send) {
    await channel
      .send({ content: buildSlipRecordedContent(amount, interaction.user.id, transfer), files })
      .catch((err) => console.warn(`[shop] post slip failed: ${err.message}`));
  }
  setOrderAmount(channel?.id, amount, uploads.map((a) => a.url), transfer, {
    unitPrice,
    pricePer,
    quantity,
    expected,
    priceMatch,
    slipWarnings: warnings,
  });

  // ยอดไม่ตรงราคา / สลิปน่าสงสัย → แจ้งทีมงานเท่านั้น (ไม่บอกผู้ซื้อ)
  if (priceMatch === false || warnings.length) {
    const logId = config.shop.orderLogChannelId;
    const log = logId ? await interaction.client?.channels?.fetch(logId).catch(() => null) : null;
    if (log?.send) {
      const mention = buildStaffMention();
      await log
        .send({
          content: [
            mention || null,
            buildSlipAlertNotice({
              order: order || { userId: interaction.user.id },
              amount,
              expected,
              unitPrice,
              pricePer,
              quantity,
              warnings,
              priceMatch,
              transRef,
              paidAt: transfer?.paidAt || null,
              roomId: channel?.id,
            }),
          ]
            .filter(Boolean)
            .join('\n'),
        })
        .catch((err) => console.warn(`[shop] slip alert failed: ${err.message}`));
    }
    if (priceMatch === false) {
      console.warn(`[shop] ยอดไม่ตรงราคา: ห้อง ${channel?.id} ควรได้ ${expected} แต่ยอดจากสลิป = ${amount}`);
    }
    if (warnings.length) {
      console.warn(`[shop] สลิปต้องตรวจสอบ: ห้อง ${channel?.id} — ${warnings.join(' | ')}`);
    }
  }

  const matchNote = priceMatch === true ? ' • ยอดตรงกับราคา' : '';
  let summary;
  if (verified) {
    summary = `✅ อ่านสลิปสำเร็จ • ยอด ${formatMoney(amount)}${warnings.length ? ' • รอทีมงานตรวจสอบ' : matchNote}`;
  } else if (amount != null) {
    summary = verifyError
      ? `⚠️ อ่านสลิปไม่ได้ (${verifyError}) • ใช้ยอดที่กรอก ${formatMoney(amount)}${matchNote}`
      : `✅ บันทึกสลิปแล้ว (ยอด ${formatMoney(amount)})${matchNote}`;
  } else {
    summary = `⚠️ อ่านสลิปไม่ได้ (${verifyError || 'ไม่มีข้อมูล'}) รอทีมงานตรวจสอบ`;
  }
  await interaction.editReply({ content: summary }).catch(() => {});
  return true;
}

// นับตัวอักษรของ embed แบบคร่าว ๆ (Discord จำกัด 6,000 ตัว/ข้อความ)
function embedCharCount(embed) {
  const data = typeof embed?.toJSON === 'function' ? embed.toJSON() : embed || {};
  let total = (data.title?.length || 0) + (data.description?.length || 0);
  total += (data.footer?.text?.length || 0) + (data.author?.name?.length || 0);
  for (const field of data.fields || []) {
    total += (field.name?.length || 0) + (field.value?.length || 0);
  }
  return total;
}

// จัด embed เป็นกลุ่มต่อข้อความ (ไม่เกิน 10 ใบ และไม่เกิน 5,600 ตัวอักษร)
function packEmbeds(embeds, { maxEmbeds = 10, maxChars = 5600 } = {}) {
  const groups = [];
  let current = [];
  let length = 0;
  for (const embed of embeds) {
    const size = embedCharCount(embed);
    if (current.length && (current.length >= maxEmbeds || length + size > maxChars)) {
      groups.push(current);
      current = [];
      length = 0;
    }
    current.push(embed);
    length += size;
  }
  if (current.length) groups.push(current);
  return groups;
}

// ---------- ช่วงเวลาของสรุป (วัน / สัปดาห์ / เดือน) ----------

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

// ช่วงสัปดาห์ของวันที่กำหนด (จันทร์–อาทิตย์)
export function weekRange(anchorKey) {
  const date = new Date(`${anchorKey}T00:00:00Z`);
  const diffToMonday = (date.getUTCDay() + 6) % 7;
  const start = new Date(date.getTime() - diffToMonday * 86400000);
  const end = new Date(start.getTime() + 6 * 86400000);
  return { startKey: isoDate(start), endKey: isoDate(end) };
}

// ช่วงเดือนของวันที่กำหนด (วันที่ 1 – วันสุดท้ายของเดือน)
export function monthRange(anchorKey) {
  const [year, month] = anchorKey.split('-').map((v) => parseInt(v, 10));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return {
    startKey: `${year}-${mm}-01`,
    endKey: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

// ส่งสรุปยอดของช่วง [startKey, endKey] เข้าช่องแจ้งเตือนออเดอร์
// การ์ดสรุป + การ์ดรายการออเดอร์ครบทุกรายการ + ไฟล์ Excel + CSV
async function sendSummary(client, { startKey, endKey, label, footerTag, fileBase }) {
  const logId = config.shop.orderLogChannelId;
  if (!logId) return false;
  const log = await client.channels.fetch(logId).catch(() => null);
  if (!log?.send) return false;

  const orders = listOrdersInRange(startKey, endKey);
  const title = `📊 สรุปยอดร้าน · ${label}`;
  const summary = buildDailySummaryEmbed({ dayKey: startKey, orders, title, footerTag });
  const details = buildOrderListEmbeds({
    dayKey: startKey,
    orders,
    title: `🧾 รายการออเดอร์ · ${label}`,
  });
  const messages = packEmbeds([summary, ...details]);
  const csv = buildDailySummaryCsv(orders);

  let xlsx = null;
  try {
    xlsx = await buildDailySummaryXlsx({ dayKey: startKey, orders, title: label });
  } catch (err) {
    console.warn(`[shop] ${fileBase} xlsx failed: ${err.message}`);
  }

  let allSent = true;
  for (let i = 0; i < messages.length; i += 1) {
    const payload = { embeds: messages[i] };
    if (i === 0) {
      payload.files = [
        ...(xlsx ? [new AttachmentBuilder(xlsx, { name: `${fileBase}.xlsx` })] : []),
        new AttachmentBuilder(Buffer.from(`\uFEFF${csv}`, 'utf8'), { name: `${fileBase}.csv` }),
      ];
    }
    const sent = await log
      .send(payload)
      .then(() => true)
      .catch((err) => {
        console.warn(`[shop] ${fileBase} failed (part ${i + 1}/${messages.length}): ${err.message}`);
        return false;
      });
    if (!sent) allSent = false;
  }
  return allSent;
}

// ส่งสรุปยอดรายได้รายวัน (ค่าเริ่มต้น = วันนี้) — ใช้ตอนตั้งเวลา/เรียกเอง
export async function postDailySummary(client, keyArg = null) {
  const key = keyArg || dayKey();
  const ok = await sendSummary(client, {
    startKey: key,
    endKey: key,
    label: key,
    footerTag: 'DAILY',
    fileBase: `orders-${key}`,
  });
  console.log(`[shop] daily summary (${key}) => ${ok ? 'sent' : 'skipped'}`);
  return ok;
}

// ส่งสรุปยอดตามช่วง: day (วันเดียว) / week (จันทร์–อาทิตย์) / month (ทั้งเดือน)
// anchor = วันที่ใดก็ได้ในช่วง (YYYY-MM-DD) — ไม่ใส่ = วันนี้
export async function postPeriodSummary(client, { period = 'day', anchor = null } = {}) {
  const key = anchor || dayKey();
  if (period === 'week') {
    const { startKey, endKey } = weekRange(key);
    const label = `สัปดาห์ ${startKey} ~ ${endKey}`;
    const ok = await sendSummary(client, {
      startKey,
      endKey,
      label,
      footerTag: 'WEEKLY',
      fileBase: `orders-week-${startKey}_${endKey}`,
    });
    console.log(`[shop] weekly summary (${startKey}..${endKey}) => ${ok ? 'sent' : 'skipped'}`);
    return ok;
  }
  if (period === 'month') {
    const { startKey, endKey } = monthRange(key);
    const label = `เดือน ${startKey.slice(0, 7)}`;
    const ok = await sendSummary(client, {
      startKey,
      endKey,
      label,
      footerTag: 'MONTHLY',
      fileBase: `orders-${startKey.slice(0, 7)}`,
    });
    console.log(`[shop] monthly summary (${startKey.slice(0, 7)}) => ${ok ? 'sent' : 'skipped'}`);
    return ok;
  }
  return postDailySummary(client, key);
}

function parseHHMM(timeStr) {
  const [h, m] = String(timeStr || '23:59')
    .split(':')
    .map((v) => parseInt(v, 10) || 0);
  return { h, m };
}

// แปลงเวลาปัจจุบันเป็นส่วนประกอบเวลาใน timezone ปลายทาง + localNow (epoch แบบเวลาท้องถิ่น)
function zonedParts(tz, now) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(now).map((x) => [x.type, x.value]));
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    localNow: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second),
  };
}

// คำนวณ ms จนถึงเวลา HH:MM ถัดไปใน timezone ที่กำหนด (export ไว้เทสต์)
export function msUntilNextDailyTime(timeStr, tz, now = new Date()) {
  const { h, m } = parseHHMM(timeStr);
  const p = zonedParts(tz, now);
  let target = Date.UTC(p.year, p.month - 1, p.day, h, m, 0);
  if (target <= p.localNow) target += 86400000;
  return target - p.localNow;
}

// รับได้ทั้ง 0-6 (0 = อาทิตย์) และ mon/tue/wed/thu/fri/sat/sun
export function parseWeekday(value, fallback = 0) {
  const text = String(value ?? '').trim().toLowerCase();
  const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  if (text in map) return map[text];
  const num = parseInt(text, 10);
  return Number.isInteger(num) && num >= 0 && num <= 6 ? num : fallback;
}

// คำนวณ ms จนถึงวันในสัปดาห์ถัดไป (targetDow: 0 = อาทิตย์)
export function msUntilNextWeeklyTime(timeStr, tz, now = new Date(), targetDow = 0) {
  const { h, m } = parseHHMM(timeStr);
  const p = zonedParts(tz, now);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  const ahead = (targetDow - dow + 7) % 7;
  let target = Date.UTC(p.year, p.month - 1, p.day + ahead, h, m, 0);
  if (target <= p.localNow) target = Date.UTC(p.year, p.month - 1, p.day + ahead + 7, h, m, 0);
  return target - p.localNow;
}

// คำนวณ ms จนถึงวันสุดท้ายของเดือน (หรือเดือนถัดไปถ้าเลยเวลาแล้ว)
export function msUntilNextMonthlyTime(timeStr, tz, now = new Date()) {
  const { h, m } = parseHHMM(timeStr);
  const p = zonedParts(tz, now);
  const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
  let target = Date.UTC(p.year, p.month - 1, daysInMonth(p.year, p.month), h, m, 0);
  if (target <= p.localNow) {
    target = Date.UTC(p.year, p.month, daysInMonth(p.year, p.month + 1), h, m, 0);
  }
  return target - p.localNow;
}

// ตั้งเวลาให้ส่งสรุปยอดรายได้รายวันเข้าช่องแจ้งเตือนออเดอร์อัตโนมัติ
export function scheduleDailySummary(client) {
  if (!config.shop.orderLogChannelId) return null;
  const time = config.shop.dailySummaryTime;
  const delay = msUntilNextDailyTime(time, config.shop.timezone);
  // จำวันที่เป้าหมายไว้ตั้งแต่ตอนตั้งเวลา กัน Timer ตื่นช้าแล้วข้ามวัน
  const anchor = dayKey(new Date(Date.now() + delay));
  const hrs = (delay / 3600000).toFixed(2);
  console.log(`[shop] จะส่งสรุปยอดรายได้รายวันในอีก ${hrs} ชม. (${time} ${config.shop.timezone})`);
  const timer = setTimeout(async () => {
    await postDailySummary(client, anchor).catch(() => {});
    scheduleDailySummary(client);
  }, delay);
  return timer;
}

// anchor ของสรุปรายสัปดาห์ = วันอาทิตย์ที่ปิดสัปดาห์ล่าสุด ณ วันที่ส่ง
// ส่งวันอาทิตย์ = วันนั้นเลย / ส่งวันอื่น = ย้อนไปวันอาทิตย์ล่าสุด เพื่อให้ได้สัปดาห์ที่จบแล้วเต็มสัปดาห์
export function weekAnchorForSendDay(sendDayKey) {
  const date = new Date(`${sendDayKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return sendDayKey;
  const dow = date.getUTCDay();
  if (dow === 0) return sendDayKey;
  return isoDate(new Date(date.getTime() - dow * 86400000));
}

// ตั้งเวลาสรุปรายสัปดาห์ (ค่าเริ่มต้น: อาทิตย์ 23:59 — สรุปจันทร์–อาทิตย์)
export function scheduleWeeklySummary(client) {
  if (!config.shop.orderLogChannelId) return null;
  const time = config.shop.weeklySummaryTime;
  if (!time || time.toLowerCase() === 'off') return null;
  const targetDow = parseWeekday(config.shop.weeklySummaryDay, 0);
  const delay = msUntilNextWeeklyTime(time, config.shop.timezone, new Date(), targetDow);
  const anchor = weekAnchorForSendDay(dayKey(new Date(Date.now() + delay)));
  const hrs = (delay / 3600000).toFixed(2);
  console.log(
    `[shop] จะส่งสรุปยอดรายสัปดาห์ในอีก ${hrs} ชม. (วัน ${config.shop.weeklySummaryDay} ${time} ${config.shop.timezone})`,
  );
  const timer = setTimeout(async () => {
    await postPeriodSummary(client, { period: 'week', anchor }).catch(() => {});
    scheduleWeeklySummary(client);
  }, delay);
  return timer;
}

// ตั้งเวลาสรุปรายเดือน (ค่าเริ่มต้น: วันสุดท้ายของเดือน 23:59)
export function scheduleMonthlySummary(client) {
  if (!config.shop.orderLogChannelId) return null;
  const time = config.shop.monthlySummaryTime;
  if (!time || time.toLowerCase() === 'off') return null;
  const delay = msUntilNextMonthlyTime(time, config.shop.timezone);
  const anchor = dayKey(new Date(Date.now() + delay));
  const hrs = (delay / 3600000).toFixed(2);
  console.log(
    `[shop] จะส่งสรุปยอดรายเดือนในอีก ${hrs} ชม. (วันสุดท้ายของเดือน ${time} ${config.shop.timezone})`,
  );
  const timer = setTimeout(async () => {
    await postPeriodSummary(client, { period: 'month', anchor }).catch(() => {});
    scheduleMonthlySummary(client);
  }, delay);
  return timer;
}

export async function handleShopInteraction(interaction) {
  try {
    if (interaction.isButton() && interaction.customId === SHOP_REQUEST_CLOSE_BTN) {
      return await handleRequestClose(interaction);
    }
    if (interaction.isButton() && interaction.customId === SHOP_CLOSE_BTN) {
      return await handleCloseRoom(interaction);
    }
    if (interaction.isButton() && interaction.customId === SHOP_SLIP_BTN) {
      return await handleSlipButton(interaction);
    }
    if (interaction.isModalSubmit() && interaction.customId === SHOP_SLIP_MODAL) {
      return await handleSlipSubmit(interaction);
    }
    if (interaction.isStringSelectMenu() && interaction.customId === SHOP_PRODUCT_SELECT) {
      return await handleProductSelect(interaction);
    }
  } catch (err) {
    console.warn(`[shop] interaction error: ${err.message}`);
    if (process.env.SHOP_DEBUG === 'true') console.warn(err.stack);
  }
  return false;
}
