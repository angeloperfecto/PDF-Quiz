const fs = require('fs');
const file = 'server.ts';
let code = fs.readFileSync(file, 'utf8');

const target = "description: 'The exact count of pre-existing questions found in the document. Set to 0 if generating new questions.'";
const newTarget = "description: 'The TRUE EXACT count of pre-existing questions physically present in the document. Do not lie. Count them all. Set to 0 if generating new questions.'";

code = code.replace(target, newTarget);
fs.writeFileSync(file, code);
console.log("Schema patched successfully");
