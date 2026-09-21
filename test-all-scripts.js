import fs from 'fs';
import * as cheerio from 'cheerio';

const url = 'https://chikasboutique.square.site/shop/dresses/3AIV2XXPBK5V7SNYLHHJ6NGD';

fetch(url, { 
  headers: { 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  }
})
  .then(res => res.text())
  .then(html => {
    const $ = cheerio.load(html);
    let out = '';
    $('script').each((i, el) => {
      const src = $(el).attr('src');
      const inner = $(el).html();
      out += `=== SCRIPT INDEX ${i} | SRC: ${src || 'inline'} ===\n`;
      if (inner) {
        out += inner + '\n';
      }
      out += `=========================================\n\n`;
    });
    fs.writeFileSync('all-scripts.txt', out);
    console.log('Successfully wrote all-scripts.txt! Total length:', out.length);
  });
