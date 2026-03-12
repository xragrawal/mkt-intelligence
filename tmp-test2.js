const url = "https://zdnzgaoeniznnopikndg.supabase.co/functions/v1/enrich-contacts-test";
const key = "sb_publishable_6fN7GRkWPZS839pMo1YStA_uEnvGiC7";

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + key
  },
  body: JSON.stringify({ articleUrl: 'https://www.bbc.com/news/articles/cj999xwjj60o' })
}).then(async r => {
  console.log('Status:', r.status);
  console.log('Body:', await r.text());
}).catch(console.error);
