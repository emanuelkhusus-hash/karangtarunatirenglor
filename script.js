// Configuration
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbzGBzDebA21dTrBKKma2AQ7QkZYubRnnLP6B21vB1aOLbfy9HfBIdNrJzxebeIfD2oe/exec' 
};

// State Management
let currentUser = null;
let allAnnouncements = [];
let allMembers = [];
let months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// DOM Elements
const authSection = document.getElementById('auth-section');
const mainSection = document.getElementById('main-section');
const authForm = document.getElementById('auth-form');
const announcementList = document.getElementById('announcement-list');
const adminActions = document.getElementById('admin-actions');
const modalOverlay = document.getElementById('modal-overlay');
const btnLogout = document.getElementById('btn-logout');
const bottomNavItems = document.querySelectorAll('.nav-item');

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    updateSystemYear();
    checkSession();
    populateMonthFilter();
    setupEventListeners();
});

function updateSystemYear() {
    const year = new Date().getFullYear();
    const yearElements = ['current-year', 'footer-year'];
    yearElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = year;
    });
}


// --- Authentication Functions ---

function checkSession() {
    const savedUser = localStorage.getItem('kt_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showMainScreen();
    } else {
        showAuthScreen();
    }
}

async function handleAuth(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const password = document.getElementById('login-id').value;

    const btn = document.getElementById('btn-login');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner small"></div>';

    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'login',
                nama: name,
                password: password
            })
        });
        const result = await response.json();

        if (result.status === 'success') {
            currentUser = result.data;
            localStorage.setItem('kt_user', JSON.stringify(currentUser));
            showMainScreen();
        } else {
            alert('Gagal login: ' + result.message);
        }
    } catch (error) {
        alert('Terjadi kesalahan koneksi ke server.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function showAuthScreen() {
    authSection.classList.add('active');
    mainSection.classList.remove('active');
}

function showMainScreen() {
    if (!currentUser) return showAuthScreen();
    
    authSection.classList.remove('active');
    mainSection.classList.add('active');
    
    // Update Profile UI
    document.getElementById('display-name').textContent = currentUser.nama;
    document.getElementById('display-role').textContent = currentUser.jabatan;
    document.getElementById('user-avatar').textContent = currentUser.nama.charAt(0).toUpperCase();

    // Check Status Pending
    if (currentUser.status === 'pending') {
        announcementList.innerHTML = `
            <div class="pending-screen">
                <i class="fas fa-clock"></i>
                <h3>Akun Menunggu Persetujuan</h3>
                <p>Halo ${currentUser.nama}, pendaftaran Anda sedang diproses oleh Admin.</p>
                <button onclick="location.reload()" class="btn-primary">Cek Status</button>
            </div>
        `;
        document.getElementById('display-role').textContent = 'Pending Approval';
        adminActions.classList.add('hidden');
        return;
    }

    // Role Check (Case Insensitive)
    const role = currentUser.jabatan.toLowerCase().trim();
    const isPowerUser = ['admin', 'ketua', 'sekretaris', 'bendahara'].includes(role);

    if (isPowerUser) {
        adminActions.classList.remove('hidden');
        if (role === 'admin') checkNotifications();
    } else {
        adminActions.classList.add('hidden');
    }

    fetchAnnouncements();
}

async function checkNotifications() {
    try {
        const response = await fetch(`${CONFIG.API_URL}?action=getMembers`);
        const result = await response.json();
        if (result.status === 'success') {
            const pendingCount = result.data.filter(m => m.status === 'pending').length;
            const badge = document.getElementById('member-badge');
            if (pendingCount > 0) {
                badge.textContent = pendingCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch (e) { console.error(e); }
}

function logout() {
    if (confirm('Yakin ingin keluar?')) {
        localStorage.removeItem('kt_user');
        location.reload();
    }
}

// --- Announcement Functions ---

async function fetchAnnouncements() {
    announcementList.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Mengambil data...</p></div>';
    try {
        const response = await fetch(`${CONFIG.API_URL}?action=getAnnouncements`);
        const result = await response.json();
        if (result.status === 'success') {
            allAnnouncements = result.data;
            renderAnnouncements(allAnnouncements);
        }
    } catch (error) {
        announcementList.innerHTML = '<p class="error-msg">Gagal memuat data.</p>';
    }
}

function renderAnnouncements(data) {
    document.getElementById('announcement-count').textContent = `${data.length} Pesan`;
    if (data.length === 0) {
        announcementList.innerHTML = '<div class="empty-state"><p>Belum ada pengumuman.</p></div>';
        return;
    }

    const isAdmin = currentUser.jabatan.toLowerCase().trim() === 'admin';

    announcementList.innerHTML = data.map((item, index) => `
        <div class="announcement-item" onclick="showDetail(${index})">
            <div class="item-header">
                <span class="author">${item.pengirim_nama} (${item.pengirim_jabatan})</span>
                <div class="header-right">
                    <span class="date">${item.hari} ${item.bulan}</span>
                    ${isAdmin ? `
                        <button onclick="event.stopPropagation(); deletePost('${item.timestamp}')" class="btn-delete-post">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
            <h4>${item.judul}</h4>
            <p>${item.isi}</p>
        </div>
    `).join('');
}

async function deletePost(timestamp) {
    if (!confirm('Hapus pengumuman ini?')) return;
    try {
        const response = await fetch(`${CONFIG.API_URL}?action=deleteAnnouncement&timestamp=${encodeURIComponent(timestamp)}`);
        const result = await response.json();
        if (result.status === 'success') {
            alert('Terhapus!');
            fetchAnnouncements();
        }
    } catch (e) { alert('Gagal menghapus.'); }
}

async function handlePost(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Mengirim...';

    const payload = {
        action: 'postAnnouncement',
        nama: currentUser.nama,
        jabatan: currentUser.jabatan,
        judul: document.getElementById('post-title').value,
        isi: document.getElementById('post-content').value
    };

    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.status === 'success') {
            closeModal();
            fetchAnnouncements();
            e.target.reset();
        }
    } catch (error) {
        alert('Gagal mengirim.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Kirim Pengumuman';
    }
}

// --- Member Management ---

async function fetchMembers() {
    announcementList.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Memuat daftar anggota...</p></div>';
    try {
        const response = await fetch(`${CONFIG.API_URL}?action=getMembers`);
        const result = await response.json();
        if (result.status === 'success') {
            allMembers = result.data;
            renderMembers(allMembers);
        }
    } catch (error) { console.error(error); }
}

function renderMembers(data) {
    document.getElementById('announcement-count').textContent = `${data.length} Anggota`;
    document.querySelector('.section-header h3').textContent = 'Daftar Anggota';
    const isAdmin = currentUser.jabatan.toLowerCase().trim() === 'admin';

    announcementList.innerHTML = data.map(member => `
        <div class="announcement-item member-item ${member.status === 'pending' ? 'is-pending' : ''}">
            <div class="item-header">
                <span class="author">${member.jabatan}</span>
                <span class="status-tag ${member.status}">${member.status === 'pending' ? 'Menunggu' : 'Aktif'}</span>
            </div>
            <h4>${member.nama}</h4>
            <p>Password: ${member.password}</p>
            ${isAdmin ? `
                <div class="admin-tools">
                    ${member.status === 'pending' ? `
                        <button onclick="approveUser('${member.id}')" class="btn-approve">Setujui</button>
                    ` : `
                        <select onchange="changeRole('${member.id}', this.value)" class="role-select">
                            <option value="Anggota" ${member.jabatan === 'Anggota' ? 'selected' : ''}>Anggota</option>
                            <option value="Ketua" ${member.jabatan === 'Ketua' ? 'selected' : ''}>Ketua</option>
                            <option value="Sekretaris" ${member.jabatan === 'Sekretaris' ? 'selected' : ''}>Sekretaris</option>
                            <option value="Bendahara" ${member.jabatan === 'Bendahara' ? 'selected' : ''}>Bendahara</option>
                            <option value="Admin" ${member.jabatan === 'Admin' ? 'selected' : ''}>Admin</option>
                        </select>
                    `}
                </div>
            ` : ''}
        </div>
    `).join('');
}

async function approveUser(userId) {
    if (!confirm('Setujui anggota ini?')) return;
    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'approveUser', targetUserId: userId })
        });
        const result = await response.json();
        if (result.status === 'success') {
            alert('Berhasil disetujui!');
            fetchMembers();
        }
    } catch (e) { alert('Gagal.'); }
}

async function changeRole(userId, newRole) {
    if (!confirm(`Ubah jabatan ke ${newRole}?`)) return;
    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'updateRole', targetUserId: userId, newRole: newRole })
        });
        const result = await response.json();
        if (result.status === 'success') {
            alert('Jabatan diperbarui!');
            fetchMembers();
        }
    } catch (e) { alert('Gagal.'); }
}

// --- UI Helpers ---

function setupEventListeners() {
    authForm.addEventListener('submit', handleAuth);
    btnLogout.addEventListener('click', logout);
    document.getElementById('post-form').addEventListener('submit', handlePost);
    
    bottomNavItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            bottomNavItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            if (target === 'home') {
                document.querySelector('.filter-bar').classList.remove('hidden');
                document.querySelector('.section-header h3').textContent = 'Pengumuman Terbaru';
                fetchAnnouncements();
            } else if (target === 'members') {
                document.querySelector('.filter-bar').classList.add('hidden');
                fetchMembers();
            }
        });
    });

    document.getElementById('search-announcement').addEventListener('input', applyFilters);
    document.getElementById('btn-add-post').onclick = () => openModal('modal-post');
    document.querySelectorAll('.btn-close').forEach(btn => btn.onclick = closeModal);
    modalOverlay.onclick = (e) => { if (e.target === modalOverlay) closeModal(); };
}

function applyFilters() {
    const searchTerm = document.getElementById('search-announcement').value.toLowerCase();
    const filtered = allAnnouncements.filter(item => 
        item.judul.toLowerCase().includes(searchTerm) || item.isi.toLowerCase().includes(searchTerm)
    );
    renderAnnouncements(filtered);
}

function populateMonthFilter() {
    const select = document.getElementById('filter-month');
    if (!select) return;
    months.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = m;
        select.appendChild(opt);
    });
}

function openModal(id) {
    modalOverlay.style.display = 'flex';
    document.querySelectorAll('.modal-content').forEach(m => m.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function closeModal() {
    modalOverlay.style.display = 'none';
}

function showDetail(index) {
    const item = allAnnouncements[index];
    document.getElementById('detail-avatar').textContent = (item.pengirim_nama || "?").charAt(0).toUpperCase();
    document.getElementById('detail-sender').textContent = `${item.pengirim_nama} (${item.pengirim_jabatan})`;
    document.getElementById('detail-date').textContent = `${item.hari} ${item.bulan}`;
    document.getElementById('detail-title').textContent = item.judul;
    document.getElementById('detail-body').textContent = item.isi;
    openModal('modal-detail');
}
