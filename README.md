# ChomRtai Key Check Bot

บอทดิสคอร์ดสำหรับ **เช็คจำนวนข้อความคงเหลือในคีย์ LinkAPI** — ผู้ใช้วางคีย์ `sk-...` ในห้อง แล้วบอทจะอ่าน Model Limits ของคีย์นั้น แล้วคำนวณว่าแต่ละโมเดล (เฉพาะโมเดลที่ขึ้นต้น `[次]`) ยังเหลืออีกกี่ข้อความ

> บอทนี้เป็นเวอร์ชัน "เช็คคีย์เท่านั้น" (ปิดฟีเจอร์ร้านค้า/แชทแล้ว)

## 1. สิ่งที่ต้องมี

- Node.js 20 ขึ้นไป
- บอทดิสคอร์ด (สร้างที่ https://discord.com/developers/applications)

## 2. เตรียมบอท

1. ไปที่ Developer Portal → **New Application** → แท็บ **Bot**
2. กด **Reset Token** แล้วคัดลอกโทเคน
3. คัดลอก **Application ID** จากแท็บ General Information
4. เปิด **Message Content Intent** (จำเป็นมาก บอทต้องอ่านข้อความเพื่อจับคีย์)

## 3. ติดตั้ง

```bat
copy .env.example .env
```

แก้ `.env` ใส่:

```env
DISCORD_TOKEN=โทเคนของบอท
DISCORD_CLIENT_ID=Application_ID
```

> บอทนี้ไม่ใช้ slash command จึงไม่ต้อง deploy คำสั่ง — แค่รันบอท

## 4. เชิญบอทเข้าเซิร์ฟ

ที่แท็บ **OAuth2 → URL Generator** เลือก scope `bot` แล้วให้สิทธิ์:

- View Channels
- Send Messages
- Read Message History
- Manage Messages (เพื่อลบข้อความที่มีคีย์)
- Create Private Threads (สำหรับโหมด thread)

## 5. รันบอท

ดับเบิลคลิก `start.bat` หรือ

```bat
npm install
npm start
```

## 6. วิธีใช้งาน

วางคีย์ในห้อง (หรือพิมพ์ข้อความที่มีคีย์) เช่น

```
sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

บอทจะ:

1. ลบข้อความต้นทาง (โหมด thread/dm)
2. ตอบผลลัพธ์ โดยค่าเริ่มต้นจะเปิด **private thread** ส่วนตัวให้ผู้ใช้แต่ละคน

ผลลัพธ์จะแสดงต่อโมเดล เช่น

```
🎟️ จำนวนข้อความคงเหลือ
• `[次]gemini-3.1-pro-preview` — ใช้ไป 12 ข้อความ • เหลืออีก **850** ข้อความ
• `[次]gemini-3.8-flash` — เหลืออีก **320** ข้อความ
```

โมเดลที่เหลือไม่จำกัดจะแสดง `เหลือ ♾️`

## 7. การตั้งค่าที่สำคัญ (.env)

| ตัวแปร | ความหมาย |
| --- | --- |
| `LINKAPI_CHANNEL_IDS` | จำกัดให้เช็คได้เฉพาะบางห้อง (คั่นด้วย `,` ปล่อยว่าง = ทุกห้อง) |
| `LINKAPI_WELCOME_CHANNEL_ID` | ช่องสำหรับโพสต์ข้อความต้อนรับ/วิธีใช้ (โพสต์ครั้งเดียวตอนบอทออนไลน์) |
| `LINKAPI_PRIVATE_MODE` | `thread` (ค่าเริ่มต้น) / `dm` / `off` |
| `LINKAPI_MAX_KEYS` | จำนวนคีย์สูงสุดต่อข้อความ (ค่าเริ่มต้น 10) |
| `LINKAPI_STRICT_ACCOUNT` | `true` = เช็คได้เฉพาะคีย์ของบัญชีที่ล็อกอิน |
| `LINKAPI_MODEL_LIMITS` | รายชื่อโมเดลสำรอง กรณีคีย์ไม่ได้ตั้ง Model Limits |
| `LINKAPI_PRICE_OVERRIDES` | ราคาต่อครั้งที่บังคับเองสำหรับโมเดลที่ไม่มี `[次]` |

### โมเดลที่ถูกนับ

บอทจะนับ **เฉพาะโมเดลที่ขึ้นต้นด้วย `[次]`** เท่านั้น (โมเดลคิดตามจำนวนครั้ง) โมเดล `[SP]`, `[free]` และโมเดลคิดตามโทเคนจะถูกข้าม ถ้าต้องการนับโมเดลที่ไม่มี `[次]` ให้ตั้งราคาผ่าน `LINKAPI_PRICE_OVERRIDES`

### ไฟล์ Excel

ผลการเช็คทุกครั้งจะถูกบันทึกลง `data/linkapi-keys.xlsx` (กำหนดตำแหน่งเองได้ด้วย `LINKAPI_EXCEL_PATH`) ถ้าอยากให้ระบุชื่อบัญชี/อีเมลในไฟล์ ให้ตั้ง `LINKAPI_ACCESS_TOKEN` และ `LINKAPI_USER_ID`

## 8. ทดสอบ

```bat
npm test
```
