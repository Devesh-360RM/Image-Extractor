const userId = '79ada4a6-af98-4122-b1ec-572ce1a1b476';
const siteId = '4d31ece0-b6bc-11ed-b735-f3e16cd1da91';

const testUrls = [
  `https://chikasboutique.square.site/app/store/api/v29/users/${userId}/sites/${siteId}/products`,
  `https://chikasboutique.square.site/app/store/api/v28/users/${userId}/sites/${siteId}/products`,
  `https://chikasboutique.square.site/app/store/api/v29/users/${userId}/sites/${siteId}/products?limit=100`,
  `https://chikasboutique.square.site/app/store/api/v29/users/${userId}/sites/${siteId}/categories`,
  `https://chikasboutique.square.site/app/store/api/v29/users/${userId}/sites/${siteId}/categories/3AIV2XXPBK5V7SNYLHHJ6NGD/products`
];

async function run() {
  for (const url of testUrls) {
    console.log('Testing URL:', url);
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
        console.log('  Length:', text.length);
        if (text.startsWith('{') || text.startsWith('[')) {
          const data = JSON.parse(text);
          console.log('  Keys:', Object.keys(data));
          if (data.data) {
            console.log('  Found data! Length:', Array.isArray(data.data) ? data.data.length : typeof data.data);
            if (Array.isArray(data.data) && data.data.length > 0) {
              console.log('  Sample:', JSON.stringify(data.data[0]).slice(0, 300));
            }
          }
        } else {
          console.log('  Not JSON:', text.slice(0, 150));
        }
      }
    } catch (err) {
      console.log('  Error:', err.message);
    }
  }
}

run();
