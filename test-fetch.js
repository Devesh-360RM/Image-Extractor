import fs from 'fs';

const url = 'https://chikasboutique.square.site/shop/dresses/3AIV2XXPBK5V7SNYLHHJ6NGD';

fetch(url, { 
  headers: { 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  }
})
  .then(res => res.text())
  .then(html => {
    fs.writeFileSync('site.html', html);
    console.log('Saved site.html. Searching for keywords...');
    
    const keywords = ['polka', 'dress', 'print', 'midi', 'mini', 'sleeve', 'stripe', 'cotton', 'knit', 'floral', 'tropical', 'chikas'];
    keywords.forEach(kw => {
      const regex = new RegExp(kw, 'gi');
      const matches = html.match(regex);
      console.log(`Keyword "${kw}": found ${matches ? matches.length : 0} times.`);
    });
    
    // Find any JSON block
    const allJsonLikes = html.match(/\{"[^"]+"\s*:/g);
    console.log('Number of JSON-like patterns:', allJsonLikes ? allJsonLikes.length : 0);
  });
