const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/^VITE_SUPABASE_URL=[\"']?(.*?)[\"']?$/m);
const keyMatch = env.match(/^VITE_SUPABASE_PUBLISHABLE_KEY=[\"']?(.*?)[\"']?$/m);

if (!urlMatch || !keyMatch) throw new Error('Could not find url/key');

fetch(urlMatch[1] + '/functions/v1/enrich-contacts-test', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + keyMatch[1]
  },
  body: JSON.stringify({ articleUrl: 'https://test.com/some-article' })
}).then(async r => {
  console.log('Status:', r.status);
  console.log('Body:', await r.text());
}).catch(console.error);
