const siteId = '4d31ece0-b6bc-11ed-b735-f3e16cd1da91';
const version = '627396e3-cf1b-4eb4-8b80-802709ffd228';

const testUrls = [
  `https://chikasboutique.square.site/uploads/b/${siteId}/catalog.json`,
  `https://chikasboutique.square.site/uploads/b/${siteId}/products.json`,
  `https://chikasboutique.square.site/uploads/b/${siteId}/items.json`,
  `https://chikasboutique.square.site/uploads/b/${siteId}/${version}.json`,
  `https://chikasboutique.square.site/uploads/b/${siteId}/catalog.${version}.json`,
  `https://chikasboutique.square.site/uploads/b/${siteId}/products.${version}.json`
];

async function run() {
  for (const url of testUrls) {
    console.log('Testing upload URL:', url);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
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
