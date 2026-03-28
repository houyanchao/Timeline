/**
 * Sidebar Starred Manager
 *
 * 侧边栏收藏列表：注入容器 + 生命周期管理。
 * 树渲染 + 交互逻辑委托给 StarredTreeRenderer（共享）。
 */

class SidebarStarredManager {
    static CONTAINER_CLASS = 'ait-sidebar-starred';
    static STORAGE_KEY_FOLDER_STATES = 'sidebarStarredFolderStates';
    static REINJECT_INTERVAL = 3000;
    static STORAGE_DEBOUNCE = 300;

    constructor(adapter) {
        this.adapter = adapter;
        this.container = null;
        this.folderManager = new FolderManager(StorageAdapter);
        this.folderStates = {};
        this.isDestroyed = false;

        this._storageListener = null;
        this._reinjectTimer = null;
        this._refreshDebounceTimer = null;

        this.treeRenderer = new StarredTreeRenderer({
            scene: 'sidebar',
            showSearch: false,
            showPlatformIcon: false,
            emptyClass: 'ait-ss-empty',
            toastOptions: {},
            folderManager: this.folderManager,
            getSearchQuery: () => '',
            getFolderStates: () => this.folderStates,
            setFolderStates: (s) => {
                this.folderStates = s;
                StorageAdapter.set(SidebarStarredManager.STORAGE_KEY_FOLDER_STATES, s);
            },
            getListContainer: () => this.container?.querySelector('.ait-ss-list') || null,
            onAfterAction: () => this._refreshContent(),
        });
    }

    // ==================== 生命周期 ====================

    async init() {
        if (this.isDestroyed) return false;
        const saved = await StorageAdapter.get(SidebarStarredManager.STORAGE_KEY_FOLDER_STATES);
        this.folderStates = saved && typeof saved === 'object' ? saved : {};
        const ok = this._injectIntoSidebar();
        if (!ok) return false;
        await this._restoreCollapseState();
        await this._refreshContent();
        this._startStorageListener();
        this._startReinjectCheck();
        this._startParentObserver();
        this._startNativeMenuInjector();
        this._initCustomDrag();
        this.adapter.refreshStarredIcons?.();
        return true;
    }

    destroy() {
        this.isDestroyed = true;
        this._destroyCustomDrag();
        this.treeRenderer.destroy();
        this.adapter.destroyNativeMenu?.();
        if (this._storageListener) { StorageAdapter.removeChangeListener(this._storageListener); this._storageListener = null; }
        if (this._reinjectTimer) { clearInterval(this._reinjectTimer); this._reinjectTimer = null; }
        if (this._refreshDebounceTimer) { clearTimeout(this._refreshDebounceTimer); this._refreshDebounceTimer = null; }
        if (this._parentObserver) { this._parentObserver.disconnect(); this._parentObserver = null; }
        if (this.container?.parentNode) this.container.parentNode.removeChild(this.container);
        this.container = null;
    }

    // ==================== 注入 ====================

    _injectIntoSidebar() {
        const existing = document.querySelector(`.${SidebarStarredManager.CONTAINER_CLASS}`);
        if (existing) { this.container = existing; return true; }
        const info = this.adapter.findInsertionPoint();
        if (!info) return false;
        this.container = this._buildContainer();
        const { parent, reference, position } = info;
        try {
            if (position === 'before') parent.insertBefore(this.container, reference);
            else if (position === 'after') parent.insertBefore(this.container, reference?.nextSibling || null);
            else if (position === 'prepend') parent.insertBefore(this.container, parent.firstChild);
            else parent.appendChild(this.container);
            return true;
        } catch (e) { console.error('[SidebarStarred] Injection failed:', e); return false; }
    }

    _buildContainer() {
        const root = document.createElement('div');
        root.className = `${SidebarStarredManager.CONTAINER_CLASS} ${this.adapter.getPlatformClass()}`;

        const header = document.createElement('div');
        header.className = 'ait-ss-header';

        const titleArea = document.createElement('div');
        titleArea.className = 'ait-ss-title-area';
        titleArea.style.cursor = 'pointer';

        const chevron = document.createElement('span');
        chevron.className = 'ait-ss-chevron';
        chevron.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>';

        const title = document.createElement('span');
        title.className = 'ait-ss-title';
        title.textContent = chrome.i18n.getMessage('vnkxpm') || 'Starred';

        const helpBtn = document.createElement('button');
        helpBtn.className = 'ait-ss-add-btn ait-ss-help-btn';
        helpBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        helpBtn.addEventListener('mouseenter', () => {
            if (!window.globalTooltipManager) return;
            const desc = chrome.i18n.getMessage('starredHelpDesc') || '文件夹，分类整理对话，告别杂乱无章。';
            const tipsTitle = chrome.i18n.getMessage('starredHelpTipsTitle') || '使用小技巧：';
            const tip1 = chrome.i18n.getMessage('starredHelpTip1') || '拖动对话到文件夹。';
            const tip2 = chrome.i18n.getMessage('starredHelpTip2') || '拖动文件夹中的对话调整位置。';
            const tip3 = chrome.i18n.getMessage('starredHelpTip3') || '拖动二级文件夹调整位置。';
            const tip4 = chrome.i18n.getMessage('starredHelpTip4') || '双击文件夹或对话，快速编辑。';
            const html = `<div style="font-size:12px;line-height:1.6">`
                + `<div style="font-size:13px;font-weight:600;margin-bottom:6px">${desc}</div>`
                + `<div style="font-weight:600;margin-bottom:4px">${tipsTitle}</div>`
                + `<div style="padding-left:2px">`
                + `<div>· ${tip1}</div>`
                + `<div>· ${tip2}</div>`
                + `<div>· ${tip3}</div>`
                + `<div>· ${tip4}</div>`
                + `</div></div>`;
            window.globalTooltipManager.show('starred-help', 'button', helpBtn, { html }, { placement: 'right', gap: 6, maxWidth: 260, allowHover: true });
        });
        helpBtn.addEventListener('mouseleave', () => { window.globalTooltipManager?.hide(); });
        helpBtn.addEventListener('click', (e) => e.stopPropagation());

        titleArea.appendChild(chevron);
        titleArea.appendChild(title);
        titleArea.appendChild(helpBtn);
        titleArea.addEventListener('click', () => this._toggleCollapse());

        const headerActions = document.createElement('div');
        headerActions.className = 'ait-ss-header-actions';

        this.searchBtn = document.createElement('button');
        this.searchBtn.className = 'ait-ss-add-btn';
        this.searchBtn.style.display = 'none';
        this.searchBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
        this.searchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.panelModal) window.panelModal.show('starred');
        });

        const addBtn = document.createElement('button');
        addBtn.className = 'ait-ss-add-btn';
        addBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>';
        addBtn.addEventListener('click', (e) => { e.stopPropagation(); this.treeRenderer.handleCreateFolder(); });

        headerActions.appendChild(this.searchBtn);
        headerActions.appendChild(addBtn);

        header.appendChild(titleArea);
        header.appendChild(headerActions);
        root.appendChild(header);

        const list = document.createElement('div');
        list.className = 'ait-ss-list';
        root.appendChild(list);

        return root;
    }

    async _toggleCollapse() {
        if (!this.container) return;
        const list = this.container.querySelector('.ait-ss-list');
        const chevron = this.container.querySelector('.ait-ss-chevron');
        if (!list) return;

        const collapsed = !this.container.classList.contains('ait-ss-collapsed');
        this.container.classList.toggle('ait-ss-collapsed', collapsed);
        await StorageAdapter.set('sidebarStarredCollapsed', collapsed);
    }

    async _restoreCollapseState() {
        const collapsed = await StorageAdapter.get('sidebarStarredCollapsed');
        if (collapsed && this.container) {
            this.container.classList.add('ait-ss-collapsed');
        }
    }

    // ==================== 数据 → 渲染 ====================

    async _refreshContent() {
        if (this.isDestroyed || !this.container) return;
        const tree = await this.folderManager.getStarredByFolder();
        this.treeRenderer.renderTree(tree);
        
        const hasContent = tree.folders.length > 0 || tree.uncategorized.length > 0;
        if (this.searchBtn) {
            this.searchBtn.style.display = hasContent ? '' : 'none';
        }
    }

    // ==================== 监听 ====================

    _startStorageListener() {
        this._storageListener = (changes, areaName) => {
            if (areaName !== 'local') return;
            if (changes.chatTimelineStars || changes.folders) {
                if (this._refreshDebounceTimer) clearTimeout(this._refreshDebounceTimer);
                this._refreshDebounceTimer = setTimeout(() => {
                    this._refreshContent();
                    this.adapter.refreshStarredIcons?.();
                }, SidebarStarredManager.STORAGE_DEBOUNCE);
            }
        };
        StorageAdapter.addChangeListener(this._storageListener);
    }

    _startParentObserver() {
        if (this._parentObserver) this._parentObserver.disconnect();
        const info = this.adapter.findInsertionPoint();
        if (!info?.parent) return;
        this._parentObserver = new MutationObserver(() => {
            if (this.isDestroyed) return;
            const info = this.adapter.findInsertionPoint();
            if (!info) {
                if (this.container?.parentNode) {
                    this.container.parentNode.removeChild(this.container);
                    this.container = null;
                }
                return;
            }
            if (this.container && this.container.parentNode !== info.parent) {
                if (this.container.parentNode) this.container.parentNode.removeChild(this.container);
                this.container = null;
            }
            if (!this.container) {
                if (this._injectIntoSidebar()) this._refreshContent();
                this._startParentObserver();
            } else if (info.position === 'before' && info.reference && this.container.nextElementSibling !== info.reference) {
                this.container.parentNode.removeChild(this.container);
                this.container = null;
                if (this._injectIntoSidebar()) this._refreshContent();
                this._startParentObserver();
            }
        });
        this._parentObserver.observe(info.parent, { childList: true });
    }

    _startReinjectCheck() {
        this._reinjectTimer = setInterval(() => {
            if (this.isDestroyed) return;
            const existing = document.querySelector(`.${SidebarStarredManager.CONTAINER_CLASS}`);
            if (!existing) {
                this.container = null;
                if (this._injectIntoSidebar()) this._refreshContent();
                return;
            }
            const info = this.adapter.findInsertionPoint();
            if (!info) {
                if (existing.parentNode) existing.parentNode.removeChild(existing);
                this.container = null;
                return;
            }
            const needsReinject =
                existing.parentNode !== info.parent ||
                (info.position === 'before' && info.reference && existing.nextElementSibling !== info.reference);
            if (needsReinject) {
                if (existing.parentNode) existing.parentNode.removeChild(existing);
                this.container = null;
                if (this._injectIntoSidebar()) this._refreshContent();
            }
            this.adapter.refreshStarredIcons?.();
        }, SidebarStarredManager.REINJECT_INTERVAL);
    }

    // ==================== 原生菜单注入 ====================

    _startNativeMenuInjector() {
        if (!this.adapter.getClickDelegateSelector?.()) return;
        this.adapter.initNativeMenu?.(this.folderManager);
    }

    // ==================== 自定义拖拽（原生对话 → 文件夹） ====================

    _initCustomDrag() {
        this._cdState = null;

        const onMouseDown = (e) => {
            if (e.button !== 0 || this.isDestroyed) return;
            const link = e.target.closest('a[href]');
            if (!link || link.closest('.ait-sidebar-starred')) return;
            const sidebar = this.adapter.findSidebarContainer();
            if (!sidebar || !sidebar.contains(link)) return;

            this._cdState = {
                startX: e.clientX, startY: e.clientY,
                url: link.href,
                title: link.textContent?.trim()?.substring(0, 100) || '',
                sourceEl: link,
                active: false, ghost: null
            };
        };

        const onDragStart = (e) => {
            if (this._cdState) {
                e.preventDefault();
            }
        };

        const onMouseMove = (e) => {
            if (!this._cdState) return;

            if (!this._cdState.active) {
                const dx = Math.abs(e.clientX - this._cdState.startX);
                const dy = Math.abs(e.clientY - this._cdState.startY);
                if (dx < 5 && dy < 5) return;
                this._cdState.active = true;
                document.body.classList.add('ait-custom-dragging');

                const src = this._cdState.sourceEl;
                src.style.opacity = '0.35';
                src.style.transition = 'opacity 0.15s';

                const ghost = document.createElement('div');
                ghost.className = 'ait-custom-drag-ghost';
                ghost.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>${this._escapeText(this._cdState.title || 'Conversation')}</span>`;
                document.body.appendChild(ghost);
                this._cdState.ghost = ghost;
            }

            if (this._cdState.ghost) {
                this._cdState.ghost.style.left = (e.clientX + 14) + 'px';
                this._cdState.ghost.style.top = (e.clientY - 16) + 'px';
            }

            const target = this.treeRenderer._detectDropTarget(e.clientX, e.clientY, null);
            this.treeRenderer._clearDropIndicator();
            this.treeRenderer._clearItemDropIndicator();
            if (target?.type === 'item') {
                this.treeRenderer._setItemDropIndicator(target.itemEl, target.position);
                this.treeRenderer._setDropIndicator(target.folderEl, 'inside');
            } else if (target?.type === 'folder') {
                this.treeRenderer._setDropIndicator(target.folderEl, 'inside');
            }
        };

        const onMouseUp = (e) => {
            if (!this._cdState) return;

            if (this._cdState.active) {
                const target = this.treeRenderer._detectDropTarget(e.clientX, e.clientY, null);
                if (target?.type === 'item') {
                    this.treeRenderer._handleExternalDrop(
                        this._cdState.url, this._cdState.title, '', target.folderEl,
                        { refTurnId: target.turnId, position: target.position }
                    );
                } else if (target?.type === 'folder') {
                    this.treeRenderer._handleExternalDrop(
                        this._cdState.url, this._cdState.title, '', target.folderEl
                    );
                }
            }

            this._cdCleanup();
        };

        const onKeyDown = (e) => {
            if (e.key === 'Escape' && this._cdState?.active) this._cdCleanup();
        };

        this._cdHandlers = { onMouseDown, onDragStart, onMouseMove, onMouseUp, onKeyDown };
        document.addEventListener('mousedown', onMouseDown, true);
        document.addEventListener('dragstart', onDragStart, true);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('keydown', onKeyDown);
    }

    _cdCleanup() {
        document.body.classList.remove('ait-custom-dragging');
        if (this._cdState?.sourceEl) {
            this._cdState.sourceEl.style.opacity = '';
            this._cdState.sourceEl.style.transition = '';
        }
        if (this._cdState?.ghost) this._cdState.ghost.remove();
        this._cdState = null;
        this.treeRenderer._clearDropIndicator();
        this.treeRenderer._clearItemDropIndicator();
    }

    _escapeText(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

    _destroyCustomDrag() {
        this._cdCleanup();
        if (!this._cdHandlers) return;
        const { onMouseDown, onDragStart, onMouseMove, onMouseUp, onKeyDown } = this._cdHandlers;
        document.removeEventListener('mousedown', onMouseDown, true);
        document.removeEventListener('dragstart', onDragStart, true);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('keydown', onKeyDown);
        this._cdHandlers = null;
    }
}
