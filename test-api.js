import fs from 'fs';

const html = fs.readFileSync('site.html', 'utf-8');

// Find all URLs matching API structures
const regex = /https?:\/\/[^\s"'`>]+/g;
const urls = html.match(regex) || [];
const apiUrls = urls.filter(u => u.includes('api') || u.includes('ajax') || u.includes('store') || u.includes('weebly') || u.includes('square'));

console.log('Total URLs found:', urls.length);
console.log('API-like URLs found:', apiUrls.length);
apiUrls.slice(0, 30).forEach(u => console.log(' -', u));

// Look for AJAX scripts in the HTML
const scripts = html.match(/<script[^>]*src="([^"]+)"/gi) || [];
console.log('Script sources:');
scripts.forEach(s => console.log(' ', s));
