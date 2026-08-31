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
  document.getElementById('phoneAuthMsg').textContent = '';
  document.getElementById('emailAuthMsg').textContent = '';
  document.getElementById('otpAuthMsg').textContent = '';
};

// === Navigation ===
window.checkAuthAndShowPost = function() {
  const user = window.currentUser ? window.currentUser() : null;
  if (!user) {
    alert('يجب تسجيل الدخول أولاً لإضافة إعلان.');
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
  if(window.favorites.has(id)) window.favorites.delete(id);
  else window.favorites.add(id);
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
  document.getElementById('detailCat').innerHTML = '🏷️ ' + window.escapeHtml(it.cat || 'أخرى');
  document.getElementById('detailDesc').textContent = it.desc || 'لا يوجد وصف إضافي.';
  
  const waText = encodeURIComponent('مرحباً، رأيت إعلانك عن "' + it.name + '" في تطبيق سوقنا وأرغب في الاستفسار عنه.');
  const phone = it.phone || '';
  document.getElementById('contactBtn').onclick = function() {
    if(!phone) { alert('عذراً، لم يتم إرفاق رقم هاتف لهذا الإعلان.'); return; }
    window.open('https://wa.me/' + phone + '?text=' + waText, '_blank');
  };

  const favBtn = document.getElementById('detailFavBtn');
  favBtn.classList.toggle('active', window.favorites.has(id));
  const svg = favBtn.querySelector('svg');
  svg.setAttribute('fill', window.favorites.has(id) ? 'currentColor' : 'none');

  const user = window.currentUser ? window.currentUser() : null;
  const deleteBtn = document.getElementById('detailDeleteBtn');
  if(user && it.ownerId === user.uid) {
    deleteBtn.style.display = 'flex';
  } else {
    deleteBtn.style.display = 'none';
  }

  window.showPage('detail');
};

window.toggleFavoriteCurrent = function() {
  if(window.currentDetailId == null) return;
  window.toggleFavorite(window.currentDetailId, document.getElementById('detailFavBtn'));
};

window.deleteCurrentItem = async function() {
  if(!window.currentDetailId) return;
  if(!confirm('هل أنت متأكد من حذف هذا الإعلان؟ لا يمكن التراجع عن هذا الإجراء.')) return;
  
  const it = window.items.find(x => x.id === window.currentDetailId);
  if(!it) return;

  try {
    if(it.imageUrl) {
      try {
        const imgRef = window.ref(window.storage, it.imageUrl);
        await window.deleteObject(imgRef);
      } catch(e) { console.log('Failed to delete image from storage', e); }
    }
    await window.deleteDoc(window.doc(window.db, 'items', window.currentDetailId));
    alert('تم حذف الإعلان بنجاح.');
    window.showPage('home');
  } catch(e) {
    console.error(e);
    alert('حدث خطأ أثناء الحذف: ' + e.message);
  }
};

// === Form & Submission ===
document.getElementById('imageInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if(!file) return;
  if(file.size > 5 * 1024 * 1024) {
    alert('حجم الصورة كبير جداً. الحد الأقصى 5 ميجابايت.');
    this.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(ev) {
    window.pendingImage = { file: file, dataUrl: ev.target.result };
    const box = document.getElementById('uploadBox');
    box.classList.add('has-image');
    box.innerHTML = '<img src="' + ev.target.result + '" alt="معاينة السلعة">';
  };
  reader.readAsDataURL(file);
});

window.normalizePhone = function(raw) {
  let digits = raw.replace(/[^0-9]/g, '');
  if(digits.indexOf('0') === 0) digits = '213' + digits.substring(1);
  else if(digits.indexOf('213') !== 0) digits = '213' + digits;
  return digits;
};

window.isValidAlgerianPhone = function(raw) {
  let digits = raw.replace(/[^0-9]/g, '');
  let local = digits;
  if(digits.indexOf('213') === 0) local = '0' + digits.substring(3);
  return /^0(5|6|7)[0-9]{8}$/.test(local);
};

window.resetUploadBox = function() {
  window.pendingImage = null;
  document.getElementById('imageInput').value = '';
  const box = document.getElementById('uploadBox');
  box.classList.remove('has-image');
  box.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg><span style="font-size:14px;font-weight:600;">اضغط لإضافة صورة السلعة</span>';
};

window.submitItem = async function() {
  const user = window.currentUser ? window.currentUser() : null;
  if (!user) { 
    alert('يجب تسجيل الدخول أولاً.'); 
    window.openAuthModal();
    return; 
  }

  const name = document.getElementById('itemName').value.trim();
  const price = document.getElementById('itemPrice').value.trim();
  const loc = document.getElementById('itemLoc').value.trim();
  const cat = document.getElementById('itemCat').value;
  const phoneRaw = document.getElementById('itemPhone').value.trim();
  
  const errEl = document.getElementById('nameErr');
  const priceErrEl = document.getElementById('priceErr');
  const phoneErrEl = document.getElementById('phoneErr');
  const submitBtn = document.getElementById('submitBtn');

  let hasError = false;
  if(!name) { errEl.style.display = 'block'; hasError = true; } else { errEl.style.display = 'none'; }
  
  const priceValid = price === '' || /^[0-9]+$/.test(price);
  if(!priceValid) { priceErrEl.style.display = 'block'; hasError = true; } else { priceErrEl.style.display = 'none'; }

  if(!window.isValidAlgerianPhone(phoneRaw)) { phoneErrEl.style.display = 'block'; hasError = true; } else { phoneErrEl.style.display = 'none'; }

  if(!loc) { 
    document.getElementById('itemLoc').style.borderColor = 'var(--rust)';
    hasError = true; 
  } else {
    document.getElementById('itemLoc').style.borderColor = 'var(--line)';
  }

  if(hasError) return;

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading-spinner"></span> جاري النشر...';

  try {
    let imageUrl = null;
    if(window.pendingImage && window.pendingImage.file) {
      const file = window.pendingImage.file;
      const ext = file.name.split('.').pop().toLowerCase();
      const safeName = 'items/' + Date.now() + '_' + Math.random().toString(36).substring(2) + '.' + ext;
      const imgRef = window.ref(window.storage, safeName);
      await window.uploadBytes(imgRef, file);
      imageUrl = await window.getDownloadURL(imgRef);
    }

    const desc = document.getElementById('itemDesc').value.trim();
    const priceNum = parseInt(price, 10);
    
    await window.addDoc(window.itemsCol, {
      name: name,
      priceNum: isNaN(priceNum) ? 0 : priceNum,
      price: price ? (price + ' دج') : 'السعر غير محدد',
      loc: loc,
      cat: cat,
      desc: desc || 'لا يوجد وصف إضافي.',
      phone: window.normalizePhone(phoneRaw),
      imageUrl: imageUrl,
      ownerId: user.uid,
      ownerEmail: user.email || null,
      ownerPhone: user.phoneNumber || null,
      createdAt: window.serverTimestamp()
    });

    document.getElementById('itemName').value = '';
    document.getElementById('itemPrice').value = '';
    document.getElementById('itemLoc').value = '';
    document.getElementById('itemPhone').value = '';
    document.getElementById('itemDesc').value = '';
    window.resetUploadBox();

    document.getElementById('successMsg').style.display = 'block';
    setTimeout(function() {
      document.getElementById('successMsg').style.display = 'none';
      window.showPage('home');
    }, 2000);
  } catch (e) {
    console.error(e);
    alert('حدث خطأ أثناء النشر: ' + e.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'نشر الإعلان الآن';
  }
};

// Input Listeners
document.getElementById('itemName').addEventListener('input', function() { document.getElementById('nameErr').style.display = 'none'; });
document.getElementById('itemPrice').addEventListener('input', function() { document.getElementById('priceErr').style.display = 'none'; });
document.getElementById('itemPhone').addEventListener('input', function() { document.getElementById('phoneErr').style.display = 'none'; });
document.getElementById('itemLoc').addEventListener('input', function() { this.style.borderColor = 'var(--line)'; });

// OTP Input - Allow only numbers
document.getElementById('otpInput').addEventListener('input', function(e) {
  this.value = this.value.replace(/[^0-9]/g, '');
});

// Firestore Listener
const q = query(window.itemsCol, orderBy('createdAt', 'desc'));
onSnapshot(q, (snapshot) => {
  window.items = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    window.items.push({ id: docSnap.id, ...data });
  });
  window.renderGrid();
});

// Initial Render
window.renderChips();
