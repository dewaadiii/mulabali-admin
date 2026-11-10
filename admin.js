/* Admin Mula Bali Bamboo Villas
   - Login karyawan (Supabase Auth: email + password)
   - Ubah semua isi website, upload & ganti foto
   - Kelola karyawan (khusus pemilik), riwayat & pulihkan versi
   Tanpa pengaturan Supabase, admin berjalan dalam MODE DEMO (tidak menyimpan apa pun). */
(function () {
  'use strict';

  var CFG = window.MB_ADMIN_CONFIG || {};
  var DEFAULT = window.MB_DEFAULT_CONTENT || {};
  var DEMO = !(CFG.supabaseUrl && CFG.supabaseAnonKey);
  var SITE = (CFG.siteUrl || '').replace(/\/?$/, '/');
  if (SITE === '/') SITE = '';
  var SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  var BUCKET = 'media', FOLDER = 'uploads';

  var root = document.getElementById('root');
  var modal = document.getElementById('modal');
  var sb = null;

  var S = {
    user: null,          // {email, name, role}
    draft: null,         // isi yang sedang diubah
    saved: null,         // JSON string versi terbit terakhir
    savedAt: null, savedBy: null,
    page: 'dashboard', sideOpen: false,
    media: null, staff: null, history: null,
    busy: {}             // path -> true saat upload
  };
  var demoStore = {
    staff: [
      { email: 'pemilik@contoh.com', name: 'Pemilik', role: 'owner', active: true, created_at: new Date().toISOString() },
      { email: 'resepsionis@contoh.com', name: 'Resepsionis', role: 'editor', active: true, created_at: new Date().toISOString() }
    ],
    history: [], media: []
  };

  /* ================= helpers ================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }
  function fill(base, live) {
    if (!isObj(base)) return live === undefined ? clone(base === undefined ? null : base) : live;
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = fill(base[k], isObj(live) ? live[k] : undefined); });
    if (isObj(live)) Object.keys(live).forEach(function (k) { if (!(k in out)) out[k] = live[k]; });
    return out;
  }
  function getP(o, path) {
    return path.split('.').reduce(function (a, k) { return a == null ? undefined : a[k]; }, o);
  }
  function setP(o, path, v) {
    var ks = path.split('.'), last = ks.pop(), t = o;
    ks.forEach(function (k, i) {
      if (t[k] == null) t[k] = /^\d+$/.test(ks[i + 1] || last) ? [] : {};
      t = t[k];
    });
    t[last] = v;
  }
  function resolveImg(u) {
    u = String(u || '');
    if (!u) return '';
    if (/^(https?:|blob:|data:)/i.test(u)) return u;
    return SITE + u.replace(/^\//, '');
  }
  function idr(n) { return 'IDR ' + Math.round(n).toLocaleString('en-US'); }
  function when(iso) {
    if (!iso) return '-';
    var d = new Date(iso);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
      d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }
  function slug(s) { return String(s || 'foto').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'foto'; }
  function uid() { return Math.random().toString(36).slice(2, 8); }
  function isDirty() { return S.draft && JSON.stringify(S.draft) !== S.saved; }
  function isOwner() { return S.user && S.user.role === 'owner'; }
  function initials(n) { return String(n || '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase(); }

  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    document.getElementById('toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, kind === 'err' ? 6000 : 3200);
  }

  var I = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    hero: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15l5-5 4 4 3-3 6 6"/>',
    about: '<path d="M12 21c-4-3-8-6.5-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 4.5-4 8-8 11z"/>',
    gallery: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    tour: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    rates: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    addons: '<path d="M12 3v18M3 12h18"/>',
    contact: '<path d="M4 5h16v11H8l-4 4z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    media: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 15l-5-5-8 8"/>',
    staff: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9.5" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5.5 5"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    out: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v6H4V6h6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'
  };
  function ic(n, s) {
    return '<svg width="' + (s || 18) + '" height="' + (s || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (I[n] || '') + '</svg>';
  }

  /* ================= modal ================= */
  function openModal(html, cls) {
    modal.innerHTML = '<div class="modal-card ' + (cls || '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    modal.hidden = false;
    var f = modal.querySelector('input,button,select,textarea');
    if (f) f.focus();
  }
  function closeModal() { modal.hidden = true; modal.innerHTML = ''; modal.onclick = null; }
  modal.addEventListener('mousedown', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
  function confirmBox(title, text, okLabel, danger) {
    return new Promise(function (res) {
      openModal('<div class="modal-h"><h3>' + esc(title) + '</h3></div><div class="modal-b"><p style="margin:0">' + esc(text) + '</p></div>' +
        '<div class="modal-f"><button class="btn" data-m="no">Batal</button><button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-m="yes">' + esc(okLabel || 'Ya') + '</button></div>');
      modal.onclick = function (e) {
        var b = e.target.closest('[data-m]');
        if (!b) return;
        var yes = b.getAttribute('data-m') === 'yes';
        closeModal(); res(yes);
      };
    });
  }
  function viewPhoto(src) {
    openModal('<img src="' + esc(resolveImg(src)) + '" alt="">', 'photo');
    modal.querySelector('.modal-card').addEventListener('click', closeModal);
  }

  /* ================= Supabase ================= */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Gagal memuat ' + src)); };
      document.head.appendChild(s);
    });
  }
  function errMsg(e) {
    var m = (e && (e.message || e.error_description)) || String(e);
    if (/Invalid login credentials/i.test(m)) return 'Email atau password salah.';
    if (/Email not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Buka email dari Supabase lalu klik link konfirmasi.';
    if (/User already registered/i.test(m)) return 'Email ini sudah punya password. Silakan masuk, atau pakai "Lupa password".';
    if (/Password should be at least/i.test(m)) return 'Password minimal 8 karakter.';
    if (/row-level security|permission denied/i.test(m)) return 'Akun Anda tidak punya izin untuk tindakan ini.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Tidak ada koneksi ke server. Cek internet lalu coba lagi.';
    return m;
  }

  /* ================= auth screens ================= */
  function authShell(inner) {
    var art = resolveImg((S.draft && S.draft.hero && S.draft.hero.image) || (DEFAULT.hero && DEFAULT.hero.image));
    root.innerHTML = '<div class="auth">' +
      '<div class="auth-art" style="background-image:url(\'' + esc(art) + '\')"><div class="auth-art-text"><p class="wordmark">MULA BALI</p><p class="wordmark-sub">BAMBOO VILLAS · ADMIN</p></div></div>' +
      '<div class="auth-main"><div class="auth-card"><div class="auth-brand"><p class="wordmark" style="margin:0">MULA BALI</p><p class="wordmark-sub" style="margin:0">BAMBOO VILLAS · ADMIN</p></div>' + inner + '</div></div></div>';
  }
  function showAuth(mode, msg, kind) {
    var note = msg ? '<div class="note note-' + (kind || 'err') + '" style="margin-bottom:16px">' + esc(msg) + '</div>' : '';
    var demo = DEMO ? '<div class="note note-warn" style="margin-bottom:18px"><b>Mode demo.</b> Admin belum disambungkan ke database, jadi perubahan tidak disimpan. Ketik email & password apa saja untuk mencoba.</div>' : '';
    var h;
    if (mode === 'signup') {
      h = '<h1>Buat password</h1><p class="auth-lead">Untuk karyawan yang emailnya sudah didaftarkan pemilik.</p>' + note +
        '<form data-form="signup"><div class="f"><label for="em">Email</label><input class="inp" id="em" type="email" autocomplete="email" required></div>' +
        '<div class="f"><label for="pw">Password baru</label><input class="inp" id="pw" type="password" autocomplete="new-password" minlength="8" required><p class="f-hint">Minimal 8 karakter.</p></div>' +
        '<button class="btn btn-primary btn-block" type="submit">Buat akun</button></form>' +
        '<div class="auth-links"><button class="linkbtn" data-auth="login">Sudah punya password? Masuk</button></div>';
    } else if (mode === 'forgot') {
      h = '<h1>Lupa password</h1><p class="auth-lead">Kami kirim link untuk membuat password baru ke email Anda.</p>' + note +
        '<form data-form="forgot"><div class="f"><label for="em">Email</label><input class="inp" id="em" type="email" autocomplete="email" required></div>' +
        '<button class="btn btn-primary btn-block" type="submit">Kirim link</button></form>' +
        '<div class="auth-links"><button class="linkbtn" data-auth="login">Kembali ke halaman masuk</button></div>';
    } else if (mode === 'reset') {
      h = '<h1>Password baru</h1><p class="auth-lead">Masukkan password baru untuk akun Anda.</p>' + note +
        '<form data-form="reset"><div class="f"><label for="pw">Password baru</label><input class="inp" id="pw" type="password" autocomplete="new-password" minlength="8" required></div>' +
        '<button class="btn btn-primary btn-block" type="submit">Simpan password</button></form>';
    } else if (mode === 'notstaff') {
      h = '<h1>Belum terdaftar</h1><p class="auth-lead">Anda masuk sebagai <b>' + esc(msg) + '</b>, tetapi email ini belum terdaftar sebagai karyawan atau sedang dinonaktifkan.</p>' +
        '<div class="note note-info" style="margin-bottom:18px">Minta pemilik menambahkan email ini di menu <b>Karyawan</b>, lalu masuk lagi.</div>' +
        '<button class="btn btn-block" data-act="logout">Keluar</button>';
    } else {
      h = '<h1>Selamat datang</h1><p class="auth-lead">Masuk untuk mengelola website Mula Bali.</p>' + demo + note +
        '<form data-form="login"><div class="f"><label for="em">Email</label><input class="inp" id="em" type="email" autocomplete="username" required></div>' +
        '<div class="f"><label for="pw">Password</label><input class="inp" id="pw" type="password" autocomplete="current-password" required></div>' +
        '<button class="btn btn-primary btn-block" type="submit">Masuk</button></form>' +
        (DEMO ? '' : '<div class="auth-links"><button class="linkbtn" data-auth="signup">Karyawan baru? Buat password</button><button class="linkbtn" data-auth="forgot">Lupa password</button></div>');
    }
    authShell(h);
  }

  root.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    var kind = form.getAttribute('data-form');
    var em = (form.querySelector('#em') || {}).value, pw = (form.querySelector('#pw') || {}).value;
    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    var done = function () { btn.disabled = false; };
    if (DEMO) {
      S.user = { email: em || 'pemilik@contoh.com', name: 'Pemilik (demo)', role: 'owner' };
      loadAll().then(renderApp);
      return;
    }
    if (kind === 'login') {
      sb.auth.signInWithPassword({ email: em, password: pw }).then(function (r) {
        done();
        if (r.error) return showAuth('login', errMsg(r.error));
        afterLogin(r.data.user);
      });
    } else if (kind === 'signup') {
      sb.auth.signUp({ email: em, password: pw, options: { emailRedirectTo: location.origin + location.pathname } }).then(function (r) {
        done();
        if (r.error) return showAuth('signup', errMsg(r.error));
        if (r.data.session) return afterLogin(r.data.user);
        showAuth('login', 'Akun dibuat. Buka email ' + em + ', klik link konfirmasi, lalu masuk di sini.', 'ok');
      });
    } else if (kind === 'forgot') {
      sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname }).then(function (r) {
        done();
        if (r.error) return showAuth('forgot', errMsg(r.error));
        showAuth('login', 'Link sudah dikirim ke ' + em + '. Buka email Anda untuk membuat password baru.', 'ok');
      });
    } else if (kind === 'reset') {
      sb.auth.updateUser({ password: pw }).then(function (r) {
        done();
        if (r.error) return showAuth('reset', errMsg(r.error));
        toast('Password baru tersimpan', 'ok');
        afterLogin(r.data.user);
      });
    }
  });

  /* ================= data ================= */
  function loadAll() {
    if (DEMO) {
      if (!S.draft) { S.draft = fill(DEFAULT, {}); S.saved = JSON.stringify(S.draft); S.savedAt = null; S.savedBy = null; }
      return Promise.resolve();
    }
    return sb.from('site_content').select('data,updated_at,updated_by').eq('id', 1).maybeSingle().then(function (r) {
      if (r.error) throw r.error;
      if (r.data) {
        S.draft = fill(DEFAULT, r.data.data);
        S.saved = JSON.stringify(S.draft);
        S.savedAt = r.data.updated_at; S.savedBy = r.data.updated_by;
      } else {
        S.draft = fill(DEFAULT, {});
        S.saved = null; S.savedAt = null; S.savedBy = null; // belum pernah diterbitkan
      }
      checkLocalDraft();
    });
  }
  function localKey() { return 'mb-admin-draft:' + (S.user ? S.user.email : ''); }
  function stashLocal() {
    try {
      if (isDirty()) localStorage.setItem(localKey(), JSON.stringify({ at: Date.now(), base: S.savedAt, data: S.draft }));
      else localStorage.removeItem(localKey());
    } catch (e) {}
  }
  var pendingLocal = null;
  function checkLocalDraft() {
    try {
      var raw = localStorage.getItem(localKey());
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d && d.data && JSON.stringify(fill(DEFAULT, d.data)) !== S.saved) pendingLocal = d;
      else localStorage.removeItem(localKey());
    } catch (e) {}
  }

  function afterLogin(user) {
    root.innerHTML = '<div class="spin" aria-label="Memuat"></div>';
    var email = String(user.email || '').toLowerCase();
    sb.from('staff').select('email,name,role,active').eq('email', email).maybeSingle().then(function (r) {
      if (r.error || !r.data || !r.data.active) return showAuth('notstaff', email);
      S.user = { email: email, name: r.data.name || email.split('@')[0], role: r.data.role };
      return loadAll().then(renderApp);
    }).catch(function (e) { showAuth('login', errMsg(e)); });
  }

  function save() {
    if (!isDirty()) return;
    var btn = document.getElementById('saveBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
    var data = clone(S.draft);
    var finish = function (at, by) {
      S.saved = JSON.stringify(S.draft); S.savedAt = at; S.savedBy = by; S.history = null;
      stashLocal(); renderApp();
      toast('Tersimpan. Website sudah memakai versi baru.', 'ok');
    };
    if (DEMO) {
      demoStore.history.unshift({ id: Date.now(), saved_at: new Date().toISOString(), saved_by: S.user.email, data: data });
      setTimeout(function () { finish(new Date().toISOString(), S.user.email); }, 400);
      return;
    }
    sb.from('site_content').select('updated_at,updated_by').eq('id', 1).maybeSingle().then(function (r) {
      var row = r.data;
      if (row && row.updated_at !== S.savedAt && row.updated_by && row.updated_by !== S.user.email) {
        return confirmBox('Ada perubahan dari orang lain', row.updated_by + ' menyimpan pada ' + when(row.updated_at) +
          ' setelah Anda membuka admin. Kalau Anda simpan sekarang, perubahan mereka tertimpa. Lanjutkan?', 'Simpan & timpa', true);
      }
      return true;
    }).then(function (go) {
      if (!go) { renderApp(); return; }
      return sb.from('site_content').upsert({ id: 1, data: data }).select('updated_at,updated_by').single().then(function (r) {
        if (r.error) throw r.error;
        finish(r.data.updated_at, r.data.updated_by);
      });
    }).catch(function (e) { toast('Gagal menyimpan: ' + errMsg(e), 'err'); renderApp(); });
  }

  /* ================= images ================= */
  function processImage(file, maxSide) {
    return new Promise(function (res, rej) {
      if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return rej(new Error('Bukan file foto'));
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, maxSide / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * s); c.height = Math.round(h * s);
        var ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('Gagal memproses foto')); }, 'image/jpeg', 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Format foto tidak didukung. Pakai JPG atau PNG.')); };
      img.src = url;
    });
  }
  function uploadBlob(blob, name) {
    var path = FOLDER + '/' + Date.now() + '-' + uid() + '-' + slug(name) + '.jpg';
    if (DEMO) {
      var u = URL.createObjectURL(blob);
      demoStore.media.unshift({ name: path.split('/').pop(), url: u, size: blob.size, created_at: new Date().toISOString() });
      S.media = null;
      return Promise.resolve(u);
    }
    return sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false }).then(function (r) {
      if (r.error) throw r.error;
      S.media = null;
      return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    });
  }
  function uploadFiles(files, maxSide) {
    files = [].slice.call(files || []);
    return files.reduce(function (p, f) {
      return p.then(function (urls) {
        return processImage(f, maxSide).then(function (b) { return uploadBlob(b, f.name); }).then(function (u) { urls.push(u); return urls; })
          .catch(function (e) { toast(f.name + ': ' + errMsg(e), 'err'); return urls; });
      });
    }, Promise.resolve([]));
  }
  var picker = document.createElement('input');
  picker.type = 'file'; picker.accept = 'image/*'; picker.hidden = true;
  document.body.appendChild(picker);
  var pickTarget = null;
  function pickFiles(multiple, cb) {
    picker.multiple = !!multiple; picker.value = ''; pickTarget = cb; picker.click();
  }
  picker.addEventListener('change', function () { if (pickTarget && picker.files.length) pickTarget(picker.files); });

  function listMedia() {
    if (S.media) return Promise.resolve(S.media);
    if (DEMO) { S.media = demoStore.media.slice(); return Promise.resolve(S.media); }
    return sb.storage.from(BUCKET).list(FOLDER, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } }).then(function (r) {
      if (r.error) throw r.error;
      S.media = (r.data || []).filter(function (f) { return f.name && !/^\./.test(f.name); }).map(function (f) {
        return { name: f.name, url: sb.storage.from(BUCKET).getPublicUrl(FOLDER + '/' + f.name).data.publicUrl, size: f.metadata && f.metadata.size, created_at: f.created_at };
      });
      return S.media;
    });
  }
  function usedImages() {
    var out = [], seen = {};
    (function walk(o) {
      if (Array.isArray(o)) o.forEach(walk);
      else if (isObj(o)) Object.keys(o).forEach(function (k) {
        var v = o[k];
        if (typeof v === 'string' && /(image|panorama|loaderImage)$/i.test(k) && v && !seen[v]) { seen[v] = 1; out.push(v); }
        else walk(v);
      });
    })(S.draft);
    return out;
  }

  /* ================= field rendering ================= */
  var fid = 0;
  function nid() { return 'f' + (++fid); }

  function F(f, path) {
    if (f.type === 'group') {
      return '<div class="card"><div class="card-h"><div><h3>' + esc(f.label) + '</h3>' + (f.hint ? '<p>' + esc(f.hint) + '</p>' : '') + '</div></div><div class="grid2">' +
        f.fields.map(function (g) { return F(g, g.path); }).join('') + '</div></div>';
    }
    var v = getP(S.draft, path), id = nid(), cls = f.full ? ' span-all' : '';
    var hint = f.hint ? '<p class="f-hint">' + esc(f.hint) + '</p>' : '';
    switch (f.type) {
      case 'text': case 'url': case 'email':
        return '<div class="f' + cls + '"><label for="' + id + '">' + esc(f.label) + '</label><input class="inp" id="' + id + '" type="' + (f.type === 'text' ? 'text' : f.type) + '" data-path="' + path + '" value="' + esc(v) + '"' + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') + '>' + hint + '</div>';
      case 'textarea':
        return '<div class="f' + cls + '"><label for="' + id + '">' + esc(f.label) + '</label><textarea class="inp" id="' + id + '" data-path="' + path + '" rows="' + (f.rows || 3) + '"' + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') + '>' + esc(v) + '</textarea>' + hint + '</div>';
      case 'int':
        return '<div class="f' + cls + '"><label for="' + id + '">' + esc(f.label) + '</label><input class="inp" id="' + id + '" type="number" inputmode="numeric" min="' + (f.min || 0) + '" step="1" data-kind="int" data-path="' + path + '" value="' + esc(v == null ? '' : v) + '">' + hint + '</div>';
      case 'price':
        return '<div class="f' + cls + '"><label for="' + id + '">' + esc(f.label) + '</label><div class="price-wrap"><span>IDR</span><input class="inp" id="' + id + '" type="text" inputmode="numeric" data-kind="price" data-path="' + path + '" value="' + esc(v ? Math.round(v).toLocaleString('en-US') : '') + '" placeholder="Kosong = On request"></div>' +
          '<p class="f-hint">' + (v ? 'Tampil: ' + esc(idr(v)) : 'Kosongkan bila harga ditanyakan lewat WhatsApp.') + '</p></div>';
      case 'select':
        return '<div class="f' + cls + '"><label for="' + id + '">' + esc(f.label) + '</label><select class="inp" id="' + id + '" data-path="' + path + '">' +
          f.options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(v) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' + hint + '</div>';
      case 'toggle':
        return '<div class="f' + cls + '"><label class="toggle"><input type="checkbox" data-path="' + path + '"' + (v !== false && v ? ' checked' : '') + '><span class="sw"></span>' + esc(f.label) + '</label>' + hint + '</div>';
      case 'image': return imageField(f, path, v);
      case 'strings': return stringsField(f, path, v || []);
      case 'list': return listField(f, path, v || []);
    }
    return '';
  }
  function imageField(f, path, v) {
    var busy = S.busy[path];
    return '<div class="f' + (f.full ? ' span-all' : '') + '">' + (f.label ? '<span class="f-label">' + esc(f.label) + '</span>' : '') +
      '<div class="imgf"><div class="thumb ' + (f.shape || '') + '">' +
      (v ? '<button type="button" class="thumb-btn" data-act="view" data-src="' + esc(v) + '" aria-label="Lihat foto besar"><img src="' + esc(resolveImg(v)) + '" alt="" loading="lazy"></button>' : '') +
      (busy ? '<div class="busy">Mengunggah…</div>' : '') + '</div>' +
      '<div class="imgf-side">' + (f.hint ? '<p class="f-hint">' + esc(f.hint) + '</p>' : '') +
      '<div class="imgf-actions"><button type="button" class="btn btn-sm" data-act="img-upload" data-path="' + path + '" data-max="' + (f.max || 2000) + '"' + (busy ? ' disabled' : '') + '>' + ic('upload', 16) + 'Unggah foto</button>' +
      '<button type="button" class="btn btn-sm" data-act="img-pick" data-path="' + path + '">' + ic('image', 16) + 'Pilih dari pustaka</button>' +
      (v && f.optional ? '<button type="button" class="btn btn-sm btn-ghost btn-danger" data-act="img-clear" data-path="' + path + '">Hapus</button>' : '') +
      '</div></div></div></div>';
  }
  function tools(path, i, n) {
    return '<div class="item-tools">' +
      '<button type="button" class="btn btn-ghost btn-icon" data-act="mv" data-path="' + path + '" data-i="' + i + '" data-d="-1" aria-label="Naikkan"' + (i === 0 ? ' disabled' : '') + '>' + ic('up', 16) + '</button>' +
      '<button type="button" class="btn btn-ghost btn-icon" data-act="mv" data-path="' + path + '" data-i="' + i + '" data-d="1" aria-label="Turunkan"' + (i === n - 1 ? ' disabled' : '') + '>' + ic('down', 16) + '</button>' +
      '<button type="button" class="btn btn-ghost btn-icon btn-danger" data-act="del" data-path="' + path + '" data-i="' + i + '" aria-label="Hapus">' + ic('trash', 16) + '</button></div>';
  }
  function stringsField(f, path, arr) {
    return '<div class="f span-all"><span class="f-label">' + esc(f.label) + '</span>' + (f.hint ? '<p class="f-hint">' + esc(f.hint) + '</p>' : '') +
      '<div class="list">' + arr.map(function (s, i) {
        var p = path + '.' + i;
        return '<div class="row" style="flex-wrap:nowrap;align-items:flex-start">' +
          (f.multi ? '<textarea class="inp" rows="3" data-path="' + p + '" aria-label="' + esc(f.label) + ' ' + (i + 1) + '">' + esc(s) + '</textarea>'
            : '<input class="inp" data-path="' + p + '" value="' + esc(s) + '" aria-label="' + esc(f.label) + ' ' + (i + 1) + '">') +
          tools(path, i, arr.length) + '</div>';
      }).join('') + '</div>' +
      '<div class="add-row" style="margin-top:8px"><button type="button" class="btn btn-sm" data-act="add" data-path="' + path + '" data-kind="string">' + ic('plus', 16) + esc(f.add || 'Tambah') + '</button></div></div>';
  }
  function listField(f, path, arr) {
    var imgF = f.item.filter(function (x) { return x.type === 'image'; })[0];
    var rest = f.item.filter(function (x) { return x !== imgF; });
    var head = '<div class="span-all"><div class="card-h" style="margin-bottom:12px"><div><h3>' + esc(f.label) + ' <span class="chip">' + arr.length + '</span></h3>' + (f.hint ? '<p>' + esc(f.hint) + '</p>' : '') + '</div></div>';
    if (f.grid) {
      return head + '<div class="list-grid">' + arr.map(function (it, i) {
        var p = path + '.' + i, v = it[imgF.key];
        return '<div class="gcard"><div class="thumb">' +
          (v ? '<button type="button" class="thumb-btn" data-act="view" data-src="' + esc(v) + '" aria-label="Lihat foto besar"><img src="' + esc(resolveImg(v)) + '" alt="" loading="lazy"></button>' : '') +
          '<span class="gcard-n">' + (i + 1) + '</span>' + (S.busy[p + '.' + imgF.key] ? '<div class="busy">Mengunggah…</div>' : '') + '</div>' +
          '<div class="gcard-body">' + rest.map(function (g) { return F(g, p + '.' + g.key); }).join('') +
          '<div class="gcard-tools"><button type="button" class="btn btn-sm" data-act="img-upload" data-path="' + p + '.' + imgF.key + '" data-max="' + (imgF.max || 2000) + '">' + ic('upload', 15) + 'Ganti</button>' +
          '<button type="button" class="btn btn-sm btn-ghost btn-icon" data-act="img-pick" data-path="' + p + '.' + imgF.key + '" aria-label="Pilih dari pustaka">' + ic('image', 16) + '</button>' +
          '<span class="spacer"></span>' + tools(path, i, arr.length) + '</div></div></div>';
      }).join('') +
        '<button type="button" class="add-tile" data-act="bulk" data-path="' + path + '" data-key="' + imgF.key + '">' + ic('upload', 26) + '<span>Unggah foto baru<br><span class="small" style="font-weight:500">Bisa pilih beberapa sekaligus</span></span></button>' +
        '</div></div>';
    }
    return head + '<div class="list">' + arr.map(function (it, i) {
      var p = path + '.' + i;
      var title = (f.titleKey && it[f.titleKey]) || (f.itemName || 'Item') + ' ' + (i + 1);
      return '<div class="item"><div class="item-head"><span class="item-num">' + (i + 1) + '</span><span class="item-title">' + esc(title) + '</span>' + tools(path, i, arr.length) + '</div>' +
        '<div class="item-body' + (imgF ? ' with-img' : '') + '">' +
        (imgF ? '<div class="item-img">' + imageField(imgF, p + '.' + imgF.key, it[imgF.key]) + '</div>' : '') +
        (imgF ? '<div class="item-fields">' : '') + rest.map(function (g) { return F(g, p + '.' + g.key); }).join('') + (imgF ? '</div>' : '') +
        '</div></div>';
    }).join('') + '</div>' +
      '<div class="add-row"><button type="button" class="btn" data-act="add" data-path="' + path + '">' + ic('plus', 16) + esc(f.add || 'Tambah') + '</button></div></div>';
  }

  /* ================= pages ================= */
  var T = function (path, label, extra) { var o = { type: 'text', path: path, label: label }; for (var k in extra) o[k] = extra[k]; return o; };
  var PAGES = [
    { id: 'dashboard', title: 'Ringkasan', icon: 'home', group: 'main' },
    {
      id: 'hero', title: 'Halaman depan', icon: 'hero', group: 'web', cover: 'hero.image',
      desc: 'Foto utama, judul besar yang muncul huruf per huruf, dan layar loading.',
      fields: [
        { type: 'image', path: 'hero.image', label: 'Foto utama (wallpaper depan)', shape: 'wide', full: true, max: 2400, hint: 'Pakai foto horizontal yang terang & tajam, lebar minimal 1600 px. Foto otomatis dikecilkan.' },
        T('hero.titleLine1', 'Judul baris 1'), T('hero.titleLine2', 'Judul baris 2'),
        T('brand.location', 'Teks kecil di atas judul'),
        { type: 'textarea', path: 'hero.subtitle', label: 'Kalimat di bawah judul', full: true, rows: 2 },
        T('hero.ctaPrimary', 'Tulisan tombol utama'), T('hero.ctaSecondary', 'Tulisan tombol tour 360°'),
        { type: 'image', path: 'brand.loaderImage', label: 'Gambar layar loading (9:16)', shape: 'tall', full: true, hint: 'Logo berdiri ukuran 9:16. Garis loading muncul otomatis di bawah logo.' }
      ]
    },
    {
      id: 'about', title: 'Tentang villa', icon: 'about', group: 'web', cover: 'about.slides.0.image',
      desc: 'Bagian "What is Mula Bali": cerita villa, angka singkat, dan slider foto 7:10.',
      fields: [
        T('about.eyebrow', 'Label kecil'), T('about.title', 'Judul'),
        { type: 'strings', path: 'about.paragraphs', label: 'Paragraf cerita', add: 'Tambah paragraf', multi: true },
        { type: 'list', path: 'about.stats', label: 'Angka singkat', add: 'Tambah angka', itemName: 'Angka', titleKey: 'label', hint: 'Maksimal 4 agar tetap rapi.', item: [{ type: 'text', key: 'value', label: 'Angka' }, { type: 'text', key: 'label', label: 'Keterangan' }], blank: function () { return { value: '', label: '' }; } },
        { type: 'list', path: 'about.slides', label: 'Foto slider (7:10)', add: 'Tambah foto', grid: true, hint: 'Tamu menggeser foto-foto ini. Urutan pertama tampil paling awal.', item: [{ type: 'image', key: 'image' }, { type: 'text', key: 'caption', label: 'Keterangan' }], blank: function () { return { image: '', caption: '' }; } }
      ]
    },
    {
      id: 'gallery', title: 'Galeri', icon: 'gallery', group: 'web', cover: 'gallery.photos.0.image',
      desc: 'Foto-foto galeri. Tamu bisa klik untuk melihat besar.',
      fields: [
        T('gallery.eyebrow', 'Label kecil'), T('gallery.title', 'Judul'),
        { type: 'textarea', path: 'gallery.text', label: 'Kalimat pengantar', full: true, rows: 2 },
        { type: 'list', path: 'gallery.photos', label: 'Foto galeri', grid: true, hint: '"Foto tinggi" mengambil 2 baris; cocok untuk foto berdiri.', item: [{ type: 'image', key: 'image' }, { type: 'text', key: 'caption', label: 'Keterangan' }, { type: 'toggle', key: 'tall', label: 'Foto tinggi' }], blank: function () { return { image: '', caption: '', tall: false }; } }
      ]
    },
    {
      id: 'tour', title: 'Tour 360°', icon: 'tour', group: 'web', cover: 'tour.panorama',
      desc: 'Foto panorama yang bisa digeser tamu.',
      fields: [
        { type: 'toggle', path: 'tour.show', label: 'Tampilkan bagian tour 360° di website', full: true },
        T('tour.eyebrow', 'Label kecil'), T('tour.title', 'Judul'),
        { type: 'textarea', path: 'tour.text', label: 'Kalimat pengantar', full: true, rows: 2 },
        { type: 'image', path: 'tour.panorama', label: 'Foto panorama 360°', shape: 'pano', full: true, max: 6000, hint: 'Foto panorama memanjang (idealnya 2:1) dari kamera 360 atau mode panorama HP.' }
      ]
    },
    {
      id: 'rates', title: 'Harga', icon: 'rates', group: 'web', cover: 'rates.standard.image',
      desc: 'Kartu harga Standard dan Long stay. Total di "Add to your stay" ikut berubah.',
      fields: [
        T('rates.eyebrow', 'Label kecil'), T('rates.title', 'Judul'),
        { type: 'textarea', path: 'rates.text', label: 'Kalimat pengantar', full: true, rows: 2 },
        { type: 'int', path: 'rates.longStayFrom', label: 'Long stay mulai dari (malam)', min: 2 },
        { type: 'int', path: 'rates.maxGuests', label: 'Maksimal tamu', min: 1 },
        { type: 'group', label: 'Standard stay', fields: [
          T('rates.standard.label', 'Nama paket'), T('rates.standard.nights', 'Keterangan malam'),
          { type: 'price', path: 'rates.standard.price', label: 'Harga per malam' }, T('rates.standard.button', 'Tulisan tombol'),
          { type: 'image', path: 'rates.standard.image', label: 'Foto kartu', full: true, shape: 'wide' },
          { type: 'strings', path: 'rates.standard.features', label: 'Yang termasuk', add: 'Tambah poin' }
        ] },
        { type: 'group', label: 'Long stay', fields: [
          T('rates.long.label', 'Nama paket'), T('rates.long.nights', 'Keterangan malam'),
          { type: 'price', path: 'rates.long.price', label: 'Harga per malam' }, T('rates.long.button', 'Tulisan tombol'),
          T('rates.long.badge', 'Label pojok (mis. Best value)'),
          { type: 'image', path: 'rates.long.image', label: 'Foto kartu', full: true, shape: 'wide' },
          { type: 'strings', path: 'rates.long.features', label: 'Yang termasuk', add: 'Tambah poin' }
        ] },
        { type: 'textarea', path: 'rates.note', label: 'Catatan di bawah harga (pajak, service, dll.)', full: true, rows: 2 }
      ]
    },
    {
      id: 'addons', title: 'Add-on', icon: 'addons', group: 'web', cover: 'addons.items.0.image',
      desc: 'Layanan tambahan di "Add to your stay": foto, harga, dan detail pop-up.',
      fields: [
        { type: 'toggle', path: 'addons.show', label: 'Tampilkan bagian "Add to your stay"', full: true },
        T('addons.eyebrow', 'Label kecil'), T('addons.title', 'Judul'),
        { type: 'textarea', path: 'addons.text', label: 'Kalimat pengantar', full: true, rows: 2 },
        {
          type: 'list', path: 'addons.items', label: 'Daftar add-on', add: 'Tambah add-on', itemName: 'Add-on', titleKey: 'name',
          item: [
            { type: 'image', key: 'image', shape: 'wide' },
            { type: 'text', key: 'name', label: 'Nama' },
            { type: 'price', key: 'price', label: 'Harga' },
            { type: 'text', key: 'unit', label: 'Satuan harga', ph: 'per person / per stay' },
            { type: 'select', key: 'mode', label: 'Cara memilih', options: [['once', 'Sekali per menginap (tombol Add)'], ['guest', 'Per orang (maks. jumlah tamu)'], ['qty', 'Jumlah bebas (− / +)']] },
            { type: 'int', key: 'max', label: 'Jumlah maksimal (untuk "jumlah bebas")', min: 1 },
            { type: 'textarea', key: 'desc', label: 'Deskripsi singkat (di kartu)', full: true, rows: 2 },
            { type: 'textarea', key: 'detail', label: 'Detail di pop-up (durasi, jam, yang termasuk)', full: true, rows: 3 }
          ],
          blank: function () { return { id: 'addon-' + uid(), name: 'Add-on baru', desc: '', detail: '', unit: 'per stay', price: null, mode: 'once', max: 1, image: '' }; }
        }
      ]
    },
    {
      id: 'contact', title: 'Kontak & booking', icon: 'contact', group: 'web', cover: 'about.slides.1.image',
      desc: 'Nomor WhatsApp (semua tombol WA ikut berubah), link booking, langkah booking, dan media sosial.',
      fields: [
        { type: 'group', label: 'Kontak', fields: [
          { type: 'text', path: 'contact.whatsapp', label: 'Nomor WhatsApp', hint: 'Boleh ditulis 0878… atau 62878…', ph: '6287823085069' },
          T('contact.whatsappDisplay', 'Nomor yang ditampilkan', { ph: '+62 878-2308-5069' }),
          { type: 'email', path: 'contact.email', label: 'Email' },
          T('contact.address', 'Alamat singkat'),
          { type: 'url', path: 'contact.mapsUrl', label: 'Link Google Maps', ph: 'https://maps.app.goo.gl/…', full: true }
        ] },
        { type: 'group', label: 'Link booking', hint: 'Link yang dikosongkan tidak ditampilkan.', fields: [
          { type: 'list', path: 'booking.links', label: 'Platform booking', add: 'Tambah platform', itemName: 'Platform', titleKey: 'name', item: [{ type: 'text', key: 'name', label: 'Nama' }, { type: 'url', key: 'url', label: 'Link', ph: 'https://' }], blank: function () { return { name: '', url: '' }; } }
        ] },
        { type: 'group', label: 'Cara booking', fields: [
          T('booking.eyebrow', 'Label kecil'), T('booking.title', 'Judul'),
          { type: 'list', path: 'booking.steps', label: 'Langkah', add: 'Tambah langkah', itemName: 'Langkah', titleKey: 'title', item: [{ type: 'text', key: 'title', label: 'Judul langkah' }, { type: 'textarea', key: 'text', label: 'Penjelasan', rows: 2 }], blank: function () { return { title: '', text: '' }; } }
        ] },
        { type: 'group', label: 'Media sosial', hint: 'Tampil kecil di bagian paling bawah website.', fields: [
          { type: 'list', path: 'social', label: 'Akun', add: 'Tambah akun', itemName: 'Akun', titleKey: 'name', item: [{ type: 'text', key: 'name', label: 'Nama', ph: 'Instagram' }, { type: 'url', key: 'url', label: 'Link', ph: 'https://' }], blank: function () { return { name: '', url: '' }; } }
        ] }
      ]
    },
    {
      id: 'settings', title: 'Pengaturan', icon: 'settings', group: 'web', cover: 'brand.loaderImage',
      desc: 'Nama villa dan teks yang tampil di Google / saat link dibagikan.',
      fields: [
        T('brand.name', 'Nama villa'),
        T('seo.title', 'Judul di Google & tab browser', { full: true }),
        { type: 'textarea', path: 'seo.description', label: 'Deskripsi di Google', full: true, rows: 3, hint: 'Sekitar 150 karakter.' }
      ]
    },
    { id: 'media', title: 'Pustaka foto', icon: 'media', group: 'tools' },
    { id: 'staff', title: 'Karyawan', icon: 'staff', group: 'tools', owner: true },
    { id: 'history', title: 'Riwayat', icon: 'history', group: 'tools' }
  ];
  function pageDef(id) { return PAGES.filter(function (p) { return p.id === id; })[0] || PAGES[0]; }
  function findField(path) {
    var found = null;
    function scan(list) {
      (list || []).forEach(function (f) {
        if (f.path === path) found = f;
        if (f.fields) scan(f.fields);
      });
    }
    PAGES.forEach(function (p) { scan(p.fields); });
    return found;
  }

  function renderPage() {
    var p = pageDef(S.page);
    if (p.id === 'dashboard') return dashboard();
    if (p.id === 'media') return mediaPage();
    if (p.id === 'staff') return staffPage();
    if (p.id === 'history') return historyPage();
    var simple = p.fields.filter(function (f) { return f.type !== 'group' && f.type !== 'list'; });
    var big = p.fields.filter(function (f) { return f.type === 'group' || f.type === 'list'; });
    var html = '<div class="page-head"><div><h2>' + esc(p.title) + '</h2><p>' + esc(p.desc || '') + '</p></div>' +
      '<a class="btn btn-sm" href="' + esc(SITE + '#' + ({ hero: 'top', contact: 'contact', addons: 'extras', settings: 'top' }[p.id] || p.id)) + '" target="_blank" rel="noopener">' + ic('ext', 16) + 'Lihat di website</a></div>';
    // gabungkan field berurutan: blok sederhana dalam satu kartu, grup/list di kartu sendiri
    var out = [], buf = [];
    function flush() { if (buf.length) { out.push('<div class="card"><div class="grid2">' + buf.join('') + '</div></div>'); buf = []; } }
    p.fields.forEach(function (f) {
      if (f.type === 'group') { flush(); out.push(F(f)); }
      else if (f.type === 'list') { flush(); out.push('<div class="card"><div class="grid2">' + F(f, f.path) + '</div></div>'); }
      else buf.push(F(f, f.path));
    });
    flush();
    return html + out.join('');
  }

  function dashboard() {
    var d = S.draft, name = S.user.name.split(' ')[0];
    var never = !S.saved;
    var tiles = PAGES.filter(function (p) { return p.group === 'web'; }).map(function (p) {
      var cov = p.cover ? getP(d, p.cover) : '';
      return '<button type="button" class="tile" data-act="nav" data-page="' + p.id + '"><div class="tile-img" style="' + (cov ? 'background-image:url(\'' + esc(resolveImg(cov)) + '\')' : 'background:#EFE6DB') + '"></div>' +
        '<div class="tile-body"><b>' + esc(p.title) + '</b><span>' + esc(p.desc || '') + '</span></div></button>';
    }).join('');
    var price = d.rates.standard.price;
    return (pendingLocal ? '<div class="note note-warn" style="margin-bottom:16px"><div class="row" style="justify-content:space-between"><span><b>Ada perubahan yang belum disimpan</b> dari ' + esc(when(new Date(pendingLocal.at).toISOString())) + '.</span>' +
      '<span class="row"><button class="btn btn-sm" data-act="local-drop">Buang</button><button class="btn btn-sm btn-primary" data-act="local-use">Lanjutkan perubahan itu</button></span></div></div>' : '') +
      '<div class="dash-hero" style="background-image:url(\'' + esc(resolveImg(d.hero.image)) + '\')"><div class="dash-hero-in">' +
      '<h2>Halo, ' + esc(name) + '</h2><p>' + (never ? 'Website belum pernah diterbitkan dari admin. Cek isinya, lalu klik <b>Simpan & terbitkan</b>.' :
        (S.savedAt ? 'Terakhir diterbitkan ' + esc(when(S.savedAt)) + (S.savedBy ? ' oleh ' + esc(S.savedBy) : '') + '.' : 'Semua perubahan sudah tersimpan.')) + '</p>' +
      '<div class="row"><a class="btn btn-primary" href="' + esc(SITE || '#') + '" target="_blank" rel="noopener">' + ic('ext', 16) + 'Lihat website</a>' +
      '<button class="btn" data-act="nav" data-page="gallery">' + ic('gallery', 16) + 'Ganti foto galeri</button></div></div></div>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + (d.gallery.photos || []).length + '</b><span>Foto galeri</span></div>' +
      '<div class="stat"><b>' + (d.about.slides || []).length + '</b><span>Foto slider</span></div>' +
      '<div class="stat"><b>' + (d.addons.items || []).length + '</b><span>Add-on</span></div>' +
      '<div class="stat"><b style="font-size:22px;padding:5px 0 3px">' + (price ? esc(idr(price)) : 'On request') + '</b><span>Harga standard / malam</span></div>' +
      '</div><div class="card-h" style="margin-top:8px"><div><h3>Ubah bagian website</h3><p>Pilih bagian yang ingin diganti.</p></div></div><div class="tiles">' + tiles + '</div>';
  }

  function mediaPage() {
    var head = '<div class="page-head"><div><h2>Pustaka foto</h2><p>Semua foto yang pernah diunggah. Foto dikecilkan otomatis sebelum diunggah agar website tetap cepat.</p></div>' +
      '<button class="btn btn-primary" data-act="media-upload">' + ic('upload', 16) + 'Unggah foto</button></div>' +
      '<div class="drop" id="drop">Tarik foto ke sini, atau klik <b>Unggah foto</b>. Bisa beberapa sekaligus.</div>';
    if (!S.media) {
      listMedia().then(function () { if (S.page === 'media') renderApp(); }).catch(function (e) { toast(errMsg(e), 'err'); S.media = []; renderApp(); });
      return head + '<div class="spin"></div>';
    }
    var usedStr = JSON.stringify(S.draft);
    var builtIn = usedImages().filter(function (u) { return !/^https?:|^blob:/.test(u); });
    var cell = function (url, name, used, deletable) {
      return '<div class="mcell"><div class="thumb"><button type="button" class="thumb-btn" data-act="view" data-src="' + esc(url) + '" aria-label="Lihat foto besar"><img src="' + esc(resolveImg(url)) + '" alt="" loading="lazy"></button>' +
        (used ? '<span class="chip chip-ok used">Dipakai</span>' : '') + '</div>' +
        '<div class="mcell-foot"><span title="' + esc(name) + '">' + esc(name) + '</span>' +
        (deletable ? '<button class="btn btn-ghost btn-icon btn-danger" data-act="media-del" data-name="' + esc(name) + '" data-url="' + esc(url) + '" aria-label="Hapus foto">' + ic('trash', 15) + '</button>' : '') + '</div></div>';
    };
    return head +
      '<div class="card mt"><div class="card-h"><div><h3>Unggahan <span class="chip">' + S.media.length + '</span></h3></div></div>' +
      (S.media.length ? '<div class="media-grid">' + S.media.map(function (m) { return cell(m.url, m.name, usedStr.indexOf(m.url) > -1, true); }).join('') + '</div>' :
        '<p class="empty">Belum ada foto yang diunggah.</p>') + '</div>' +
      '<div class="card"><div class="card-h"><div><h3>Foto bawaan website <span class="chip">' + builtIn.length + '</span></h3><p>Foto yang ikut dari website awal. Tetap bisa dipakai lewat "Pilih dari pustaka".</p></div></div>' +
      '<div class="media-grid">' + builtIn.map(function (u) { return cell(u, u.split('/').pop(), true, false); }).join('') + '</div></div>';
  }

  function staffPage() {
    var head = '<div class="page-head"><div><h2>Karyawan</h2><p>Siapa saja yang boleh masuk admin. <b>Pemilik</b> bisa mengelola karyawan; <b>Editor</b> bisa mengubah isi website.</p></div></div>';
    if (!S.staff) {
      var load = DEMO ? Promise.resolve({ data: demoStore.staff }) : sb.from('staff').select('*').order('created_at');
      load.then(function (r) { if (r.error) throw r.error; S.staff = r.data || []; if (S.page === 'staff') renderApp(); })
        .catch(function (e) { toast(errMsg(e), 'err'); S.staff = []; renderApp(); });
      return head + '<div class="spin"></div>';
    }
    var owner = isOwner();
    var rows = S.staff.map(function (s) {
      var me = s.email === S.user.email;
      return '<tr><td><div class="row" style="flex-wrap:nowrap"><span class="avatar" style="width:32px;height:32px;font-size:12px">' + esc(initials(s.name || s.email)) + '</span><div><b>' + esc(s.name || '-') + '</b>' + (me ? ' <span class="chip chip-clay">Anda</span>' : '') +
        '<div class="small muted">' + esc(s.email) + '</div></div></div></td>' +
        '<td>' + (owner && !me ? '<select class="inp" data-staff="role" data-email="' + esc(s.email) + '" aria-label="Peran ' + esc(s.email) + '"><option value="editor"' + (s.role === 'editor' ? ' selected' : '') + '>Editor</option><option value="owner"' + (s.role === 'owner' ? ' selected' : '') + '>Pemilik</option></select>'
          : '<span class="chip ' + (s.role === 'owner' ? 'chip-clay' : '') + '">' + (s.role === 'owner' ? 'Pemilik' : 'Editor') + '</span>') + '</td>' +
        '<td>' + (owner && !me ? '<label class="toggle"><input type="checkbox" data-staff="active" data-email="' + esc(s.email) + '"' + (s.active ? ' checked' : '') + '><span class="sw"></span><span class="small">' + (s.active ? 'Aktif' : 'Nonaktif') + '</span></label>'
          : '<span class="chip ' + (s.active ? 'chip-ok' : '') + '">' + (s.active ? 'Aktif' : 'Nonaktif') + '</span>') + '</td>' +
        '<td style="text-align:right">' + (owner && !me ? '<button class="btn btn-sm btn-ghost btn-danger" data-act="staff-del" data-email="' + esc(s.email) + '">' + ic('trash', 15) + 'Hapus</button>' : '') + '</td></tr>';
    }).join('');
    return head +
      (owner ? '<div class="card"><div class="card-h"><div><h3>Tambah karyawan</h3><p>Setelah ditambahkan, karyawan membuka admin lalu pilih <b>"Karyawan baru? Buat password"</b> dengan email yang sama.</p></div></div>' +
        '<form data-form2="staff-add" class="grid2"><div class="f"><label for="sn">Nama</label><input class="inp" id="sn" required placeholder="mis. Komang"></div>' +
        '<div class="f"><label for="se">Email</label><input class="inp" id="se" type="email" required placeholder="nama@gmail.com"></div>' +
        '<div class="f"><label for="sr">Peran</label><select class="inp" id="sr"><option value="editor">Editor (ubah isi website)</option><option value="owner">Pemilik (semua + kelola karyawan)</option></select></div>' +
        '<div class="f" style="justify-content:flex-end"><button class="btn btn-primary" type="submit">' + ic('plus', 16) + 'Tambah karyawan</button></div></form></div>'
        : '<div class="note note-info">Hanya pemilik yang bisa menambah atau menghapus karyawan.</div>') +
      '<div class="card"><div class="card-h"><div><h3>Daftar karyawan <span class="chip">' + S.staff.length + '</span></h3></div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Karyawan</th><th>Peran</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  function historyPage() {
    var head = '<div class="page-head"><div><h2>Riwayat</h2><p>Setiap kali disimpan, versi lama tetap tersimpan. Pulihkan bila ada yang salah ubah.</p></div></div>';
    if (!S.history) {
      var load = DEMO ? Promise.resolve({ data: demoStore.history }) : sb.from('content_history').select('id,saved_at,saved_by').order('id', { ascending: false }).limit(60);
      load.then(function (r) { if (r.error) throw r.error; S.history = r.data || []; if (S.page === 'history') renderApp(); })
        .catch(function (e) { toast(errMsg(e), 'err'); S.history = []; renderApp(); });
      return head + '<div class="spin"></div>';
    }
    if (!S.history.length) return head + '<div class="card"><p class="empty">Belum ada riwayat. Riwayat muncul setelah perubahan pertama disimpan.</p></div>';
    return head + '<div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Disimpan oleh</th><th></th></tr></thead><tbody>' +
      S.history.map(function (h, i) {
        return '<tr><td><b>' + esc(when(h.saved_at)) + '</b>' + (i === 0 ? ' <span class="chip chip-ok">Sedang tayang</span>' : '') + '</td><td>' + esc(h.saved_by || '-') + '</td>' +
          '<td style="text-align:right">' + (i === 0 ? '' : '<button class="btn btn-sm" data-act="restore" data-id="' + h.id + '">' + ic('restore', 15) + 'Pulihkan versi ini</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ================= shell ================= */
  function renderApp() {
    fid = 0;
    var p = pageDef(S.page);
    if (p.owner && !isOwner() && p.id !== 'staff') S.page = 'dashboard';
    var navItem = function (x) {
      return '<button type="button" class="nav-item' + (x.id === S.page ? ' active' : '') + '" data-act="nav" data-page="' + x.id + '"' + (x.id === S.page ? ' aria-current="page"' : '') + '>' + ic(x.icon) + esc(x.title) + '</button>';
    };
    var dirty = isDirty();
    var y = window.scrollY;
    root.innerHTML =
      (DEMO ? '<div class="demo-bar"><b>MODE DEMO</b> · Admin belum disambungkan ke database. Perubahan tidak tersimpan.</div>' : '') +
      '<div class="app">' +
      (S.sideOpen ? '<div class="side-scrim" data-act="menu"></div>' : '') +
      '<aside class="side' + (S.sideOpen ? ' open' : '') + '" aria-label="Menu admin"><div class="side-brand"><p class="wordmark" style="margin:0">MULA BALI</p><p class="wordmark-sub" style="margin:8px 0 0">BAMBOO VILLAS</p><span class="side-tag">Admin</span></div>' +
      '<nav>' + navItem(PAGES[0]) + '<p class="side-h">Isi website</p>' + PAGES.filter(function (x) { return x.group === 'web'; }).map(navItem).join('') +
      '<p class="side-h">Kelola</p>' + PAGES.filter(function (x) { return x.group === 'tools'; }).map(navItem).join('') + '</nav>' +
      '<div class="side-user"><span class="avatar">' + esc(initials(S.user.name)) + '</span><div class="side-user-txt"><p>' + esc(S.user.name) + '</p><span>' + (isOwner() ? 'Pemilik' : 'Editor') + '</span></div>' +
      '<button class="btn btn-icon" data-act="logout" aria-label="Keluar" title="Keluar">' + ic('out', 17) + '</button></div></aside>' +
      '<div class="main"><header class="top"><div class="top-in">' +
      '<button class="btn btn-icon btn-ghost menu-btn" data-act="menu" aria-label="Buka menu">' + ic('menu', 20) + '</button>' +
      '<div class="top-title"><p>Admin Mula Bali</p><h1>' + esc(p.title) + '</h1></div>' +
      '<span id="statusPill" class="status ' + (dirty ? 'status-dirty' : 'status-ok') + '"><i></i><span>' + (dirty ? (S.saved ? 'Belum disimpan' : 'Belum diterbitkan') : 'Tersimpan') + '</span></span>' +
      '<button class="btn btn-ghost btn-sm hide-sm" id="discardBtn" data-act="discard"' + (dirty && S.saved ? '' : ' hidden') + '>Batalkan</button>' +
      '<button class="btn btn-primary" id="saveBtn" data-act="save"' + (dirty ? '' : ' disabled') + '>' + ic('check', 16) + '<span>Simpan<span class="hide-sm"> &amp; terbitkan</span></span></button>' +
      '</div></header><div class="content" id="content">' + renderPage() + '</div></div></div>';
    window.scrollTo(0, y);
    bindDrop();
  }
  function updateStatus() {
    var dirty = isDirty();
    var pill = document.getElementById('statusPill'), btn = document.getElementById('saveBtn'), dis = document.getElementById('discardBtn');
    if (pill) { pill.className = 'status ' + (dirty ? 'status-dirty' : 'status-ok'); pill.querySelector('span').textContent = dirty ? (S.saved ? 'Belum disimpan' : 'Belum diterbitkan') : 'Tersimpan'; }
    if (btn) btn.disabled = !dirty;
    if (dis) dis.hidden = !(dirty && S.saved);
    stashLocal();
  }
  function go(page) {
    S.page = page; S.sideOpen = false;
    if (page === 'media') S.media = S.media; // dimuat bila perlu
    renderApp(); window.scrollTo(0, 0);
  }

  /* ================= events ================= */
  function inputValue(el) {
    if (el.type === 'checkbox') return el.checked;
    var k = el.getAttribute('data-kind');
    if (k === 'int') { var n = parseInt(el.value, 10); return isNaN(n) ? null : n; }
    if (k === 'price') { var d = String(el.value).replace(/[^\d]/g, ''); return d ? parseInt(d, 10) : null; }
    return el.value;
  }
  root.addEventListener('input', function (e) {
    var el = e.target, path = el.getAttribute && el.getAttribute('data-path');
    if (!path || el.type === 'checkbox' || el.tagName === 'SELECT') return;
    setP(S.draft, path, inputValue(el));
    if (el.getAttribute('data-kind') === 'price') {
      var v = inputValue(el), hint = el.parentNode.parentNode.querySelector('.f-hint');
      if (hint) hint.textContent = v ? 'Tampil: ' + idr(v) : 'Kosongkan bila harga ditanyakan lewat WhatsApp.';
    }
    var item = el.closest('.item');
    if (item) {
      var tEl = item.querySelector('.item-title'), key = path.split('.').pop();
      var lf = null; // perbarui judul item bila field judul diubah
      PAGES.forEach(function (p) { (p.fields || []).forEach(function scan(f) { if (f.type === 'list' && path.indexOf(f.path + '.') === 0) lf = f; (f.fields || []).forEach(scan); }); });
      if (lf && lf.titleKey === key && tEl) tEl.textContent = el.value || (lf.itemName || 'Item');
    }
    updateStatus();
  });
  root.addEventListener('change', function (e) {
    var el = e.target;
    var path = el.getAttribute && el.getAttribute('data-path');
    if (path && (el.type === 'checkbox' || el.tagName === 'SELECT')) { setP(S.draft, path, inputValue(el)); updateStatus(); return; }
    if (path && el.getAttribute('data-kind') === 'price') { renderApp(); return; }
    var sk = el.getAttribute && el.getAttribute('data-staff');
    if (sk) staffUpdate(el.getAttribute('data-email'), sk, sk === 'active' ? el.checked : el.value, el);
  });
  root.addEventListener('submit', function (e) {
    var f = e.target.closest('[data-form2="staff-add"]');
    if (!f) return;
    e.preventDefault();
    var row = { name: f.querySelector('#sn').value.trim(), email: f.querySelector('#se').value.trim().toLowerCase(), role: f.querySelector('#sr').value, active: true };
    if (S.staff.some(function (s) { return s.email === row.email; })) return toast('Email ini sudah terdaftar.', 'err');
    var p = DEMO ? Promise.resolve({ data: [Object.assign({ created_at: new Date().toISOString() }, row)] }) : sb.from('staff').insert(row).select();
    p.then(function (r) {
      if (r.error) throw r.error;
      if (DEMO) demoStore.staff.push(r.data[0]);
      S.staff = null; renderApp(); toast(row.name + ' ditambahkan', 'ok');
    }).catch(function (err) { toast(errMsg(err), 'err'); });
  });

  function staffUpdate(email, field, value, el) {
    var owners = S.staff.filter(function (s) { return s.role === 'owner' && s.active; });
    var target = S.staff.filter(function (s) { return s.email === email; })[0];
    if (!target) return;
    if (target.role === 'owner' && owners.length <= 1 && ((field === 'role' && value !== 'owner') || (field === 'active' && !value))) {
      toast('Harus ada minimal satu pemilik aktif.', 'err'); renderApp(); return;
    }
    var patch = {}; patch[field] = value;
    var p = DEMO ? Promise.resolve({}) : sb.from('staff').update(patch).eq('email', email);
    p.then(function (r) {
      if (r.error) throw r.error;
      target[field] = value; renderApp(); toast('Perubahan karyawan tersimpan', 'ok');
    }).catch(function (err) { toast(errMsg(err), 'err'); S.staff = null; renderApp(); });
  }

  root.addEventListener('click', function (e) {
    var a = e.target.closest('[data-auth]');
    if (a) { showAuth(a.getAttribute('data-auth')); return; }
    var b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    var act = b.getAttribute('data-act'), path = b.getAttribute('data-path');
    switch (act) {
      case 'nav': go(b.getAttribute('data-page')); break;
      case 'menu': S.sideOpen = !S.sideOpen; renderApp(); break;
      case 'save': save(); break;
      case 'discard':
        confirmBox('Batalkan perubahan?', 'Semua perubahan sejak terakhir disimpan akan dibuang.', 'Buang perubahan', true).then(function (y) {
          if (!y) return; S.draft = fill(DEFAULT, JSON.parse(S.saved)); stashLocal(); renderApp();
        });
        break;
      case 'logout':
        (isDirty() ? confirmBox('Keluar tanpa menyimpan?', 'Perubahan yang belum disimpan tetap tersimpan di perangkat ini dan bisa dilanjutkan saat masuk lagi.', 'Keluar') : Promise.resolve(true)).then(function (y) {
          if (!y) return;
          S.user = null; S.draft = null; S.media = S.staff = S.history = null; S.page = 'dashboard';
          if (DEMO) return showAuth('login');
          sb.auth.signOut().then(function () { showAuth('login'); });
        });
        break;
      case 'view': viewPhoto(b.getAttribute('data-src')); break;
      case 'add': {
        var arr = getP(S.draft, path) || [];
        var f = findField(path) || {};
        arr.push(b.getAttribute('data-kind') === 'string' ? '' : (f.blank ? f.blank() : {}));
        setP(S.draft, path, arr); renderApp(); updateStatus();
        var items = document.querySelectorAll('[data-path^="' + path + '.' + (arr.length - 1) + '"]');
        if (items[0] && items[0].focus) { items[0].focus(); items[0].scrollIntoView({ block: 'center' }); }
        break;
      }
      case 'del': {
        var list = getP(S.draft, path), i = +b.getAttribute('data-i');
        list.splice(i, 1); renderApp(); updateStatus(); break;
      }
      case 'mv': {
        var l = getP(S.draft, path), k = +b.getAttribute('data-i'), d = +b.getAttribute('data-d'), j = k + d;
        if (j < 0 || j >= l.length) return;
        var t = l[k]; l[k] = l[j]; l[j] = t; renderApp(); updateStatus(); break;
      }
      case 'img-upload':
        pickFiles(false, function (files) {
          S.busy[path] = true; renderApp();
          uploadFiles(files, +b.getAttribute('data-max') || 2000).then(function (urls) {
            delete S.busy[path];
            if (urls[0]) { setP(S.draft, path, urls[0]); toast('Foto diganti. Jangan lupa Simpan.', 'ok'); }
            renderApp(); updateStatus();
          });
        });
        break;
      case 'bulk':
        pickFiles(true, function (files) {
          toast('Mengunggah ' + files.length + ' foto…');
          uploadFiles(files, 2000).then(function (urls) {
            var arr2 = getP(S.draft, path) || [], f2 = findField(path) || {};
            urls.forEach(function (u) { var o = f2.blank ? f2.blank() : {}; o[b.getAttribute('data-key')] = u; arr2.push(o); });
            setP(S.draft, path, arr2); renderApp(); updateStatus();
            if (urls.length) toast(urls.length + ' foto ditambahkan. Jangan lupa Simpan.', 'ok');
          });
        });
        break;
      case 'img-pick': openPicker(path); break;
      case 'img-clear': setP(S.draft, path, ''); renderApp(); updateStatus(); break;
      case 'media-upload':
        pickFiles(true, function (files) { mediaUpload(files); });
        break;
      case 'media-del': mediaDelete(b.getAttribute('data-name'), b.getAttribute('data-url')); break;
      case 'staff-del': {
        var em = b.getAttribute('data-email');
        var tg = S.staff.filter(function (s) { return s.email === em; })[0];
        var owners = S.staff.filter(function (s) { return s.role === 'owner' && s.active; });
        if (tg && tg.role === 'owner' && owners.length <= 1) return toast('Harus ada minimal satu pemilik aktif.', 'err');
        confirmBox('Hapus karyawan?', em + ' tidak bisa masuk admin lagi.', 'Hapus', true).then(function (y) {
          if (!y) return;
          var p = DEMO ? Promise.resolve({}) : sb.from('staff').delete().eq('email', em);
          p.then(function (r) {
            if (r.error) throw r.error;
            if (DEMO) demoStore.staff = demoStore.staff.filter(function (s) { return s.email !== em; });
            S.staff = null; renderApp(); toast('Karyawan dihapus', 'ok');
          }).catch(function (err) { toast(errMsg(err), 'err'); });
        });
        break;
      }
      case 'restore': restoreVersion(b.getAttribute('data-id')); break;
      case 'local-use':
        S.draft = fill(DEFAULT, pendingLocal.data); pendingLocal = null; renderApp(); toast('Perubahan sebelumnya dilanjutkan. Klik Simpan untuk menerbitkan.'); break;
      case 'local-drop':
        pendingLocal = null; try { localStorage.removeItem(localKey()); } catch (er) {} renderApp(); break;
    }
  });

  function mediaUpload(files) {
    toast('Mengunggah ' + files.length + ' foto…');
    uploadFiles(files, 2400).then(function (urls) {
      S.media = null; renderApp();
      if (urls.length) toast(urls.length + ' foto masuk pustaka', 'ok');
    });
  }
  function mediaDelete(name, url) {
    var used = JSON.stringify(S.draft).indexOf(url) > -1 || (S.saved || '').indexOf(url) > -1;
    confirmBox('Hapus foto?', used ? 'Foto ini sedang dipakai di website. Kalau dihapus, bagian itu akan kosong.' : 'Foto akan dihapus permanen dari pustaka.', 'Hapus foto', true).then(function (y) {
      if (!y) return;
      var p = DEMO ? Promise.resolve({}) : sb.storage.from(BUCKET).remove([FOLDER + '/' + name]);
      p.then(function (r) {
        if (r.error) throw r.error;
        if (DEMO) demoStore.media = demoStore.media.filter(function (m) { return m.name !== name; });
        S.media = null; renderApp(); toast('Foto dihapus', 'ok');
      }).catch(function (err) { toast(errMsg(err), 'err'); });
    });
  }
  function bindDrop() {
    var d = document.getElementById('drop');
    if (!d) return;
    ['dragenter', 'dragover'].forEach(function (ev) { d.addEventListener(ev, function (e) { e.preventDefault(); d.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { d.addEventListener(ev, function (e) { e.preventDefault(); d.classList.remove('over'); }); });
    d.addEventListener('drop', function (e) { if (e.dataTransfer.files.length) mediaUpload(e.dataTransfer.files); });
  }

  function openPicker(path) {
    openModal('<div class="modal-h"><h3>Pilih foto</h3><button class="btn btn-ghost btn-icon" data-m="close" aria-label="Tutup">' + ic('close') + '</button></div><div class="modal-b"><div class="spin"></div></div>', 'big');
    listMedia().catch(function () { return []; }).then(function (media) {
      var seen = {}, all = [];
      media.forEach(function (m) { if (!seen[m.url]) { seen[m.url] = 1; all.push({ url: m.url, name: m.name }); } });
      usedImages().forEach(function (u) { if (!seen[u]) { seen[u] = 1; all.push({ url: u, name: u.split('/').pop() }); } });
      var body = modal.querySelector('.modal-b');
      if (!body) return;
      body.innerHTML = '<div class="row" style="justify-content:space-between;margin-bottom:14px"><p class="muted" style="margin:0">Klik foto untuk memakainya.</p>' +
        '<button class="btn btn-sm btn-primary" data-m="upload">' + ic('upload', 15) + 'Unggah baru</button></div>' +
        '<div class="media-grid">' + all.map(function (m) {
          return '<div class="mcell"><button type="button" class="pick" data-m="pick" data-url="' + esc(m.url) + '"><div class="thumb"><img src="' + esc(resolveImg(m.url)) + '" alt="" loading="lazy"></div>' +
            '<div class="mcell-foot"><span>' + esc(m.name) + '</span></div></button></div>';
        }).join('') + '</div>';
    });
    modal.onclick = function (e) {
      var b = e.target.closest('[data-m]');
      if (!b) return;
      var k = b.getAttribute('data-m');
      if (k === 'close') closeModal();
      if (k === 'pick') { setP(S.draft, path, b.getAttribute('data-url')); closeModal(); renderApp(); updateStatus(); }
      if (k === 'upload') {
        closeModal();
        var f = findField(path);
        pickFiles(false, function (files) {
          S.busy[path] = true; renderApp();
          uploadFiles(files, (f && f.max) || 2000).then(function (urls) {
            delete S.busy[path];
            if (urls[0]) setP(S.draft, path, urls[0]);
            renderApp(); updateStatus();
          });
        });
      }
    };
  }

  function restoreVersion(id) {
    confirmBox('Pulihkan versi ini?', 'Isi versi ini dimuat ke admin. Website belum berubah sampai Anda klik "Simpan & terbitkan".', 'Pulihkan').then(function (y) {
      if (!y) return;
      var p = DEMO ? Promise.resolve({ data: demoStore.history.filter(function (h) { return String(h.id) === String(id); })[0] })
        : sb.from('content_history').select('data').eq('id', id).single();
      p.then(function (r) {
        if (r.error) throw r.error;
        S.draft = fill(DEFAULT, r.data.data); S.page = 'dashboard'; renderApp(); updateStatus();
        toast('Versi lama dimuat. Klik Simpan & terbitkan untuk memakainya.');
      }).catch(function (err) { toast(errMsg(err), 'err'); });
    });
  }

  window.addEventListener('beforeunload', function (e) {
    if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ================= boot ================= */
  function boot() {
    if (DEMO) { showAuth('login'); return; }
    root.innerHTML = '<div class="spin" aria-label="Memuat"></div>';
    loadScript(SUPABASE_JS).then(function () {
      sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      var recovering = /type=recovery/.test(location.hash);
      sb.auth.onAuthStateChange(function (ev) {
        if (ev === 'PASSWORD_RECOVERY') { recovering = true; showAuth('reset'); }
      });
      return sb.auth.getSession().then(function (r) {
        if (recovering) return showAuth('reset');
        var s = r.data && r.data.session;
        if (s && s.user) afterLogin(s.user); else showAuth('login');
      });
    }).catch(function (e) {
      authShell('<h1>Tidak bisa terhubung</h1><div class="note note-err">' + esc(errMsg(e)) + '</div><button class="btn btn-block mt" onclick="location.reload()">Coba lagi</button>');
    });
  }
  boot();
})();
