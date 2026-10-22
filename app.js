const $ = (s) => document.querySelector(s);
const postsEl = $('#posts');
const message = $('#adminMessage');
$('#year').textContent = new Date().getFullYear();

function esc(value='') {
 return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function niceDate(value) {
 const d = new Date(value.replace(' ', 'T') + 'Z');
 return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('ar-LY',{year:'numeric',month:'short',day:'numeric'});
}
async function api(url, options={}) {
 const res = await fetch(url, options);
 const data = await res.json().catch(()=>({}));
 if (!res.ok) throw new Error(data.error || 'حدث خطأ.');
 return data;
}
async function loadPosts() {
 try {
  const posts = await api('/api/posts');
  $('#count').textContent = `${posts.length} محتوى`;
  if (!posts.length) { postsEl.innerHTML='<div class="empty">لا توجد منشورات حالياً. ترقّبوا أول إصدار قريباً ✍️</div>'; return; }
  postsEl.innerHTML = posts.map(p => `
   <article class="post" id="post-${p.id}">
    <span class="category">${esc(p.category)}</span><h3>${esc(p.title)}</h3>
    <div class="meta">${esc(niceDate(p.created_at))}</div>
    ${p.body ? `<p>${esc(p.body)}</p>` : ''}
    ${p.file_name ? `<a class="file-link" href="/uploads/${encodeURIComponent(p.file_name)}" target="_blank" rel="noopener">📎 ${esc(p.original_name || 'فتح الملف')}</a>` : ''}
    <div class="actions"><button class="small-btn like-btn" data-id="${p.id}">♡ إعجاب <span>${p.likes}</span></button><span class="meta">💬 ${p.comments_count} تعليق</span>
    ${window.isAdmin ? `<button class="small-btn delete-btn" data-id="${p.id}">حذف</button>` : ''}</div>
    <details class="comments"><summary>عرض التعليقات وإضافة تعليق</summary><div class="comment-list" id="comments-${p.id}">جاري تحميل التعليقات…</div>
     <form class="comment-form" data-id="${p.id}"><input name="author" maxlength="40" placeholder="اسمك" required><textarea name="body" rows="2" maxlength="1000" placeholder="اكتب تعليقك باحترام…" required></textarea><button class="small-btn">إرسال التعليق</button></form>
    </details>
   </article>`).join('');
  postsEl.querySelectorAll('.like-btn').forEach(b=>b.addEventListener('click',async()=>{try{const r=await api(`/api/posts/${b.dataset.id}/like`,{method:'POST'});b.querySelector('span').textContent=r.likes;b.textContent=(r.liked?'♥ إعجاب ':'♡ إعجاب ')+r.likes;}catch(e){alert(e.message)}}));
  postsEl.querySelectorAll('.comments').forEach(d=>d.addEventListener('toggle',()=>{if(d.open){const id=d.closest('.post').id.split('-')[1];loadComments(id)}},{once:true}));
  postsEl.querySelectorAll('.comment-form').forEach(f=>f.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(f);try{await api(`/api/posts/${f.dataset.id}/comments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({author:fd.get('author'),body:fd.get('body')})});f.reset();await loadComments(f.dataset.id);loadPosts();}catch(err){alert(err.message)}}));
  postsEl.querySelectorAll('.delete-btn').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('هل تريد حذف هذا المحتوى؟'))return;try{await api(`/api/posts/${b.dataset.id}`,{method:'DELETE'});loadPosts()}catch(e){alert(e.message)}}));
 } catch(e) {postsEl.innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
}
async function loadComments(id) {
 const el=$(`#comments-${id}`);if(!el)return;
 try {const items=await api(`/api/posts/${id}/comments`);el.innerHTML=items.length?items.map(c=>`<div class="comment"><strong>${esc(c.author)}</strong><div>${esc(c.body)}</div><small class="meta">${esc(niceDate(c.created_at))}</small></div>`).join():'<p class="muted">لا توجد تعليقات بعد.</p>';}catch(e){el.textContent=e.message}
}
async function checkSession() {
 try {const s=await api('/api/session');window.isAdmin=s.admin;$('#loginBox').classList.toggle('hidden',s.admin);$('#publishBox').classList.toggle('hidden',!s.admin);await loadPosts();}catch(_){}
}
$('#adminToggle').addEventListener('click',()=>$('#adminPanel').classList.toggle('hidden'));
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('#password').value})});window.isAdmin=true;$('#password').value='';message.textContent='تم تسجيل الدخول.';checkSession()}catch(err){message.textContent=err.message}});
$('#postForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{await api('/api/posts',{method:'POST',body:fd});e.currentTarget.reset();message.textContent='تم نشر المحتوى بنجاح.';await loadPosts();window.scrollTo({top:document.querySelector('#library').offsetTop,behavior:'smooth'});}catch(err){message.textContent=err.message}});
$('#logout').addEventListener('click',async()=>{await api('/api/logout',{method:'POST'});window.isAdmin=false;message.textContent='تم تسجيل الخروج.';checkSession()});
checkSession();
