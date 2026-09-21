import fs from 'fs';

const content = fs.readFileSync('all-scripts.txt', 'utf-8');
const lines = content.split('\n');

lines.forEach((line, i) => {
  if (line.includes('window.') && line.includes('=')) {
    console.log(`Line ${i}: ${line.trim().slice(0, 300)}`);
  }
});
