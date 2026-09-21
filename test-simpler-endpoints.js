const version = '627396e3-cf1b-4eb4-8b80-802709ffd228';

const urls = [
  `https://chikasboutique.square.site/app/store/api/v28/products?cache-version=${version}`,
  `https://chikasboutique.square.site/app/store/api/v29/products?cache-version=${version}`,
  `https://chikasboutique.square.site/app/store/api/v5/pub/products?cache-version=${version}`,
  `https://cdn5.editmysite.com/app/store/api/v28/products?cache-version=${version}`,
  `https://cdn5.editmysite.com/app/store/api/v29/products?cache-version=${version}`,
  `https://cdn5.editmysite.com/app/store/api/v5/pub/products?cache-version=${version}`
];

async function run() {
  for (const url of urls) {
    console.log('Fetching:', url);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/json'
        }
      });
      console.log('  Status:', res.status);
      if (res.ok) {
        const text = await res.text();
        console.log('  Length:', text.length, 'Content preview:', text.slice(0, 150));
      }
    } catch (err) {
      console.log('  Error:', err.message);
    }
  }
}

run();
