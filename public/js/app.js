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
  return d.toLocaleDateString('zh-CN');
};
const showToast = (msg, type = 'info') => {
  let container = $('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || ''} ${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
};

// ===== 记录来源页（登录后跳回） =====
function saveReturnUrl() {
  const path = location.pathname + location.search;
  if (path !== '/' && !path.includes('login')) {
    sessionStorage.setItem('returnUrl', path);
  }
}
function getReturnUrl() {
  return sessionStorage.getItem('returnUrl') || '/';
}
function clearReturnUrl() {
  sessionStorage.removeItem('returnUrl');
}

// ===== 最近浏览记录 =====
function saveRecentView(product) {
  try {
    let recent = JSON.parse(localStorage.getItem('recentViewed') || '[]');
    recent = recent.filter(p => p.id !== product.id);
    recent.unshift({
      id: product.id,
      title: product.title,
      price: product.price,
      image: product.images?.[0] || null
    });
    recent = recent.slice(0, 8);
    localStorage.setItem('recentViewed', JSON.stringify(recent));
  } catch {}
}

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
  put: async (url, data) => {
    const r = await fetch(API_BASE + url, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data), credentials: 'include'
    });
    if (!r.ok) throw new Error((await r.json()).error || '请求失败');
    return r.json();
  },
  upload: async (url, formData, method = 'POST') => {
    const r = await fetch(API_BASE + url, {
      method, body: formData, credentials: 'include'
    });
    if (!r.ok) throw new Error((await r.json()).error || '请求失败');
    return r.json();
  },
  delete: async (url) => {
    const r = await fetch(API_BASE + url, { method: 'DELETE', credentials: 'include' });
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
        <img src="/img/default-avatar.png" class="user-avatar" id="navAvatar"
          onclick="toggleDropdown()" title="${currentUser.username}">
        <div class="dropdown" id="userDropdown">
          <a href="/profile.html">👤 个人中心</a>
          <a href="/chat.html">💬 消息
            <span class="badge" id="unreadBadge" style="display:none">0</span>
          </a>
          <a href="/profile.html?tab=favorites">❤️ 我的收藏</a>
          <a href="/profile.html?tab=products">📦 我的发布</a>
          <div class="dropdown-divider"></div>
          <a href="#" onclick="logout();return false">🚪 退出登录</a>
        </div>
      </div>`;
    loadUnreadCount();
    // 加载真实头像
    api.get('/api/me').then(u => {
      const av = document.getElementById('navAvatar');
      if (av && u.avatar) av.src = u.avatar;
    }).catch(() => {});
  } else {
    actions.innerHTML = `
      <button class="btn btn-outline" onclick="openLoginModal()">登录</button>
      <button class="btn btn-primary" onclick="openRegisterModal()">注册</button>`;
  }
  // 更新底部导航高亮
  updateBottomNav();
}

function updateBottomNav() {
  const path = location.pathname;
  $$('.bottom-nav-item').forEach(item => {
    const href = item.getAttribute('href');
    item.classList.toggle('active', href && href !== '#' && path === href);
  });
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
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('show');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}
function openLoginModal() {
  saveReturnUrl();
  openModal('loginModal');
}
function openRegisterModal() {
  openModal('registerModal');
}
function openPostModal() {
  if (!currentUser) {
    showToast('请先登录后再发布', 'warning');
    saveReturnUrl();
    openLoginModal();
    return;
  }
  openModal('postModal');
}

// ===== FORMS =====
async function handleLogin(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = '登录中...';
  try {
    const r = await api.post('/api/login', {
      username: fd.get('username'),
      password: fd.get('password')
    });
    currentUser = r;
    showToast(`欢迎回来，${r.username}！`, 'success');
    closeModal('loginModal');
    updateNavbar(true);
    e.target.reset();
    // 跳回来源页
    const returnUrl = getReturnUrl();
    clearReturnUrl();
    if (returnUrl && returnUrl !== location.pathname + location.search) {
      setTimeout(() => location.href = returnUrl, 600);
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '登录';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  if (fd.get('password') !== fd.get('password2')) {
    showToast('两次密码不一致', 'error'); return;
  }
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = '注册中...';
  try {
    const r = await api.post('/api/register', {
      username: fd.get('username'),
      password: fd.get('password'),
      phone: fd.get('phone')
    });
    currentUser = r;
    showToast('注册成功，欢迎加入！', 'success');
    closeModal('registerModal');
    updateNavbar(true);
    e.target.reset();
    // 注册成功跳转个人中心
    setTimeout(() => location.href = '/profile.html', 800);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '注册';
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
      reader.onload = ev => {
        uploadedImages.push({ file: f, preview: ev.target.result });
        renderPreview();
      };
      reader.readAsDataURL(f);
    });
  }
  function renderPreview() {
    if (!preview) return;
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
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = '发布中...';
  try {
    const result = await api.upload('/api/products', fd);
    showToast('发布成功！', 'success');
    closeModal('postModal');
    e.target.reset();
    uploadedImages = [];
    const pg = $('.img-preview-grid');
    if (pg) pg.innerHTML = '';
    // 发布成功跳转到商品详情页
    setTimeout(() => location.href = `/product.html?id=${result.productId}`, 600);
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false; btn.textContent = '🚀 立即发布';
  }
}

// ===== PRODUCTS =====
async function loadProducts() {
  const grid = $('.product-grid') || document.getElementById('productGrid');
  if (!grid) return;
  grid.innerHTML = renderSkeletons ? renderSkeletons(12) : '<div class="loading"><div class="spinner"></div></div>';
  try {
    const params = new URLSearchParams({
      page: currentPage, limit: 12, sort: currentSort,
      category: currentCategory, keyword: currentKeyword
    });
    const { products, total } = await api.get(`/api/products?${params}`);
    totalPages = Math.ceil(total / 12) || 1;
    const countEl = document.getElementById('productCount');
    if (countEl) countEl.textContent = total ? `共 ${total} 件` : '';
    if (!products.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="icon">📦</div><h3>暂无商品</h3>
        <p>换个分类或搜索词试试看</p>
        <button class="btn btn-primary" onclick="setCategory('all');currentKeyword='';loadProducts()">查看全部</button>
      </div>`;
    } else {
      grid.innerHTML = products.map(p => renderProductCard(p)).join('');
    }
    renderPagination();
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="icon">⚠️</div><h3>加载失败</h3><p>${err.message}</p>
      <button class="btn btn-primary" onclick="loadProducts()">重试</button>
    </div>`;
  }
}

function renderSkeletons(n) {
  return Array(n).fill(0).map(() => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-img"></div>
      <div style="padding:14px">
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text" style="width:60%"></div>
        <div class="skeleton skeleton-text" style="width:40%"></div>
      </div>
    </div>
  `).join('');
}

function renderProductCard(p) {
  const conditionClass = {
    '全新': 'condition-new', '99新': 'condition-like-new',
    '良好': 'condition-good', '一般': 'condition-fair'
  }[p.condition] || 'condition-good';
  const img = p.images?.[0]
    ? `<img src="${p.images[0]}" class="product-img" loading="lazy">`
    : `<div class="product-img-placeholder">📷</div>`;
  const negotiableTag = p.negotiable ? `<span class="negotiable-tag">可议价</span>` : '';
  return `
    <div class="product-card" onclick="location.href='/product.html?id=${p.id}'">
      ${img}
      ${p.status !== 'active' ? `<span class="status-badge status-${p.status}">${p.status === 'sold' ? '已售出' : '已预订'}</span>` : ''}
      ${negotiableTag}
      <button class="fav-btn" onclick="event.stopPropagation();toggleFavorite(${p.id}, this)" title="收藏">♡</button>
      <div class="product-info">
        <div class="product-title">${highlightKeyword(p.title, currentKeyword)}</div>
        <div class="product-price">${formatPrice(p.price)}</div>
        <div class="product-meta">
          <span class="product-condition ${conditionClass}">${p.condition}</span>
          <span>${p.location || '未知'}</span>
        </div>
        <div class="product-footer">
          <span class="seller-link" onclick="event.stopPropagation();location.href='/profile.html?id=${p.user_id}'">
            <img src="${p.avatar || '/img/default-avatar.png'}" class="seller-mini-avatar">
            ${p.username}
          </span>
          <span class="product-time">${formatTime(p.created_at)}</span>
        </div>
      </div>
    </div>
  `;
}

// 关键词高亮
function highlightKeyword(text, keyword) {
  if (!keyword || !text) return text || '';
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'gi'), m => `<mark>${m}</mark>`);
}

function renderPagination() {
  const p = document.getElementById('pagination') || $('.pagination');
  if (!p) return;
  if (totalPages <= 1) { p.innerHTML = ''; return; }
  let html = `<button class="page-btn" onclick="changePage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage-1 && i <= currentPage+1)) {
      html += `<button class="page-btn ${i===currentPage?'active':''}" onclick="changePage(${i})">${i}</button>`;
    } else if (i === currentPage-2 || i === currentPage+2) {
      html += `<span style="padding:0 4px;color:var(--text-light)">…</span>`;
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

async function toggleFavorite(id, btn) {
  if (!currentUser) {
    showToast('请先登录后再收藏', 'warning');
    saveReturnUrl();
    openLoginModal();
    return;
  }
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
      showToast('已加入收藏 ❤️', 'success');
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

  $('#loginForm')?.addEventListener('submit', handleLogin);
  $('#registerForm')?.addEventListener('submit', handleRegister);
  $('#postForm')?.addEventListener('submit', handlePostProduct);

  // 分类按钮
  $$('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => setCategory(btn.dataset.cat));
  });

  // 排序按钮
  $$('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => setSort(btn.dataset.sort));
  });

  // 搜索框
  $('#searchForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const kw = $('#searchInput')?.value.trim() || '';
    if (kw) {
      try { saveHistory(kw); } catch {}
    }
    search(kw);
    document.getElementById('searchDropdown')?.classList.remove('show');
  });

  // 点击遮罩关闭弹窗
  $$('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => {
      if (e.target === m) m.classList.remove('show');
    });
  });

  // 点击外部关闭下拉
  document.addEventListener('click', e => {
    if (!e.target.closest('.user-menu')) {
      $('#userDropdown')?.classList.remove('show');
    }
  });

  // ESC 关闭弹窗
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      $$('.modal-overlay.show').forEach(m => m.classList.remove('show'));
      document.getElementById('searchDropdown')?.classList.remove('show');
    }
  });

  // URL 参数处理
  const urlParams = new URLSearchParams(location.search);
  const searchKw = urlParams.get('search');
  const cat = urlParams.get('category');
  if (searchKw) {
    currentKeyword = searchKw;
    const si = document.getElementById('searchInput');
    if (si) si.value = searchKw;
  }
  if (cat) {
    currentCategory = cat;
    $$('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
  }
});
