import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { SUPPORT_OPTIONS } from './constants.js';

const CUSTOM_ID_PREFIX = 'supportForm';
export const SUPPORT_OPEN_BTN = `${CUSTOM_ID_PREFIX}:open`;
export const SUPPORT_MODAL = `${CUSTOM_ID_PREFIX}:modal`;
export const SUPPORT_STEP2_BTN = `${CUSTOM_ID_PREFIX}:step2`;
export const SUPPORT_STEP2_MODAL = `${CUSTOM_ID_PREFIX}:step2Modal`;
export const SUPPORT_CLOSE_BTN = `${CUSTOM_ID_PREFIX}:close`;

export const FIELD_IDS = {
  title: 'titleInput',
  channel: 'channelSelect',
  launch: 'launchSelect',
  device: 'deviceSelect',
  model: 'modelInput',
  jailbreak: 'jailbreakInput',
  problem: 'problemInput',
  image: 'imageUpload',
};

export function buildOpenButton(label) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(SUPPORT_OPEN_BTN).setLabel(label).setStyle(ButtonStyle.Primary),
  );
}

// ปุ่มไปสเต็ป 2 (อยู่ในข้อความยืนยันแบบส่วนตัวของคนแจ้ง)
export function buildStep2Button() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(SUPPORT_STEP2_BTN)
      .setLabel('กรอกรายละเอียด + แนบรูป (2/2)')
      .setStyle(ButtonStyle.Primary),
  );
}

function selectComponent(customId, placeholder, options) {
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(options)
    .setMinValues(1)
    .setMaxValues(1)
    .setRequired(true);
}

function textInput(customId, { style, placeholder, required = true, minLength, maxLength } = {}) {
  const input = new TextInputBuilder().setCustomId(customId).setStyle(style).setRequired(required);
  if (placeholder) input.setPlaceholder(placeholder);
  if (minLength) input.setMinLength(minLength);
  if (maxLength) input.setMaxLength(maxLength);
  return input;
}

// สเต็ป 1: 5 ช่อง (หัวข้อปัญหา, ช่องทางการใช้งาน, วิธีเปิด, อุปกรณ์, โมเดล)
export function buildFormModal() {
  const modal = new ModalBuilder().setCustomId(SUPPORT_MODAL).setTitle('แจ้งปัญหาใช้งาน (1/2)');
  modal.addComponents(
    new LabelBuilder()
      .setLabel('หัวข้อปัญหา')
      .setDescription('สรุปปัญหาสั้น ๆ ใช้เป็นชื่อเรื่อง')
      .setTextInputComponent(
        textInput(FIELD_IDS.title, {
          style: TextInputStyle.Short,
          placeholder: 'เช่น เปิดโปรแกรมไม่ติด',
          maxLength: 100,
        }),
      ),
    new LabelBuilder()
      .setLabel('ช่องทางการใช้งาน')
      .setDescription('เลือกช่องทางที่ใช้เชื่อมต่อ')
      .setStringSelectMenuComponent(selectComponent(FIELD_IDS.channel, 'เลือกช่องทางการใช้งาน', SUPPORT_OPTIONS.channel)),
    new LabelBuilder()
      .setLabel('วิธีเปิด')
      .setDescription('เลือกวิธีที่ใช้เปิดโปรแกรม')
      .setStringSelectMenuComponent(selectComponent(FIELD_IDS.launch, 'เลือกวิธีเปิด', SUPPORT_OPTIONS.launch)),
    new LabelBuilder()
      .setLabel('อุปกรณ์ที่ใช้')
      .setDescription('คอมพิวเตอร์แยก Windows / macOS')
      .setStringSelectMenuComponent(selectComponent(FIELD_IDS.device, 'เลือกอุปกรณ์', SUPPORT_OPTIONS.device)),
    new LabelBuilder()
      .setLabel('โมเดลที่ใช้')
      .setTextInputComponent(
        textInput(FIELD_IDS.model, {
          style: TextInputStyle.Short,
          placeholder: 'เช่น Gemini 3.x / GPT-4o',
          maxLength: 100,
        }),
      ),
  );
  return modal;
}

// สเต็ป 2: Jailbreak + รายละเอียดปัญหา + แนบรูป
export function buildStep2Modal() {
  const modal = new ModalBuilder().setCustomId(SUPPORT_STEP2_MODAL).setTitle('รายละเอียด & แนบรูป (2/2)');
  modal.addComponents(
    new LabelBuilder()
      .setLabel('Jailbreak ที่ใช้')
      .setTextInputComponent(
        textInput(FIELD_IDS.jailbreak, {
          style: TextInputStyle.Short,
          placeholder: 'ถ้าไม่มีใส่ "ไม่มี"',
          maxLength: 100,
        }),
      ),
    new LabelBuilder()
      .setLabel('รายละเอียดปัญหา')
      .setDescription('อธิบายอาการให้ละเอียดที่สุด')
      .setTextInputComponent(
        textInput(FIELD_IDS.problem, {
          style: TextInputStyle.Paragraph,
          placeholder: 'บอกอาการ ปัญหาที่พบ ขั้นตอนที่ทำแล้วเกิดอะไร',
          minLength: 10,
        }),
      ),
    new LabelBuilder()
      .setLabel('แนบรูป (ถ้ามี)')
      .setDescription('เลือกได้หลายไฟล์ (ไม่บังคับ)')
      .setFileUploadComponent(
        new FileUploadBuilder().setCustomId(FIELD_IDS.image).setMinValues(0).setMaxValues(10).setRequired(false),
      ),
  );
  return modal;
}

export function buildStaffButtons(current = 'pending') {
  const closed = current === 'resolved' || current === 'closed';
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(SUPPORT_CLOSE_BTN)
      .setLabel('แก้ไขแล้ว / ปิดเคส')
      .setStyle(ButtonStyle.Success)
      .setDisabled(closed),
  );
}
