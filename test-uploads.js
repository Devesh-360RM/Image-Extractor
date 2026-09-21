import fs from 'fs';

const html = fs.readFileSync('site.html', 'utf-8');

const regex = /uploads\/[a-zA-Z0-9_\-\/.]+/g;
const matches = html.match(regex) || [];
console.log('Matches for uploads in site.html:', [...new Set(matches)]);
