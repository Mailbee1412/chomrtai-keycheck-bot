export const SUPPORT_OPTIONS = {
  channel: [
    { value: 'google-ai-studio', label: 'Google Ai Studio' },
    { value: 'google-vertex', label: 'Google Vertex' },
    { value: 'proxy-api', label: 'Proxy Api' },
  ],
  launch: [
    { value: 'termux', label: 'Termux' },
    { value: 'irole', label: 'Irole' },
    { value: 'server-rent-room01', label: 'Server เช่าส่วนตัว-room01' },
  ],
  device: [
    { value: 'ios', label: 'IOS' },
    { value: 'android', label: 'Android' },
    { value: 'pc-windows', label: 'PC — Windows' },
    { value: 'pc-mac', label: 'PC — macOS' },
  ],
};

export const SUPPORT_NOTE =
  'หากสมาชิกท่านใดเลือกซื้อ Proxy จากร้านค้าภายนอก แล้วพบปัญหาในการใช้งาน แนวทางแก้ไขคือให้ติดต่อกลับไปยังร้านค้าที่ซื้อโดยตรง เพื่อให้ทางร้านช่วยตรวจสอบและดำเนินการแก้ไขปัญหา เนื่องจาก Proxy ของแต่ละร้านอาจมีระบบและวิธีการจัดการที่แตกต่างกัน ทำให้ทางเราไม่สามารถตรวจสอบหรือแก้ไขปัญหาที่เกิดขึ้นจาก Proxy ของทุกร้านได้โดยตรง จึงขอแนะนำให้ผู้ซื้อประสานงานกับร้านค้าที่ตนเองเลือกซื้อโดยตรงค่ะ';

// ข้อความแจ้งเตือนท้ายโพสต์เมื่อปิดเคส
export const SUPPORT_CLOSED_NOTE =
  '✅ เคสของท่านได้รับการแก้ไขเป็นที่เรียบร้อยแล้ว หากท่านมีข้อสงสัยหรือพบปัญหาเพิ่มเติมประการใด กรุณาแจ้งเรื่องเข้ามาได้อีกครั้ง ขอบคุณค่ะ ♡';

export function getOptionLabel(type, value) {
  if (!value) return '';
  const list = SUPPORT_OPTIONS[type];
  if (!list) return value;
  const found = list.find((o) => o.value === value);
  return found ? found.label : value;
}

export function buildMentionString(roleIds = [], userId = null) {
  const parts = [];
  for (const r of roleIds || []) {
    if (r) parts.push(`<@&${r}>`);
  }
  if (userId) parts.push(`<@${userId}>`);
  return parts.join(' ');
}
