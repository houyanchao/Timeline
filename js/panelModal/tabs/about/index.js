/**
 * About Tab - 关于插件
 */

class AboutTab extends BaseTab {
    constructor() {
        super();
        this.id = 'about';
        this.name = chrome.i18n.getMessage('aboutTabName') || '关于插件';
        const isEdge = /Edg/i.test(navigator.userAgent);
        this._storeUrl = isEdge
            ? 'https://microsoftedge.microsoft.com/addons/detail/ai-timeline%EF%BC%9Agemini%E3%80%81chatgp/ekednjjojnhlajfobalaaihkibbdcbab'
            : 'https://chromewebstore.google.com/detail/fgebdnlceacaiaeikopldglhffljjlhh?utm_source=item-share-cb';
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="8" stroke-width="3" stroke-linecap="round"/>
            <line x1="12" y1="12" x2="12" y2="16" stroke-linecap="round"/>
        </svg>`;
    }

    render() {
        const container = document.createElement('div');
        container.className = 'about-tab';

        container.innerHTML = `
            <div class="about-share-actions">
                <a href="https://chromewebstore.google.com/detail/fgebdnlceacaiaeikopldglhffljjlhh?utm_source=item-share-cb" target="_blank" class="about-share-action-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" y1="8" x2="12" y2="8"/><line x1="3.95" y1="6.06" x2="8.54" y2="14"/><line x1="10.88" y1="21.94" x2="15.46" y2="14"/></svg>
                    Chrome 安装地址
                </a>
                <a href="https://microsoftedge.microsoft.com/addons/detail/ai-timeline%EF%BC%9Agemini%E3%80%81chatgp/ekednjjojnhlajfobalaaihkibbdcbab" target="_blank" class="about-share-action-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49"/></svg>
                    Edge 安装地址
                </a>
                <a href="https://github.com/houyanchao/AITimeline" target="_blank" class="about-share-action-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/></svg>
                    GitHub 开源地址
                </a>
                <a href="https://timeline4ai.com/#/guide?section=timeline" target="_blank" class="about-share-action-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
                    官方文档
                </a>
            </div>

            <div class="about-section">
                <div class="about-section-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
                        <polyline points="13,2 13,9 20,9"/>
                    </svg>
                </div>
                <div class="about-section-body">
                    <div class="about-section-title">${chrome.i18n.getMessage('aboutPluginTitle') || '插件简介'}</div>
                    <div class="about-section-content">${chrome.i18n.getMessage('aboutPluginContent') || '专门为 AI 对话开发的提效插件，拥有 对话时间轴、闪记、复制 LaTeX 公式、自定义提示词等超多功能。支持 ChatGPT、Gemini、DeepSeek、Kimi、Claude 等主流平台，它的使命是助你使用 AI 的效率翻倍。'}</div>
                </div>
            </div>

            <div class="about-section">
                <div class="about-section-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                </div>
                <div class="about-section-body">
                    <div class="about-section-title">${chrome.i18n.getMessage('aboutDataSecurityTitle') || '数据安全'}</div>
                    <div class="about-section-content">${chrome.i18n.getMessage('aboutDataSecurityContent') || '你在本插件内的所有数据都存储在你的浏览器本地或你的 Google Drive 中，不经过任何第三方服务器。插件不会收集、上传或分享你的任何对话内容和个人信息，本项目已在GitHub开源，可随时审查代码。'}</div>
                </div>
            </div>

            <div class="about-section">
                <div class="about-section-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>
                </div>
                <div class="about-section-body">
                    <div class="about-section-title">${chrome.i18n.getMessage('aboutDeveloperTitle') || '开发者'}</div>
                    <div class="about-section-content">
                        ${chrome.i18n.getMessage('aboutDeveloperContent') || '这个项目是我一个人在维护，每周 1～2 个新版本的更新节奏。如果想反馈 bug 或功能建议，可通过以下任一渠道进行反馈（我看到一定会回复）：'}
                        <div class="about-feedback-blocks">
                            <a href="https://chromewebstore.google.com/detail/fgebdnlceacaiaeikopldglhffljjlhh?utm_source=item-share-cb" target="_blank" class="about-feedback-block">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
                                <span>Chrome 商店评价</span>
                            </a>
                            <a href="https://github.com/houyanchao/AITimeline/issues" target="_blank" class="about-feedback-block">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/></svg>
                                <span>GitHub Issues</span>
                            </a>
                            <div class="about-feedback-block about-feedback-email" data-email="houyanchao@outlook.com">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                <span>邮件联系我</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="about-section about-section-highlight">
                <div class="about-section-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                    </svg>
                </div>
                <div class="about-section-body">
                    <div class="about-section-title">${chrome.i18n.getMessage('aboutShareTitle') || '想请你帮个忙'}</div>
                    <div class="about-section-content">
                        ${chrome.i18n.getMessage('aboutShareContent') || '如果这个插件帮到了你，欢迎分享到 小红书、X、Reddit、YouTube 等等，也欢迎分享给朋友、同学、同事，让更多人使用到它。我是一个人维护这个插件，精力有限，无法抽身去做用户增长运营，我能做到的是让这个插件越来越好用，非常感谢。❤️'}
                    </div>
                </div>
            </div>

        `;

        return container;
    }

    mounted() {
        super.mounted();
        const emailItem = document.querySelector('.about-feedback-email');
        if (emailItem) {
            this.addEventListener(emailItem, 'click', () => {
                const email = emailItem.dataset.email;
                navigator.clipboard.writeText(email).then(() => {
                    if (window.globalToastManager) {
                        window.globalToastManager.success(chrome.i18n.getMessage('xpzmvk') || '复制成功');
                    }
                });
            });
        }
    }

    unmounted() {
        super.unmounted();
    }
}
