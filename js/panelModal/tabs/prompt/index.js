/**
 * Prompt Tab - 提示词设置
 * 
 * 功能：
 * - 提示词列表管理（添加、编辑、删除）
 * - 提示词按钮显示开关
 */

class PromptTab extends BaseTab {
    constructor() {
        super();
        this.id = 'prompt';
        this.name = chrome.i18n.getMessage('hosegod');
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>`;
    }
    
    /**
     * 定义初始状态
     */
    getInitialState() {
        return {
            transient: {
                prompts: [],      // 提示词列表
                editingId: null   // 正在编辑的提示词 ID
            },
            persistent: {}
        };
    }
    
    /**
     * 渲染设置内容
     */
    render() {
        const container = document.createElement('div');
        container.className = 'prompt-settings';

        // ==================== 滚动区域 ====================
        const scrollArea = document.createElement('div');
        scrollArea.className = 'prompt-settings-scroll';
        scrollArea.innerHTML = `
            <div class="prompt-list-section">
                <div class="prompt-list-header">
                    <div class="prompt-list-title">${chrome.i18n.getMessage('biwhckdj')}</div>
                    <button class="prompt-add-btn" id="prompt-add-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        <span>${chrome.i18n.getMessage('addkbt')}</span>
                    </button>
                </div>
                <div class="prompt-list-container" id="prompt-list-container"></div>
            </div>
        `;
        container.appendChild(scrollArea);

        // ==================== 底部悬浮区域 ====================
        const bottomDivider = document.createElement('div');
        bottomDivider.className = 'prompt-settings-bottom-divider';
        container.appendChild(bottomDivider);

        const bottomSection = document.createElement('div');
        bottomSection.className = 'prompt-settings-bottom';
        bottomSection.innerHTML = `
            <div class="setting-item">
                <div class="setting-info">
                    <div class="setting-label">${chrome.i18n.getMessage('promptBtnDisplayLabel') || '显示提示词按钮'}</div>
                    <div class="setting-hint">${chrome.i18n.getMessage('hobsidbg')}</div>
                </div>
                <button class="starred-manage-btn">${chrome.i18n.getMessage('promptBtnSwitch') || '开关'}</button>
            </div>
        `;
        container.appendChild(bottomSection);

        this.addEventListener(bottomSection.querySelector('.starred-manage-btn'), 'click', () => {
            this._showPlatformManageModal();
        });

        return container;
    }
    
    /**
     * Tab 激活时加载状态
     */
    async mounted() {
        super.mounted();
        
        // 加载提示词列表
        await this.loadPrompts();
        
        // 渲染提示词列表
        this.renderPromptList();
        
        // 绑定添加按钮事件
        this.bindAddButtonEvent();
    }
    
    /**
     * 加载提示词列表
     */
    async loadPrompts() {
        try {
            const result = await chrome.storage.local.get('prompts');
            this.setState('prompts', result.prompts || []);
        } catch (e) {
            console.error('[PromptTab] Failed to load prompts:', e);
            this.setState('prompts', []);
        }
    }
    
    /**
     * 保存提示词列表
     */
    async savePrompts() {
        try {
            const prompts = this.getState('prompts') || [];
            await chrome.storage.local.set({ prompts: prompts });
        } catch (e) {
            console.error('[PromptTab] Failed to save prompts:', e);
        }
    }
    
    /**
     * 从 storage 中获取最新的提示词列表（防止内存状态过期导致数据丢失）
     */
    async _getFreshPrompts() {
        try {
            const result = await chrome.storage.local.get('prompts');
            return result.prompts || [];
        } catch (e) {
            return this.getState('prompts') || [];
        }
    }
    
    /**
     * 根据 platformId 获取平台信息
     */
    _getPlatformInfo(platformId) {
        if (!platformId || typeof SITE_INFO === 'undefined') return null;
        return SITE_INFO.find(site => site.id === platformId) || null;
    }
    
    /**
     * 渲染提示词列表
     */
    renderPromptList() {
        const container = document.getElementById('prompt-list-container');
        if (!container) return;
        
        const prompts = this.getState('prompts') || [];
        
        if (prompts.length === 0) {
            container.innerHTML = `
                <div class="prompt-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    <span>${chrome.i18n.getMessage('hsiwhwl')}</span>
                </div>
            `;
            return;
        }
        
        // 排序：置顶的在前面
        const sortedPrompts = [...prompts].sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return 0;
        });
        
        const pinIcon = '<span class="prompt-pin-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="3" x2="19" y2="3"/><line x1="12" y1="7" x2="12" y2="21"/><polyline points="8 11 12 7 16 11"/></svg></span>';
        
        container.innerHTML = sortedPrompts.map((prompt) => {
            // 获取平台 logo
            const platform = this._getPlatformInfo(prompt.platformId);
            const platformLogo = platform ? `<img class="prompt-platform-logo" src="${chrome.runtime.getURL(platform.logoPath)}" alt="${platform.name}" title="${platform.name}">` : '';
            const promptName = this._escapeHtml(prompt.name || '');
            
            return `
            <div class="prompt-item ${prompt.pinned ? 'pinned' : ''}" data-id="${prompt.id}">
                <div class="prompt-item-content">
                    <div class="prompt-item-header">
                        <div class="prompt-item-name">${prompt.pinned ? pinIcon : ''}${platformLogo}<span class="prompt-item-name-text">${promptName}</span></div>
                        <div class="prompt-item-actions">
                            <button class="prompt-item-btn prompt-pin-btn ${prompt.pinned ? 'active' : ''}" data-id="${prompt.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                    <line x1="5" y1="3" x2="19" y2="3"/>
                                    <line x1="12" y1="7" x2="12" y2="21"/>
                                    <polyline points="8 11 12 7 16 11"/>
                                </svg>
                            </button>
                            <button class="prompt-item-btn prompt-edit-btn" data-id="${prompt.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            <button class="prompt-item-btn prompt-delete-btn" data-id="${prompt.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                            <button class="prompt-item-btn prompt-move-up-btn" data-id="${prompt.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="18 15 12 9 6 15"/>
                                </svg>
                            </button>
                            <button class="prompt-item-btn prompt-move-down-btn" data-id="${prompt.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="6 9 12 15 18 9"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="prompt-item-text"><span class="prompt-item-text-content">${this._escapeHtml(prompt.content)}</span></div>
                </div>
            </div>`;
        }).join('');
        
        // 绑定按钮事件
        this.bindPromptItemEvents();
    }
    
    /**
     * 绑定添加按钮事件
     */
    bindAddButtonEvent() {
        const addBtn = document.getElementById('prompt-add-btn');
        if (addBtn) {
            this.addEventListener(addBtn, 'click', () => {
                this.showPromptModal();
            });
        }
    }
    
    /**
     * 绑定提示词项的按钮事件
     */
    bindPromptItemEvents() {
        // 置顶按钮
        const pinBtns = document.querySelectorAll('.prompt-pin-btn');
        pinBtns.forEach(btn => {
            this.addEventListener(btn, 'click', (e) => {
                const id = btn.getAttribute('data-id');
                this.togglePin(id);
            });
            this.addEventListener(btn, 'mouseenter', () => {
                window.globalTooltipManager?.show('prompt-pin', 'button', btn, chrome.i18n.getMessage('pntotp') || '置顶');
            });
            this.addEventListener(btn, 'mouseleave', () => {
                window.globalTooltipManager?.hide();
            });
        });
        
        // 编辑按钮
        const editBtns = document.querySelectorAll('.prompt-edit-btn');
        editBtns.forEach(btn => {
            this.addEventListener(btn, 'click', (e) => {
                const id = btn.getAttribute('data-id');
                this.hsksuywm(id);
            });
            this.addEventListener(btn, 'mouseenter', () => {
                window.globalTooltipManager?.show('prompt-edit', 'button', btn, chrome.i18n.getMessage('vkpxzm') || '编辑');
            });
            this.addEventListener(btn, 'mouseleave', () => {
                window.globalTooltipManager?.hide();
            });
        });
        
        // 删除按钮
        const deleteBtns = document.querySelectorAll('.prompt-delete-btn');
        deleteBtns.forEach(btn => {
            this.addEventListener(btn, 'click', (e) => {
                const id = btn.getAttribute('data-id');
                this.deletePrompt(id);
            });
            this.addEventListener(btn, 'mouseenter', () => {
                window.globalTooltipManager?.show('prompt-delete', 'button', btn, chrome.i18n.getMessage('mzxvkp') || '删除');
            });
            this.addEventListener(btn, 'mouseleave', () => {
                window.globalTooltipManager?.hide();
            });
        });
        
        // 上移按钮
        const moveUpBtns = document.querySelectorAll('.prompt-move-up-btn');
        moveUpBtns.forEach(btn => {
            this.addEventListener(btn, 'click', (e) => {
                const id = btn.getAttribute('data-id');
                this.movePrompt(id, 'up');
            });
            this.addEventListener(btn, 'mouseenter', () => {
                window.globalTooltipManager?.show('prompt-move-up', 'button', btn, chrome.i18n.getMessage('mvupkt') || '上移');
            });
            this.addEventListener(btn, 'mouseleave', () => {
                window.globalTooltipManager?.hide();
            });
        });
        
        // 下移按钮
        const moveDownBtns = document.querySelectorAll('.prompt-move-down-btn');
        moveDownBtns.forEach(btn => {
            this.addEventListener(btn, 'click', (e) => {
                const id = btn.getAttribute('data-id');
                this.movePrompt(id, 'down');
            });
            this.addEventListener(btn, 'mouseenter', () => {
                window.globalTooltipManager?.show('prompt-move-down', 'button', btn, chrome.i18n.getMessage('mvdnkt') || '下移');
            });
            this.addEventListener(btn, 'mouseleave', () => {
                window.globalTooltipManager?.hide();
            });
        });
    }
    
    /**
     * 切换置顶状态
     */
    async togglePin(id) {
        const prompts = await this._getFreshPrompts();
        const index = prompts.findIndex(p => p.id === id);
        
        if (index !== -1) {
            const isPinned = prompts[index].pinned;
            prompts[index].pinned = !isPinned;
            
            this.setState('prompts', prompts);
            await this.savePrompts();
            this.renderPromptList();
            
            // 显示提示
            if (window.globalToastManager) {
                const message = prompts[index].pinned 
                    ? (chrome.i18n.getMessage('pmpknd'))
                    : (chrome.i18n.getMessage('pmuknp'));
                window.globalToastManager.show('success', message);
            }
        }
    }
    
    /**
     * 移动提示词位置
     * @param {string} id - 提示词 ID
     * @param {string} direction - 移动方向：'up' 或 'down'
     */
    async movePrompt(id, direction) {
        const prompts = await this._getFreshPrompts();
        const index = prompts.findIndex(p => p.id === id);
        
        if (index === -1) return;
        
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        
        // 边界检查
        if (targetIndex < 0 || targetIndex >= prompts.length) {
            return;
        }
        
        // 交换位置
        [prompts[index], prompts[targetIndex]] = [prompts[targetIndex], prompts[index]];
        
        this.setState('prompts', prompts);
        await this.savePrompts();
        this.renderPromptList();
    }
    
    /**
     * 获取支持智能输入的平台列表
     */
    _getSmartInputPlatforms() {
        // id 为空表示全部平台
        const platforms = [{ id: '', name: chrome.i18n.getMessage('allptfm') }];
        if (typeof SITE_INFO !== 'undefined') {
            SITE_INFO.forEach(site => {
                if (site.features?.smartInput === true) {
                    platforms.push({ id: site.id, name: site.name });
                }
            });
        }
        return platforms;
    }
    
    /**
     * 显示提示词编辑弹窗
     */
    showPromptModal(prompt = null) {
        const isEdit = !!prompt;
        const title = isEdit 
            ? (chrome.i18n.getMessage('hsksuywm'))
            : (chrome.i18n.getMessage('byaskjndg'));
        
        // 获取平台列表
        const platforms = this._getSmartInputPlatforms();
        const currentPlatformId = prompt?.platformId || '';
        const currentPlatform = platforms.find(p => p.id === currentPlatformId) || platforms[0];
        
        // 创建自定义弹窗
        const overlay = document.createElement('div');
        overlay.className = 'prompt-modal-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'prompt-modal';
        
        modal.innerHTML = `
            <div class="prompt-modal-header">
                <h3>${title}</h3>
                <button class="prompt-modal-close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="prompt-modal-body">
                <div class="prompt-modal-field">
                    <label>${chrome.i18n.getMessage('hsuywkw')}<span class="required-mark">*</span></label>
                    <input type="text" class="prompt-modal-input" id="prompt-name-input"
                        placeholder="${chrome.i18n.getMessage('hsuywkwPlaceholder')}"
                        maxlength="16" value="${this._escapeHtml(prompt?.name || '')}">
                </div>
                <div class="prompt-modal-field">
                    <label>${chrome.i18n.getMessage('promptContent')}<span class="required-mark">*</span></label>
                    <textarea class="prompt-modal-textarea" id="prompt-content-input"
                        placeholder="${chrome.i18n.getMessage('uwkjwjw')}"
                        rows="4" maxlength="10000">${this._escapeHtml(prompt?.content || '')}</textarea>
                    <div class="prompt-char-counter">
                        <div class="prompt-platform-select" id="prompt-platform-select">
                            <span class="prompt-platform-label">${chrome.i18n.getMessage('ptfmsl')}：</span>
                            <span class="prompt-platform-select-text">${currentPlatform.name}</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"/>
                            </svg>
                        </div>
                        <span><span id="prompt-char-count">${prompt?.content?.length || 0}</span>/10000</span>
                    </div>
                </div>
            </div>
            <div class="prompt-modal-footer">
                <button class="prompt-modal-btn prompt-modal-cancel">${chrome.i18n.getMessage('pxvkmz')}</button>
                <button class="prompt-modal-btn prompt-modal-confirm">${chrome.i18n.getMessage('svkbtn')}</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // 获取元素
        const nameInput = modal.querySelector('#prompt-name-input');
        const contentInput = modal.querySelector('#prompt-content-input');
        const charCount = modal.querySelector('#prompt-char-count');
        const closeBtn = modal.querySelector('.prompt-modal-close');
        const cancelBtn = modal.querySelector('.prompt-modal-cancel');
        const confirmBtn = modal.querySelector('.prompt-modal-confirm');
        const platformSelect = modal.querySelector('#prompt-platform-select');
        const platformText = platformSelect.querySelector('.prompt-platform-select-text');
        
        // 当前选中的平台 ID
        let selectedPlatformId = currentPlatformId;
        
        // 自动调整高度函数
        const autoResize = () => {
            contentInput.style.height = 'auto';
            const newHeight = Math.min(contentInput.scrollHeight, 200);
            contentInput.style.height = newHeight + 'px';
        };
        
        // 字符计数更新 + 自动调整高度
        contentInput.addEventListener('input', () => {
            charCount.textContent = contentInput.value.length;
            autoResize();
        });
        
        // 初始化高度（编辑时内容可能已存在）
        autoResize();
        
        // 平台选择器点击
        platformSelect.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.globalDropdownManager) {
                const items = platforms.map(p => ({
                    label: p.name,
                    onClick: () => {
                        selectedPlatformId = p.id;
                        platformText.textContent = p.name;
                    }
                }));
                
                window.globalDropdownManager.show({
                    trigger: platformSelect,
                    items: items,
                    position: 'bottom-left',
                    width: Math.max(150, platformSelect.offsetWidth)
                });
            }
        });
        
        // 显示动画
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });
        
        // 关闭弹窗
        const closeModal = () => {
            overlay.classList.remove('visible');
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 200);
        };
        
        // 保存
        const savePrompt = async () => {
            const name = nameInput.value.trim();
            const content = contentInput.value.trim();
            
            // 验证名称
            if (!name) {
                if (window.globalToastManager) {
                    window.globalToastManager.show('error', chrome.i18n.getMessage('zmxvkp'));
                }
                nameInput.focus();
                return;
            }
            
            // 验证内容
            if (!content) {
                if (window.globalToastManager) {
                    window.globalToastManager.show('error', chrome.i18n.getMessage('zmxvkp'));
                }
                contentInput.focus();
                return;
            }
            
            // 保存
            if (isEdit) {
                await this.updatePrompt(prompt.id, { name, content, platformId: selectedPlatformId });
            } else {
                await this.byaskjndg({ name, content, platformId: selectedPlatformId });
            }
            
            closeModal();
        };
        
        // 事件绑定
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        confirmBtn.addEventListener('click', savePrompt);
    }
    
    /**
     * 添加提示词
     */
    async byaskjndg(values) {
        const prompts = await this._getFreshPrompts();
        const newPrompt = {
            id: Date.now().toString(),
            name: values.name?.trim() || '',
            content: values.content.trim(),
            platformId: values.platformId || '',
            createdAt: Date.now()
        };
        
        prompts.push(newPrompt);
        this.setState('prompts', prompts);
        
        await this.savePrompts();
        this.renderPromptList();
        
        // 显示成功提示
        if (window.globalToastManager) {
            window.globalToastManager.show('success', chrome.i18n.getMessage('shwsuwk'));
        }
    }
    
    /**
     * 编辑提示词
     */
    hsksuywm(id) {
        const prompts = this.getState('prompts') || [];
        const prompt = prompts.find(p => p.id === id);
        if (prompt) {
            this.showPromptModal(prompt);
        }
    }
    
    /**
     * 更新提示词
     */
    async updatePrompt(id, values) {
        const prompts = await this._getFreshPrompts();
        const index = prompts.findIndex(p => p.id === id);
        
        if (index !== -1) {
            prompts[index] = {
                ...prompts[index],
                name: values.name !== undefined ? values.name.trim() : (prompts[index].name || ''),
                content: values.content.trim(),
                platformId: values.platformId !== undefined ? values.platformId : (prompts[index].platformId || ''),
                updatedAt: Date.now()
            };
            
            this.setState('prompts', prompts);
            await this.savePrompts();
            this.renderPromptList();
            
            // 显示成功提示
            if (window.globalToastManager) {
                window.globalToastManager.show('success', chrome.i18n.getMessage('hwkwbhwk'));
            }
        }
    }
    
    /**
     * 删除提示词
     */
    async deletePrompt(id) {
        const prompts = await this._getFreshPrompts();
        const prompt = prompts.find(p => p.id === id);
        
        // 使用确认弹窗
        if (window.globalPopconfirmManager) {
            const confirmed = await window.globalPopconfirmManager.show({
                title: chrome.i18n.getMessage('dcnfmq'),
                confirmText: chrome.i18n.getMessage('mzxvkp'),
                cancelText: chrome.i18n.getMessage('pxvkmz'),
                confirmTextType: 'danger'
            });
            
            if (confirmed) {
                const newPrompts = prompts.filter(p => p.id !== id);
                this.setState('prompts', newPrompts);
                await this.savePrompts();
                this.renderPromptList();
                
                // 显示成功提示
                if (window.globalToastManager) {
                    window.globalToastManager.show('success', chrome.i18n.getMessage('qrtypd'));
                }
            }
        }
    }
    
    async _showPlatformManageModal() {
        const platforms = getPlatformsByFeature('smartInput');
        const result = await chrome.storage.local.get('promptButtonPlatformSettings');
        const settings = result.promptButtonPlatformSettings || {};

        const overlay = document.createElement('div');
        overlay.className = 'starred-platform-modal-overlay';

        const items = platforms.map(p => {
            const logoHtml = p.logoPath
                ? `<img src="${chrome.runtime.getURL(p.logoPath)}" alt="${p.name}">`
                : `<span>${p.name.charAt(0)}</span>`;
            return `
                <div class="starred-platform-item">
                    <div class="starred-platform-info">
                        <div class="starred-platform-logo">${logoHtml}</div>
                        <span class="starred-platform-name">${p.name}</span>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" data-platform-id="${p.id}" ${settings[p.id] !== false ? 'checked' : ''}>
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>`;
        }).join('');

        overlay.innerHTML = `
            <div class="starred-platform-modal">
                <div class="starred-platform-modal-header">
                    <span>${chrome.i18n.getMessage('mkvzpx')}</span>
                    <button class="starred-platform-modal-close">✕</button>
                </div>
                <div class="starred-platform-modal-body">${items}</div>
            </div>`;

        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('.starred-platform-modal-close').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        overlay.querySelectorAll('input[data-platform-id]').forEach(cb => {
            cb.addEventListener('change', async () => {
                const cur = (await chrome.storage.local.get('promptButtonPlatformSettings')).promptButtonPlatformSettings || {};
                cur[cb.dataset.platformId] = cb.checked;
                await chrome.storage.local.set({ promptButtonPlatformSettings: cur });
            });
        });
    }
    
    /**
     * 截断文本
     */
    _truncate(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
    
    /**
     * HTML 转义
     */
    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Tab 卸载时清理
     */
    unmounted() {
        super.unmounted();
    }
}
