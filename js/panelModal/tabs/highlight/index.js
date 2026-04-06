/**
 * HighlightTab - 划重点功能设置面板
 *
 * 提供：
 * - 功能开关
 * - 高亮样式选择（4 种）
 * - 高亮颜色管理（排序、添加、删除）
 */

class HighlightTab extends BaseTab {
    constructor() {
        super();
        this.id = 'highlight';
        this.name = chrome.i18n.getMessage('highlightMark') || '文本高亮';
        this.badge = 'NEW';
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>`;
        this._defaultColors = HIGHLIGHT_DEFAULT_COLORS;
        this._customColorsKey = 'highlightCustomColors';
        this._maxCustomColors = 11;
    }

    render() {
        const container = document.createElement('div');
        container.className = 'highlight-settings';

        container.innerHTML = `
            <div class="setting-section">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">${chrome.i18n.getMessage('highlightToggleTitle') || '启用文本高亮'}</div>
                        <div class="setting-hint">${chrome.i18n.getMessage('highlightToggleHint') || '开启后，选中网页文字时可进行高亮标注'}</div>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" id="highlight-toggle">
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>
            </div>

            <div class="setting-section">
                <div class="setting-item hl-list-item">
                    <div class="setting-info">
                        <div class="setting-label">${chrome.i18n.getMessage('highlightStyleTitle') || '高亮样式'}</div>
                        <div class="hl-style-list" id="hl-style-list"></div>
                    </div>
                </div>
            </div>

            <div class="setting-section">
                <div class="setting-item hl-list-item">
                    <div class="setting-info">
                        <div class="setting-label">
                            ${chrome.i18n.getMessage('highlightMyColors') || '高亮颜色'}
                            <button class="hl-add-color-btn" id="hl-add-color-btn">+ ${chrome.i18n.getMessage('highlightAddColorBtn') || '颜色'}</button>
                        </div>
                        <div class="hl-color-list" id="hl-color-list"></div>
                    </div>
                </div>
            </div>
        `;

        return container;
    }

    async mounted() {
        super.mounted();
        this._setupToggle();
        this._renderStyles();
        await this._renderColors();
        this._setupColorEvents();
        this._setupAddColor();
    }

    _setupToggle() {
        const toggle = document.getElementById('highlight-toggle');
        if (!toggle) return;

        chrome.storage.local.get(['highlightEnabled']).then(result => {
            toggle.checked = result.highlightEnabled !== false;
        }).catch(() => { toggle.checked = true; });

        this.addEventListener(toggle, 'change', async (e) => {
            const enabled = e.target.checked;
            if (window.highlightManager) {
                await window.highlightManager.setEnabled(enabled);
            } else {
                await chrome.storage.local.set({ highlightEnabled: enabled });
            }
        });
    }

    // ==================== 高亮样式 ====================

    _renderStyles() {
        const styleList = document.getElementById('hl-style-list');
        if (!styleList) return;

        const styles = [
            { id: 'solid', name: chrome.i18n.getMessage('highlightStyleFullCover') || '全覆盖', desc: chrome.i18n.getMessage('highlightStyleFullCoverDesc') || '高亮区域完整罩住文字' },
            { id: 'half', name: chrome.i18n.getMessage('highlightStyleHalfCover') || '半覆盖', desc: chrome.i18n.getMessage('highlightStyleHalfCoverDesc') || '高亮区域在文字腰部以下' },
            { id: 'underline', name: chrome.i18n.getMessage('highlightStyleUnderline') || '下划线', desc: chrome.i18n.getMessage('highlightStyleUnderlineDesc') || '高亮区域在文字下方' },
            { id: 'textOnly', name: chrome.i18n.getMessage('highlightStyleTextOnly') || '仅文字', desc: chrome.i18n.getMessage('highlightStyleTextOnlyDesc') || '无背景高亮，仅文字变色' },
        ];

        styleList.innerHTML = styles.map(s => `
            <div class="hl-style-row" data-style="${s.id}">
                <div class="hl-style-preview">${this._getStylePreviewHtml(s.id)}</div>
                <div class="hl-style-info">
                    <div class="hl-style-name">${s.name}</div>
                    <div class="hl-style-desc">${s.desc}</div>
                </div>
            </div>
        `).join('');
    }

    _getStylePreviewHtml(styleId) {
        const text = 'AaBb';
        switch (styleId) {
            case 'solid': {
                const c = this._defaultColors[0];
                return `<span class="hl-preview-text" style="background-color:${c};">${text}</span>`;
            }
            case 'half': {
                const c = this._defaultColors[1];
                return `<span class="hl-preview-text" style="background:linear-gradient(transparent 50%, ${c} 50%);">${text}</span>`;
            }
            case 'underline': {
                const c = this._defaultColors[2];
                return `<span class="hl-preview-text" style="background:linear-gradient(transparent 80%, ${c} 80%);">${text}</span>`;
            }
            case 'textOnly': {
                const c = this._defaultColors[3];
                return `<span class="hl-preview-text" style="color:${c};font-weight:600;">${text}</span>`;
            }
            default:
                return `<span class="hl-preview-text">${text}</span>`;
        }
    }

    // ==================== 高亮颜色 ====================

    async _getCustomColors() {
        try {
            const result = await chrome.storage.local.get([this._customColorsKey]);
            return result[this._customColorsKey] || [];
        } catch {
            return [];
        }
    }

    async _saveCustomColors(customColors) {
        if (!customColors || customColors.length === 0) {
            await chrome.storage.local.remove(this._customColorsKey);
        } else {
            await chrome.storage.local.set({ [this._customColorsKey]: customColors });
        }
    }

    async _renderColors() {
        const colorList = document.getElementById('hl-color-list');
        if (!colorList) return;

        const customColors = await this._getCustomColors();

        const upSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
        const downSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
        const delSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

        const customHtml = customColors.map((c, i) => `
            <div class="hl-color-row" data-color="${c}" data-custom-index="${i}">
                <div class="hl-color-swatch" style="background:${c};"></div>
                <div class="hl-color-hex">${c}</div>
                <div class="hl-color-actions">
                    <button class="hl-color-delete">${delSvg}</button>
                    <button class="hl-color-move" data-dir="up" ${i === 0 ? 'disabled' : ''}>${upSvg}</button>
                    <button class="hl-color-move" data-dir="down" ${i === customColors.length - 1 ? 'disabled' : ''}>${downSvg}</button>
                </div>
            </div>
        `).join('');

        const defaultHtml = this._defaultColors.map(c => `
            <div class="hl-color-row hl-color-default" data-color="${c}">
                <div class="hl-color-swatch" style="background:${c};"></div>
                <div class="hl-color-hex">${c}</div>
            </div>
        `).join('');

        colorList.innerHTML = customHtml + defaultHtml;

        const addBtn = document.getElementById('hl-add-color-btn');
        if (addBtn) {
            addBtn.style.display = customColors.length >= this._maxCustomColors ? 'none' : '';
        }
    }

    _setupColorEvents() {
        const colorList = document.getElementById('hl-color-list');
        if (!colorList) return;

        this.addEventListener(colorList, 'click', async (e) => {
            const moveBtn = e.target.closest('.hl-color-move');
            if (moveBtn && !moveBtn.disabled) {
                const row = moveBtn.closest('.hl-color-row');
                const ci = parseInt(row.dataset.customIndex);
                const dir = moveBtn.dataset.dir;
                const customColors = await this._getCustomColors();
                const newCi = dir === 'up' ? ci - 1 : ci + 1;
                if (newCi < 0 || newCi >= customColors.length) return;
                [customColors[ci], customColors[newCi]] = [customColors[newCi], customColors[ci]];
                await this._saveCustomColors(customColors);
                await this._renderColors();
                return;
            }

            const deleteBtn = e.target.closest('.hl-color-delete');
            if (deleteBtn) {
                const row = deleteBtn.closest('.hl-color-row');
                const color = row.dataset.color;
                if (!window.globalPopconfirmManager) return;
                const confirmed = await window.globalPopconfirmManager.show({
                    title: chrome.i18n.getMessage('mzxvkp') || '删除',
                    content: (chrome.i18n.getMessage('highlightDeleteColorConfirm') || '确定要删除颜色 {color} 吗？').replace('{color}', color),
                });
                if (!confirmed) return;
                const customColors = await this._getCustomColors();
                const idx = customColors.indexOf(color);
                if (idx === -1) return;
                customColors.splice(idx, 1);
                await this._saveCustomColors(customColors);
                await this._renderColors();
                return;
            }
        });
    }

    _setupAddColor() {
        const addBtn = document.getElementById('hl-add-color-btn');
        if (!addBtn) return;

        this.addEventListener(addBtn, 'click', async () => {
            const color = await this._showAddColorModal();
            if (!color) return;

            const customColors = await this._getCustomColors();
            customColors.push(color);
            await this._saveCustomColors(customColors);
            await this._renderColors();
        });
    }

    _showAddColorModal() {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'folder-edit-modal-overlay';

            const dialog = document.createElement('div');
            dialog.className = 'folder-edit-modal';

            const header = document.createElement('div');
            header.className = 'folder-edit-modal-header';
            header.innerHTML = `<h3>${chrome.i18n.getMessage('highlightAddColorTitle') || '添加颜色'}</h3>`;

            const body = document.createElement('div');
            body.className = 'folder-edit-modal-body';

            const inputRow = document.createElement('div');
            inputRow.className = 'folder-edit-modal-input-row';

            const preview = document.createElement('div');
            preview.className = 'hl-modal-color-preview';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'folder-edit-modal-input';
            input.placeholder = '#FF5733';
            input.maxLength = 7;
            input.autocomplete = 'off';
            input.value = '#';

            input.addEventListener('input', () => {
                let v = input.value;
                if (!v.startsWith('#')) v = '#' + v.replace(/#/g, '');
                v = '#' + v.slice(1).replace(/[^0-9A-Fa-f]/g, '');
                if (v.length > 7) v = v.slice(0, 7);
                input.value = v;

                if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
                    preview.style.background = v;
                    preview.classList.add('valid');
                } else {
                    preview.style.background = '';
                    preview.classList.remove('valid');
                }
            });

            input.addEventListener('keydown', (e) => {
                const pos = input.selectionStart;
                if (pos <= 1 && (e.key === 'Backspace' || e.key === 'Delete')) {
                    if (pos === 0 || (pos === 1 && e.key === 'Backspace')) e.preventDefault();
                }
            });

            input.addEventListener('select', () => {
                if (input.selectionStart === 0) input.selectionStart = 1;
            });

            inputRow.appendChild(preview);
            inputRow.appendChild(input);
            body.appendChild(inputRow);

            const hint = document.createElement('div');
            hint.className = 'hl-modal-color-hint';
            hint.textContent = chrome.i18n.getMessage('highlightColorHint') || '请输入 6 位十六进制颜色值，例如 #FF5733';
            body.appendChild(hint);

            const footer = document.createElement('div');
            footer.className = 'folder-edit-modal-footer';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'folder-edit-modal-cancel';
            cancelBtn.textContent = chrome.i18n.getMessage('pxvkmz') || '取消';

            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'folder-edit-modal-confirm';
            confirmBtn.textContent = chrome.i18n.getMessage('vkmzpx') || '确定';

            footer.appendChild(cancelBtn);
            footer.appendChild(confirmBtn);

            dialog.appendChild(header);
            dialog.appendChild(body);
            dialog.appendChild(footer);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            requestAnimationFrame(() => {
                overlay.classList.add('visible');
                input.focus();
                input.setSelectionRange(1, 1);
            });

            const cleanup = () => {
                overlay.classList.remove('visible');
                setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
            };

            const doConfirm = async () => {
                let value = input.value.trim();
                if (!value.startsWith('#')) value = '#' + value;
                value = value.toUpperCase();

                if (!/^#[0-9A-F]{6}$/.test(value)) {
                    if (window.globalToastManager) window.globalToastManager.error(chrome.i18n.getMessage('highlightInvalidHex') || '无效的颜色格式', input);
                    return;
                }

                const customColors = await this._getCustomColors();
                if (customColors.length >= this._maxCustomColors) { cleanup(); resolve(null); return; }

                const allColors = [...customColors, ...this._defaultColors];
                if (allColors.includes(value)) {
                    if (window.globalToastManager) window.globalToastManager.error(chrome.i18n.getMessage('highlightColorExists') || '颜色已存在', input);
                    return;
                }

                cleanup();
                resolve(value);
            };

            const doCancel = () => { cleanup(); resolve(null); };

            confirmBtn.addEventListener('click', doConfirm);
            cancelBtn.addEventListener('click', doCancel);
            overlay.addEventListener('click', (e) => { if (e.target === overlay) doCancel(); });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') doConfirm();
            });
        });
    }

    unmounted() {
        super.unmounted();
    }
}
