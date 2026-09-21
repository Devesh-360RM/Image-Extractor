import fs from 'fs';

const html = fs.readFileSync('site.html', 'utf-8');

// Find all src or data-src matching image patterns
const regex = /src=["']([^"']+)["']/g;
const srcMatches = [];
let match;
while ((match = regex.exec(html)) !== null) {
  srcMatches.push(match[1]);
}

const dataRegex = /data-src=["']([^"']+)["']/g;
while ((match = dataRegex.exec(html)) !== null) {
  srcMatches.push(match[1]);
}

const uniqueImages = [...new Set(srcMatches)].filter(s => s.includes('image') || s.includes('img') || s.includes('upload') || s.includes('cdn'));
console.log('Total image URLs found:', uniqueImages.length);
console.log('Sample images:');
uniqueImages.slice(0, 30).forEach(img => console.log(' -', img));
