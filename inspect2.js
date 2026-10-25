const fs = require('fs');
const path = 'c:/Users/user/Desktop/SUB2/node_modules/simple-icons';
// Try to read the typings/d.ts file if present
try {
  const dts = fs.readFileSync(path + '/index.d.ts', 'utf8');
  console.log('=== index.d.ts ===');
  console.log(dts.slice(0, 3000));
} catch (e) {
  console.log('No index.d.ts at root.');
}
try {
  const dts = fs.readFileSync(path + '/dist/index.d.ts', 'utf8');
  console.log('=== dist/index.d.ts ===');
  console.log(dts.slice(0, 3000));
} catch (e) {
  console.log('No dist/index.d.ts.');
}
try {
  const main = fs.readFileSync(path + '/index.js', 'utf8');
  console.log('=== index.js (first 1500 chars) ===');
  console.log(main.slice(0, 1500));
} catch (e) {
  console.log('No index.js.');
}
