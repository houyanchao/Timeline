/**
 * Folder Edit Modal - 文件夹编辑弹窗（全局单例）
 *
 * 统一的文件夹创建/编辑弹窗，支持图标选择 + 名称输入。
 * 用于侧边栏的新建/编辑文件夹场景。
 *
 * @example
 * const result = await window.folderEditModal.show({
 *     mode: 'create',
 *     title: '新建文件夹',
 *     maxLength: 20,
 *     validator: (name) => ({ valid: true })
 * });
 * // result = { name: '工作', icon: '⭐' } | null
 */

class FolderEditModal {
    constructor(options = {}) {
        this.config = {
            debug: options.debug || false,
            animationDuration: 200
        };

        this.iconCategories = [
            {
                id: 'emoji', label: '表情',
                icons: [
                    '', '😀', '😊', '😎', '🤓', '🤔', '😍', '🥰',
                    '🤩', '😇', '🥳', '😏', '😌', '🤗', '😬', '🫡',
                    '🧐', '😴', '🥱', '😷', '🤒', '🥺', '😢', '😤',
                    '😡', '🤯', '😱', '😂', '🤣', '🥹', '😈', '🤖',
                    '👻', '👽', '💀', '🤡', '😺', '😸', '😻', '😼'
                ]
            },
            {
                id: 'symbol', label: '符号',
                icons: [
                    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
                    '⭐', '🌟', '✨', '💫', '🔥', '💥', '💯', '💢',
                    '✅', '❌', '⭕', '❗', '❓', '⚠️', '🚫', '⛔',
                    '♻️', '💠', '🔷', '🔶', '🔴', '🟠', '🟡', '🟢',
                    '🔵', '🟣', '⚫', '⚪', '🟤', '▶️', '⏸️', '🔔'
                ]
            },
            {
                id: 'letter', label: 'ABC',
                icons: [
                    '🅰️', '🅱️', '🆎', '🅾️', '🅿️', 'Ⓜ️', 'ℹ️', '🆑',
                    '🆒', '🆓', '🆔', '🆕', '🆖', '🆗', '🆘', '🆙',
                    '🆚', '©️', '®️', '™️', '‼️', '⁉️', '🔤', '🔠',
                    '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣',
                    '8️⃣', '9️⃣', '🔟', '#️⃣', '*️⃣', '🔢', '🔡', '🔣'
                ]
            },
            {
                id: 'object', label: '物品',
                icons: [
                    '📁', '📂', '📌', '📎', '🔖', '🏷️', '🗂️', '📋',
                    '📝', '✏️', '📚', '📖', '📓', '📒', '📕', '📗',
                    '💼', '🎒', '📦', '🔑', '🔒', '🔓', '💡', '🔧',
                    '⚙️', '🛠️', '🔬', '💻', '📱', '⌨️', '🖥️', '📷',
                    '🎵', '🎬', '📊', '📈', '💰', '💎', '🎁', '🧩'
                ]
            },
            {
                id: 'nature', label: '自然',
                icons: [
                    '☀️', '🌙', '⭐', '🌈', '🌊', '🔥', '❄️', '⚡',
                    '💧', '🌍', '🌏', '🌎', '🌸', '🌺', '🌻', '🌹',
                    '🌷', '🍀', '🌿', '🌱', '🌲', '🌴', '🍁', '🍂',
                    '🍄', '🌵', '💎', '🪨', '🪵', '🌋', '🏔️', '🪐',
                    '☄️', '🌕', '🌑', '🌓', '🌗', '☁️', '⛅', '🌪️'
                ]
            },
            {
                id: 'animal', label: '动物',
                icons: [
                    '🐶', '🐱', '🐻', '🦊', '🐼', '🐨', '🦁', '🐯',
                    '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦅',
                    '🦉', '🐝', '🦋', '🐌', '🐞', '🐢', '🐍', '🐙',
                    '🐬', '🐳', '🦈', '🐠', '🦀', '🦄', '🐺', '🐿️',
                    '🦔', '🦩', '🦜', '🐾', '🦎', '🐡', '🐰', '🐹'
                ]
            },
            {
                id: 'food', label: '食物',
                icons: [
                    '🍎', '🍊', '🍋', '🍇', '🍓', '🍑', '🍒', '🥝',
                    '🍌', '🍉', '🥭', '🍍', '🥥', '🥑', '🌽', '🥕',
                    '🍕', '🍔', '🌮', '🍜', '🍣', '🍱', '🥗', '🍝',
                    '🍩', '🍰', '🧁', '🍫', '🍪', '🍿', '🧀', '🥐',
                    '☕', '🍵', '🥤', '🍺', '🍷', '🧃', '🥛', '🍶'
                ]
            }
        ];

        this.state = {
            isShowing: false,
            currentOverlay: null,
            currentResolve: null,
            currentUrl: location.href
        };

        this._boundHandleUrlChange = this._handleUrlChange.bind(this);
        this._attachUrlListeners();

        this._log('FolderEditModal initialized');
    }

    /**
     * 显示文件夹编辑弹窗
     * @param {Object} options
     * @param {'create'|'edit'} options.mode - 模式
     * @param {string} options.title - 弹窗标题
     * @param {string} [options.name=''] - 默认名称（编辑时传入）
     * @param {string} [options.icon=''] - 默认图标（编辑时传入，空字符串表示使用默认文件夹图标）
     * @param {string} [options.placeholder] - 输入框占位符
     * @param {number} [options.maxLength=20] - 最大长度
     * @param {boolean} [options.required=true] - 是否必填
     * @param {string} [options.requiredMessage] - 必填提示
     * @param {Function} [options.validator] - 自定义校验 (name) => { valid, message }
     * @param {string} [options.confirmText] - 确认按钮文本
     * @param {string} [options.cancelText] - 取消按钮文本
     * @returns {Promise<{name: string, icon: string}|null>}
     */
    async show(options = {}) {
        try {
            if (!options.title) {
                console.error('[FolderEditModal] Missing required parameter: title');
                return null;
            }

            if (this.state.isShowing) {
                this._log('Modal already showing, ignoring');
                return null;
            }

            const config = {
                mode: options.mode || 'create',
                title: options.title,
                name: options.name || '',
                icon: options.icon || '',
                placeholder: options.placeholder || chrome.i18n.getMessage('vzkpmx') || 'Folder name',
                maxLength: options.maxLength || 20,
                required: options.required !== undefined ? options.required : true,
                requiredMessage: options.requiredMessage || chrome.i18n.getMessage('kmxpvz') || 'Name is required',
                validator: options.validator || null,
                confirmText: options.confirmText || chrome.i18n.getMessage('vkmzpx') || 'OK',
                cancelText: options.cancelText || chrome.i18n.getMessage('pxvkmz') || 'Cancel'
            };

            return await this._showModal(config);
        } catch (error) {
            console.error('[FolderEditModal] Show failed:', error);
            return null;
        }
    }

    forceClose() {
        if (this.state.isShowing && this.state.currentResolve) {
            this._cleanup();
            this.state.currentResolve(null);
            this.state.currentResolve = null;
        }
    }

    destroy() {
        this._log('Destroying FolderEditModal');
        this.forceClose();
        this._detachUrlListeners();
    }

    // ==================== Internal ====================

    async _showModal(config) {
        return new Promise((resolve) => {
            let selectedIcon = config.icon;

            const overlay = document.createElement('div');
            overlay.className = 'folder-edit-modal-overlay';

            const dialog = document.createElement('div');
            dialog.className = 'folder-edit-modal';

            const escapeHTML = (str) => {
                const div = document.createElement('div');
                div.textContent = str;
                return div.innerHTML;
            };

            // Header
            const header = document.createElement('div');
            header.className = 'folder-edit-modal-header';
            header.innerHTML = `<h3>${escapeHTML(config.title)}</h3>`;
            dialog.appendChild(header);

            // Body
            const body = document.createElement('div');
            body.className = 'folder-edit-modal-body';

            // Input row: icon button + text input
            const inputRow = document.createElement('div');
            inputRow.className = 'folder-edit-modal-input-row';

            // Icon picker button
            const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform) || (navigator.userAgentData && navigator.userAgentData.platform === 'macOS');
            const gradId = 'folder-grad-' + Date.now();
            const gradColors = isMac
                ? { top: '#6CC4F8', bottom: '#3B9FE7' }   // macOS blue
                : { top: '#FFD666', bottom: '#E5A520' };   // Windows yellow
            const folderSvg = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <defs>
                    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${gradColors.top}"/>
                        <stop offset="100%" stop-color="${gradColors.bottom}"/>
                    </linearGradient>
                </defs>
                <path d="M2 6a2 2 0 0 1 2-2h4.6a2 2 0 0 1 1.5.7L11.4 6H20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" fill="url(#${gradId})"/>
                <path d="M2 9h20v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z" fill="url(#${gradId})" opacity="0.85"/>
            </svg>`;

            const setIconBtnContent = (btn, icon) => {
                if (icon) {
                    btn.textContent = icon;
                    btn.classList.remove('default');
                } else {
                    btn.innerHTML = folderSvg;
                    btn.classList.add('default');
                }
            };

            const iconBtn = document.createElement('button');
            iconBtn.className = 'folder-edit-modal-icon-btn';
            iconBtn.type = 'button';
            setIconBtnContent(iconBtn, selectedIcon);

            const tooltipId = 'folder-icon-picker';

            // Build icon picker with category tabs
            const buildIconPicker = () => {
                const wrapper = document.createElement('div');
                wrapper.className = 'folder-icon-picker';

                // Category tabs
                const tabs = document.createElement('div');
                tabs.className = 'folder-icon-picker-tabs';

                const grid = document.createElement('div');
                grid.className = 'folder-edit-modal-icon-grid';

                const renderCategory = (catId) => {
                    const cat = this.iconCategories.find(c => c.id === catId);
                    if (!cat) return;
                    grid.innerHTML = '';
                    cat.icons.forEach(icon => {
                        const item = document.createElement('span');
                        item.className = 'folder-edit-modal-icon-item';
                        if (icon === selectedIcon) item.classList.add('selected');
                        if (icon === '') {
                            item.innerHTML = folderSvg.replace(/width="22"/g, 'width="18"').replace(/height="22"/g, 'height="18"');
                            item.classList.add('folder-default');
                        } else {
                            item.textContent = icon;
                        }
                        item.addEventListener('click', (e) => {
                            e.stopPropagation();
                            selectedIcon = icon;
                            setIconBtnContent(iconBtn, icon);
                            if (window.globalTooltipManager) {
                                window.globalTooltipManager.hide(true);
                            }
                            input.focus();
                        });
                        grid.appendChild(item);
                    });
                };

                this.iconCategories.forEach((cat, i) => {
                    const tab = document.createElement('button');
                    tab.className = 'folder-icon-picker-tab';
                    tab.type = 'button';
                    tab.textContent = cat.label;
                    if (i === 0) tab.classList.add('active');
                    tab.addEventListener('click', (e) => {
                        e.stopPropagation();
                        tabs.querySelectorAll('.folder-icon-picker-tab').forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        renderCategory(cat.id);
                    });
                    tabs.appendChild(tab);
                });

                wrapper.appendChild(tabs);
                wrapper.appendChild(grid);

                // Render first category
                renderCategory(this.iconCategories[0].id);

                return wrapper;
            };

            iconBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!window.globalTooltipManager) return;
                if (window.globalTooltipManager.isShowing(tooltipId)) {
                    window.globalTooltipManager.hide(true);
                } else {
                    window.globalTooltipManager.show(
                        tooltipId, 'node', iconBtn,
                        { element: buildIconPicker() },
                        { placement: 'bottom', showDelay: 0, gap: 8 }
                    );
                }
            });

            inputRow.appendChild(iconBtn);

            // Text input
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'folder-edit-modal-input';
            input.placeholder = escapeHTML(config.placeholder);
            input.value = config.name;
            input.maxLength = config.maxLength;
            input.autocomplete = 'off';
            inputRow.appendChild(input);

            body.appendChild(inputRow);
            dialog.appendChild(body);

            // Footer
            const footer = document.createElement('div');
            footer.className = 'folder-edit-modal-footer';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'folder-edit-modal-cancel';
            cancelBtn.textContent = config.cancelText;

            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'folder-edit-modal-confirm';
            confirmBtn.textContent = config.confirmText;

            footer.appendChild(cancelBtn);
            footer.appendChild(confirmBtn);
            dialog.appendChild(footer);

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            // State
            this.state.isShowing = true;
            this.state.currentOverlay = overlay;
            this.state.currentResolve = resolve;

            // Animate in
            requestAnimationFrame(() => {
                overlay.classList.add('visible');
                input.focus();
                if (config.name) {
                    setTimeout(() => {
                        const len = input.value.length;
                        input.setSelectionRange(len, len);
                    }, 0);
                }
            });

            // Validate
            const validateInput = () => {
                const value = input.value.trim();
                if (config.required && !value) {
                    return { valid: false, message: config.requiredMessage };
                }
                if (config.validator && value) {
                    return config.validator(value);
                }
                return { valid: true };
            };

            // Submit
            const submitInput = () => {
                const validation = validateInput();
                if (!validation.valid) {
                    if (window.globalToastManager) {
                        window.globalToastManager.error(validation.message, input);
                    }
                    return;
                }
                const name = input.value.trim();
                this._cleanup();
                resolve({ name, icon: selectedIcon });
            };

            // Cancel
            const cancelInput = () => {
                this._cleanup();
                resolve(null);
            };

            confirmBtn.addEventListener('click', submitInput);
            cancelBtn.addEventListener('click', cancelInput);

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) cancelInput();
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submitInput();
                if (e.key === 'Escape') cancelInput();
            });

            this._log('Modal shown:', config.mode);
        });
    }

    _cleanup() {
        if (!this.state.currentOverlay) return;

        // Close the icon picker tooltip if open
        if (window.globalTooltipManager && window.globalTooltipManager.isShowing('folder-icon-picker')) {
            window.globalTooltipManager.hide(true);
        }

        const overlay = this.state.currentOverlay;
        overlay.classList.remove('visible');
        setTimeout(() => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, this.config.animationDuration);
        this.state.isShowing = false;
        this.state.currentOverlay = null;
        this.state.currentResolve = null;
        this._log('Modal cleaned up');
    }

    _log(...args) {
        if (this.config.debug) console.log('[FolderEditModal]', ...args);
    }

    // ==================== URL listeners ====================

    _attachUrlListeners() {
        try {
            window.addEventListener('popstate', this._boundHandleUrlChange);
            window.addEventListener('hashchange', this._boundHandleUrlChange);
        } catch (error) {
            console.error('[FolderEditModal] Failed to attach URL listeners:', error);
        }
    }

    _detachUrlListeners() {
        try {
            window.removeEventListener('popstate', this._boundHandleUrlChange);
            window.removeEventListener('hashchange', this._boundHandleUrlChange);
        } catch (error) {
            console.error('[FolderEditModal] Failed to detach URL listeners:', error);
        }
    }

    _handleUrlChange() {
        const newUrl = location.href;
        if (newUrl !== this.state.currentUrl) {
            this._log('URL changed, auto-closing modal');
            this.state.currentUrl = newUrl;
            if (this.state.isShowing) this.forceClose();
        }
    }
}

// ==================== Global singleton ====================

if (typeof window.folderEditModal === 'undefined') {
    window.folderEditModal = new FolderEditModal({ debug: false });
}
