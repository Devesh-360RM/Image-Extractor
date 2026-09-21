const userId = '79ada4a6-af98-4122-b1ec-572ce1a1b476';
const siteId = '4d31ece0-b6bc-11ed-b735-f3e16cd1da91';
const version = '627396e3-cf1b-4eb4-8b80-802709ffd228';

const urls = [
  `https://cdn5.editmysite.com/app/store/api/v28/users/${userId}/sites/${siteId}/products?cache-version=${version}`,
  `https://cdn5.editmysite.com/app/store/api/v29/users/${userId}/sites/${siteId}/products?cache-version=${version}`,
  `https://cdn5.editmysite.com/app/store/api/v28/users/${userId}/sites/${siteId}/products?cache-version=${version}&limit=100`,
  `https://cdn5.editmysite.com/app/store/api/v28/users/${userId}/sites/${siteId}/categories?cache-version=${version}`,
  `https://cdn5.editmysite.com/app/store/api/v28/users/${userId}/sites/${siteId}/categories/3AIV2XXPBK5V7SNYLHHJ6NGD/products?cache-version=${version}`
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
        console.log('  Length:', text.length);
        if (text.startsWith('{') || text.startsWith('[')) {
          const data = JSON.parse(text);
          console.log('  Keys:', Object.keys(data));
          if (Array.isArray(data.data)) {
            console.log('  Items found:', data.data.length);
            if (data.data.length > 0) {
              console.log('  First Item sample:', JSON.stringify(data.data[0]).slice(0, 300));
            }
          }
        } else {
          console.log('  Response preview:', text.slice(0, 200));
        }
      }
    } catch (err) {
      console.log('  Error:', err.message);
    }
    console.log('----------------------------');
  }
}

run();
