// OwlMail Web Application
// API Base URL - 使用新的 API v1 端点
const API_BASE = `${window.location.origin}/api/v1`;

// Global State
let state = {
    emails: [],
    currentEmail: null,
    currentPage: 0,
    pageSize: 50,
    total: 0,
    searchQuery: '',
    ws: null
};

// API Functions - 使用新的 RESTful API 设计
const API = {
    async getEmails(offset = 0, limit = 50, query = '') {
        const params = new URLSearchParams({
            offset: offset.toString(),
            limit: limit.toString()
        });
        if (query) {
            params.append('q', query);
        }
        const response = await fetch(`${API_BASE}/emails?${params}`);
        if (!response.ok) throw new Error('Failed to fetch emails');
        return await response.json();
    },

    async getEmail(id) {
        const response = await fetch(`${API_BASE}/emails/${id}`);
        if (!response.ok) throw new Error('Failed to fetch email');
        return await response.json();
    },

    async getEmailHTML(id) {
        const response = await fetch(`${API_BASE}/emails/${id}/html`);
        if (!response.ok) throw new Error('Failed to fetch email HTML');
        return await response.text();
    },

    async deleteEmail(id) {
        const response = await fetch(`${API_BASE}/emails/${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete email');
        return await response.json();
    },

    async deleteAllEmails() {
        const response = await fetch(`${API_BASE}/emails`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete all emails');
        return await response.json();
    },

    async markAllRead() {
        const response = await fetch(`${API_BASE}/emails/read`, {
            method: 'PATCH'
        });
        if (!response.ok) throw new Error('Failed to mark all as read');
        return await response.json();
    },

    async relayEmail(id, relayTo = '') {
        const url = relayTo
            ? `${API_BASE}/emails/${id}/actions/relay/${encodeURIComponent(relayTo)}`
            : `${API_BASE}/emails/${id}/actions/relay`;
        const response = await fetch(url, {
            method: 'POST'
        });
        if (!response.ok) throw new Error('Failed to relay email');
        return await response.json();
    }
};

// WebSocket Connection - 使用新的 API v1 WebSocket 端点
function connectWebSocket() {
    try {
        // Use ws:// or wss:// based on current protocol
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/v1/ws`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WebSocket connected');
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (e) {
                console.error('Failed to parse WebSocket message:', e);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected, reconnecting...');
            setTimeout(connectWebSocket, 3000);
        };

        state.ws = ws;
    } catch (e) {
        console.error('Failed to connect WebSocket:', e);
        // Retry after 3 seconds
        setTimeout(connectWebSocket, 3000);
    }
}

function handleWebSocketMessage(data) {
    if (data.type === 'new') {
        // Add new email to the list
        state.emails.unshift(data.email);
        state.total++;
        renderEmailList();
        updateEmailCount();
    } else if (data.type === 'delete') {
        // Remove deleted email from the list
        state.emails = state.emails.filter(e => e.id !== data.id);
        state.total--;
        renderEmailList();
        updateEmailCount();
        if (state.currentEmail && state.currentEmail.id === data.id) {
            state.currentEmail = null;
            renderEmailDetail();
        }
    }
}

// UI Rendering Functions
function renderEmailList() {
    const container = document.getElementById('emailList');
    if (!container) return;

    if (state.emails.length === 0) {
        container.innerHTML = '<div class="loading">暂无邮件</div>';
        return;
    }

    container.innerHTML = state.emails.map(email => {
        const from = email.from && email.from.length > 0
            ? email.from[0].address || email.from[0].name || '未知发件人'
            : '未知发件人';
        const time = formatTime(email.time);
        const preview = email.text ? email.text.substring(0, 100) : '';
        const unreadClass = email.read ? '' : 'unread';
        const selectedClass = state.currentEmail && state.currentEmail.id === email.id ? 'selected' : '';
        const attachments = email.attachments && email.attachments.length > 0
            ? `<div class="email-item-attachments">📎 ${email.attachments.length} 个附件</div>`
            : '';

        return `
            <div class="email-item ${unreadClass} ${selectedClass}" data-id="${email.id}">
                <div class="email-item-header">
                    <span class="email-item-from">${escapeHtml(from)}</span>
                    <span class="email-item-time">${time}</span>
                </div>
                <div class="email-item-subject">${escapeHtml(email.subject || '(无主题)')}</div>
                ${preview ? `<div class="email-item-preview">${escapeHtml(preview)}</div>` : ''}
                ${attachments}
            </div>
        `;
    }).join('');

    // Add click handlers
    container.querySelectorAll('.email-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            loadEmailDetail(id);
        });
    });
}

function renderEmailDetail() {
    const container = document.getElementById('emailDetail');
    if (!container) return;

    if (!state.currentEmail) {
        container.innerHTML = '<div class="empty-state"><p>选择一个邮件查看详情</p></div>';
        return;
    }

    const email = state.currentEmail;
    const from = email.from && email.from.length > 0
        ? formatAddress(email.from[0])
        : '未知发件人';
    const to = email.to && email.to.length > 0
        ? email.to.map(addr => formatAddress(addr)).join(', ')
        : '未知收件人';
    const cc = email.cc && email.cc.length > 0
        ? email.cc.map(addr => formatAddress(addr)).join(', ')
        : '';
    const time = formatTime(email.time);
    const attachments = email.attachments && email.attachments.length > 0
        ? renderAttachments(email.attachments, email.id)
        : '';

    container.innerHTML = `
        <div class="email-detail-actions">
            <button class="btn btn-primary" onclick="downloadEmail('${email.id}')">下载 .eml</button>
            <button class="btn btn-secondary" onclick="viewEmailSource('${email.id}')">查看源码</button>
            <button class="btn btn-danger" onclick="deleteEmail('${email.id}')">删除</button>
        </div>
        <div class="email-detail-header">
            <h2 class="email-detail-subject">${escapeHtml(email.subject || '(无主题)')}</h2>
            <div class="email-detail-meta">
                <span class="email-detail-meta-label">发件人:</span>
                <span>${escapeHtml(from)}</span>
                <span class="email-detail-meta-label">收件人:</span>
                <span>${escapeHtml(to)}</span>
                ${cc ? `
                    <span class="email-detail-meta-label">抄送:</span>
                    <span>${escapeHtml(cc)}</span>
                ` : ''}
                <span class="email-detail-meta-label">时间:</span>
                <span>${time}</span>
            </div>
        </div>
        <div class="email-detail-body">
            ${email.html ? renderHTML(email.html) : renderText(email.text || '')}
        </div>
        ${attachments}
    `;
}

function renderHTML(html) {
    // Create a safe iframe for HTML content
    const iframeId = 'email-html-' + Date.now();
    return `
        <div class="email-detail-html">
            <iframe id="${iframeId}" srcdoc="${escapeHtml(html)}"></iframe>
        </div>
    `;
}

function renderText(text) {
    return `<div class="email-detail-text">${escapeHtml(text)}</div>`;
}

function renderAttachments(attachments, emailId) {
    return `
        <div class="email-detail-attachments">
            <h3>附件 (${attachments.length})</h3>
            ${attachments.map(att => {
        // 使用新的 API v1 端点：/api/v1/emails/:id/attachments/:filename
        const url = `${API_BASE}/emails/${emailId}/attachments/${encodeURIComponent(att.generatedFileName)}`;
        return `
                    <div class="attachment-item">
                        <div class="attachment-item-info">
                            <div class="attachment-item-name">${escapeHtml(att.fileName || att.generatedFileName)}</div>
                            <div class="attachment-item-size">${att.sizeHuman || formatBytes(att.size || 0)}</div>
                        </div>
                        <a href="${url}" class="attachment-item-download" download>下载</a>
                    </div>
                `;
    }).join('')}
        </div>
    `;
}

// Action Functions
async function loadEmails() {
    try {
        showLoading();
        const data = await API.getEmails(
            state.currentPage * state.pageSize,
            state.pageSize,
            state.searchQuery
        );
        state.emails = data.emails || [];
        state.total = data.total || 0;
        renderEmailList();
        updateEmailCount();
        updatePagination();
    } catch (error) {
        console.error('Failed to load emails:', error);
        alert('加载邮件失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function loadEmailDetail(id) {
    try {
        showLoading();
        const email = await API.getEmail(id);
        state.currentEmail = email;
        renderEmailDetail();
        renderEmailList(); // Update selected state
    } catch (error) {
        console.error('Failed to load email detail:', error);
        alert('加载邮件详情失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function deleteEmail(id) {
    if (!confirm('确定要删除这封邮件吗？')) return;

    try {
        showLoading();
        await API.deleteEmail(id);
        // Remove from list
        state.emails = state.emails.filter(e => e.id !== id);
        state.total--;
        if (state.currentEmail && state.currentEmail.id === id) {
            state.currentEmail = null;
            renderEmailDetail();
        }
        renderEmailList();
        updateEmailCount();
    } catch (error) {
        console.error('Failed to delete email:', error);
        alert('删除邮件失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function deleteAllEmails() {
    if (!confirm('确定要删除所有邮件吗？此操作不可恢复！')) return;

    try {
        showLoading();
        await API.deleteAllEmails();
        state.emails = [];
        state.total = 0;
        state.currentEmail = null;
        renderEmailList();
        renderEmailDetail();
        updateEmailCount();
    } catch (error) {
        console.error('Failed to delete all emails:', error);
        alert('删除所有邮件失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function markAllRead() {
    try {
        showLoading();
        const result = await API.markAllRead();
        // Reload emails to update read status
        await loadEmails();
        alert(`已标记 ${result.count || 0} 封邮件为已读`);
    } catch (error) {
        console.error('Failed to mark all as read:', error);
        alert('标记失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

function downloadEmail(id) {
    // 使用新的 API v1 端点：/api/v1/emails/:id/raw (替代 /download)
    window.open(`${API_BASE}/emails/${id}/raw`, '_blank');
}

function viewEmailSource(id) {
    // 使用新的 API v1 端点：/api/v1/emails/:id/source
    window.open(`${API_BASE}/emails/${id}/source`, '_blank');
}

function searchEmails() {
    const query = document.getElementById('searchInput').value.trim();
    state.searchQuery = query;
    state.currentPage = 0;
    loadEmails();
}

function nextPage() {
    const maxPage = Math.ceil(state.total / state.pageSize) - 1;
    if (state.currentPage < maxPage) {
        state.currentPage++;
        loadEmails();
    }
}

function prevPage() {
    if (state.currentPage > 0) {
        state.currentPage--;
        loadEmails();
    }
}

// Utility Functions
function formatTime(timeStr) {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days} 天前`;
    } else if (hours > 0) {
        return `${hours} 小时前`;
    } else if (minutes > 0) {
        return `${minutes} 分钟前`;
    } else {
        return '刚刚';
    }
}

function formatAddress(addr) {
    if (typeof addr === 'string') return addr;
    if (addr.Name && addr.Address) {
        return `${addr.Name} <${addr.Address}>`;
    }
    return addr.Address || addr.Name || '未知';
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateEmailCount() {
    const countEl = document.getElementById('emailCount');
    if (countEl) {
        countEl.textContent = `${state.total} 封邮件`;
    }
}

function updatePagination() {
    const pageInfo = document.getElementById('pageInfo');
    const maxPage = Math.ceil(state.total / state.pageSize) - 1;
    if (pageInfo) {
        pageInfo.textContent = `第 ${state.currentPage + 1} 页 / 共 ${maxPage + 1} 页`;
    }

    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    if (prevBtn) prevBtn.disabled = state.currentPage === 0;
    if (nextBtn) nextBtn.disabled = state.currentPage >= maxPage;
}

function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'flex';
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
}

function setTheme(theme) {
    const body = document.body;
    const themeToggle = document.getElementById('themeToggle');

    if (theme === 'dark') {
        body.classList.remove('light-theme');
        body.classList.add('dark-theme');
        if (themeToggle) themeToggle.textContent = '☀️';
    } else {
        body.classList.remove('dark-theme');
        body.classList.add('light-theme');
        if (themeToggle) themeToggle.textContent = '🌙';
    }

    localStorage.setItem('theme', theme);
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme
    initTheme();

    // Load initial emails
    loadEmails();

    // Connect WebSocket
    connectWebSocket();

    // Button event listeners
    document.getElementById('refreshBtn').addEventListener('click', loadEmails);
    document.getElementById('markAllReadBtn').addEventListener('click', markAllRead);
    document.getElementById('deleteAllBtn').addEventListener('click', deleteAllEmails);
    document.getElementById('searchBtn').addEventListener('click', searchEmails);
    document.getElementById('prevPage').addEventListener('click', prevPage);
    document.getElementById('nextPage').addEventListener('click', nextPage);
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // Search input enter key
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchEmails();
        }
    });
});

// Make functions available globally for onclick handlers
window.deleteEmail = deleteEmail;
window.downloadEmail = downloadEmail;
window.viewEmailSource = viewEmailSource;

