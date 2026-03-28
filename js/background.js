/**
 * Background Service Worker
 * 
 * 职责：
 * 1. Google Drive 云同步（OAuth2 认证 + 文件读写）
 * 2. 处理需要绕过 CORS 限制的请求（图片获取等）
 */

// ============================================
// Google Drive 同步服务
// ============================================

const GDRIVE_FOLDER_NAME = 'AITimeline_Backup';
const GDRIVE_DATA_FILE = 'ait-backup.json';
const GDRIVE_API = 'https://www.googleapis.com';

const IS_FIREFOX = typeof browser !== 'undefined' && browser.runtime?.id;

const OAUTH_CLIENT_ID_CHROME = '945798922226-gdjj6v37j5fueacci9253u0j1iasiht2.apps.googleusercontent.com';
const OAUTH_CLIENT_ID_FIREFOX = '945798922226-jve664u0ibs7lsji89kr8s7f9lsnilla.apps.googleusercontent.com';
const OAUTH_SCOPES = 'https://www.googleapis.com/auth/drive.file';

/**
 * 获取 OAuth2 Access Token
 * Chrome: chrome.identity.getAuthToken（内置 OAuth，自动管理 token）
 * Firefox: browser.identity.launchWebAuthFlow（打开网页授权）
 */
async function getAuthToken(interactive = true) {
    if (IS_FIREFOX) {
        return await getAuthTokenFirefox(interactive);
    }
    const result = await chrome.identity.getAuthToken({ interactive });
    if (!result.token) {
        throw new Error('Not authenticated');
    }
    return result.token;
}

async function getAuthTokenFirefox(interactive) {
    const stored = await browser.storage.local.get('gdriveToken');
    if (stored.gdriveToken?.access_token) {
        const isValid = await validateToken(stored.gdriveToken.access_token);
        if (isValid) return stored.gdriveToken.access_token;
    }

    if (!interactive) throw new Error('Not authenticated');

    const redirectUrl = browser.identity.getRedirectURL();
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth` +
        `?client_id=${encodeURIComponent(OAUTH_CLIENT_ID_FIREFOX)}` +
        `&response_type=token` +
        `&redirect_uri=${encodeURIComponent(redirectUrl)}` +
        `&scope=${encodeURIComponent(OAUTH_SCOPES)}`;

    const responseUrl = await browser.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
    });

    const params = new URL(responseUrl.replace('#', '?')).searchParams;
    const accessToken = params.get('access_token');
    if (!accessToken) throw new Error('OAuth failed: no access_token');

    await browser.storage.local.set({
        gdriveToken: { access_token: accessToken, obtained_at: Date.now() }
    });

    return accessToken;
}

async function validateToken(token) {
    try {
        const resp = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`);
        return resp.ok;
    } catch { return false; }
}

/**
 * 撤销 Token 并登出
 */
async function revokeToken() {
    try {
        if (IS_FIREFOX) {
            const stored = await browser.storage.local.get('gdriveToken');
            const token = stored.gdriveToken?.access_token;
            if (token) {
                await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
                await browser.storage.local.remove('gdriveToken');
            }
        } else {
            const result = await chrome.identity.getAuthToken({ interactive: false });
            if (result.token) {
                await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${result.token}`);
                await chrome.identity.removeCachedAuthToken({ token: result.token });
            }
        }
    } catch {}
}

/**
 * 查找 Google Drive 中的文件/文件夹
 * @param {string} token - Access Token
 * @param {string} name - 文件名
 * @param {string} mimeType - MIME 类型（可选，用于区分文件和文件夹）
 * @param {string} parentId - 父文件夹 ID（可选）
 * @returns {string|null} 文件 ID
 */
async function findFile(token, name, mimeType = null, parentId = null) {
    let query = `name='${name}' and trashed=false`;
    if (mimeType) query += ` and mimeType='${mimeType}'`;
    if (parentId) query += ` and '${parentId}' in parents`;
    
    const url = `${GDRIVE_API}/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
    const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!resp.ok) throw new Error(`Find file failed: ${resp.status}`);
    
    const data = await resp.json();
    return data.files?.[0]?.id || null;
}

/**
 * 确保备份文件夹存在
 * @returns {string} 文件夹 ID
 */
async function ensureFolder(token) {
    // 先查找
    const folderId = await findFile(token, GDRIVE_FOLDER_NAME, 'application/vnd.google-apps.folder');
    if (folderId) return folderId;
    
    // 不存在，创建
    const resp = await fetch(`${GDRIVE_API}/drive/v3/files`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: GDRIVE_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder'
        })
    });
    
    if (!resp.ok) throw new Error(`Create folder failed: ${resp.status}`);
    
    const folder = await resp.json();
    return folder.id;
}

/**
 * 上传数据到 Google Drive
 * 使用 multipart upload（元数据 + 内容一起上传）
 */
async function uploadToDrive(token, data) {
    const folderId = await ensureFolder(token);
    const fileId = await findFile(token, GDRIVE_DATA_FILE, null, folderId);
    
    // 构建 multipart body
    const boundary = 'ait_boundary_' + Date.now();
    const metadata = {
        name: GDRIVE_DATA_FILE,
        mimeType: 'application/json',
        ...(!fileId && { parents: [folderId] }) // 新建时指定父文件夹
    };
    
    const body = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        `--${boundary}`,
        'Content-Type: application/json',
        '',
        JSON.stringify(data),
        `--${boundary}--`
    ].join('\r\n');
    
    // 更新已有文件 or 创建新文件
    const url = fileId
        ? `${GDRIVE_API}/upload/drive/v3/files/${fileId}?uploadType=multipart`
        : `${GDRIVE_API}/upload/drive/v3/files?uploadType=multipart`;
    
    const resp = await fetch(url, {
        method: fileId ? 'PATCH' : 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: body
    });
    
    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Upload failed: ${resp.status} ${errText}`);
    }
    
    return await resp.json();
}

/**
 * 从 Google Drive 下载数据
 */
async function downloadFromDrive(token) {
    const folderId = await findFile(token, GDRIVE_FOLDER_NAME, 'application/vnd.google-apps.folder');
    if (!folderId) return null; // 文件夹不存在，说明从未上传过
    
    const fileId = await findFile(token, GDRIVE_DATA_FILE, null, folderId);
    if (!fileId) return null; // 文件不存在
    
    const resp = await fetch(`${GDRIVE_API}/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    
    return await resp.json();
}

// ============================================
// 扩展图标点击
// ============================================

const SUPPORTED_DOMAINS = [
    'chatgpt.com', 'chat.openai.com', 'gemini.google.com', 'doubao.com',
    'chat.deepseek.com', 'yiyan.baidu.com', 'qianwen.com', 'chat.qwen.ai',
    'kimi.com', 'kimi.moonshot.cn', 'yuanbao.tencent.com', 'grok.com',
    'perplexity.ai', 'claude.ai', 'notebooklm.google.com'
];

function isSupportedSite(url) {
    try {
        const hostname = new URL(url).hostname;
        return SUPPORTED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
    } catch { return false; }
}

chrome.action.onClicked.addListener(async (tab) => {
    if (tab.url && isSupportedSite(tab.url)) {
        try {
            await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PANEL_MODAL' });
        } catch {
            chrome.tabs.create({ url: chrome.runtime.getURL('popup/guide.html') });
        }
    } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('popup/guide.html') });
    }
});

// ============================================
// 消息处理
// ============================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // --- Google Drive 同步 ---
    
    // 上传到 Google Drive（未登录时自动触发登录）
    if (request.type === 'GDRIVE_UPLOAD') {
        (async () => {
            try {
                const token = await getAuthToken(true);
                await uploadToDrive(token, request.data);
                sendResponse({ success: true });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }
    
    // 从 Google Drive 下载（未登录时自动触发登录）
    if (request.type === 'GDRIVE_DOWNLOAD') {
        (async () => {
            try {
                const token = await getAuthToken(true);
                const data = await downloadFromDrive(token);
                sendResponse({ success: true, data });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }
    
    // --- 旧功能：图片获取（CORS 绕过）---
    
    if (request.type === 'FETCH_IMAGE') {
        fetchImageAsBase64(request.url)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

/**
 * 获取图片并转换为 base64
 */
async function fetchImageAsBase64(url) {
    try {
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const blob = await response.blob();
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                resolve({
                    success: true,
                    data: reader.result,
                    type: blob.type
                });
            };
            reader.onerror = () => reject(new Error('Failed to read blob'));
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('[AI Chat Timeline Background] Fetch failed:', error);
        return { success: false, error: error.message };
    }
}
