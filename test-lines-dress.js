import fs from 'fs';

const html = fs.readFileSync('site.html', 'utf-8');
const lines = html.split('\n');

lines.forEach((line, i) => {
  if (line.toLowerCase().includes('dress')) {
    console.log(`Line ${i}: ${line.trim().slice(0, 300)}`);
  }
});
