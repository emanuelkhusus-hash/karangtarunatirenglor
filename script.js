// Configuration
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbzGBzDebA21dTrBKKma2AQ7QkZYubRnnLP6B21vB1aOLbfy9HfBIdNrJzxebeIfD2oe/exec' 
};

// State Management
let currentUser = null;
let allAnnouncements = [];
let allMembers = [];
let allFinance = [];
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
document.addEventListener('DOMContentLoaded', async () => {
    updateSystemYear();
    await checkSession();
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

async function checkSession() {
    const savedUser = localStorage.getItem('kt_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        // Tampilkan layar utama segera dari cache (cepat)
        showMainScreen();
        // Lalu refresh data dari server di background (tanpa perlu logout)
        silentRefresh();
    } else {
        showAuthScreen();
    }
}

async function silentRefresh() {
    const oldJabatan = currentUser?.jabatan;
    const oldStatus = currentUser?.status;
    const result = await refreshUserStatus();
    if (!result || result.status !== 'success') return;

    const newJabatan = currentUser?.jabatan;
    const newStatus = currentUser?.status;

    // Jika ada perubahan jabatan atau status, perbarui UI secara otomatis
    if (oldJabatan !== newJabatan || oldStatus !== newStatus) {
        console.log(`[SilentRefresh] Perubahan terdeteksi: jabatan ${oldJabatan} → ${newJabatan}, status ${oldStatus} → ${newStatus}`);
        showMainScreen();
    }
}

async function refreshUserStatus() {
    if (!currentUser) return null;
    let payload = { action: 'checkStatusOnly', id: currentUser.id };
    if (currentUser.password) {
        payload = {
            action: 'login',
            nama: currentUser.nama,
            password: currentUser.password
        };
    }
    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.status === 'success') {
            if (payload.action === 'login') {
                currentUser = { ...result.data, password: currentUser.password };
            } else {
                currentUser.status = result.newStatus;
                currentUser.jabatan = result.jabatan;
            }
            localStorage.setItem('kt_user', JSON.stringify(currentUser));
        }
        return result;
    } catch (e) { 
        return { status: 'error', message: 'Koneksi gagal' };
    }
}

async function checkStatusManual(btn) {
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengecek...';
    const result = await refreshUserStatus();
    if (result && result.status === 'error') {
        alert("Gagal mengecek: " + (result.message || "Kesalahan server"));
    } else {
        const currentStatus = currentUser.status ? currentUser.status.toString().toLowerCase().trim() : 'pending';
        if (currentStatus === 'aktif') {
            alert("Selamat! Akun Anda sudah disetujui. Halaman akan dimuat ulang.");
            location.reload();
            return;
        } else {
            alert("Status saat ini: '" + currentStatus + "'. Mohon tunggu persetujuan admin.");
        }
    }
    btn.disabled = false;
    btn.innerHTML = originalText;
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
            body: JSON.stringify({ action: 'login', nama: name, password: password })
        });
        const result = await response.json();
        if (result.status === 'success') {
            currentUser = { ...result.data, password: password };
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
    document.getElementById('display-name').textContent = currentUser.nama;
    document.getElementById('display-role').textContent = currentUser.jabatan;
    document.getElementById('user-avatar').textContent = currentUser.nama.charAt(0).toUpperCase();

    if (currentUser.status === 'pending') {
        announcementList.innerHTML = `
            <div class="pending-screen">
                <i class="fas fa-clock"></i>
                <h3>Akun Menunggu Persetujuan</h3>
                <p>Halo ${currentUser.nama}, pendaftaran Anda sedang diproses oleh Admin.</p>
                <div style="display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 300px; margin: 0 auto;">
                    <button onclick="checkStatusManual(this)" class="btn-primary">Cek Status Terbaru</button>
                    <button onclick="logout()" class="btn-reject-outline">Keluar</button>
                </div>
            </div>
        `;
        document.getElementById('display-role').textContent = 'Pending Approval';
        adminActions.classList.add('hidden');
        return;
    }

    const role = currentUser.jabatan.toLowerCase().trim();
    if (role === 'admin') checkNotifications();

    // Tab KAS: tampil untuk semua, beda label per role
    const navFinance = document.getElementById('nav-finance');
    const navIcon = document.getElementById('nav-finance-icon');
    const navLabel = document.getElementById('nav-finance-label');
    if (navFinance && navIcon && navLabel) {
        navFinance.classList.remove('hidden');
        if (role === 'bendahara') {
            navIcon.className = 'fas fa-wallet';
            navLabel.textContent = 'Kas';
        } else {
            navIcon.className = 'fas fa-chart-line';
            navLabel.textContent = 'Cek Kas';
        }
    }
    
    updateFabContext('announcement');
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
            } else { badge.classList.add('hidden'); }
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
    announcementList.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Memuat data...</p></div>';
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
    const role = currentUser.jabatan.toLowerCase().trim();
    const isAdmin = role === 'admin';
    const canDeleteOwn = ['admin', 'ketua', 'sekretaris', 'bendahara'].includes(role);
    announcementList.innerHTML = data.map((item, index) => {
        const dateDisplay = isNaN(item.hari) ? `${item.bulan} ${item.hari}` : `${item.hari} ${item.bulan}`;
        const senderNama = item.pengirim_nama || item.nama || '';
        const isOwner = senderNama.toLowerCase().trim() === currentUser.nama.toLowerCase().trim();
        const showDelete = isAdmin || (canDeleteOwn && isOwner);
        return `
        <div class="announcement-item" style="animation-delay: ${index * 0.05}s" onclick="showDetail(${index})">
            <div class="item-header">
                <span class="author">${senderNama || 'Anonim'} (${item.pengirim_jabatan || item.jabatan || 'Anggota'})</span>
                <div class="header-right">
                    <span class="date">${dateDisplay}</span>
                    ${showDelete ? `
                        <button onclick="event.stopPropagation(); deletePost('${item.timestamp}')" class="btn-delete-post">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
            <h4>${item.judul}</h4>
            <p>${item.isi}</p>
        </div>
    `; }).join('');
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
        const response = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(payload) });
        const result = await response.json();
        if (result.status === 'success') {
            closeModal();
            fetchAnnouncements();
            e.target.reset();
        }
    } catch (error) { alert('Gagal mengirim.'); }
    finally { btn.disabled = false; btn.textContent = 'Kirim Pengumuman'; }
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
    const searchTerm = document.getElementById('search-member-input')?.value.toLowerCase().trim() || "";
    const filteredData = data.filter(member => 
        member.nama.toLowerCase().includes(searchTerm) || 
        member.jabatan.toLowerCase().includes(searchTerm)
    );
    document.getElementById('announcement-count').textContent = `${filteredData.length} Anggota`;
    document.getElementById('announcement-list-header').textContent = 'Daftar Anggota';
    const isAdmin = currentUser.jabatan.toLowerCase().trim() === 'admin';

    const itemsHtml = filteredData.map((member, index) => `
        <div class="announcement-item member-item ${member.status === 'pending' ? 'is-pending' : ''}" style="animation-delay: ${index * 0.05}s">
            <div class="item-header">
                <span class="author">${member.jabatan}</span>
                <span class="status-tag ${member.status}">${member.status === 'pending' ? 'Wait' : 'Aktif'}</span>
            </div>
            <h4>${member.nama}</h4>
            ${isAdmin ? `
                <div class="admin-tools">
                    ${member.status === 'pending' ? `
                        <div style="display: flex; gap: 8px;">
                            <button onclick="approveUser('${member.id}')" class="btn-approve" style="flex: 1;">OK</button>
                            <button onclick="rejectUser('${member.id}')" class="btn-reject" style="flex: 1;">Tolak</button>
                        </div>
                    ` : `
                        <div style="display: flex; gap: 8px; flex-direction: column;">
                            <select onchange="changeRole('${member.id}', this.value)" class="role-select">
                                <option value="Anggota" ${member.jabatan === 'Anggota' ? 'selected' : ''}>Anggota</option>
                                <option value="Ketua" ${member.jabatan === 'Ketua' ? 'selected' : ''}>Ketua</option>
                                <option value="Sekretaris" ${member.jabatan === 'Sekretaris' ? 'selected' : ''}>Sekretaris</option>
                                <option value="Bendahara" ${member.jabatan === 'Bendahara' ? 'selected' : ''}>Bendahara</option>
                                <option value="Admin" ${member.jabatan === 'Admin' ? 'selected' : ''}>Admin</option>
                            </select>
                            <button onclick="deleteMember('${member.id}', '${member.nama}')" class="btn-reject-outline">
                                <i class="fas fa-trash-alt"></i> Hapus
                            </button>
                        </div>
                    `}
                </div>
            ` : ''}
        </div>
    `).join('');
    
    announcementList.innerHTML = `<div class="members-grid-container">${itemsHtml}</div>`;
}

async function deleteMember(userId, userName) {
    if (!confirm(`Hapus anggota "${userName}"?`)) return;
    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'rejectUser', targetUserId: userId })
        });
        const result = await response.json();
        if (result.status === 'success') { alert('Anggota berhasil dihapus.'); fetchMembers(); }
    } catch (e) { alert('Gagal.'); }
}

async function approveUser(userId) {
    if (!confirm('Setujui anggota ini?')) return;
    try {
        const response = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ action: 'approveUser', targetUserId: userId }) });
        const result = await response.json();
        if (result.status === 'success') { alert('Berhasil disetujui!'); fetchMembers(); }
    } catch (e) { alert('Gagal.'); }
}

async function rejectUser(userId) {
    if (!confirm('Tolak pendaftaran ini?')) return;
    try {
        const response = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ action: 'rejectUser', targetUserId: userId }) });
        const result = await response.json();
        if (result.status === 'success') { alert('Pendaftaran ditolak.'); fetchMembers(); }
    } catch (e) { alert('Gagal.'); }
}

async function changeRole(userId, newRole) {
    if (!confirm(`Ubah jabatan ke ${newRole}?`)) return;
    try {
        const response = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ action: 'updateRole', targetUserId: userId, newRole: newRole }) });
        const result = await response.json();
        if (result.status === 'success') { alert('Jabatan diperbarui!'); fetchMembers(); }
    } catch (e) { alert('Gagal.'); }
}

async function handleAddMember(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';

    const payload = {
        action: 'addMember',
        nama: document.getElementById('add-member-name').value,
        jabatan: document.getElementById('add-member-role').value,
        password: document.getElementById('add-member-password').value,
        status: 'aktif' // Admin adds directly as active
    };

    try {
        const response = await fetch(CONFIG.API_URL, { 
            method: 'POST', 
            body: JSON.stringify(payload) 
        });
        const result = await response.json();
        if (result.status === 'success') {
            alert('Anggota baru berhasil ditambahkan!');
            closeModal();
            fetchMembers();
            e.target.reset();
        } else {
            alert('Gagal: ' + result.message);
        }
    } catch (error) {
        alert('Terjadi kesalahan koneksi.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Simpan Anggota';
    }
}

// --- Finance Functions ---

function updateFabContext(context) {
    const fab = document.getElementById('btn-add-post');
    const wrapper = document.getElementById('admin-actions');
    const role = currentUser.jabatan.toLowerCase().trim();
    fab.setAttribute('data-context', context);
    if (context === 'announcement') {
        const canPost = ['admin', 'ketua', 'sekretaris', 'bendahara'].includes(role);
        if (canPost) {
            wrapper.classList.remove('hidden');
            fab.classList.remove('hidden');
        } else {
            wrapper.classList.add('hidden');
            fab.classList.add('hidden');
        }
    } else if (context === 'finance') {
        const canPostFinance = ['admin', 'bendahara'].includes(role);
        if (canPostFinance) {
            wrapper.classList.remove('hidden');
            fab.classList.remove('hidden');
        } else {
            wrapper.classList.add('hidden');
            fab.classList.add('hidden');
        }
    } else if (context === 'members') {
        if (role === 'admin') {
            wrapper.classList.remove('hidden');
            fab.classList.remove('hidden');
        } else {
            wrapper.classList.add('hidden');
            fab.classList.add('hidden');
        }
    } else {
        wrapper.classList.add('hidden');
        fab.classList.add('hidden');
    }
}

async function fetchFinance() {
    const list = document.getElementById('finance-list');
    list.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Memuat data keuangan...</p></div>';
    try {
        const response = await fetch(`${CONFIG.API_URL}?action=getFinance`);
        const result = await response.json();
        if (result.status === 'success') {
            allFinance = result.data;
            renderFinance(allFinance);
        }
    } catch (error) { list.innerHTML = '<p class="error-msg">Gagal memuat data keuangan.</p>'; }
}

function renderFinance(data) {
    const list = document.getElementById('finance-list');
    let totalIncome = 0; let totalExpense = 0;
    if (data.length === 0) { list.innerHTML = '<div class="empty-state"><p>Belum ada transaksi.</p></div>'; return; }
    list.innerHTML = data.map((item, index) => {
        const amount = parseInt(item.jumlah);
        if (item.jenis === 'income') totalIncome += amount; else totalExpense += amount;
        return `
            <div class="finance-item ${item.jenis}" style="animation-delay: ${index * 0.05}s">
                <div class="finance-info">
                    <h4>${item.keterangan}</h4>
                    <p>Oleh: ${item.nama}</p>
                </div>
                <div class="finance-amount">
                    <span class="amount-val">${item.jenis === 'income' ? '+' : '-'}${formatRupiah(amount)}</span>
                    <span class="finance-date">${item.tanggal}</span>
                </div>
            </div>
        `;
    }).reverse().join('');
    document.getElementById('total-income').textContent = formatRupiah(totalIncome);
    document.getElementById('total-expense').textContent = formatRupiah(totalExpense);
    document.getElementById('total-balance').textContent = formatRupiah(totalIncome - totalExpense);
}

async function handleFinancePost(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Menyimpan...';
    // Ambil nilai raw (strip titik ribuan)
    const rawAmount = document.getElementById('finance-amount').value.replace(/\./g, '').trim();
    if (!rawAmount || isNaN(parseInt(rawAmount)) || parseInt(rawAmount) <= 0) {
        alert('Masukkan jumlah yang valid.');
        btn.disabled = false; btn.textContent = 'Simpan Transaksi';
        return;
    }
    const payload = {
        action: 'postFinance',
        nama: currentUser.nama,
        jenis: document.getElementById('finance-type').value,
        jumlah: rawAmount,
        keterangan: document.getElementById('finance-note').value
    };
    try {
        const response = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(payload) });
        const result = await response.json();
        if (result.status === 'success') { closeModal(); fetchFinance(); e.target.reset(); }
    } catch (error) { alert('Gagal menyimpan.'); }
    finally { btn.disabled = false; btn.textContent = 'Simpan Transaksi'; }
}

function formatRupiah(number) {
    const formatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
    return formatted.replace(/\u00A0/g, ' ');
}

// Format input nominal dengan titik ribuan secara real-time
function formatAmountInput(input) {
    // Simpan posisi kursor
    const cursorPos = input.selectionStart;
    const prevLen = input.value.length;

    // Ambil hanya angka
    const raw = input.value.replace(/\D/g, '');

    if (!raw) { input.value = ''; return; }

    // Format dengan titik ribuan (id-ID style pakai titik)
    const formatted = parseInt(raw, 10).toLocaleString('id-ID');
    input.value = formatted;

    // Perbaiki posisi kursor agar tidak lompat ke akhir
    const diff = formatted.length - prevLen;
    const newPos = Math.max(0, cursorPos + diff);
    input.setSelectionRange(newPos, newPos);
}

function exportFinance() {
    // 1. Cek apakah ada data
    if (!allFinance || allFinance.length === 0) {
        alert('Tidak ada data transaksi untuk di-export. Pastikan menu Kas sudah memuat data.');
        return;
    }

    // 2. Cek apakah library jsPDF sudah ter-load
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert('Library PDF sedang dimuat atau gagal dimuat. Silakan refresh halaman dan tunggu sebentar.');
        console.error('jsPDF not found in window object');
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const now = new Date();
        const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

        // Header Laporan
        doc.setFontSize(18);
        doc.setTextColor(79, 70, 229);
        doc.text("LAPORAN KAS KARANG TARUNA", 105, 20, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text("Watuireng Lor, Desa Platarejo", 105, 27, { align: 'center' });
        doc.text(`Dicetak pada: ${dateStr}`, 105, 32, { align: 'center' });
        
        doc.setLineWidth(0.5);
        doc.line(20, 38, 190, 38);

        // Hitung Ringkasan
        let totalIn = 0; let totalOut = 0;
        const tableData = allFinance.map((item, index) => {
            const amt = parseInt(item.jumlah) || 0;
            if (item.jenis === 'income') totalIn += amt; else totalOut += amt;
            return [
                index + 1,
                item.tanggal,
                item.keterangan,
                item.nama,
                item.jenis === 'income' ? formatRupiah(amt) : '-',
                item.jenis === 'expense' ? formatRupiah(amt) : '-'
            ];
        });

        // Tabel Transaksi
        doc.autoTable({
            startY: 45,
            head: [['No', 'Tanggal', 'Keterangan', 'Oleh', 'Masuk', 'Keluar']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [79, 70, 229] },
            styles: { fontSize: 8 },
            columnStyles: {
                4: { halign: 'right' },
                5: { halign: 'right' }
            }
        });

        // Ringkasan Akhir
        const finalY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 45) + 15;
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`Total Pemasukan: ${formatRupiah(totalIn)}`, 130, finalY);
        doc.text(`Total Pengeluaran: ${formatRupiah(totalOut)}`, 130, finalY + 7);
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`SALDO AKHIR: ${formatRupiah(totalIn - totalOut)}`, 130, finalY + 15);

        // Simpan PDF (kompatibel Browser & Android WebView)
        savePdfDocument(doc, `Laporan_Kas_KT_${now.getTime()}.pdf`);

    } catch (err) {
        console.error('PDF Generation Error:', err);
        alert('Terjadi kesalahan saat membuat PDF: ' + err.message);
    }
}

// --- PDF Save Helper (Browser + Android WebView) ---

function savePdfDocument(doc, fileName) {
    // Deteksi apakah berjalan di Android WebView dengan JavascriptInterface
    if (window.Android && typeof window.Android.savePdf === 'function') {
        try {
            // Konversi PDF ke base64 lalu kirim ke Android
            const base64 = doc.output('datauristring');
            window.Android.savePdf(base64, fileName);
        } catch (e) {
            console.error('Android PDF save error:', e);
            alert('Gagal menyimpan PDF di perangkat: ' + e.message);
        }
    } else {
        // Browser biasa: download langsung
        doc.save(fileName);
    }
}

// --- UI Helpers ---

function setupEventListeners() {
    authForm.addEventListener('submit', handleAuth);
    btnLogout.addEventListener('click', logout);
    document.getElementById('post-form').addEventListener('submit', handlePost);
    document.getElementById('finance-form').addEventListener('submit', handleFinancePost);
    document.getElementById('add-member-form').addEventListener('submit', handleAddMember);
    
    bottomNavItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            bottomNavItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            if (target === 'home') {
                document.getElementById('announcement-container').classList.remove('hidden');
                document.getElementById('profile-section').classList.add('hidden');
                document.getElementById('finance-section').classList.add('hidden');
                document.getElementById('cek-kas-section').classList.add('hidden');
                document.querySelector('.filter-bar').classList.remove('hidden');
                document.getElementById('member-search-container').classList.add('hidden');
                document.getElementById('announcement-list-header').textContent = 'Pengumuman Terbaru';
                updateFabContext('announcement');
                fetchAnnouncements();
            } else if (target === 'finance') {
                const userRole = currentUser.jabatan.toLowerCase().trim();
                document.getElementById('announcement-container').classList.add('hidden');
                document.getElementById('profile-section').classList.add('hidden');
                document.getElementById('finance-section').classList.add('hidden');
                document.getElementById('cek-kas-section').classList.add('hidden');
                document.querySelector('.filter-bar').classList.add('hidden');
                document.getElementById('member-search-container').classList.add('hidden');
                if (userRole === 'bendahara') {
                    document.getElementById('finance-section').classList.remove('hidden');
                    updateFabContext('finance');
                    fetchFinance();
                } else {
                    document.getElementById('cek-kas-section').classList.remove('hidden');
                    updateFabContext('none');
                    fetchCekKas();
                }
            } else if (target === 'members') {
                document.getElementById('announcement-container').classList.remove('hidden');
                document.getElementById('profile-section').classList.add('hidden');
                document.getElementById('finance-section').classList.add('hidden');
                document.getElementById('cek-kas-section').classList.add('hidden');
                document.querySelector('.filter-bar').classList.add('hidden');
                document.getElementById('member-search-container').classList.remove('hidden');
                updateFabContext('members');
                fetchMembers();
            } else if (target === 'profile') {
                document.getElementById('announcement-container').classList.add('hidden');
                document.getElementById('profile-section').classList.remove('hidden');
                document.getElementById('finance-section').classList.add('hidden');
                document.getElementById('cek-kas-section').classList.add('hidden');
                document.querySelector('.filter-bar').classList.add('hidden');
                document.getElementById('member-search-container').classList.add('hidden');
                updateFabContext('none');
                renderProfile();
            }
        });
    });

    document.getElementById('search-announcement').addEventListener('input', applyFilters);
    document.getElementById('filter-sender').addEventListener('change', applyFilters);
    document.getElementById('filter-month').addEventListener('change', applyFilters);
    document.getElementById('btn-add-post').onclick = () => {
        const context = document.getElementById('btn-add-post').getAttribute('data-context');
        if (context === 'finance') openModal('modal-finance');
        else if (context === 'members') openModal('modal-add-member');
        else openModal('modal-post');
    };
    document.querySelectorAll('.btn-close').forEach(btn => btn.onclick = closeModal);
    modalOverlay.onclick = (e) => { if (e.target === modalOverlay) closeModal(); };
}

function renderProfile() {
    const profileSection = document.getElementById('profile-section');
    profileSection.innerHTML = `
        <div class="profile-card">
            <div class="profile-avatar-large">${currentUser.nama.charAt(0).toUpperCase()}</div>
            <h3>${currentUser.nama}</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem;">${currentUser.jabatan}</p>
            <div class="profile-info-list">
                <div class="info-item"><i class="fas fa-id-badge"></i><div class="info-content"><label>ID Anggota</label><span>${currentUser.id}</span></div></div>
                <div class="info-item"><i class="fas fa-shield-alt"></i><div class="info-content"><label>Status Akun</label><span style="color: #16a34a;">${currentUser.status.toUpperCase()}</span></div></div>
            </div>
            <button onclick="logout()" class="btn-logout-alt"><i class="fas fa-sign-out-alt"></i> Keluar Aplikasi</button>
        </div>
    `;
}

function applyFilters() {
    const searchTerm = document.getElementById('search-announcement').value.toLowerCase().trim();
    const filterSender = document.getElementById('filter-sender').value;
    const filterMonth = document.getElementById('filter-month').value.toLowerCase().trim();
    const filtered = allAnnouncements.filter(item => {
        const matchesSearch = searchTerm === "" || item.judul.toLowerCase().includes(searchTerm) || item.isi.toLowerCase().includes(searchTerm);
        const senderJabatan = (item.pengirim_jabatan || item.jabatan || "").toLowerCase().trim();
        const matchesSender = filterSender === 'all' || senderJabatan === filterSender.toLowerCase().trim();
        const valHari = String(item.hari || "").toLowerCase().trim();
        const valBulan = String(item.bulan || "").toLowerCase().trim();
        const matchesMonth = filterMonth === 'all' || valBulan === filterMonth || valHari === filterMonth;
        return matchesSearch && matchesSender && matchesMonth;
    });
    renderAnnouncements(filtered);
}

function resetFilters(hardReload = false) {
    if (hardReload) { location.reload(); return; }
    document.getElementById('search-announcement').value = '';
    document.getElementById('filter-sender').value = 'all';
    document.getElementById('filter-month').value = 'all';
    fetchAnnouncements();
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

function closeModal() { modalOverlay.style.display = 'none'; }

function showDetail(index) {
    const item = allAnnouncements[index];
    const pengirimNama = item.pengirim_nama || item.nama || 'Anonim';
    const pengirimJabatan = item.pengirim_jabatan || item.jabatan || 'Anggota';
    document.getElementById('detail-avatar').textContent = pengirimNama.charAt(0).toUpperCase();
    document.getElementById('detail-sender').textContent = `${pengirimNama} (${pengirimJabatan})`;
    document.getElementById('detail-date').textContent = `${item.hari} ${item.bulan}`;
    document.getElementById('detail-title').textContent = item.judul;
    document.getElementById('detail-body').textContent = item.isi;
    openModal('modal-detail');
}

// --- Cek KAS (Read-Only View) ---

function extractMonthYear(tanggal) {
    if (!tanggal) return null;
    const parts = String(tanggal).trim().split(' ');
    if (parts.length >= 3) return `${parts[1]} ${parts[2]}`;
    return tanggal;
}

async function fetchCekKas() {
    const list = document.getElementById('cek-kas-list');
    list.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Memuat data kas...</p></div>';
    try {
        const response = await fetch(`${CONFIG.API_URL}?action=getFinance`);
        const result = await response.json();
        if (result.status === 'success') {
            allFinance = result.data;
            populateCekKasMonthFilter();
            renderCekKas(allFinance);
        } else {
            list.innerHTML = '<p class="error-msg">Gagal memuat data kas.</p>';
        }
    } catch (e) {
        list.innerHTML = '<p class="error-msg">Koneksi gagal.</p>';
    }
}

function populateCekKasMonthFilter() {
    const select = document.getElementById('cek-filter-month');
    if (!select) return;
    const unique = [...new Set(allFinance.map(i => extractMonthYear(i.tanggal)).filter(Boolean))];
    select.innerHTML = '<option value="all">Semua Bulan</option>';
    unique.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = m;
        select.appendChild(opt);
    });
}

function applyCekKasFilter() {
    const selected = document.getElementById('cek-filter-month').value;
    const filtered = selected === 'all' ? allFinance
        : allFinance.filter(i => extractMonthYear(i.tanggal) === selected);
    renderCekKas(filtered);
}

function renderCekKas(data) {
    const list = document.getElementById('cek-kas-list');
    document.getElementById('cek-kas-count').textContent = `${data.length} Transaksi`;

    // Saldo selalu dari SEMUA data (bukan yang difilter)
    let totalIn = 0, totalOut = 0;
    allFinance.forEach(item => {
        const amt = parseInt(item.jumlah) || 0;
        if (item.jenis === 'income') totalIn += amt; else totalOut += amt;
    });
    document.getElementById('cek-total-income').textContent = formatRupiah(totalIn);
    document.getElementById('cek-total-expense').textContent = formatRupiah(totalOut);
    document.getElementById('cek-total-balance').textContent = formatRupiah(totalIn - totalOut);

    if (data.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Tidak ada transaksi pada periode ini.</p></div>';
        return;
    }
    list.innerHTML = [...data].reverse().map((item, index) => {
        const amt = parseInt(item.jumlah) || 0;
        return `
        <div class="finance-item ${item.jenis}" style="animation-delay:${index * 0.04}s">
            <div class="finance-info">
                <h4>${item.keterangan}</h4>
                <p>Oleh: ${item.nama}</p>
                <p class="trans-time"><i class="fas fa-clock"></i> ${item.tanggal || '-'}</p>
            </div>
            <div class="finance-amount">
                <span class="amount-val">${item.jenis === 'income' ? '+' : '-'}${formatRupiah(amt)}</span>
                <span class="finance-date tag-${item.jenis}">${item.jenis === 'income' ? 'Masuk' : 'Keluar'}</span>
            </div>
        </div>`;
    }).join('');
}

async function exportCekKasByMonth() {
    // Jika data belum dimuat, fetch dulu
    if (!allFinance || allFinance.length === 0) {
        const list = document.getElementById('cek-kas-list');
        list.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Memuat data untuk export...</p></div>';
        try {
            const response = await fetch(`${CONFIG.API_URL}?action=getFinance`);
            const result = await response.json();
            if (result.status === 'success') {
                allFinance = result.data;
                populateCekKasMonthFilter();
                renderCekKas(allFinance);
            } else {
                alert('Gagal memuat data kas.'); return;
            }
        } catch (e) {
            alert('Koneksi gagal, coba lagi.'); return;
        }
    }

    const selected = document.getElementById('cek-filter-month').value;
    const dataExport = selected === 'all' ? allFinance
        : allFinance.filter(i => extractMonthYear(i.tanggal) === selected);

    if (!dataExport || dataExport.length === 0) {
        alert('Tidak ada data untuk di-export pada periode ini.'); return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert('Library PDF belum siap. Tunggu sebentar lalu coba lagi.'); return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const now = new Date();
        const dateStr = now.toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });
        const periodLabel = selected === 'all' ? 'Semua Periode' : selected;

        doc.setFontSize(18); doc.setTextColor(30, 58, 138);
        doc.text('LAPORAN KAS KARANG TARUNA', 105, 20, { align:'center' });
        doc.setFontSize(10); doc.setTextColor(100, 116, 139);
        doc.text('Watuireng Lor, Desa Platarejo', 105, 28, { align:'center' });
        doc.text(`Periode: ${periodLabel}`, 105, 34, { align:'center' });
        doc.text(`Dicetak: ${dateStr}`, 105, 40, { align:'center' });
        doc.setLineWidth(0.5); doc.setDrawColor(30, 58, 138);
        doc.line(20, 46, 190, 46);

        let totalIn = 0, totalOut = 0;
        const rows = dataExport.map((item, i) => {
            const amt = parseInt(item.jumlah) || 0;
            if (item.jenis === 'income') totalIn += amt; else totalOut += amt;
            return [i+1, item.tanggal || '-', item.keterangan, item.nama,
                item.jenis === 'income' ? formatRupiah(amt) : '-',
                item.jenis === 'expense' ? formatRupiah(amt) : '-'];
        });

        doc.autoTable({
            startY: 52,
            head: [['No', 'Waktu Transaksi', 'Keterangan', 'Oleh', 'Masuk', 'Keluar']],
            body: rows, theme: 'striped',
            headStyles: { fillColor: [30, 58, 138] },
            styles: { fontSize: 8 },
            columnStyles: { 4: { halign:'right' }, 5: { halign:'right' } }
        });

        const fy = (doc.lastAutoTable?.finalY || 52) + 12;
        doc.setFontSize(10); doc.setTextColor(0);
        doc.text(`Total Pemasukan : ${formatRupiah(totalIn)}`, 130, fy);
        doc.text(`Total Pengeluaran: ${formatRupiah(totalOut)}`, 130, fy + 7);
        doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(30, 58, 138);
        doc.text(`SALDO: ${formatRupiah(totalIn - totalOut)}`, 130, fy + 16);

        const suffix = selected === 'all' ? 'Semua' : selected.replace(' ', '_');
        savePdfDocument(doc, `Cek_Kas_KT_${suffix}.pdf`);
    } catch (err) {
        console.error(err);
        alert('Gagal membuat PDF: ' + err.message);
    }
}
