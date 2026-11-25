// ดึงโมดูล engine/cases ออกจาก index.html แล้วรันใน vm เดียวกัน (ไม่ต้อง build)
const fs = require('fs'), vm = require('vm'), path = require('path');
module.exports = () => {
  const html = fs.readFileSync(path.join(__dirname, '../../games/bp-monitor/index.html'), 'utf8');
  const ctx = vm.createContext({ Math, console });
  for (const m of ['engine', 'cases']) {
    const hit = html.match(new RegExp(`<script data-module="${m}">([\\s\\S]*?)</script>`));
    if (!hit) throw new Error('missing module ' + m);
    vm.runInContext(hit[1], ctx);
  }
  return ctx;
};
