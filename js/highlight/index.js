/**
 * Highlight - 主入口
 *
 * 网页文字标注功能，所有网站生效。
 *
 * 按钮显示策略：
 *   AI 网站 + 追问 ON  → 标注按钮嵌入追问工具栏（由 QuickAsk 负责渲染）
 *   AI 网站 + 追问 OFF → 独立标注按钮
 *   非 AI 网站          → 独立标注按钮
 *
 * 点击标注按钮 → 弹出浮窗（标注文字 + 风格 + 颜色 + 确认）
 *
 * 开关：highlightEnabled（独立于追问开关）
 */

(function () {
    'use strict';

    const HIGHLIGHT_BTN_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';

    const HL_DEFAULT_COLORS = HIGHLIGHT_DEFAULT_COLORS;

    async function _loadColors() {
        try {
            const result = await chrome.storage.local.get('highlightCustomColors');
            const custom = result.highlightCustomColors || [];
            return [...custom, ...HL_DEFAULT_COLORS];
        } catch {
            return [...HL_DEFAULT_COLORS];
        }
    }

    function _buildColorButtons(colors) {
        return colors.map(c =>
            `<button class="ait-hl-pop-color" data-color="${c}"><span style="background:${c};"></span></button>`
        ).join('');
    }

    let manager = null;
    let standaloneBtn = null;
    let _hlBtnMouseDown = false;
    let _hlDocMouseUpHandler = null;
    let popoverEl = null;
    let savedRange = null;
    let editingHlId = null;
    let editingOrigColor = null;
    let editingOrigStyle = null;
    let currentUrl = location.href;

    // ==================== 浮窗 ====================

    function createPopover() {
        if (popoverEl) return;

        popoverEl = document.createElement('div');
        popoverEl.className = 'ait-hl-popover';
        popoverEl.tabIndex = -1;
        popoverEl.style.display = 'none';

        const colorButtons = _buildColorButtons(HL_DEFAULT_COLORS);

        const deleteIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

        const settingsIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

        popoverEl.innerHTML = `
            <div class="ait-hl-pop-header">
                <div class="ait-hl-pop-colors">${colorButtons}</div>
                <button class="ait-hl-pop-settings" title="${chrome.i18n.getMessage('highlightSettings') || '设置'}">${settingsIcon}</button>
            </div>
            <div class="ait-hl-pop-styles">
                <button class="ait-hl-pop-style-btn" data-style="solid"><span class="ait-hl-pop-style-preview">AaBb</span></button>
                <button class="ait-hl-pop-style-btn" data-style="half"><span class="ait-hl-pop-style-preview">AaBb</span></button>
                <button class="ait-hl-pop-style-btn" data-style="underline"><span class="ait-hl-pop-style-preview">AaBb</span></button>
                <button class="ait-hl-pop-style-btn" data-style="textOnly"><span class="ait-hl-pop-style-preview">AaBb</span></button>
            </div>
            <div class="ait-hl-pop-note">
                <textarea class="ait-hl-pop-input" rows="1" maxlength="140" placeholder="${chrome.i18n.getMessage('highlightAnnotationPlaceholder') || '想法…'}"></textarea>
                <button class="ait-hl-pop-confirm" title="${chrome.i18n.getMessage('highlightConfirm') || '确定'}">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </button>
                <button class="ait-hl-pop-delete ait-hl-pop-edit-only" title="${chrome.i18n.getMessage('highlightRemoveYes') || '删除'}">${deleteIcon}</button>
            </div>
        `;

        popoverEl.addEventListener('mousedown', (e) => {
            if (!e.target.closest('button, textarea, input')) {
                e.preventDefault();
                popoverEl.focus();
            }
        });

        popoverEl.addEventListener('click', (e) => {
            const target = e.target;

            // Style selection
            const styleBtn = target.closest('.ait-hl-pop-style-btn');
            if (styleBtn) {
                popoverEl.querySelectorAll('.ait-hl-pop-style-btn').forEach(b => b.classList.remove('active'));
                styleBtn.classList.add('active');
                updateStylePreviewColors();
                editingHlId ? updateEditingPreview() : updatePendingMarksStyle();
                return;
            }

            // Color selection
            const colorBtn = target.closest('.ait-hl-pop-color');
            if (colorBtn) {
                popoverEl.querySelectorAll('.ait-hl-pop-color').forEach(b => b.classList.remove('active'));
                colorBtn.classList.add('active');
                updateStylePreviewColors();
                editingHlId ? updateEditingPreview() : updatePendingMarksStyle();
                return;
            }

            // Settings
            if (target.closest('.ait-hl-pop-settings')) {
                hidePopover();
                window.panelModal?.show('highlight');
                return;
            }

            // Delete (edit mode)
            if (target.closest('.ait-hl-pop-delete')) {
                deleteEditingHighlight();
                return;
            }

            // Confirm
            if (target.closest('.ait-hl-pop-confirm')) {
                confirmHighlight();
                return;
            }
        });

        const textarea = popoverEl.querySelector('.ait-hl-pop-input');
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                confirmHighlight();
            }
        });
        textarea.addEventListener('input', _autoResizeInput);

        popoverEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && document.activeElement !== textarea) {
                e.preventDefault();
                confirmHighlight();
            }
        });

        document.body.appendChild(popoverEl);
    }

    function _autoResizeInput() {
        const ta = popoverEl?.querySelector('.ait-hl-pop-input');
        if (!ta || ta.tagName !== 'TEXTAREA') return;
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
    }

    function updateStylePreviewColors() {
        const activeColor = popoverEl.querySelector('.ait-hl-pop-color.active')?.dataset.color || HL_DEFAULT_COLORS[0];
        popoverEl.querySelectorAll('.ait-hl-pop-style-btn').forEach(btn => {
            const preview = btn.querySelector('.ait-hl-pop-style-preview');
            if (!preview) return;
            preview.style.cssText = '';
            switch (btn.dataset.style) {
                case 'solid':
                    preview.style.backgroundColor = activeColor;
                    break;
                case 'half':
                    preview.style.background = `linear-gradient(transparent 50%, ${activeColor} 50%)`;
                    break;
                case 'underline':
                    preview.style.background = `linear-gradient(transparent calc(100% - 4px), ${activeColor} calc(100% - 4px))`;
                    break;
                case 'textOnly':
                    preview.style.color = activeColor;
                    preview.style.fontWeight = '600';
                    break;
            }
        });
    }

    function _setPopoverEditMode(isEdit) {
        popoverEl.querySelectorAll('.ait-hl-pop-edit-only').forEach(el => {
            el.style.display = isEdit ? '' : 'none';
        });
    }

    function _positionPopover(anchorRect) {
        const popW = popoverEl.offsetWidth;
        const popH = popoverEl.offsetHeight;
        const gap = 8;
        const margin = 10;

        let left = anchorRect.left + (anchorRect.width - popW) / 2;
        let top = anchorRect.top - popH - gap;

        if (top < margin) top = anchorRect.bottom + gap;
        if (left < margin) left = margin;
        if (left + popW > window.innerWidth - margin) left = window.innerWidth - popW - margin;

        popoverEl.style.left = `${left}px`;
        popoverEl.style.top = `${top + window.scrollY}px`;
    }

    async function showPopover(anchorRect, opts = {}) {
        createPopover();

        const isDark = typeof detectDarkMode === 'function' ? detectDarkMode() : true;
        popoverEl.classList.toggle('ait-hl-light', !isDark);

        const colors = await _loadColors();
        const colorsContainer = popoverEl.querySelector('.ait-hl-pop-colors');
        if (colorsContainer) colorsContainer.innerHTML = _buildColorButtons(colors);

        const color = opts.color || manager?.currentColor || HL_DEFAULT_COLORS[0];
        const style = opts.style || manager?.currentStyle || 'solid';
        const annotation = opts.annotation || '';
        const isEdit = !!opts.edit;

        editingHlId = opts.hlId || null;
        editingOrigColor = isEdit ? color : null;
        editingOrigStyle = isEdit ? style : null;
        _setPopoverEditMode(isEdit);

        popoverEl.querySelectorAll('.ait-hl-pop-style-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.style === style);
        });
        popoverEl.querySelectorAll('.ait-hl-pop-color').forEach(b => {
            b.classList.toggle('active', b.dataset.color === color);
        });

        let fallbackApplied = false;
        if (!isEdit && !popoverEl.querySelector('.ait-hl-pop-color.active')) {
            popoverEl.querySelector('.ait-hl-pop-color')?.classList.add('active');
            fallbackApplied = true;
        }
        if (!isEdit && !popoverEl.querySelector('.ait-hl-pop-style-btn.active')) {
            popoverEl.querySelector('.ait-hl-pop-style-btn')?.classList.add('active');
            fallbackApplied = true;
        }

        updateStylePreviewColors();
        if (fallbackApplied) updatePendingMarksStyle();

        const input = popoverEl.querySelector('.ait-hl-pop-input');
        input.value = annotation;

        popoverEl.style.display = 'block';
        popoverEl.classList.remove('visible');
        _autoResizeInput();

        _positionPopover(anchorRect);

        requestAnimationFrame(() => {
            popoverEl.classList.add('visible');
            popoverEl.focus();
        });
    }

    // ==================== 临时选中标记 ====================

    function _getPendingStyle() {
        if (!popoverEl) return { color: manager?.currentColor || HL_DEFAULT_COLORS[0], style: manager?.currentStyle || 'solid' };
        const color = popoverEl.querySelector('.ait-hl-pop-color.active')?.dataset.color || manager?.currentColor || HL_DEFAULT_COLORS[0];
        const style = popoverEl.querySelector('.ait-hl-pop-style-btn.active')?.dataset.style || manager?.currentStyle || 'solid';
        return { color, style };
    }

    function _stylePendingMark(mark) {
        const { color, style } = _getPendingStyle();
        switch (style) {
            case 'half':
            case 'highlighter':
                mark.style.cssText = `background: linear-gradient(transparent 50%, ${color} 50%) !important;`;
                mark.dataset.hlStyle = 'half';
                break;
            case 'underline':
                mark.style.cssText = `background: linear-gradient(transparent calc(100% - 4px), ${color} calc(100% - 4px)) !important; padding-bottom: 2px;`;
                mark.dataset.hlStyle = 'underline';
                break;
            case 'textOnly':
                mark.style.cssText = `background: transparent !important; color: ${color} !important;`;
                mark.dataset.hlStyle = 'textOnly';
                break;
            default:
                mark.style.cssText = `background-color: ${color} !important;`;
                mark.dataset.hlStyle = 'solid';
                break;
        }
    }

    function updatePendingMarksStyle() {
        document.querySelectorAll('mark.ait-highlight-pending').forEach(_stylePendingMark);
    }

    function updateEditingPreview() {
        if (!editingHlId || !manager) return;
        const color = popoverEl.querySelector('.ait-hl-pop-color.active')?.dataset.color || manager.currentColor;
        const style = popoverEl.querySelector('.ait-hl-pop-style-btn.active')?.dataset.style || manager.currentStyle;
        document.querySelectorAll(`mark.ait-highlight[data-hl-id="${editingHlId}"]`).forEach(mark => {
            manager._applyMarkStyle(mark, color, style);
        });
    }

    function applyPendingMarks(range) {
        clearPendingMarks();
        const cloned = range.cloneRange();
        const mark = document.createElement('mark');
        mark.className = 'ait-highlight-pending';
        _stylePendingMark(mark);
        try {
            cloned.surroundContents(mark);
        } catch {
            _applyPendingComplex(range.cloneRange());
        }
    }

    function _applyPendingComplex(range) {
        const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
            ? range.commonAncestorContainer.parentElement
            : range.commonAncestorContainer;
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        const parts = [];
        let node;
        while ((node = tw.nextNode())) {
            if (!range.intersectsNode(node)) continue;
            const s = node === range.startContainer ? range.startOffset : 0;
            const e = node === range.endContainer ? range.endOffset : node.textContent.length;
            if (e > s) parts.push({ node, s, e });
        }
        for (const p of parts) {
            const mark = document.createElement('mark');
            mark.className = 'ait-highlight-pending';
            _stylePendingMark(mark);
            const r = document.createRange();
            r.setStart(p.node, p.s);
            r.setEnd(p.node, p.e);
            r.surroundContents(mark);
        }
    }

    function clearPendingMarks() {
        document.querySelectorAll('mark.ait-highlight-pending').forEach(mark => {
            const parent = mark.parentNode;
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
            parent.removeChild(mark);
            parent.normalize();
        });
    }

    // ==================== 浮窗开关 ====================

    function hidePopover() {
        if (!popoverEl) return;

        if (editingHlId && manager && editingOrigColor) {
            document.querySelectorAll(`mark.ait-highlight[data-hl-id="${editingHlId}"]`).forEach(mark => {
                manager._applyMarkStyle(mark, editingOrigColor, editingOrigStyle);
            });
        }

        popoverEl.classList.remove('visible');
        popoverEl.style.display = 'none';
        clearPendingMarks();
        savedRange = null;
        editingHlId = null;
        editingOrigColor = null;
        editingOrigStyle = null;
    }

    async function confirmHighlight() {
        if (!manager) { hidePopover(); return; }

        const annotation = popoverEl.querySelector('.ait-hl-pop-input')?.value.trim() || '';
        const color = popoverEl.querySelector('.ait-hl-pop-color.active')?.dataset.color || editingOrigColor || manager.currentColor;
        const style = popoverEl.querySelector('.ait-hl-pop-style-btn.active')?.dataset.style || editingOrigStyle || manager.currentStyle;

        await manager.setColor(color);
        await manager.setStyle(style);

        if (editingHlId) {
            await manager.updateHighlight(editingHlId, { color, style, annotation });
            popoverEl.classList.remove('visible');
            popoverEl.style.display = 'none';
            editingHlId = null;
            editingOrigColor = null;
            editingOrigStyle = null;
            return;
        }

        if (!savedRange) { hidePopover(); return; }

        const serialized = manager._serialize(savedRange, savedRange.toString(), { color, style, annotation });
        if (!serialized) { hidePopover(); return; }

        clearPendingMarks();
        try {
            await manager.highlightSerialized(serialized);
        } catch (e) {
            console.error('[Highlight] confirmHighlight failed:', e);
        }

        popoverEl.classList.remove('visible');
        popoverEl.style.display = 'none';
        savedRange = null;
    }

    async function deleteEditingHighlight() {
        if (!manager || !editingHlId) { hidePopover(); return; }
        manager.removeHighlight(editingHlId);
        hidePopover();
    }

    async function onHighlightAction() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim()) return;

        savedRange = selection.getRangeAt(0).cloneRange();
        const rect = savedRange.getBoundingClientRect();
        applyPendingMarks(savedRange);
        _recaptureSavedRange();
        selection.removeAllRanges();
        hideStandaloneButton();
        await showPopover(rect);
    }

    function _firstTextNode(root) {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        return w.nextNode();
    }

    function _lastTextNode(root) {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        let last = null, n;
        while ((n = w.nextNode())) last = n;
        return last;
    }

    function _recaptureSavedRange() {
        const marks = document.querySelectorAll('mark.ait-highlight-pending');
        if (marks.length === 0) return;
        const startNode = _firstTextNode(marks[0]);
        const endNode = _lastTextNode(marks[marks.length - 1]);
        if (!startNode || !endNode) return;
        const range = document.createRange();
        range.setStart(startNode, 0);
        range.setEnd(endNode, endNode.textContent.length);
        savedRange = range;
    }

    function setupPopoverDismiss() {
        document.addEventListener('mousedown', (e) => {
            if (!popoverEl || popoverEl.style.display === 'none') return;
            if (popoverEl.contains(e.target)) return;
            if (e.target.closest('mark.ait-highlight')) return;
            hidePopover();
        });
    }

    // ==================== 独立按钮（非 AI 网站或追问关闭时） ====================

    function createStandaloneButton() {
        if (standaloneBtn) return;

        standaloneBtn = document.createElement('div');
        standaloneBtn.className = 'ait-highlight-standalone-btn';
        standaloneBtn.style.display = 'none';
        standaloneBtn.innerHTML = `
            <button class="ait-highlight-action">
                ${HIGHLIGHT_BTN_ICON}
                <span>${chrome.i18n.getMessage('highlightMark') || '标注'}</span>
            </button>
        `;

        window.eventDelegateManager.on('click', '.ait-highlight-standalone-btn .ait-highlight-action', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onHighlightAction();
        });

        window.eventDelegateManager.on('mousedown', '.ait-highlight-standalone-btn', (e) => {
            e.preventDefault();
        });

        standaloneBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            _hlBtnMouseDown = true;
        });
        standaloneBtn.addEventListener('mouseup', () => { _hlBtnMouseDown = false; });
        _hlDocMouseUpHandler = () => { _hlBtnMouseDown = false; };
        document.addEventListener('mouseup', _hlDocMouseUpHandler);
        document.body.appendChild(standaloneBtn);
    }

    function showStandaloneButton(selection) {
        if (!standaloneBtn || !selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        const btnWidth = 80;
        const btnHeight = 32;
        const gap = 8;
        const margin = 10;

        let left = rect.left;
        let top = rect.top - btnHeight - gap;

        if (top < margin) top = rect.bottom + gap;
        if (left < margin) left = margin;
        if (left + btnWidth > window.innerWidth - margin) left = window.innerWidth - btnWidth - margin;

        standaloneBtn.style.left = `${left}px`;
        standaloneBtn.style.top = `${top + window.scrollY}px`;
        standaloneBtn.style.display = 'flex';

        requestAnimationFrame(() => standaloneBtn.classList.add('visible'));
    }

    function hideStandaloneButton() {
        if (!standaloneBtn) return;
        standaloneBtn.classList.remove('visible');
        standaloneBtn.style.display = 'none';
    }

    // ==================== 选区监听（独立模式） ====================

    function isValidHighlightSelection(selection) {
        if (!selection || selection.rangeCount === 0) return false;
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
        if (!element) return false;

        if (element.closest('textarea, [contenteditable="true"], input')) return false;
        if (element.closest('.ait-quick-ask-btn, .ait-highlight-standalone-btn, .ait-hl-popover, .ait-chat-timeline-wrapper, .ait-panel-modal')) return false;
        if (element.closest('.runner-panel, .floating-runner-container')) return false;

        return true;
    }

    function needsStandaloneMode() {
        const quickAsk = window.quickAskManager;
        return !quickAsk || !quickAsk.isEnabled;
    }

    let boundHandlers = null;

    function bindSelectionEvents() {
        if (boundHandlers) return;

        boundHandlers = {
            mouseup: (e) => {
                if (standaloneBtn?.contains(e.target)) return;
                if (popoverEl?.contains(e.target)) return;
                setTimeout(() => checkSelection(), 10);
            },
            keyup: (e) => {
                if (e.shiftKey) setTimeout(() => checkSelection(), 10);
            },
            selectionchange: () => {
                if (_hlBtnMouseDown) return;
                const sel = window.getSelection();
                if (!sel?.toString().trim()) {
                    if (!popoverEl || popoverEl.style.display === 'none') {
                        hideStandaloneButton();
                    }
                }
            },
            scroll: () => {
                hideStandaloneButton();
            }
        };

        document.addEventListener('mouseup', boundHandlers.mouseup);
        document.addEventListener('keyup', boundHandlers.keyup);
        document.addEventListener('selectionchange', boundHandlers.selectionchange);
        window.addEventListener('scroll', boundHandlers.scroll, { passive: true, capture: true });
    }

    function unbindSelectionEvents() {
        if (!boundHandlers) return;
        document.removeEventListener('mouseup', boundHandlers.mouseup);
        document.removeEventListener('keyup', boundHandlers.keyup);
        document.removeEventListener('selectionchange', boundHandlers.selectionchange);
        window.removeEventListener('scroll', boundHandlers.scroll, { capture: true });
        boundHandlers = null;
        if (_hlDocMouseUpHandler) {
            document.removeEventListener('mouseup', _hlDocMouseUpHandler);
            _hlDocMouseUpHandler = null;
        }
        _hlBtnMouseDown = false;
    }

    function checkSelection() {
        if (!manager?.isEnabled) return;
        if (!needsStandaloneMode()) return;
        if (popoverEl && popoverEl.style.display !== 'none') return;

        const selection = window.getSelection();
        const text = selection?.toString().trim();
        if (!text) { hideStandaloneButton(); return; }
        if (!isValidHighlightSelection(selection)) { hideStandaloneButton(); return; }
        if (manager.isSelectionInsideHighlight()) { hideStandaloneButton(); return; }

        showStandaloneButton(selection);
    }

    // ==================== 状态更新 ====================

    function updateState() {
        if (!manager) return;

        if (manager.isEnabled && needsStandaloneMode()) {
            createStandaloneButton();
            bindSelectionEvents();
        } else {
            hideStandaloneButton();
            hidePopover();
            unbindSelectionEvents();
        }
    }

    // ==================== URL 变化处理 ====================

    function handleUrlChange() {
        if (location.href === currentUrl) return;
        currentUrl = location.href;

        hidePopover();
        manager?.clearAllMarks();
        setTimeout(() => {
            if (manager?.isEnabled) manager.restoreHighlights();
        }, 1000);
    }

    // ==================== 初始化 ====================

    async function initHighlight() {
        try {
            if (typeof HighlightManager === 'undefined') return;
            if (typeof window.eventDelegateManager === 'undefined') return;

            manager = new HighlightManager();
            await manager.init();

            window.highlightManager = manager;
            setupPopoverDismiss();

            window.addEventListener('ait-highlight-click', async (e) => {
                const { id, mark } = e.detail;
                if (!manager || !id) return;
                const hlData = await manager.getHighlightById(id);
                const rect = mark.getBoundingClientRect();
                hideStandaloneButton();
                await showPopover(rect, {
                    edit: true,
                    hlId: id,
                    color: hlData?.color || manager.currentColor,
                    style: hlData?.style || manager.currentStyle,
                    annotation: hlData?.annotation || ''
                });
            });

            window.addEventListener('url:change', handleUrlChange);

            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local') return;
                if (changes.highlightEnabled !== undefined || changes.quickAskEnabled !== undefined) {
                    setTimeout(updateState, 100);
                }
            });

            setTimeout(updateState, 500);

            window.AIChatTimelineHighlight = {
                getManager: () => manager,
                getButtonIcon: () => HIGHLIGHT_BTN_ICON,
                updateState,
                onHighlightAction,
                isSelectionInsideHighlight: () => manager?.isSelectionInsideHighlight() ?? false
            };

        } catch (error) {
            console.error('[Highlight] Initialization failed:', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHighlight);
    } else {
        initHighlight();
    }

})();
