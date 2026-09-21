const userId = '79ada4a6-af98-4122-b1ec-572ce1a1b476';
const siteId = '4d31ece0-b6bc-11ed-b735-f3e16cd1da91';
const version = '627396e3-cf1b-4eb4-8b80-802709ffd228';
const categoryId = '3AIV2XXPBK5V7SNYLHHJ6NGD';

const urls = [
  // Without category filter
  `https://cdn5.editmysite.com/app/store/api/v28/editor/users/${userId}/sites/${siteId}/products?cache-version=${version}`,
  // With category filter (se.categories=[categoryId])
  `https://cdn5.editmysite.com/app/store/api/v28/editor/users/${userId}/sites/${siteId}/products?cache-version=${version}&categories=${categoryId}`,
  // With category filter, limit 100
  `https://cdn5.editmysite.com/app/store/api/v28/editor/users/${userId}/sites/${siteId}/products?cache-version=${version}&categories=${categoryId}&per_page=100`,
  // On the main custom domain
  `https://chikasboutique.square.site/app/store/api/v28/editor/users/${userId}/sites/${siteId}/products?cache-version=${version}&categories=${categoryId}`,
];

async function run() {
  for (const url of urls) {
    console.log('Fetching:', url);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*'
        }
      });
      console.log('  Status:', res.status);
      if (res.ok) {
        const text = await res.text();
        console.log('  Length:', text.length);
        if (text.startsWith('{') || text.startsWith('[')) {
          const data = JSON.parse(text);
          console.log('  Keys:', Object.keys(data));
          if (Array.isArray(data.data)) {
            console.log('  Products found:', data.data.length);
            if (data.data.length > 0) {
              console.log('  First product keys:', Object.keys(data.data[0]));
              console.log('  First product name:', data.data[0].name || data.data[0].title);
              console.log('  First product images:', data.data[0].images);
            }
          }
        } else {
          console.log('  Response preview:', text.slice(0, 300));
        }
      }
    } catch (err) {
      console.log('  Error:', err.message);
    }
    console.log('----------------------------');
  }
}

run();
