/**
 * Mirror Site Float Button
 *
 * 镜像站浮窗按钮：可拖拽，点击弹出提示词列表（复制模式）。
 * 提示词下拉菜单复用 prompt-dropdown-ui.js 共享渲染。
 * 点击提示词项时复制到剪贴板，不关闭弹窗。
 */

class MirrorSiteFloatButton {
    constructor() {
        this.buttonElement = null;
        this.prompts = [];
        this._promptDropdown = null;
        this._promptOverlay = null;
        this._storageListener = null;
        this._boundCloseOnClickOutside = null;
        this.isDestroyed = false;

        // 拖拽状态
        this._isDragging = false;
        this._hasMoved = false;
        this._startX = 0;
        this._startY = 0;
        this._startLeft = 0;
        this._startTop = 0;
        this._boundOnPointerMove = null;
        this._boundOnPointerUp = null;
    }

    async init() {
        await this._loadPrompts();
        this._createButton();
        await this._loadPosition();
        this._initDrag();
        this._attachStorageListener();
    }

    async _loadPrompts() {
        try {
            const result = await chrome.storage.local.get('prompts');
            this.prompts = result.prompts || [];
        } catch (e) {
            this.prompts = [];
        }
    }

    _attachStorageListener() {
        this._storageListener = (changes, areaName) => {
            if (this.isDestroyed) return;
            if (areaName === 'local' && changes.prompts) {
                this.prompts = changes.prompts.newValue || [];
            }
        };
        chrome.storage.onChanged.addListener(this._storageListener);
    }

    // ==================== 按钮创建 ====================

    _createButton() {
        if (this.buttonElement) return;

        const btn = document.createElement('div');
        btn.className = 'mirror-site-float-btn';
        btn.innerHTML = `<img src="${chrome.runtime.getURL('images/logo.png')}" alt="Timeline" class="mirror-site-float-logo">`;
        document.body.appendChild(btn);
        this.buttonElement = btn;
    }

    // ==================== 拖拽 ====================

    _initDrag() {
        const btn = this.buttonElement;
        if (!btn) return;

        const onPointerDown = (e) => {
            if (e.button && e.button !== 0) return;
            this._isDragging = true;
            this._hasMoved = false;

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            this._startX = clientX;
            this._startY = clientY;

            const rect = btn.getBoundingClientRect();
            this._startLeft = rect.left;
            this._startTop = rect.top;

            btn.style.transition = 'none';
        };

        this._boundOnPointerMove = (e) => {
            if (!this._isDragging) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const dx = clientX - this._startX;
            const dy = clientY - this._startY;

            if (!this._hasMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
                this._hasMoved = true;
            }

            if (this._hasMoved) {
                const btnW = btn.offsetWidth;
                const btnH = btn.offsetHeight;
                const newLeft = Math.max(0, Math.min(this._startLeft + dx, window.innerWidth - btnW));
                const newTop = Math.max(0, Math.min(this._startTop + dy, window.innerHeight - btnH));
                btn.style.left = `${newLeft}px`;
                btn.style.top = `${newTop}px`;
                btn.style.right = 'auto';
                btn.style.bottom = 'auto';
            }
        };

        this._boundOnPointerUp = () => {
            if (!this._isDragging) return;
            this._isDragging = false;
            btn.style.transition = '';

            if (this._hasMoved) {
                this._savePosition();
            } else {
                this._handleClick();
            }
        };

        btn.addEventListener('mousedown', onPointerDown);
        btn.addEventListener('touchstart', onPointerDown, { passive: true });
        document.addEventListener('mousemove', this._boundOnPointerMove);
        document.addEventListener('touchmove', this._boundOnPointerMove, { passive: true });
        document.addEventListener('mouseup', this._boundOnPointerUp);
        document.addEventListener('touchend', this._boundOnPointerUp);
    }

    async _savePosition() {
        if (!this.buttonElement) return;
        const rect = this.buttonElement.getBoundingClientRect();
        try {
            await chrome.storage.local.set({
                mirrorSiteFloatPos: { left: rect.left, top: rect.top }
            });
        } catch { /* ignore */ }
    }

    async _loadPosition() {
        try {
            const result = await chrome.storage.local.get('mirrorSiteFloatPos');
            const pos = result.mirrorSiteFloatPos;
            if (pos && this.buttonElement) {
                const btnW = this.buttonElement.offsetWidth || 44;
                const btnH = this.buttonElement.offsetHeight || 44;
                const left = Math.max(0, Math.min(pos.left, window.innerWidth - btnW));
                const top = Math.max(0, Math.min(pos.top, window.innerHeight - btnH));
                this.buttonElement.style.left = `${left}px`;
                this.buttonElement.style.top = `${top}px`;
                this.buttonElement.style.right = 'auto';
                this.buttonElement.style.bottom = 'auto';
            }
        } catch { /* use default CSS position */ }
    }

    // ==================== 提示词弹窗（复用共享 UI） ====================

    _handleClick() {
        if (this._promptDropdown) {
            this._hidePromptDropdown();
        } else {
            this._showPromptDropdown();
        }
    }

    _showPromptDropdown() {
        if (window.globalDropdownManager) {
            window.globalDropdownManager.hide(true);
        }

        this._promptOverlay = document.createElement('div');
        this._promptOverlay.className = 'prompt-dropdown-overlay';
        this._promptOverlay.addEventListener('click', () => this._hidePromptDropdown());
        document.body.appendChild(this._promptOverlay);

        const filteredPrompts = this.prompts.filter(p => !p.platformId);

        this._promptDropdown = createPromptDropdownUI({
            prompts: filteredPrompts,
            tooltipPlacement: 'left',
            onItemClick: (prompt, itemEl) => {
                this._copyPrompt(prompt, itemEl);
            },
            onManageClick: () => {
                this._hidePromptDropdown();
                if (window.panelModal) window.panelModal.show('prompt');
            }
        });

        document.body.appendChild(this._promptDropdown);
        this._positionDropdown();

        requestAnimationFrame(() => {
            this._promptDropdown.classList.add('visible');
        });

        this._boundCloseOnClickOutside = (e) => {
            if (!this._promptDropdown?.contains(e.target) && !this.buttonElement?.contains(e.target)) {
                this._hidePromptDropdown();
            }
        };
        setTimeout(() => {
            document.addEventListener('click', this._boundCloseOnClickOutside, true);
        }, 0);
    }

    async _copyPrompt(prompt, itemEl) {
        if (!prompt.content) return;

        try {
            await navigator.clipboard.writeText(prompt.content);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = prompt.content;
            ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }

        // 项目闪烁反馈
        if (itemEl) {
            itemEl.classList.add('mirror-site-copy-flash');
            setTimeout(() => itemEl.classList.remove('mirror-site-copy-flash'), 600);
        }

        if (window.globalToastManager) {
            window.globalToastManager.show('success', chrome.i18n.getMessage('mirrorSiteCopied') || '已复制到剪贴板');
        }
    }

    _positionDropdown() {
        if (!this._promptDropdown || !this.buttonElement) return;

        const btnRect = this.buttonElement.getBoundingClientRect();
        const dw = 320, dh = 400, gap = 10;

        this._promptDropdown.style.width = `${dw}px`;
        this._promptDropdown.style.height = `${dh}px`;
        this._promptDropdown.style.visibility = 'hidden';
        this._promptDropdown.style.display = 'flex';

        let left = btnRect.right - dw;
        if (left < 8) left = 8;
        if (left + dw > window.innerWidth - 8) left = window.innerWidth - dw - 8;

        let top = btnRect.top - gap - dh;
        if (top < 20) top = btnRect.bottom + gap;

        this._promptDropdown.style.left = `${left}px`;
        this._promptDropdown.style.top = `${top}px`;
        this._promptDropdown.style.visibility = 'visible';
    }

    _hidePromptDropdown() {
        if (this._boundCloseOnClickOutside) {
            document.removeEventListener('click', this._boundCloseOnClickOutside, true);
            this._boundCloseOnClickOutside = null;
        }
        if (window.globalTooltipManager) window.globalTooltipManager.hide();

        if (this._promptDropdown) {
            this._promptDropdown.classList.remove('visible');
            setTimeout(() => {
                this._promptDropdown?.parentNode?.removeChild(this._promptDropdown);
                this._promptDropdown = null;
            }, 150);
        }
        if (this._promptOverlay?.parentNode) {
            this._promptOverlay.parentNode.removeChild(this._promptOverlay);
        }
        this._promptOverlay = null;
    }

    // ==================== 销毁 ====================

    destroy() {
        this.isDestroyed = true;
        this._hidePromptDropdown();

        if (this._storageListener) {
            chrome.storage.onChanged.removeListener(this._storageListener);
            this._storageListener = null;
        }
        if (this._boundOnPointerMove) {
            document.removeEventListener('mousemove', this._boundOnPointerMove);
            document.removeEventListener('touchmove', this._boundOnPointerMove);
        }
        if (this._boundOnPointerUp) {
            document.removeEventListener('mouseup', this._boundOnPointerUp);
            document.removeEventListener('touchend', this._boundOnPointerUp);
        }
        if (this.buttonElement?.parentNode) {
            this.buttonElement.parentNode.removeChild(this.buttonElement);
            this.buttonElement = null;
        }
    }
}
