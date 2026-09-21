const userId = '141690468';
const siteId = '676219110594064211';
const version = '627396e3-cf1b-4eb4-8b80-802709ffd228';
const categoryId = '3AIV2XXPBK5V7SNYLHHJ6NGD';

const urls = [
  // Fastly with categories[]
  `https://cdn5.editmysite.com/app/store/api/v28/editor/users/${userId}/sites/${siteId}/products?cache-version=${version}&categories%5B%5D=${categoryId}`,
  // Fastly with categories%5B0%5D
  `https://cdn5.editmysite.com/app/store/api/v28/editor/users/${userId}/sites/${siteId}/products?cache-version=${version}&categories%5B0%5D=${categoryId}`,
  // Fastly with per_page=100 (let's check total products on store)
  `https://cdn5.editmysite.com/app/store/api/v28/editor/users/${userId}/sites/${siteId}/products?cache-version=${version}&per_page=100`
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
        const data = JSON.parse(text);
        if (Array.isArray(data.data)) {
          console.log('  Products found:', data.data.length);
          if (data.data.length > 0) {
            console.log('  First product name:', data.data[0].name);
            console.log('  First product categoryIds:', data.data[0].categoryIds);
            console.log('  Sample of image details in first product:', data.data[0].images || data.data[0].image_url || data.data[0].images_data);
            // Let's print the entire first product JSON object to inspect images schema!
            console.log('  First product JSON:');
            console.log(JSON.stringify(data.data[0], null, 2).slice(0, 1000));
          }
        }
      } else {
        const text = await res.text();
        console.log('  Error body:', text);
      }
    } catch (err) {
      console.log('  Error:', err.message);
    }
    console.log('----------------------------');
  }
}

run();
