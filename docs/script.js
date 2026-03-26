let reports = [];
let nextId = 1;
let turnstileToken = null;
let API_URL = 'https://abuse-report-api.reporting-abusers-projects.workers.dev';

const statusConfig = {
    underReview: {
        label: "Under Review",
        color: "#8b5cf6",
        bg: "rgba(139, 92, 246, 0.1)"
    },
    banned: {
        label: "Permanently Banned",
        color: "#ef4444",
        bg: "rgba(239, 68, 68, 0.1)"
    },
    suspended: {
        label: "Suspended",
        color: "#f59e0b",
        bg: "rgba(245, 158, 11, 0.1)"
    },
    warning: {
        label: "Warning Issued",
        color: "#3b82f6",
        bg: "rgba(59, 130, 246, 0.1)"
    },
    dismissed: {
        label: "Dismissed",
        color: "#6b7280",
        bg: "rgba(107, 114, 128, 0.1)"
    },
    flagged: {
        label: "Flagged",
        color: "#ec489a",
        bg: "rgba(236, 72, 153, 0.1)"
    }
};

const particleCanvas = document.getElementById('particleCanvas');
let ctx, particles = [];

function initParticles() {
    if (!particleCanvas) return;
    ctx = particleCanvas.getContext('2d');
    particleCanvas.width = window.innerWidth;
    particleCanvas.height = window.innerHeight;
    
    const particleCount = 80;
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * particleCanvas.width,
            y: Math.random() * particleCanvas.height,
            radius: Math.random() * 2 + 1,
            alpha: Math.random() * 0.3 + 0.1,
            velocityX: (Math.random() - 0.5) * 0.3,
            velocityY: (Math.random() - 0.5) * 0.3
        });
    }
    
    animateParticles();
}

function animateParticles() {
    if (!ctx) return;
    ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    
    particles.forEach(particle => {
        particle.x += particle.velocityX;
        particle.y += particle.velocityY;
        
        if (particle.x < 0) particle.x = particleCanvas.width;
        if (particle.x > particleCanvas.width) particle.x = 0;
        if (particle.y < 0) particle.y = particleCanvas.height;
        if (particle.y > particleCanvas.height) particle.y = 0;
        
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${particle.alpha})`;
        ctx.fill();
    });
    
    requestAnimationFrame(animateParticles);
}

function getDisplayStatus(report) {
    if (report.statusType === "resolved" && report.finalStatus) {
        return statusConfig[report.finalStatus] || statusConfig.flagged;
    }
    return statusConfig.underReview;
}

function updateStats() {
    const totalReports = reports.length;
    const activeReports = reports.filter(r => r.statusType === "underReview").length;
    const resolvedReports = reports.filter(r => r.statusType === "resolved").length;
    
    const activeCountEl = document.getElementById('activeReportsCount');
    const resolvedCountEl = document.getElementById('resolvedReportsCount');
    const totalCountEl = document.getElementById('totalReportsCount');
    
    if (activeCountEl) activeCountEl.textContent = activeReports;
    if (resolvedCountEl) resolvedCountEl.textContent = resolvedReports;
    if (totalCountEl) totalCountEl.textContent = totalReports;
}

function renderReports(filter = 'all') {
    const reportsList = document.getElementById('reportsList');
    if (!reportsList) return;
    
    const filteredReports = filter === 'all' 
        ? reports 
        : filter === 'active' 
            ? reports.filter(r => r.statusType === "underReview")
            : reports.filter(r => r.statusType === "resolved");
    
    reportsList.innerHTML = filteredReports.map(report => {
        const config = getDisplayStatus(report);
        const displayStatus = config.label;
        const displayDate = new Date(report.reportedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        
        return `
            <div class="report-item" style="--status-color: ${config.color}; --status-bg: ${config.bg}">
                <div class="report-info">
                    <div class="report-details">
                        <h4>@${report.username}</h4>
                        <p>Reported: ${displayDate} • ${report.reason}</p>
                    </div>
                </div>
                <div class="report-status" style="background: ${config.bg}; color: ${config.color}">
                    ${displayStatus}
                </div>
            </div>
        `;
    }).join('');
}

function renderActiveCases() {
    const activeCasesList = document.getElementById('activeCasesList');
    if (!activeCasesList) return;
    
    const activeCases = reports.filter(r => r.statusType === "underReview");
    
    if (activeCases.length === 0) {
        activeCasesList.innerHTML = '<p style="color: var(--text-tertiary);">No active cases to resolve.</p>';
        return;
    }
    
    activeCasesList.innerHTML = activeCases.map(report => `
        <div class="active-case-item" data-id="${report.id}">
            <div class="active-case-info">
                <h4>@${report.username}</h4>
                <p>Reported: ${new Date(report.reportedDate).toLocaleDateString()} • ${report.reason}</p>
            </div>
            <div style="display: flex; gap: 0.5rem;">
                <select class="resolve-select" data-id="${report.id}">
                    <option value="banned">Permanently Banned</option>
                    <option value="suspended">Suspended</option>
                    <option value="warning">Warning Issued</option>
                    <option value="dismissed">Dismissed</option>
                    <option value="flagged">Flagged</option>
                </select>
                <button class="resolve-btn" data-id="${report.id}">Resolve</button>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll('.resolve-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(btn.dataset.id);
            const select = document.querySelector(`.resolve-select[data-id="${id}"]`);
            const finalStatus = select.value;
            await resolveCase(id, finalStatus);
        });
    });
}

async function resolveCase(id, finalStatus) {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        alert('Session expired. Please login again.');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/reports/resolve`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id, finalStatus })
        });

        if (response.ok) {
            await loadReportsFromAPI();
            updateStats();
            renderReports(document.querySelector('.filter-btn.active')?.dataset.filter || 'all');
            renderActiveCases();
        } else {
            alert('Failed to resolve case. Please try again.');
        }
    } catch (error) {
        console.error('Failed to resolve:', error);
        alert('Failed to resolve case.');
    }
}

async function addReport(username, reason, statusType, finalStatus = null) {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        alert('Session expired. Please login again.');
        return false;
    }

    try {
        const response = await fetch(`${API_URL}/api/reports`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ username, reason, statusType, finalStatus })
        });

        if (response.ok) {
            await loadReportsFromAPI();
            updateStats();
            renderReports(document.querySelector('.filter-btn.active')?.dataset.filter || 'all');
            renderActiveCases();
            return true;
        } else {
            alert('Failed to add report. Please try again.');
            return false;
        }
    } catch (error) {
        console.error('Failed to add:', error);
        alert('Failed to add report.');
        return false;
    }
}

async function loadReportsFromAPI() {
    try {
        const response = await fetch(`${API_URL}/api/reports`);
        const data = await response.json();
        reports = data.reports || [];
        nextId = data.nextId || 1;
    } catch (error) {
        console.error('Failed to load reports:', error);
        reports = [];
        nextId = 1;
    }
}

function exportData() {
    const data = {
        reports: reports,
        nextId: nextId,
        exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `abuse-reports-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function importData(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.reports && Array.isArray(data.reports)) {
                const token = localStorage.getItem('adminToken');
                if (!token) {
                    alert('Please login to import data');
                    return;
                }
                
                for (const report of data.reports) {
                    await addReport(report.username, report.reason, report.statusType, report.finalStatus);
                }
                alert('Data imported successfully!');
            } else {
                alert('Invalid file format');
            }
        } catch (err) {
            alert('Error parsing file');
        }
    };
    reader.readAsText(file);
}

async function verifyPassword(password, token) {
    try {
        const response = await fetch(`${API_URL}/api/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password, token })
        });
        const result = await response.json();
        if (result.success === true) {
            localStorage.setItem('adminToken', password);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Verification failed:', error);
        return false;
    }
}

function initTurnstile() {
    const container = document.getElementById('turnstileContainer');
    
    if (!container) {
        console.error('turnstileContainer element not found');
        return;
    }
    
    if (typeof turnstile !== 'undefined') {
        turnstile.render('#turnstileContainer', {
            sitekey: '0x4AAAAAACv_BFsvfFdlrvG6',
            callback: function(token) {
                turnstileToken = token;
                const loginError = document.getElementById('loginError');
                if (loginError) loginError.textContent = '';
            },
            'error-callback': function(error) {
                console.error('Turnstile error:', error);
                const loginError = document.getElementById('loginError');
                if (loginError) loginError.textContent = 'Verification failed. Please refresh.';
            },
            'expired-callback': function() {
                turnstileToken = null;
                const loginError = document.getElementById('loginError');
                if (loginError) loginError.textContent = 'Verification expired. Please refresh.';
            }
        });
    } else {
        console.error('Turnstile script not loaded');
    }
}

const modal = document.getElementById('modal');
const adminModal = document.getElementById('adminModal');
const openModalBtn = document.getElementById('openModalBtn');
const openAdminBtn = document.getElementById('openAdminBtn');
const closeBtns = document.querySelectorAll('.close-btn');

function openModalFunc(modalEl) {
    modalEl.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModalFunc(modalEl) {
    modalEl.classList.remove('active');
    document.body.style.overflow = '';
}

if (openModalBtn) openModalBtn.addEventListener('click', () => openModalFunc(modal));
if (openAdminBtn) openAdminBtn.addEventListener('click', () => openModalFunc(adminModal));

closeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        closeModalFunc(adminModal);
        closeModalFunc(modal);
    });
});

[modal, adminModal].forEach(modalEl => {
    if (modalEl) {
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) closeModalFunc(modalEl);
        });
    }
});

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderReports(btn.dataset.filter);
    });
});

const adminAuth = document.getElementById('adminAuth');
const adminPanel = document.getElementById('adminPanel');
const loginBtn = document.getElementById('loginBtn');
const adminPassword = document.getElementById('adminPassword');
const loginError = document.getElementById('loginError');

if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
        const password = adminPassword.value;
        
        if (!password) {
            loginError.textContent = 'Please enter your password';
            return;
        }
        
        if (!turnstileToken) {
            loginError.textContent = 'Please complete the verification';
            return;
        }
        
        loginBtn.disabled = true;
        loginBtn.textContent = 'Verifying...';
        
        const isValid = await verifyPassword(password, turnstileToken);
        
        if (isValid) {
            adminAuth.style.display = 'none';
            adminPanel.style.display = 'block';
            renderActiveCases();
        } else {
            loginError.textContent = 'Invalid password or verification failed';
            if (typeof turnstile !== 'undefined') turnstile.reset();
            turnstileToken = null;
        }
        
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
    });
}

const reportStatusType = document.getElementById('reportStatusType');
const finalStatusGroup = document.getElementById('finalStatusGroup');

if (reportStatusType) {
    reportStatusType.addEventListener('change', (e) => {
        finalStatusGroup.style.display = e.target.value === 'resolved' ? 'block' : 'none';
    });
}

const addReportForm = document.getElementById('addReportForm');
if (addReportForm) {
    addReportForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('reportUsername').value;
        const reason = document.getElementById('reportReason').value;
        const statusType = document.getElementById('reportStatusType').value;
        const finalStatus = statusType === 'resolved' ? document.getElementById('reportFinalStatus').value : null;
        
        if (username && reason) {
            const success = await addReport(username, reason, statusType, finalStatus);
            if (success) {
                addReportForm.reset();
                finalStatusGroup.style.display = 'none';
                alert('Report added successfully!');
            }
        } else {
            alert('Please fill all fields');
        }
    });
}

const exportDataBtn = document.getElementById('exportDataBtn');
if (exportDataBtn) exportDataBtn.addEventListener('click', exportData);

const importDataBtn = document.getElementById('importDataBtn');
const importFile = document.getElementById('importFile');
if (importDataBtn) {
    importDataBtn.addEventListener('click', () => {
        importFile.click();
    });
}
if (importFile) {
    importFile.addEventListener('change', (e) => {
        if (e.target.files[0]) importData(e.target.files[0]);
    });
}

async function initialize() {
    await loadReportsFromAPI();
    updateStats();
    renderReports('all');
    initParticles();
    setTimeout(() => {
        initTurnstile();
    }, 500);
}

initialize();

window.addEventListener('resize', () => {
    if (particleCanvas) {
        particleCanvas.width = window.innerWidth;
        particleCanvas.height = window.innerHeight;
        particles = [];
        initParticles();
    }
});