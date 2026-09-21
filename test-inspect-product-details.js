const userId = '141690468';
const siteId = '676219110594064211';
const version = '627396e3-cf1b-4eb4-8b80-802709ffd228';
const categoryId = '3AIV2XXPBK5V7SNYLHHJ6NGD';

const url = `https://cdn5.editmysite.com/app/store/api/v28/editor/users/${userId}/sites/${siteId}/products?cache-version=${version}&categories%5B%5D=${categoryId}&per_page=100`;

async function run() {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json'
      }
    });
    if (res.ok) {
      const data = await res.json();
      console.log('Total products in category:', data.data.length);
      const product = data.data[0];
      console.log('PRODUCT KEYS:', Object.keys(product));
      
      // Look for any keys containing "image", "media", "url", "pic", "file", "thumb"
      const imageKeys = Object.keys(product).filter(k => 
        k.toLowerCase().includes('image') || 
        k.toLowerCase().includes('media') || 
        k.toLowerCase().includes('url') || 
        k.toLowerCase().includes('file') || 
        k.toLowerCase().includes('thumb')
      );
      console.log('Potentially relevant image/media/url keys:', imageKeys);
      
      imageKeys.forEach(k => {
        console.log(`Key "${k}":`, JSON.stringify(product[k], null, 2));
      });

      // Let's print the entire first product object to a file for complete analysis
      import('fs').then(fs => {
        fs.writeFileSync('sample_product.json', JSON.stringify(product, null, 2));
        console.log('Saved full sample product to sample_product.json');
      });

    }
  } catch (err) {
    console.log('Error:', err.message);
  }
}

run();
