const API_BASE = '';

// ===== STATE =====
let currentUser = null;
let currentPage = 1;
let totalPages = 1;
let currentCategory = 'all';
let currentSort = 'newest';
let currentKeyword = '';
let uploadedImages = [];

// ===== UTILS =====
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const formatPrice = p => '¥' + parseFloat(p).toFixed(2);
const formatTime = t => {
  const d = new Date(t);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff/60) + '分钟前';
  if (diff < 86400) return Math.floor(diff/3600) + '小时前';
  if (diff < 604800) return Math.floor(diff/86400) + '天前';
  return d.toLocaleDateString();
};
const showToast = (msg, type = 'info') => {
  const container = $('.toast-container') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toast-container' }));
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};

// ===== API =====
const api = {
  get: async (url) => {
    const r = await fetch(API_BASE + url, { credentials: 'include' });
    if (!r.ok) throw new Error((await r.json()).error || '请求失败');
    return r.json();
  },
  post: async (url, data) => {
    const r = await fetch(API_BASE + url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data), credentials: 'include'
    });
    if (!r.ok) throw new Error((await r.json()).error || '请求失败');
    return r.json();
  },
  upload: async (url, formData) => {
    const r = await fetch(API_BASE + url, {
      method: 'POST', body: formData, credentials: 'include'
    });
    if (!r.ok) throw new Error((await r.json()).error || '请求失败');
    return r.json();
  },
  delete: async (url) => {
    const r = await fetch(API_BASE + url, {
      method: 'DELETE', credentials: 'include'
    });
    if (!r.ok) throw new Error((await r.json()).error || '请求失败');
    return r.json();
  }
};

// ===== AUTH =====
async function checkSession() {
  try {
    const s = await api.get('/api/session');
    if (s.loggedIn) {
      currentUser = s;
      updateNavbar(true);
    } else {
      updateNavbar(false);
    }
  } catch {
    updateNavbar(false);
  }
}
function updateNavbar(loggedIn) {
  const actions = $('.navbar-actions');
  if (!actions) return;
  if (loggedIn) {
    actions.innerHTML = `
      <button class="btn btn-primary" onclick="openPostModal()">📷 发布闲置</button>
      <div class="user-menu">
        <img src="/img/default-avatar.png" class="user-avatar" onclick="toggleDropdown()">
        <div class="dropdown" id="userDropdown">
          <a href="/profile.html">👤 个人中心</a>
          <a href="/messages.html">💬 消息 <span class="badge" id="unreadBadge" style="display:none">0</span></a>
          <a href="/favorites.html">❤️ 我的收藏</a>
          <div class="dropdown-divider"></div>
          <a href="#" onclick="logout()">🚪 退出登录</a>
        </div>
      </div>`;
    loadUnreadCount();
  } else {
    actions.innerHTML = `
      <button class="btn btn-outline" onclick="openLoginModal()">登录</button>
      <button class="btn btn-primary" onclick="openRegisterModal()">注册</button>`;
  }
}
function toggleDropdown() {
  const d = $('#userDropdown');
  if (d) d.classList.toggle('show');
}
async function logout() {
  try {
    await api.post('/api/logout');
    currentUser = null;
    showToast('已退出登录', 'success');
    setTimeout(() => location.href = '/', 800);
  } catch (e) {
    showToast(e.message, 'error');
  }
}
async function loadUnreadCount() {
  try {
    const { count } = await api.get('/api/my/unread');
    const badge = $('#unreadBadge');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
  } catch {}
}

// ===== MODALS =====
function openModal(id) { $(`#${id}`).classList.add('show'); }
function closeModal(id) { $(`#${id}`).classList.remove('show'); }
function openLoginModal() { openModal('loginModal'); }
function openRegisterModal() { openModal('registerModal'); }
function openPostModal() {
  if (!currentUser) { showToast('请先登录', 'warning'); openLoginModal(); return; }
  openModal('postModal');
}

// ===== FORMS =====
async function handleLogin(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const r = await api.post('/api/login', {
      username: fd.get('username'),
      password: fd.get('password')
    });
    currentUser = r;
    showToast('登录成功', 'success');
    closeModal('loginModal');
    updateNavbar(true);
    e.target.reset();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
async function handleRegister(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  if (fd.get('password') !== fd.get('password2')) {
    showToast('两次密码不一致', 'error'); return;
  }
  try {
    const r = await api.post('/api/register', {
      username: fd.get('username'),
      password: fd.get('password'),
      phone: fd.get('phone')
    });
    currentUser = r;
    showToast('注册成功', 'success');
    closeModal('registerModal');
    updateNavbar(true);
    e.target.reset();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== IMAGE UPLOAD =====
function initImageUpload() {
  const area = $('.img-upload-area');
  const input = $('#imageInput');
  const preview = $('.img-preview-grid');
  if (!area) return;

  area.onclick = () => input?.click();
  area.ondragover = e => { e.preventDefault(); area.classList.add('dragover'); };
  area.ondragleave = () => area.classList.remove('dragover');
  area.ondrop = e => {
    e.preventDefault();
    area.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  };
  input?.addEventListener('change', () => handleFiles(input.files));

  function handleFiles(files) {
    if (uploadedImages.length >= 6) { showToast('最多上传6张图片', 'warning'); return; }
    [...files].slice(0, 6 - uploadedImages.length).forEach(f => {
      if (!f.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = e => {
        uploadedImages.push({ file: f, preview: e.target.result });
        renderPreview();
      };
      reader.readAsDataURL(f);
    });
  }
  function renderPreview() {
    preview.innerHTML = uploadedImages.map((img, i) => `
      <div class="img-preview-item">
        <img src="${img.preview}">
        <button type="button" class="remove-img" onclick="removeImage(${i})">×</button>
      </div>
    `).join('');
  }
}
function removeImage(i) {
  uploadedImages.splice(i, 1);
  const preview = $('.img-preview-grid');
  if (preview) preview.innerHTML = uploadedImages.map((img, j) => `
    <div class="img-preview-item">
      <img src="${img.preview}">
      <button type="button" class="remove-img" onclick="removeImage(${j})">×</button>
    </div>
  `).join('');
}

// ===== POST PRODUCT =====
async function handlePostProduct(e) {
  e.preventDefault();
  if (!currentUser) { showToast('请先登录', 'warning'); return; }
  const fd = new FormData(e.target);
  uploadedImages.forEach(img => fd.append('images', img.file));
  try {
    await api.upload('/api/products', fd);
    showToast('发布成功', 'success');
    closeModal('postModal');
    e.target.reset();
    uploadedImages = [];
    $('.img-preview-grid').innerHTML = '';
    loadProducts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== PRODUCTS =====
async function loadProducts() {
  const grid = $('.product-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const params = new URLSearchParams({
      page: currentPage, limit: 12, sort: currentSort,
      category: currentCategory, keyword: currentKeyword
    });
    const { products, total } = await api.get(`/api/products?${params}`);
    totalPages = Math.ceil(total / 12);
    if (products.length === 0) {
      grid.innerHTML = `<div class="empty-state"><div class="icon">📦</div><h3>暂无商品</h3><p>换个分类或搜索词试试看</p></div>`;
    } else {
      grid.innerHTML = products.map(p => renderProductCard(p)).join('');
    }
    renderPagination();
    updateStats(total);
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>加载失败</h3><p>${err.message}</p></div>`;
  }
}
function renderProductCard(p) {
  const conditionClass = {
    '全新': 'condition-new', '99新': 'condition-like-new',
    '良好': 'condition-good', '一般': 'condition-fair'
  }[p.condition] || 'condition-good';
  const img = p.images?.[0] ? `<img src="${p.images[0]}" class="product-img">` : `<div class="product-img-placeholder">📷</div>`;
  return `
    <div class="product-card" onclick="location.href='/product.html?id=${p.id}'">
      ${img}
      ${p.status !== 'active' ? `<span class="status-badge status-${p.status}">${p.status === 'sold' ? '已售出' : '已预订'}</span>` : ''}
      <button class="fav-btn" onclick="event.stopPropagation();toggleFavorite(${p.id}, this)">♡</button>
      <div class="product-info">
        <div class="product-title">${p.title}</div>
        <div class="product-price">${formatPrice(p.price)}</div>
        <div class="product-meta">
          <span class="product-condition ${conditionClass}">${p.condition}</span>
          <span>${p.location || '未知位置'}</span>
        </div>
      </div>
    </div>
  `;
}
function renderPagination() {
  const p = $('.pagination');
  if (!p) return;
  let html = `<button class="page-btn" onclick="changePage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage-1 && i <= currentPage+1)) {
      html += `<button class="page-btn ${i===currentPage?'active':''}" onclick="changePage(${i})">${i}</button>`;
    } else if (i === currentPage-2 || i === currentPage+2) {
      html += `<span>...</span>`;
    }
  }
  html += `<button class="page-btn" onclick="changePage(${currentPage+1})" ${currentPage===totalPages?'disabled':''}>›</button>`;
  p.innerHTML = html;
}
function changePage(p) {
  if (p < 1 || p > totalPages) return;
  currentPage = p;
  loadProducts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function setCategory(c) {
  currentCategory = c;
  currentPage = 1;
  $$('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === c));
  loadProducts();
}
function setSort(s) {
  currentSort = s;
  currentPage = 1;
  $$('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === s));
  loadProducts();
}
function search(keyword) {
  currentKeyword = keyword;
  currentPage = 1;
  loadProducts();
}
function updateStats(total) {
  const el = $('#productCount');
  if (el) el.textContent = total;
}
async function toggleFavorite(id, btn) {
  if (!currentUser) { showToast('请先登录', 'warning'); openLoginModal(); return; }
  try {
    if (btn.classList.contains('active')) {
      await api.delete(`/api/favorites/${id}`);
      btn.classList.remove('active');
      btn.textContent = '♡';
      showToast('已取消收藏', 'success');
    } else {
      await api.post(`/api/favorites/${id}`);
      btn.classList.add('active');
      btn.textContent = '♥';
      showToast('已收藏', 'success');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
  initImageUpload();
  loadProducts();

  // Event listeners
  $('#loginForm')?.addEventListener('submit', handleLogin);
  $('#registerForm')?.addEventListener('submit', handleRegister);
  $('#postForm')?.addEventListener('submit', handlePostProduct);

  // Category buttons
  $$('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => setCategory(btn.dataset.cat));
  });

  // Sort buttons
  $$('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => setSort(btn.dataset.sort));
  });

  // Search
  $('#searchForm')?.addEventListener('submit', e => {
    e.preventDefault();
    search($('#searchInput').value.trim());
  });
  $('#heroSearchForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const kw = $('#heroSearchInput').value.trim();
    if (kw) { search(kw); window.location.href = '/?search=' + encodeURIComponent(kw); }
  });

  // Close modals on backdrop click
  $$('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => {
      if (e.target === m) m.classList.remove('show');
    });
  });

  // Close dropdown on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.user-menu')) {
      $('#userDropdown')?.classList.remove('show');
    }
  });
});
