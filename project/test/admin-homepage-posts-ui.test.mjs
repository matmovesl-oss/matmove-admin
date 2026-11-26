import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const css=await read('../src/index.css');
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


test('homepage price validation accepts whole numbers and one or two decimal places',async()=>{
 const page=await read('../src/pages/HomepagePostsPage.tsx');
 assert.match(page,/\^\\d\+\(\?:\\\.\\d\{1,2\}\)\?\$/);
 assert.match(page,/Number\(priceText\)>1000000/);
});

test('published homepage posts remain editable and saves update the existing post version',async()=>{
 const page=await read('../src/pages/HomepagePostsPage.tsx');
 assert.match(page,/post\.status==='archived'/);
 assert.match(page,/call\('save',draft\.id,draft\.version,data\)/);
 assert.match(page,/Post updated\. Your changes are live on the customer homepage/);
 assert.match(page,/setDraft\(\{id:post\.id,[\s\S]*?version:post\.version\}\)/);
});
test('admin shell uses MatMove active navigation and grouped workspaces without stale scroll restoration',async()=>{
  const layout=await read('../src/components/AdminLayout.tsx');
  assert.match(layout,/bg-\[#073b2f\]/);
  assert.match(layout,/bg-sky-500/);
  assert.match(layout,/mm-admin-nav-list min-h-0 flex-1/);
  assert.match(layout,/navSections\.map/);
  assert.match(layout,/aria-expanded=\{expanded\}/);
  assert.doesNotMatch(layout,/new ResizeObserver\(restore\)/);
  assert.match(layout,/MATMOVE OPERATIONS/);
  assert.match(layout,/access\.full_name/);
 });

test('Edit opens the post editor in the visible viewport and focuses the title field',async()=>{
 const page=await read('../src/pages/HomepagePostsPage.tsx');
 assert.match(page,/function beginEdit\(post:Post\)/);
 assert.match(page,/onClick=\{\(\)=>beginEdit\(post\)\}/);
 assert.match(page,/editorRef\.current\?\.scrollIntoView\(\{behavior:'smooth',block:'start'\}\)/);
 assert.match(page,/editorTitleRef\.current\?\.focus\(\{preventScroll:true\}\)/);
});
test('Delete permanently removes the post and cleans up its uploaded artwork',async()=>{
 const page=await read('../src/pages/HomepagePostsPage.tsx');
 assert.match(page,/call\(action,id,version,data\)/);
 assert.match(page,/mutate\('delete',post\.id,post\.version\)/);
 assert.match(page,/r\.deleted!==true/);
 assert.match(page,/supabase\.storage\.from\(BUCKET\)\.remove\(\[r\.image_path\]\)/);
 assert.match(page,/setPosts\(current=>current\.filter\(post=>post\.id!==id\)\)/);
 assert.match(page,/Permanently delete this post and its uploaded image/);
 assert.match(page,/row\.deleted_at&&row\.status!=='archived'/);
});
test('editing an already-published post saves its new content without unpublishing it',async()=>{
 const page=await read('../src/pages/HomepagePostsPage.tsx');
 assert.match(page,/const result=await call\('save',draft\.id,draft\.version,data\)/);
 assert.match(page,/if\(result\.status!=='published'\)/);
 assert.match(page,/Post updated\. Your changes are live on the customer homepage/);
});


test('Admin operations workspace uses the shared MatMove glass palette, panels and responsive motion rules',()=>{
 assert.match(css,/--mm-admin-glass:\s*rgba\(255,255,255/);
 assert.match(css,/--mm-admin-green:\s*#0e946b/);
 assert.match(css,/--mm-admin-blue:\s*#1769e0/);
 assert.match(css,/backdrop-filter:\s*blur\(17px\) saturate\(148%\)/);
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
});
test('Admin shell exposes stable glass styling hooks without changing its navigation access model',async()=>{
 const layout=await read('../src/components/AdminLayout.tsx');
 assert.match(layout,/mm-admin-shell/);
 assert.match(layout,/mm-admin-sidebar/);
 assert.match(layout,/mm-admin-header/);
 assert.match(layout,/mm-admin-main/);
 assert.match(layout,/canAccess\(access, item\.key\)/);
});
