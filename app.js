// === Global State ===
window.colors = ['#B5502D','#1F4741','#E3A02E','#8A8168'];
window.categories = ['الكل','إلكترونيات','أثاث','ملابس','صناعة يدوية','أخرى'];
window.activeCategory = 'الكل';
window.favorites = new Set(JSON.parse(localStorage.getItem('souqna_favs') || '[]'));
window.showFavoritesOnly = false;
window.currentDetailId = null;
window.items = [];
window.pendingImage = null;

// === Auth Modal Controls ===
window.openAuthModal = function() { 
  document.getElementById('authModal').classList.add('open'); 
  document.body.style.overflow = 'hidden';
};
window.closeAuthModal = function() { 
  document.getElementById('authModal').classList.remove('open'); 
  document.getElementById('authMsg').textContent = '';
  // ملاحظة: body.style.overflow يتم إدارته بواسطة firebase.js بناءً على حالة المستخدم
};

// === Navigation ===
window.checkAuthAndShowPost = function() {
  const user = window.currentUser ? window.currentUser() : null;
  if (!user || !user.email) {
    alert('يجب تسجيل الدخول بحساب حقيقي أولاً لإضافة إعلان.');
    window.openAuthModal();
    return;
  }
  showPage('post');
};

window.showPage = function(page) {
  document.getElementById('pageHome').classList.toggle('hidden', page !== 'home');
  document.getElementById('pagePost').classList.toggle('hidden', page !== 'post');
  document.getElementById('pageDetail').classList.toggle('hidden', page !== 'detail');
  document.getElementById('navHome').classList.toggle('active', page === 'home' || page === 'detail');
  document.getElementById('navPost').classList.toggle('active', page === 'post');
  if(page === 'home') renderGrid();
  window.scrollTo({top: 0, behavior: 'smooth'});
};

// === Rendering ===
window.renderChips = function() {
  const wrap = document.getElementById('chips');
  wrap.innerHTML = '';
  window.categories.forEach(function(c) {
    const el = document.createElement('button');
    el.className = 'chip' + (c === window.activeCategory ? ' active' : '');
    el.textContent = c;
    el.onclick = function() { window.activeCategory = c; window.renderChips(); window.renderGrid(); };
    wrap.appendChild(el);
  });
};

window.escapeHtml = function(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
};

window.toggleFavView = function() {
  window.showFavoritesOnly = !window.showFavoritesOnly;
  document.getElementById('favToggle').classList.toggle('active', window.showFavoritesOnly);
  window.renderGrid();
};

window.toggleFavorite = function(id, btnEl) {
  if(window.favorites.has(id)) { window.favorites.delete(id); }
  else { window.favorites.add(id); }
  localStorage.setItem('souqna_favs', JSON.stringify([...window.favorites]));
  if(btnEl) {
    btnEl.classList.toggle('active', window.favorites.has(id));
    const svg = btnEl.querySelector('svg');
    if(svg) svg.setAttribute('fill', window.favorites.has(id) ? 'currentColor' : 'none');
  }
  if(window.showFavoritesOnly) window.renderGrid();
};

window.renderGrid = function() {
  const grid = document.getElementById('grid');
  const queryStr = document.getElementById('searchInput').value.trim().toLowerCase();
  const sortBy = document.getElementById('sortSelect').value;
  
  let filtered = window.items.filter(function(it) {
    const matchCat = window.activeCategory === 'الكل' || it.cat === window.activeCategory;
    const haystack = (it.name + ' ' + (it.desc || '') + ' ' + (it.loc || '')).toLowerCase();
    const matchQuery = !queryStr || haystack.indexOf(queryStr) !== -1;
    const matchFav = !window.showFavoritesOnly || window.favorites.has(it.id);
    return matchCat && matchQuery && matchFav;
  });

  if(sortBy === 'lowest') {
    filtered = filtered.slice().sort(function(a,b) { 
      const pa = a.priceNum > 0 ? a.priceNum : Infinity;
      const pb = b.priceNum > 0 ? b.priceNum : Infinity;
      return pa - pb; 
    });
  } else if(sortBy === 'highest') {
    filtered = filtered.slice().sort(function(a,b) { 
      const pa = a.priceNum > 0 ? a.priceNum : -1;
      const pb = b.priceNum > 0 ? b.priceNum : -1;
      return pb - pa; 
    });
  }

  grid.innerHTML = '';
  if(filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state">' + (window.showFavoritesOnly ? 'لا توجد سلع في المفضلة بعد.' : 'لم نعثر على سلع تطابق بحثك.') + '</div>';
    return;
  }

  filtered.forEach(function(it, i) {
    const card = document.createElement('div');
    card.className = 'card';
    const color = window.colors[i % window.colors.length];
    const isFav = window.favorites.has(it.id);
    const imgContent = it.imageUrl
      ? '<img src="' + window.escapeHtml(it.imageUrl) + '" alt="' + window.escapeHtml(it.name) + '" loading="lazy">'
      : '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="8.5" cy="10.5" r="1.5"></circle><path d="M21 15l-5-5-9 9"></path></svg>';
    
    card.innerHTML =
      '<div class="card-img" style="background:' + (it.imageUrl ? '#fff' : color) + '">' +
      '<button class="fav-btn' + (isFav ? ' active' : '') + '" aria-label="أضف للمفضلة" data-id="' + it.id + '"><svg viewBox="0 0 24 24" fill="' + (isFav ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-4.35-9.5-8.5C.7 9 2 5.5 5.5 5c2-.3 3.6.7 4.5 2.2C10.9 5.7 12.5 4.7 14.5 5c3.5.5 4.8 4 3 7.5C19 16.65 12 21 12 21z"></path></svg></button>' +
      imgContent +
      '</div>' +
      '<div class="card-body" data-id="' + it.id + '">' +
      '<div class="card-title">' + window.escapeHtml(it.name) + '</div>' +
      '<div class="card-price">' + window.escapeHtml(it.price || 'السعر غير محدد') + '</div>' +
      '<div class="card-loc">📍 ' + window.escapeHtml(it.loc || 'غير محدد') + '</div>' +
      '</div>';
    
    const favBtn = card.querySelector('.fav-btn');
    favBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      window.toggleFavorite(it.id, favBtn);
    });
    
    const body = card.querySelector('.card-body');
    body.addEventListener('click', function() { window.openDetail(it.id); });
    grid.appendChild(card);
  });
};

// === Detail Page ===
window.openDetail = function(id) {
  const it = window.items.find(function(x) { return x.id === id; });
  if(!it) return;
  window.currentDetailId = id;
  const idx = window.items.indexOf(it);
  const color = window.colors[idx % window.colors.length];
  const detailImgEl = document.getElementById('detailImg');
  
  if(it.imageUrl) {
    detailImgEl.style.background = '#fff';
    detailImgEl.innerHTML = '<img src="' + window.escapeHtml(it.imageUrl) + '" alt="' + window.escapeHtml(it.name) + '">';
  } else {
    detailImgEl.style.background = color;
    detailImgEl.innerHTML = '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="8.5" cy="10.5" r="1.5"></circle><path d="M21 15l-5-5-9 9"></path></svg>';
  }
  
  document.getElementById('detailTitle').textContent = it.name;
  document.getElementById('detailPrice').textContent = it.price || 'السعر غير محدد';
  document.getElementById('detailLoc').innerHTML = '📍 ' + window.escapeHtml(it.loc || 'غير محدد');
  document.getElementById('detailCat').innerHTML = '🏷️ ' + window.escapeHtml(it.cat || 'أ
