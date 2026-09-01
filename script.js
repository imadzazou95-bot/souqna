import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ================================================
// إعدادات Supabase — استبدل القيمتين بقيمك الحقيقية
// ================================================
const SUPABASE_URL = 'https://vrbkoidkklhtpnpefnwk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FQguRFCfwd34bUp2lNB4Iw_OPyQlV9U';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== صورة بديلة عند تعذر عرض الصورة الأصلية =====
const PLACEHOLDER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#FAF6EC" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="8.5" cy="10.5" r="1.5"></circle><path d="M21 15l-5-5-9 9"></path></svg>';
const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(PLACEHOLDER_SVG);

// ===== قائمة الولايات (01 - أدرار إلى 58 - المنيعة) =====
const WILAYAS = [
  '01 - أدرار','02 - الشلف','03 - الأغواط','04 - أم البواقي','05 - باتنة',
  '06 - بجاية','07 - بسكرة','08 - بشار','09 - البليدة','10 - البويرة',
  '11 - تمنراست','12 - تبسة','13 - تلمسان','14 - تيارت','15 - تيزي وزو',
  '16 - الجزائر','17 - الجلفة','18 - جيجل','19 - سطيف','20 - سعيدة',
  '21 - سكيكدة','22 - سيدي بلعباس','23 - عنابة','24 - قالمة','25 - قسنطينة',
  '26 - المدية','27 - مستغانم','28 - المسيلة','29 - معسكر','30 - ورقلة',
  '31 - وهران','32 - البيض','33 - إليزي','34 - برج بوعريريج','35 - بومرداس',
  '36 - الطارف','37 - تندوف','38 - تيسمسيلت','39 - الوادي','40 - خنشلة',
  '41 - سوق أهراس','42 - تيبازة','43 - ميلة','44 - عين الدفلى','45 - النعامة',
  '46 - عين تموشنت','47 - غرداية','48 - غليزان','49 - تيميمون','50 - برج باجي مختار',
  '51 - أولاد جلال','52 - بني عباس','53 - عين صالح','54 - عين قزام','55 - تقرت',
  '56 - جانت','57 - المغير','58 - المنيعة'
];

const CATEGORIES = ['الكل','إلكترونيات','هواتف وإكسسوارات','حاسوب وإكسسوارات','أثاث','أدوات منزلية','ملابس','أحذية وحقائب','مجوهرات وساعات','عطور ومستحضرات تجميل','سيارات','دراجات نارية','عقارات','مستلزمات أطفال','كتب وقرطاسية','رياضة ولياقة','حيوانات أليفة','أدوات زراعية','آلات موسيقية','صناعة يدوية','خدمات','أخرى'];

const state = {
  items: [],
  activeCategory: 'الكل',
  showFavoritesOnly: false,
  currentDetailId: null,
  pendingImageFile: null,
  favorites: loadFavorites()
};

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// ===== المفضلة (localStorage) =====
function loadFavorites(){
  try{
    const raw = localStorage.getItem('souqna_favorites');
    return new Set(raw ? JSON.parse(raw) : []);
  }catch(e){ return new Set(); }
}
function saveFavorites(){
  try{ localStorage.setItem('souqna_favorites', JSON.stringify(Array.from(state.favorites))); }catch(e){}
}

// ===== تحقق رقم واتساب (9 أرقام تبدأ بـ 5/6/7، مع بادئة +213 ثابتة بالواجهة) =====
function normalizeWhatsapp(v){
  const digits = v.replace(/\D/g, '');
  if(!digits) return null;
  if(!/^[567][0-9]{8}$/.test(digits)) return 'invalid';
  return '213' + digits;
}

// ===== تعبئة قوائم الولايات =====
function populateWilayas(){
  const sel = document.getElementById('itemLoc');
  WILAYAS.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w; opt.textContent = w;
    sel.appendChild(opt);
  });
  const filterSel = document.getElementById('wilayaFilterSelect');
  WILAYAS.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w; opt.textContent = w;
    filterSel.appendChild(opt);
  });
}

function renderChips(){
  const wrap = document.getElementById('chips');
  wrap.innerHTML = '';
  CATEGORIES.forEach(c => {
    const el = document.createElement('button');
    el.className = 'chip' + (c === state.activeCategory ? ' active' : '');
    el.textContent = c;
    el.onclick = () => { state.activeCategory = c; renderChips(); renderGrid(); };
    wrap.appendChild(el);
  });
}

// ===== تحميل السلع من قاعدة البيانات =====
async function loadItems(){
  document.getElementById('loadingRow').classList.remove('hidden');
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .order('created_at', { ascending: false });
  document.getElementById('loadingRow').classList.add('hidden');
  if(error){
    console.error(error);
    document.getElementById('grid').innerHTML = '<div class="empty-state">تعذّر تحميل السلع، حاول لاحقًا.</div>';
    return;
  }
  state.items = data || [];
  renderGrid();
}

// تحديث لحظي بدون إعادة تحميل كامل
supabase
  .channel('items-changes')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'items' }, (payload) => {
    if(!state.items.find(it => it.id === payload.new.id)){
      state.items.unshift(payload.new);
      renderGrid();
    }
  })
  .subscribe();

window.toggleFavView = function(){
  state.showFavoritesOnly = !state.showFavoritesOnly;
  document.getElementById('favToggle').classList.toggle('active', state.showFavoritesOnly);
  renderGrid();
};

window.goHome = function(){
  showPage('home');
  renderGrid();
};

window.toggleFavorite = function(id, btnEl){
  if(state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
  saveFavorites();
  if(btnEl) btnEl.classList.toggle('active', state.favorites.has(id));
  if(state.showFavoritesOnly) renderGrid();
};

window.renderGrid = function(){
  const grid = document.getElementById('grid');
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  const sortBy = document.getElementById('sortSelect').value;
  const wilayaFilter = document.getElementById('wilayaFilterSelect').value;

  let filtered = state.items.filter(it => {
    const matchCat = state.activeCategory === 'الكل' || it.category === state.activeCategory;
    const haystack = (it.name + ' ' + (it.description || '')).toLowerCase();
    const matchQuery = !query || haystack.indexOf(query) !== -1;
    const matchFav = !state.showFavoritesOnly || state.favorites.has(it.id);
    const matchWilaya = !wilayaFilter || it.location === wilayaFilter;
    return matchCat && matchQuery && matchFav && matchWilaya;
  });
  if(sortBy === 'lowest') filtered = filtered.slice().sort((a,b) => a.price - b.price);
  else if(sortBy === 'highest') filtered = filtered.slice().sort((a,b) => b.price - a.price);

  grid.innerHTML = '';
  if(filtered.length === 0){
    let msg = 'ما لقيناش سلع تطابق بحثك.';
    if(state.items.length === 0) msg = 'ما فيه سلع منشورة بعد. كن أول من ينشر!';
    else if(state.showFavoritesOnly) msg = 'ما عندكش سلع بالمفضلة بعد.';
    grid.innerHTML = '<div class="empty-state">' + msg + '</div>';
    return;
  }

  filtered.forEach(it => {
    const card = document.createElement('div');
    card.className = 'card';
    const isFav = state.favorites.has(it.id);
    const imgContent = it.image_url
      ? '<img src="' + it.image_url + '" alt="' + escapeHtml(it.name) + '" onerror="this.onerror=null;this.src=\'' + PLACEHOLDER_IMG + '\';">'
      : '<img src="' + PLACEHOLDER_IMG + '" alt="">';
    card.innerHTML =
      '<div class="card-img">' +
      '<button class="fav-btn' + (isFav ? ' active' : '') + '" aria-label="أضف للمفضلة"><svg viewBox="0 0 24 24" fill="' + (isFav ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7-4.35-9.5-8.5C.7 9 2 5.5 5.5 5c2-.3 3.6.7 4.5 2.2C10.9 5.7 12.5 4.7 14.5 5c3.5.5 4.8 4 3 7.5C19 16.65 12 21 12 21z"></path></svg></button>' +
      imgContent +
      '</div>' +
      '<div class="card-body">' +
      '<div class="card-title">' + escapeHtml(it.name) + '</div>' +
      '<div class="card-price">' + escapeHtml(String(it.price)) + ' دج</div>' +
      '<div class="card-loc">📍 ' + escapeHtml(it.location) + '</div>' +
      '</div>';
    card.querySelector('.fav-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(it.id, e.currentTarget);
    });
    card.querySelector('.card-body').addEventListener('click', () => openDetail(it.id));
    grid.appendChild(card);
  });
};

window.openDetail = function(id){
  const it = state.items.find(x => x.id === id);
  if(!it) return;
  state.currentDetailId = id;

  const detailImgEl = document.getElementById('detailImg');
  detailImgEl.innerHTML = it.image_url
    ? '<img src="' + it.image_url + '" alt="' + escapeHtml(it.name) + '" onerror="this.onerror=null;this.src=\'' + PLACEHOLDER_IMG + '\';this.style.cursor=\'default\';this.onclick=null;" onclick="window.open(this.src,\'_blank\')">'
    : '<img src="' + PLACEHOLDER_IMG + '" alt="" width="40" height="40">';

  document.getElementById('detailTitle').textContent = it.name;
  document.getElementById('detailPrice').textContent = it.price + ' دج';
  document.getElementById('detailLoc').textContent = '📍 ' + it.location;
  document.getElementById('detailCat').textContent = it.category;
  document.getElementById('detailDesc').textContent = it.description || 'بدون وصف إضافي.';

  const contactBtn = document.getElementById('contactBtn');
  const waIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 3.5A11.8 11.8 0 0012 0C5.4 0 0 5.4 0 12c0 2.1.5 4.1 1.6 5.9L0 24l6.3-1.6A12 12 0 0012 24c6.6 0 12-5.4 12-12 0-3.2-1.3-6.2-3.5-8.5zM12 22c-1.9 0-3.7-.5-5.3-1.5l-.4-.2-3.8 1 1-3.7-.2-.4A9.9 9.9 0 012 12C2 6.5 6.5 2 12 2s10 4.5 10 10-4.5 10-10 10z"></path></svg>';
  if(it.seller_whatsapp){
    contactBtn.href = 'https://wa.me/' + it.seller_whatsapp + '?text=' + encodeURIComponent('مرحبا، أنا مهتم بسلعتك: ' + it.name);
    contactBtn.style.background = '#25D366';
    contactBtn.innerHTML = waIcon + ' تواصل عبر واتساب';
  } else {
    contactBtn.href = '#';
    contactBtn.style.background = 'var(--ink-muted)';
    contactBtn.innerHTML = 'الرقم غير متوفر';
  }

  document.getElementById('detailFavBtn').classList.toggle('active', state.favorites.has(id));
  showPage('detail');
};

window.toggleFavoriteCurrent = function(){
  if(state.currentDetailId == null) return;
  toggleFavorite(state.currentDetailId);
  document.getElementById('detailFavBtn').classList.toggle('active', state.favorites.has(state.currentDetailId));
};

// ===== رفع صورة =====
document.getElementById('imageInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const maxSize = 5 * 1024 * 1024;
  if(file.size > maxSize){
    alert('حجم الصورة كبير جدًا، اختر صورة أقل من 5 ميغابايت.');
    e.target.value = '';
    return;
  }
  state.pendingImageFile = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const box = document.getElementById('uploadBox');
    box.classList.add('has-image');
    box.innerHTML = '<img src="' + ev.target.result + '" alt="معاينة">';
  };
  reader.readAsDataURL(file);
});

function resetUploadBox(){
  state.pendingImageFile = null;
  document.getElementById('imageInput').value = '';
  const box = document.getElementById('uploadBox');
  box.classList.remove('has-image');
  box.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h3l2-3h6l2 3h3v13H4z"></path><circle cx="12" cy="13" r="4"></circle></svg><span style="font-size:13px;">أضف صورة السلعة</span>';
}

// ===== تعبئة آخر رقم واتساب استُعمل تلقائيًا (بدون حاجة لتسجيل دخول) =====
function loadSavedWhatsapp(){
  const saved = localStorage.getItem('souqna_last_whatsapp');
  if(saved) document.getElementById('itemWhatsapp').value = saved;
}

// ===== نشر سلعة =====
window.submitItem = async function(){
  const name = document.getElementById('itemName').value.trim();
  const price = document.getElementById('itemPrice').value.trim();
  const loc = document.getElementById('itemLoc').value;
  const cat = document.getElementById('itemCat').value;
  const desc = document.getElementById('itemDesc').value.trim();
  const waRaw = document.getElementById('itemWhatsapp').value.trim();

  const nameErr = document.getElementById('nameErr');
  const priceErr = document.getElementById('priceErr');
  const locErr = document.getElementById('locErr');
  const waErr = document.getElementById('waErr');

  let hasError = false;
  if(!name){ nameErr.style.display = 'block'; hasError = true; } else { nameErr.style.display = 'none'; }
  const priceValid = /^[0-9]+$/.test(price);
  if(!priceValid){ priceErr.style.display = 'block'; hasError = true; } else { priceErr.style.display = 'none'; }
  if(!loc){ locErr.style.display = 'block'; hasError = true; } else { locErr.style.display = 'none'; }

  const waNormalized = normalizeWhatsapp(waRaw);
  if(!waRaw || waNormalized === 'invalid'){ waErr.style.display = 'block'; hasError = true; } else { waErr.style.display = 'none'; }

  if(hasError) return;

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'جارِ النشر...';

  let imageUrl = null;
  if(state.pendingImageFile){
    const extMatch = state.pendingImageFile.name.match(/\.[a-zA-Z0-9]+$/);
    const ext = extMatch ? extMatch[0].toLowerCase() : '.jpg';
    const filePath = 'public/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
    const { error: uploadError } = await supabase.storage.from('item-images').upload(filePath, state.pendingImageFile, { upsert: true });
    if(uploadError){
      console.error(uploadError);
      alert('تعذر رفع الصورة: ' + uploadError.message);
    } else {
      const { data: pub } = supabase.storage.from('item-images').getPublicUrl(filePath);
      imageUrl = pub.publicUrl;
    }
  }

  const payload = {
    name: name,
    price: parseInt(price, 10),
    location: loc,
    category: cat,
    description: desc,
    image_url: imageUrl,
    seller_whatsapp: waNormalized
  };

  const { data: inserted, error } = await supabase.from('items').insert(payload).select().single();

  submitBtn.disabled = false;
  submitBtn.textContent = 'انشر السلعة';

  if(error){
    alert('صار خطأ أثناء النشر: ' + (error.message || ''));
    console.error(error);
    return;
  }

  if(inserted && !state.items.find(it => it.id === inserted.id)){
    state.items.unshift(inserted);
  }

  localStorage.setItem('souqna_last_whatsapp', waRaw.replace(/\D/g, ''));

  document.getElementById('itemName').value = '';
  document.getElementById('itemPrice').value = '';
  document.getElementById('itemLoc').selectedIndex = 0;
  document.getElementById('itemDesc').value = '';
  resetUploadBox();

  document.getElementById('successMsg').style.display = 'block';
  setTimeout(() => {
    document.getElementById('successMsg').style.display = 'none';
    showPage('home');
    renderGrid();
  }, 1000);
};

document.getElementById('itemName').addEventListener('input', () => { document.getElementById('nameErr').style.display = 'none'; });
document.getElementById('itemPrice').addEventListener('input', function(){
  this.value = this.value.replace(/[^0-9]/g, '');
  document.getElementById('priceErr').style.display = 'none';
});
document.getElementById('itemLoc').addEventListener('change', () => { document.getElementById('locErr').style.display = 'none'; });
document.getElementById('itemWhatsapp').addEventListener('input', () => { document.getElementById('waErr').style.display = 'none'; });

window.showPage = function(page){
  document.getElementById('pageHome').classList.toggle('hidden', page !== 'home');
  document.getElementById('pagePost').classList.toggle('hidden', page !== 'post');
  document.getElementById('pageDetail').classList.toggle('hidden', page !== 'detail');
  document.getElementById('navHome').classList.toggle('active', page === 'home' || page === 'detail');
  document.getElementById('navPost').classList.toggle('active', page === 'post');
  window.scrollTo(0,0);
};

// ===== تشغيل =====
populateWilayas();
renderChips();
loadSavedWhatsapp();
loadItems();
