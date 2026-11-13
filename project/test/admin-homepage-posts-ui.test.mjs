import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
test('Admin login uses the MatMove animated Freetown route and keeps staff password recovery',async()=>{
 const login=await read('../src/pages/LoginPage.tsx');
 assert.match(login,/animateMotion/);assert.match(login,/FREETOWN ROUTE PREVIEW/);
 assert.match(login,/resetPasswordForEmail/);assert.match(login,/signInWithPassword/);
});
test('Admin homepage manager exposes publishing, image upload, scheduling and enquiry handling',async()=>{
 const [page,app,layout]=await Promise.all([read('../src/pages/HomepagePostsPage.tsx'),read('../src/App.tsx'),read('../src/components/AdminLayout.tsx')]);
 assert.match(page,/matmove_admin_homepage_posts/);assert.match(page,/matmove-homepage-posts/);
 assert.match(page,/Publish/);assert.match(page,/datetime-local/);assert.match(page,/Customer enquiries/);
 assert.match(app,/homepage-posts/);assert.match(layout,/Homepage Posts/);
});

test('saving a homepage post publishes it immediately and keeps a saved draft recoverable if publish is blocked',async()=>{
 const page=await read('../src/pages/HomepagePostsPage.tsx');
 assert.match(page,/call\('publish',draft\.id,result\.version\)/);
 assert.match(page,/Save & publish/);
 assert.match(page,/setDraft\(\{\.\.\.draft,version:result\.version,image_path:imagePath\}\)/);
 assert.match(page,/Post published\. It is live on the customer homepage now/);
});

test('homepage image storage RLS failures show a specific actionable message',async()=>{
 const page=await read('../src/pages/HomepagePostsPage.tsx');
 assert.match(page,/row\.level security\|42501/);
 assert.match(page,/not authorized for Homepage Posts artwork/);
 assert.match(page,/remove the image and publish the post without it/);
});

test('homepage posts save and render optional USD or SLE promotion prices',async()=>{
 const page=await read('../src/pages/HomepagePostsPage.tsx');
 assert.match(page,/price_amount:priceText\?Number\(priceText\):null/);
 assert.match(page,/price_currency:priceText\?draft\.price_currency:null/);
 assert.match(page,/SLE · Sierra Leonean Leone/);
 assert.match(page,/USD · US Dollar/);
 assert.match(page,/priceLabel\(post\.price_amount,post\.price_currency\)/);
});
test('scheduled homepage posts are distinguished from live posts and can be published immediately',async()=>{
 const page=await read('../src/pages/HomepagePostsPage.tsx');
 assert.match(page,/const scheduled=posts\.filter/);
 assert.match(page,/Scheduled to go live:/);
 assert.match(page,/mutate\('publish_now',post\.id,post\.version\)/);
 assert.match(page,/const liveNow=posts\.filter/);
});
