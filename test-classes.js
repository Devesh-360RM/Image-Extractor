import fs from 'fs';
import * as cheerio from 'cheerio';

const html = fs.readFileSync('site.html', 'utf-8');
const $ = cheerio.load(html);

const classes = new Set();
$('*').each((i, el) => {
  const cls = $(el).attr('class');
  if (cls) {
    cls.split(/\s+/).forEach(c => classes.add(c));
  }
});

console.log('Total unique classes:', classes.size);
console.log('Product/Category/Item related classes:');
const arr = [...classes].filter(c => c.toLowerCase().includes('product') || c.toLowerCase().includes('item') || c.toLowerCase().includes('grid') || c.toLowerCase().includes('category'));
console.log(arr);
