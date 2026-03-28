/**
 * Starred Tab - 收藏列表（支持2级文件夹）
 *
 * 树渲染 + 交互 + 导航均委托给 StarredTreeRenderer（共享）。
 * 本类只负责：容器/工具栏、搜索框、BaseTab 生命周期。
 */

class StarredTab extends BaseTab {
    constructor() {
        super();
        this.id = 'starred';
        this.name = chrome.i18n.getMessage('vnkxpm');
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>`;

        this.folderManager = new FolderManager(StorageAdapter);

        this.toastColor = {
            light: { backgroundColor: '#0d0d0d', textColor: '#ffffff', borderColor: '#262626' },
            dark: { backgroundColor: '#ffffff', textColor: '#1f2937', borderColor: '#d1d5db' }
        };

        this.treeRenderer = new StarredTreeRenderer({
            scene: 'tab',
            showSearch: true,
            showPlatformIcon: true,
            emptyClass: 'timeline-starred-empty',
            toastOptions: { color: this.toastColor },
            folderManager: this.folderManager,
            getSearchQuery: () => this.getState('searchQuery'),
            getFolderStates: () => this.getPersistentState('folderStates'),
            setFolderStates: (s) => this.setPersistentState('folderStates', s),
            getListContainer: () => this.getDomRef('listContainer'),
            onAfterAction: () => this.updateList(),
            onAfterNavigate: () => { if (window.panelModal) window.panelModal.hide(); },
        });
    }

    getInitialState() {
        return {
            transient: { searchQuery: '' },
            persistent: { folderStates: {} }
        };
    }

    // ==================== 渲染 ====================

    render() {
        const container = document.createElement('div');
        container.className = 'starred-tab-container';

        const toolbar = document.createElement('div');
        toolbar.className = 'starred-toolbar';

        const addFolderBtn = document.createElement('button');
        addFolderBtn.className = 'starred-toolbar-btn';
        addFolderBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
        `;
        this.addEventListener(addFolderBtn, 'mouseenter', () => {
            window.globalTooltipManager.show(
                'add-folder-btn', 'button', addFolderBtn,
                chrome.i18n.getMessage('kxvpmz'),
                { placement: 'top' }
            );
        });
        this.addEventListener(addFolderBtn, 'mouseleave', () => { window.globalTooltipManager.hide(); });
        this.addEventListener(addFolderBtn, 'click', () => this.treeRenderer.handleCreateFolder());
        toolbar.appendChild(addFolderBtn);

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'starred-toolbar-search';
        searchInput.placeholder = chrome.i18n.getMessage('mvkzpx');
        searchInput.autocomplete = 'off';
        searchInput.value = '';

        this.addEventListener(searchInput, 'input', (e) => {
            this.setState('searchQuery', e.target.value.trim().toLowerCase());
            this.updateList();
        });
        this.addEventListener(searchInput, 'keydown', (e) => {
            if (e.key === 'Escape') {
                const input = this.getDomRef('searchInput');
                if (input) input.value = '';
                this.setState('searchQuery', '');
                this.updateList();
            }
        });
        this.setDomRef('searchInput', searchInput);
        toolbar.appendChild(searchInput);

        container.appendChild(toolbar);

        const listContainer = document.createElement('div');
        listContainer.className = 'starred-list-tree';
        this.setDomRef('listContainer', listContainer);
        container.appendChild(listContainer);

        const sidebarPlatforms = typeof getPlatformsByFeature === 'function' ? getPlatformsByFeature('sidebarStarred') : [];
        if (sidebarPlatforms.length > 0) {
            const divider = document.createElement('div');
            divider.className = 'starred-sidebar-divider';
            container.appendChild(divider);

            const manageSection = document.createElement('div');
            manageSection.className = 'starred-sidebar-toggle';
            manageSection.innerHTML = `
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">${chrome.i18n.getMessage('starredDisplayLabel') || '显示文件夹'}</div>
                        <div class="setting-hint">${chrome.i18n.getMessage('sidebarStarredHint') || 'Control which platforms show the starred folder in their sidebar'}</div>
                    </div>
                    <button class="starred-manage-btn">${chrome.i18n.getMessage('promptBtnSwitch') || '开关'}</button>
                </div>
            `;
            container.appendChild(manageSection);

            const manageBtn = manageSection.querySelector('.starred-manage-btn');
            this.addEventListener(manageBtn, 'click', () => {
                this._showPlatformManageModal(sidebarPlatforms);
            });
        }

        return container;
    }

    // ==================== 生命周期 ====================

    async mounted() {
        super.mounted();
        await this.updateList();
        this.addStorageListener(async () => {
            if (window.panelModal && window.panelModal.currentTabId === 'starred') {
                await this.updateList();
            }
        });
    }

    unmounted() {
        super.unmounted();
    }

    // ==================== 数据 → 渲染 ====================

    async updateList() {
        const tree = await this.folderManager.getStarredByFolder();
        this.treeRenderer.renderTree(tree);
    }

    // ==================== 平台管理弹窗 ====================

    async _showPlatformManageModal(platforms) {
        const settings = await StorageAdapter.get('sidebarStarredPlatformSettings') || {};

        const overlay = document.createElement('div');
        overlay.className = 'starred-platform-modal-overlay';

        const platformItems = platforms.map(p => {
            const logoHtml = p.logoPath
                ? `<img src="${chrome.runtime.getURL(p.logoPath)}" alt="${p.name}">`
                : `<span>${p.name.charAt(0)}</span>`;
            const checked = settings[p.id] !== false ? 'checked' : '';
            return `
                <div class="starred-platform-item">
                    <div class="starred-platform-info">
                        <div class="starred-platform-logo">${logoHtml}</div>
                        <span class="starred-platform-name">${p.name}</span>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" data-platform-id="${p.id}" ${checked}>
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>`;
        }).join('');

        overlay.innerHTML = `
            <div class="starred-platform-modal">
                <div class="starred-platform-modal-header">
                    <span>${chrome.i18n.getMessage('mkvzpx') || 'Supported Platforms'}</span>
                    <button class="starred-platform-modal-close">✕</button>
                </div>
                <div class="starred-platform-modal-body">${platformItems}</div>
            </div>`;

        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('.starred-platform-modal-close').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        overlay.querySelectorAll('input[data-platform-id]').forEach(cb => {
            cb.addEventListener('change', async () => {
                const current = await StorageAdapter.get('sidebarStarredPlatformSettings') || {};
                current[cb.dataset.platformId] = cb.checked;
                await StorageAdapter.set('sidebarStarredPlatformSettings', current);
            });
        });
    }

}
