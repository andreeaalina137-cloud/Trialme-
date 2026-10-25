const fs = require('fs');
const path = 'c:/Users/user/Desktop/SUB2/node_modules/simple-icons/package.json';
const p = JSON.parse(fs.readFileSync(path, 'utf8'));
console.log('version:', p.version);
console.log('typings:', p.typings);

const s = require('c:/Users/user/Desktop/SUB2/node_modules/simple-icons');
const x = s.siNetflix;
console.log('typeof siNetflix:', typeof x);
console.log('siNetflix keys:', Object.keys(x).join(', '));
console.log('---sample siNetflix keys---');
for (const k of Object.keys(x)) {
  console.log(k, '->', JSON.stringify(x[k]).slice(0, 120));
}
