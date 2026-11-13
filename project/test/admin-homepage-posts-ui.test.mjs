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
