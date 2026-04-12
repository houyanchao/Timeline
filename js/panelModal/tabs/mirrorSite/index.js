/**
 * Mirror Site Tab - 镜像站点设置
 *
 * 允许用户添加自定义镜像站域名，
 * 在这些站点上可以使用浮窗快捷调用提示词（复制模式）
 */

class MirrorSiteTab extends BaseTab {
    constructor() {
        super();
        this.id = 'mirror-site';
        this.name = chrome.i18n.getMessage('mirrorSiteTabName') || '镜像站点';
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>`;
    }

    shouldShow() {
        return true;
    }

    getInitialState() {
        return {
            transient: {
                domains: []
            },
            persistent: {}
        };
    }

    render() {
        const container = document.createElement('div');
        container.className = 'mirror-site-settings';

        container.innerHTML = `
            <div class="mirror-site-hint">
                ${chrome.i18n.getMessage('mirrorSiteHint') || '添加 AI 镜像站域名后，在这些网站上会出现浮窗按钮，可使用本插件的部分功能。'}
            </div>
            <div class="mirror-site-add-row">
                <input type="text" class="mirror-site-input" id="mirror-site-domain-input"
                    placeholder="${chrome.i18n.getMessage('mirrorSiteInputPlaceholder') || '输入域名，如 chat.example.com'}"
                    autocomplete="off" spellcheck="false">
                <button class="mirror-site-add-btn" id="mirror-site-add-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    <span>${chrome.i18n.getMessage('mirrorSiteAddDomain') || '添加'}</span>
                </button>
            </div>
            <div class="mirror-site-list-section">
                <div class="mirror-site-list-title">${chrome.i18n.getMessage('mirrorSiteDomainListTitle') || '已添加的域名'}</div>
                <div class="mirror-site-list" id="mirror-site-list"></div>
            </div>
        `;

        return container;
    }

    async mounted() {
        super.mounted();
        await this._loadDomains();
        this._renderList();
        this._bindEvents();
    }

    async _loadDomains() {
        try {
            const result = await chrome.storage.local.get('mirrorSiteDomains');
            this.setState('domains', result.mirrorSiteDomains || []);
        } catch (e) {
            this.setState('domains', []);
        }
    }

    async _saveDomains() {
        const domains = this.getState('domains') || [];
        await chrome.storage.local.set({ mirrorSiteDomains: domains });
    }

    _bindEvents() {
        const addBtn = document.getElementById('mirror-site-add-btn');
        const input = document.getElementById('mirror-site-domain-input');

        if (addBtn) {
            this.addEventListener(addBtn, 'click', () => this._addDomain());
        }
        if (input) {
            this.addEventListener(input, 'keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._addDomain();
                }
            });
        }
    }

    _addDomain() {
        const input = document.getElementById('mirror-site-domain-input');
        if (!input) return;

        const raw = input.value.trim().toLowerCase();
        if (!raw) return;

        let domain = raw;
        try {
            if (/^https?:\/\//.test(domain)) {
                domain = new URL(domain).hostname;
            } else if (domain.includes('/')) {
                domain = domain.split('/')[0];
            }
        } catch { /* keep as-is, will be caught by regex below */ }

        // 域名格式校验
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
            if (window.globalToastManager) {
                window.globalToastManager.show('error', chrome.i18n.getMessage('mirrorSiteDomainInvalid') || '域名格式无效');
            }
            return;
        }

        // 不允许与 SITE_INFO 中的已适配平台冲突
        if (typeof SITE_INFO !== 'undefined') {
            for (const platform of SITE_INFO) {
                if (platform.sites.some(s => domain === s || domain.endsWith('.' + s) || s.endsWith('.' + domain))) {
                    if (window.globalToastManager) {
                        window.globalToastManager.show('info', chrome.i18n.getMessage('mirrorSiteDomainIsOfficial') || '该域名已是适配平台，无需添加');
                    }
                    return;
                }
            }
        }

        const domains = this.getState('domains') || [];

        if (domains.includes(domain)) {
            if (window.globalToastManager) {
                window.globalToastManager.show('info', chrome.i18n.getMessage('mirrorSiteDomainExists') || '域名已存在');
            }
            return;
        }

        domains.push(domain);
        this.setState('domains', domains);
        this._saveDomains();
        this._renderList();

        input.value = '';
        input.focus();

        if (window.globalToastManager) {
            window.globalToastManager.show('success', chrome.i18n.getMessage('mirrorSiteDomainAdded') || '域名已添加');
        }
    }

    async _removeDomain(domain) {
        const domains = this.getState('domains') || [];
        const newDomains = domains.filter(d => d !== domain);
        this.setState('domains', newDomains);
        await this._saveDomains();
        this._renderList();

        if (window.globalToastManager) {
            window.globalToastManager.show('success', chrome.i18n.getMessage('mirrorSiteDomainRemoved') || '域名已移除');
        }
    }

    _renderList() {
        const list = document.getElementById('mirror-site-list');
        if (!list) return;

        const domains = this.getState('domains') || [];

        if (domains.length === 0) {
            list.innerHTML = `
                <div class="mirror-site-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="2" y1="12" x2="22" y2="12"/>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                    <span>${chrome.i18n.getMessage('mirrorSiteNoDomains') || '暂未添加任何域名'}</span>
                </div>
            `;
            return;
        }

        list.innerHTML = domains.map(domain => `
            <div class="mirror-site-domain-item" data-domain="${this._escapeHtml(domain)}">
                <div class="mirror-site-domain-info">
                    <svg class="mirror-site-domain-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="2" y1="12" x2="22" y2="12"/>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10"/>
                    </svg>
                    <span class="mirror-site-domain-text">${this._escapeHtml(domain)}</span>
                </div>
                <button class="mirror-site-remove-btn" data-domain="${this._escapeHtml(domain)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        `).join('');

        list.querySelectorAll('.mirror-site-remove-btn').forEach(btn => {
            this.addEventListener(btn, 'click', () => {
                this._removeDomain(btn.dataset.domain);
            });
        });
    }

    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    unmounted() {
        super.unmounted();
    }
}
