// Configuration
const CONFIG = {
    // URL API dari Google Apps Script
    API_URL: 'https://script.google.com/macros/s/AKfycbzGBzDebA21dTrBKKma2AQ7QkZYubRnnLP6B21vB1aOLbfy9HfBIdNrJzxebeIfD2oe/exec' 
};

// State Management
let currentUser = null;
let allAnnouncements = [];
let months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// DOM Elements
const authSection = document.getElementById('auth-section');
const mainSection = document.getElementById('main-section');
const authForm = document.getElementById('auth-form');
const announcementList = document.getElementById('announcement-list');
const adminActions = document.getElementById('admin-actions');
const modalOverlay = document.getElementById('modal-overlay');
const btnLogout = document.getElementById('btn-logout');

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    populateMonthFilter();
    setupEventListeners();
});

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
    const id = document.getElementById('login-id').value;

    const btn = document.getElementById('btn-login');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner small"></div>';

    try {
        const response = await fetch(`${CONFIG.API_URL}?action=login&id=${id}&nama=${encodeURIComponent(name)}`);
        const result = await response.json();

        if (result.status === 'success') {
            currentUser = result.data;
            localStorage.setItem('kt_user', JSON.stringify(currentUser));
            showMainScreen();
        } else {
            alert('Gagal login: ' + result.message);
        }
    } catch (error) {
        console.error('Error:', error);
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
    authSection.classList.remove('active');
    mainSection.classList.add('active');
    
    // Update Profile UI
    document.getElementById('display-name').textContent = currentUser.nama;
    document.getElementById('display-role').textContent = currentUser.jabatan;
    document.getElementById('user-avatar').textContent = currentUser.nama.charAt(0).toUpperCase();

    // Show/Hide Admin Button
    if (['Ketua', 'Sekretaris', 'Bendahara'].includes(currentUser.jabatan)) {
        adminActions.classList.remove('hidden');
    } else {
        adminActions.classList.add('hidden');
    }

    fetchAnnouncements();
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
        announcementList.innerHTML = '<p class="error-msg">Gagal memuat data. Periksa koneksi Anda.</p>';
    }
}

function renderAnnouncements(data) {
    if (data.length === 0) {
        announcementList.innerHTML = '<div class="empty-state"><i class="fas fa-bullhorn"></i><p>Belum ada pengumuman.</p></div>';
        document.getElementById('announcement-count').textContent = '0 Pesan';
        return;
    }

    document.getElementById('announcement-count').textContent = `${data.length} Pesan`;
    
    announcementList.innerHTML = data.map((item, index) => `
        <div class="announcement-item" onclick="showDetail(${index})">
            <div class="item-header">
                <span class="author">${item.pengirim_nama} (${item.pengirim_jabatan})</span>
                <span class="date">${item.hari} ${item.bulan}</span>
            </div>
            <h4>${item.judul}</h4>
            <p>${item.isi}</p>
        </div>
    `).join('');
}

async function handlePost(e) {
    e.preventDefault();
    const title = document.getElementById('post-title').value;
    const content = document.getElementById('post-content').value;
    
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Mengirim...';

    const payload = {
        action: 'postAnnouncement',
        nama: currentUser.nama,
        jabatan: currentUser.jabatan,
        judul: title,
        isi: content
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
        } else {
            alert('Gagal mengirim: ' + result.message);
        }
    } catch (error) {
        alert('Kesalahan server.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Kirim Pengumuman';
    }
}

// --- UI Helpers ---

function setupEventListeners() {
    authForm.addEventListener('submit', handleAuth);
    btnLogout.addEventListener('click', logout);
    document.getElementById('post-form').addEventListener('submit', handlePost);
    
    // Search & Filters
    document.getElementById('search-announcement').addEventListener('input', applyFilters);
    document.getElementById('filter-sender').addEventListener('change', applyFilters);
    document.getElementById('filter-month').addEventListener('change', applyFilters);

    // Modal Events
    document.getElementById('btn-add-post').onclick = () => openModal('modal-post');
    document.querySelectorAll('.btn-close').forEach(btn => btn.onclick = closeModal);
    modalOverlay.onclick = (e) => { if(e.target === modalOverlay) closeModal(); };
}

function applyFilters() {
    const searchTerm = document.getElementById('search-announcement').value.toLowerCase();
    const sender = document.getElementById('filter-sender').value;
    const month = document.getElementById('filter-month').value;

    const filtered = allAnnouncements.filter(item => {
        const matchesSearch = item.judul.toLowerCase().includes(searchTerm) || item.isi.toLowerCase().includes(searchTerm);
        const matchesSender = sender === 'all' || item.pengirim_jabatan === sender;
        const matchesMonth = month === 'all' || item.bulan === month;
        return matchesSearch && matchesSender && matchesMonth;
    });

    renderAnnouncements(filtered);
}

function populateMonthFilter() {
    const select = document.getElementById('filter-month');
    months.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
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
    document.getElementById('detail-avatar').textContent = item.pengirim_nama.charAt(0).toUpperCase();
    document.getElementById('detail-sender').textContent = `${item.pengirim_nama} (${item.pengirim_jabatan})`;
    document.getElementById('detail-date').textContent = `${item.hari} ${item.bulan}`;
    document.getElementById('detail-title').textContent = item.judul;
    document.getElementById('detail-body').textContent = item.isi;
    
    openModal('modal-detail');
}
