const fs = require('fs');

// 1. 修复 api.js 质量参数
let api = fs.readFileSync('src/api.js', 'utf8');

// Images API: 确保固定 high
if (api.includes("quality: options.quality || 'high'")) {
  console.log('Images API quality already high');
} else {
  console.log('WARNING: Images API quality not found as expected');
}

// Responses API: 固定 high
api = api.replace(
  "if (options.quality) tool.quality = options.quality;",
  "tool.quality = 'high';"
);
console.log('Responses API quality fixed to high');

fs.writeFileSync('src/api.js', api);

// 验证语法
try { new Function(api); console.log('api.js: OK'); } catch(e) { console.log('api.js ERROR:', e.message); }

// 2. 改名
let html = fs.readFileSync('index.html', 'utf8');

// 标题
html = html.replace(/电商AI图片提示词生成器/g, '电商设计台');
console.log('Title replaced');

fs.writeFileSync('index.html', html);

// server.js 也改
let server = fs.readFileSync('server.js', 'utf8');
server = server.replace(/电商AI图片提示词生成器/g, '电商设计台');
fs.writeFileSync('server.js', server);
console.log('server.js title replaced');

console.log('DONE');
