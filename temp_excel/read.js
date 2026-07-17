const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'functional requirement testcase.xlsx');
const workbook = xlsx.readFile(filePath);

const sheetNames = workbook.SheetNames;

for (const sheetName of sheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    console.log(`\n--- Sheet: ${sheetName} ---`);
    for (let i = 0; i < data.length; i++) {
        if (data[i].length > 0) {
            console.log(data[i].join(' | '));
        }
    }
}
