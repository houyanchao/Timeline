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
        this.adapter.refreshStarredIcons?.();
        return true;
    }

    destroy() {
        this.isDestroyed = true;
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

        titleArea.appendChild(chevron);
        titleArea.appendChild(title);
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
}
