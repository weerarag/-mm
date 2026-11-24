# BP Monitor Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เกมเว็บจำลองเครื่องวัดความดันแบบพันแขน (โหมดพยาบาล manual + โหมดวิศวกร oscillometric) พร้อมด่านเคสผู้ป่วย

**Architecture:** ไฟล์ `games/bp-monitor/index.html` ไฟล์เดียว มี `<script data-module="...">` แยกโมดูล: `engine` (ฟิสิกส์/อัลกอริทึม เป็นฟังก์ชันล้วน ไม่แตะ DOM), `cases` (ข้อมูลเคส), `ui` (DOM/canvas/เสียง) เทสต์ด้วย Node ดึงโมดูล `engine`/`cases` ออกจาก HTML แล้วรันใน `vm`
**Tech Stack:** HTML/CSS/JS ล้วน, Canvas 2D, Web Audio API; เทสต์ `node:test` (Node ≥ 18); ตรวจ UI ด้วย Playwright ที่ติดตั้งไว้แล้ว

**Spec:** `docs/superpowers/specs/2026-11-24-bp-monitor-game-design.md`

## Global Constraints

- ไฟล์ HTML เดียว ไม่มี dependency/build/CDN; ใช้ได้ทั้งมือถือและเดสก์ท็อป
- UI ภาษาไทย ศัพท์เทคนิคคงอังกฤษ (systolic, diastolic, MAP, Korotkoff, cuff)
- เกณฑ์ถูกต้อง: ค่าที่ผู้เล่นอ่านต่างจากค่าจริงของเคสไม่เกิน ±5 mmHg
- อัตราส่วน oscillometric เริ่มต้น: SBP = 0.55, DBP = 0.75 ของแอมพลิจูดสูงสุด (ปรับได้)
- มีคำเตือนในเกมว่าเป็นสื่อการเรียนรู้ ไม่ใช่เครื่องมือวินิจฉัย
- เคสอย่างน้อย 5: ความดันสูง, ความดันต่ำ, auscultatory gap, AF (ไม่สม่ำเสมอ), แขนใหญ่/เล็ก
- ข้อผิดพลาดที่ต้องจำลอง: ปล่อยลมเร็วเกิน, cuff เล็กเกิน, แขนต่ำกว่าระดับหัวใจ

## Review Focus

- ผู้เล่นปั๊มลมไม่ถึง systolic แล้วเริ่มปล่อย → ไม่ได้ยินเสียงเลย ต้องแจ้ง "ปั๊มสูงกว่านี้" ไม่ใช่ให้ค่า 0
- ปล่อยลมจนถึง 0 โดยไม่เคยได้ยินเสียง / เสียงไม่หาย → ไม่ crash, ให้ลองใหม่
- AF: เสียง/oscillation ไม่เท่ากันทุกจังหวะ → โหมดวิศวกรต้องไม่ให้ค่า NaN และมีคำเตือนว่าไม่น่าเชื่อถือ
- ความดันต่ำมาก (sbp ≈ 80) → envelope ยังหา MAP ได้
- เบราว์เซอร์บล็อกเสียงจนกว่าจะแตะ → ปุ่มเปิดเสียง, เกมเล่นได้แม้ปิดเสียง (มีภาพกระพริบแทน)

---

### Task 1: Physiology core (apparent pressures + Korotkoff + oscillation)

**Files:**
- Create: `games/bp-monitor/index.html` (โครง + `<script data-module="engine">`)
- Create: `tests/helpers/load.js` (ดึงโมดูลตาม `data-module` จาก HTML, รันใน `vm`, คืน `exports`)
- Test: `tests/engine.test.js`

**Interfaces:**
- Produces (ใน `engine`, ส่งออกผ่าน `module.exports`/global `BPEngine`):
  - `type Case = {id, title, sbp, dbp, hr, irregular?:boolean, gap?:[hi,lo], armCirc:number}`
  - `type Errs = {cuffSize:'small'|'ok'|'large', armLevel:'below'|'heart'|'above', deflationRate:number}`
  - `apparentPressures(c: Case, e: Errs) -> {sbp:number, dbp:number}`
  - `korotkoff(c: Case, e: Errs, cuffP: number) -> {sound:boolean, phase:1|2|3|4|5|0}`
  - `oscAmplitude(c: Case, e: Errs, cuffP: number) -> number` (0..1, ระฆังคว่ำ จุดสูงสุดที่ MAP)
  - `mapOf(c: Case, e: Errs) -> number` = dbp + (sbp − dbp)/3 ของค่า apparent
- Consumes: —

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว** (`tests/engine.test.js`) พร้อม helper `load.js`:
  - `apparentPressures({sbp:120,dbp:80,armCirc:30}, {cuffSize:'ok',armLevel:'heart',deflationRate:2})` → `{sbp:120,dbp:80}`
  - cuffSize `'small'` → ทั้งสองค่า +10; `'large'` → −5; armLevel `'below'` → +8, `'above'` → −8
  - `korotkoff(c, ok, 130).sound === false`; `korotkoff(c, ok, 100).sound === true`; `korotkoff(c, ok, 70).sound === false`
  - เคส gap `[100,90]` (sbp 150, dbp 85): `korotkoff(c, ok, 95).sound === false` แต่ที่ 120 และ 88 เป็น true
  - `oscAmplitude` สูงสุดที่ `mapOf` (= 93.33 สำหรับ 120/80) และเป็น 0 เมื่อ cuffP ≥ sbp+30 หรือ ≤ dbp−30
- [ ] **Step 2: รัน** `node --test tests/` → คาดว่า FAIL (engine ยังไม่มี)
- [ ] **Step 3: Implement** ฟังก์ชันข้างต้นใน `<script data-module="engine">`; ค่าชดเชยตามเทสต์; phase: 1 ที่ระดับ sbp, 5 ที่ระดับ dbp (ระหว่างกลางไล่ 2–4); `oscAmplitude` ใช้ระฆังแบบ Gaussian รอบ MAP
- [ ] **Step 4: รัน** `node --test tests/` → PASS
- [ ] **Step 5: Commit** `feat: physiology core`

### Task 2: Deflation simulation + oscillometric estimator

**Files:**
- Modify: `games/bp-monitor/index.html` (เพิ่มใน `engine`)
- Test: `tests/engine.test.js`

**Interfaces:**
- Consumes: Task 1
- Produces:
  - `simulateBeats(c: Case, e: Errs, startP: number, rng?: ()=>number) -> Beat[]` โดย `Beat = {t:number, cuffP:number, amp:number, sound:boolean, phase:number}`; ปล่อยลมจาก `startP` ลงที่ `e.deflationRate` mmHg/s; ช่วงเวลาระหว่างจังหวะ = 60/hr (ถ้า `irregular` สุ่ม ±35% ด้วย `rng`, แอมพลิจูดคูณ 0.6–1.2)
  - `estimateOscillometric(beats: Beat[], ratios?: {sbp:number, dbp:number}) -> {sbp:number, dbp:number, map:number, reliable:boolean}`; หาจุดแอมพลิจูดสูงสุด = MAP; SBP = ค่า cuffP ที่ด้านสูงกว่า MAP ที่แอมพลิจูด = ratios.sbp × max (interpolate); DBP ด้านต่ำกว่า MAP ที่ ratios.dbp × max; `reliable=false` ถ้า irregular หรือจังหวะน้อยกว่า 8

- [ ] **Step 1: เทสต์:** เคส 120/80 hr 70 deflationRate 2 → `estimateOscillometric` ได้ sbp 120±8, dbp 80±8, map 93±4 ; ใช้ rng ที่กำหนดค่าคงที่
- [ ] **Step 2: เทสต์:** deflationRate 8 ทำให้ผู้ฟัง manual อ่าน sbp ต่ำกว่าจริง (sbp จากเสียงแรก < 120 อย่างน้อย 3); deflationRate 2 ผิดไม่เกิน 3
- [ ] **Step 3: เทสต์ Review Focus:** startP 100 สำหรับเคส sbp 150 → ไม่มีจังหวะ `sound` เลยและ `estimateOscillometric` ไม่คืน NaN (คืน `reliable:false`); เคส 80/50 หา map ได้; AF ได้ `reliable:false` และไม่มี NaN
- [ ] **Step 4: รันให้ FAIL → implement → รันให้ PASS**
- [ ] **Step 5: Commit** `feat: deflation simulation and oscillometric estimator`

### Task 3: Case library + scoring

**Files:**
- Modify: `games/bp-monitor/index.html` (`<script data-module="cases">`)
- Test: `tests/cases.test.js`

**Interfaces:**
- Consumes: `Case` จาก Task 1
- Produces: `CASES: Case[]` (≥ 5 รายการ ตามข้อกำหนด พร้อมฟิลด์ `story:string`, `teach:string` ข้อความอธิบายทางคลินิก/ที่มาของค่า), `scoreReading(c: Case, e: Errs, read:{sbp:number, dbp:number}) -> {ok:boolean, errSbp:number, errDbp:number, explanation:string}` — เปรียบเทียบกับค่าจริง `c.sbp/c.dbp` ที่ ±5; `explanation` ระบุสาเหตุถ้ามีข้อผิดพลาดใน `e` (cuff เล็ก ฯลฯ)

- [ ] **Step 1: เทสต์:** `CASES.length >= 5`; มีเคสที่ `gap` และเคสที่ `irregular`; ทุกเคส `sbp > dbp+15`; `scoreReading` ที่ผิด 5 → ok, 6 → not ok; เมื่อ `e.cuffSize==='small'` และอ่านสูง `explanation` มีคำว่า "cuff"
- [ ] **Step 2–4:** FAIL → implement → PASS
- [ ] **Step 5: Commit** `feat: cases and scoring`

### Task 4: UI shell + โหมดพยาบาล (manual)

**Files:**
- Modify: `games/bp-monitor/index.html` (`<script data-module="ui">`, CSS)

**Interfaces:**
- Consumes: `simulateBeats`, `korotkoff`, `CASES`
- Produces: หน้าจอ: เลือกเคส/โหมด, แขน+cuff+ปรอท/หน้าปัด, ปุ่มกด-ค้างเพื่อปั๊ม, ลูกบิดปล่อยลม (อัตราตามที่ผู้เล่นหมุน), หูฟังเสียงด้วย Web Audio (เริ่มหลังแตะ) + ไฟกระพริบตามจังหวะ, ปุ่ม "บันทึกค่า systolic/diastolic" ณ ความดันปัจจุบัน, คำเตือนเป็นข้อความถาวร, `prefers-reduced-motion` ลดแอนิเมชัน

- [ ] **Step 1:** ใช้ `engine` ผ่านตัวแปร global เดียวกับที่เทสต์ ห้ามคำนวณฟิสิกส์ใน `ui`
- [ ] **Step 2: ตรวจด้วย Playwright** (สคริปต์ใน scratchpad): เปิดไฟล์, เลือกเคสแรก, จำลองกดปั๊มจนเกิน sbp, ปล่อยลมช้า, ตรวจว่า DOM แสดงเสียง/ไฟกระพริบอย่างน้อยหนึ่งครั้ง และกดบันทึกแล้วขึ้นผลคะแนน; จับภาพหน้าจอทั้ง 390px และ 1280px
- [ ] **Step 3: Commit** `feat: manual auscultatory mode UI`

### Task 5: โหมดวิศวกร (automatic) + สามมุมมอง

**Files:**
- Modify: `games/bp-monitor/index.html`

**Interfaces:**
- Consumes: `simulateBeats`, `estimateOscillometric`, `oscAmplitude`
- Produces: ปุ่ม "วัดอัตโนมัติ" (ปั๊มถึง sbp+30 แล้วปล่อยช้าเอง), มุมมอง `ภายนอก | กลไก | สัญญาณ`; กลไก = บล็อกไดอะแกรม ปั๊ม→วาล์ว→cuff→เซนเซอร์→ADC→MCU ไฮไลต์ส่วนที่ทำงาน; สัญญาณ = กราฟ cuff pressure, oscillation, envelope พร้อมเส้น MAP/SBP/DBP; ช่องปรับอัตราส่วน SBP/DBP พร้อมข้อความว่าแต่ละผู้ผลิตต่างกัน; แสดงคำเตือนเมื่อ `reliable=false`

- [ ] **Step 1: Playwright:** เลือกโหมดวิศวกร รันวัดอัตโนมัติ, ตรวจว่าค่าที่แสดงอยู่ในช่วง ±8 ของเคส, สลับสามมุมมองแล้วแต่ละมุมมองมี canvas/องค์ประกอบเฉพาะ, เคส AF แสดงคำเตือน
- [ ] **Step 2: Commit** `feat: automatic oscillometric mode and views`

### Task 6: ด่านเคส ข้อผิดพลาด และฟีดแบ็ก

**Files:**
- Modify: `games/bp-monitor/index.html`

**Interfaces:**
- Consumes: `CASES`, `scoreReading`, `Errs`
- Produces: ลำดับด่าน (เล่นได้ทั้งสองโหมด), ตัวเลือกข้อผิดพลาดที่ผู้เล่นตั้งเองได้ (ขนาด cuff, ระดับแขน) ในโหมดฝึก, หน้าสรุปหลังแต่ละด่าน: ค่าจริง vs ที่อ่าน + `explanation` + `teach`, ความคืบหน้าบันทึกใน `localStorage` (ครอบ try/catch)

- [ ] **Step 1: Playwright:** เล่นครบ 5 ด่านด้วยค่าที่ถูกต้อง ตรวจหน้าสรุป; ตั้ง cuff เล็กแล้วอ่านค่าที่ได้ ตรวจว่าคำอธิบายพูดถึง cuff
- [ ] **Step 2: ตรวจ Review Focus ใน UI:** ปล่อยลมโดยไม่ปั๊มถึง sbp → ข้อความ "ปั๊มสูงกว่านี้"; ปิดเสียง → ยังเล่นได้
- [ ] **Step 3: รัน** `node --test tests/` ทั้งหมด PASS
- [ ] **Step 4: Commit + push** `git push -u origin claude/lucid-bell-hzuxaw` แล้วเปิด draft PR

---

## Self-review

- Spec coverage: โหมดพยาบาล (T4), โหมดวิศวกร+มุมมอง+อัตราส่วนปรับได้ (T5), เคส ≥5 + ข้อผิดพลาด + ฟีดแบ็ก (T3, T6), คำเตือน (T4), ±5 (T3), ไฟล์เดียวไม่มี dependency (Architecture)
- สัญญา type สอดคล้องระหว่างงาน: `Case`, `Errs`, `Beat` ตั้งชื่อเดียวกันทุกงาน
- Review Focus ทั้ง 5 ข้อมีเทสต์: ข้อ 1–4 ใน T2/T6, ข้อ 5 ใน T6
