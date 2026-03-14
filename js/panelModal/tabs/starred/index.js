/**
 * Starred Tab - 收藏列表（支持2级文件夹）
 * 从 timeline-manager.js 完整迁移而来，并添加文件夹功能
 */

class StarredTab extends BaseTab {
    constructor() {
        super();
        this.id = 'starred';
        this.name = chrome.i18n.getMessage('vnkxpm');
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>`;
        
        // 文件夹管理器
        this.folderManager = new FolderManager(StorageAdapter);
        
        // Toast 颜色配置（黑/白反转）
        this.toastColor = {
            light: { backgroundColor: '#0d0d0d', textColor: '#ffffff', borderColor: '#262626' },
            dark: { backgroundColor: '#ffffff', textColor: '#1f2937', borderColor: '#d1d5db' }
        };

        // 平台感知的文件夹 SVG
        const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform) || (navigator.userAgentData && navigator.userAgentData.platform === 'macOS');
        const gTop = isMac ? '#6CC4F8' : '#FFD666';
        const gBot = isMac ? '#3B9FE7' : '#E5A520';
        this._folderSvgClosed = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><defs><linearGradient id="st-fc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${gTop}"/><stop offset="100%" stop-color="${gBot}"/></linearGradient></defs><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" fill="url(#st-fc)"/></svg>`;
        this._folderSvgOpen = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><defs><linearGradient id="st-fo" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${gTop}"/><stop offset="100%" stop-color="${gBot}"/></linearGradient></defs><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="url(#st-fo)" stroke-width="2" fill="none"/></svg>`;
    }
    
    /**
     * 定义初始状态
     * ✨ 使用 BaseTab 的自动状态管理
     */
    getInitialState() {
        return {
            transient: {
                searchQuery: ''  // 搜索关键词（每次打开重置）
            },
            persistent: {
                folderStates: {}  // 文件夹展开/折叠状态（保留用户偏好）
            }
        };
    }
    
    /**
     * 渲染收藏列表内容
     */
    render() {
        const container = document.createElement('div');
        container.className = 'starred-tab-container';
        
        // 顶部操作栏
        const toolbar = document.createElement('div');
        toolbar.className = 'starred-toolbar';
        
        // 新建文件夹按钮
        const addFolderBtn = document.createElement('button');
        addFolderBtn.className = 'starred-toolbar-btn';
        addFolderBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
        `;
        // ✨ 使用 BaseTab 的自动事件管理
        this.addEventListener(addFolderBtn, 'mouseenter', () => {
            window.globalTooltipManager.show(
                'add-folder-btn',
                'button',
                addFolderBtn,
                chrome.i18n.getMessage('kxvpmz'),
                { placement: 'top' }
            );
        });
        this.addEventListener(addFolderBtn, 'mouseleave', () => {
            window.globalTooltipManager.hide();
        });
        this.addEventListener(addFolderBtn, 'click', () => this.handleCreateFolder());
        
        toolbar.appendChild(addFolderBtn);
        
        // 搜索输入框
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'starred-toolbar-search';
        searchInput.placeholder = chrome.i18n.getMessage('mvkzpx');
        searchInput.autocomplete = 'off'; // ✨ 防止浏览器缓存输入值
        searchInput.value = ''; // ✨ 总是用空值初始化
        
        // ✨ 使用 BaseTab 的自动事件管理和状态管理
        this.addEventListener(searchInput, 'input', (e) => {
            this.setState('searchQuery', e.target.value.trim().toLowerCase());
            this.updateList();
        });
        
        // 清空搜索框的快捷键（Escape）
        this.addEventListener(searchInput, 'keydown', (e) => {
            if (e.key === 'Escape') {
                const input = this.getDomRef('searchInput');
                if (input) {
                    input.value = '';
                }
                this.setState('searchQuery', '');
                this.updateList();
            }
        });
        
        // ✨ 保存 DOM 引用
        this.setDomRef('searchInput', searchInput);
        
        toolbar.appendChild(searchInput);
        container.appendChild(toolbar);
        
        // 列表容器
        const listContainer = document.createElement('div');
        listContainer.className = 'starred-list-tree';
        
        // ✨ 保存 DOM 引用
        this.setDomRef('listContainer', listContainer);
        
        container.appendChild(listContainer);
        
        return container;
    }
    
    /**
     * Tab 被激活时更新列表并监听存储变化
     * ✨ 使用 BaseTab 的自动状态管理
     */
    async mounted() {
        super.mounted();  // ✅ 必须先调用（初始化状态）
        
        await this.updateList();
        
        // ✨ 使用 BaseTab 的自动事件管理
        this.addStorageListener(async () => {
            if (window.panelModal && window.panelModal.currentTabId === 'starred') {
                await this.updateList();
            }
        });
    }
    
    /**
     * Tab 被卸载时清理事件
     * ✨ 使用 BaseTab 的自动清理机制
     */
    unmounted() {
        super.unmounted();  // ✅ 自动清理所有状态、引用、监听器
        // ✨ 不需要手动清理任何东西！
    }
    
    /**
     * 更新收藏列表（树状结构）
     * ✨ 使用 BaseTab 的状态管理
     */
    async updateList() {
        const listContainer = this.getDomRef('listContainer');
        if (!listContainer) return;
        
        // 隐藏tooltip
        if (window.globalTooltipManager) {
            window.globalTooltipManager.forceHideAll();
        }
        
        // 获取分组数据
        const tree = await this.folderManager.getStarredByFolder();
        
        // 清空列表
        listContainer.innerHTML = '';
        
        // 检查是否有任何数据
        const hasData = tree.folders.length > 0 || tree.uncategorized.length > 0;
        
        if (!hasData) {
            listContainer.innerHTML = `<div class="timeline-starred-empty">${chrome.i18n.getMessage('jwvnkp')}</div>`;
            return;
        }
        
        // 判断是否只有默认文件夹
        const onlyDefaultFolder = tree.folders.length === 0;
        
        // 始终先渲染默认文件夹（虚拟）
        this.renderUncategorized(tree.uncategorized, listContainer, onlyDefaultFolder);
        
        // 渲染文件夹树
        for (const folder of tree.folders) {
            this.renderFolder(folder, listContainer);
        }
        
        // ✨ 搜索模式下，如果没有任何结果，显示提示
        const searchQuery = this.getState('searchQuery');
        if (searchQuery && listContainer.children.length === 0) {
            listContainer.innerHTML = `
                <div class="timeline-starred-empty">
                    <div style="margin-bottom: 8px;">未找到匹配的收藏</div>
                    <div style="font-size: 13px; color: #9ca3af;">
                        搜索关键词：<strong>"${this.escapeHtml(searchQuery)}"</strong>
                    </div>
                </div>
            `;
        }
    }
    
    /**
     * 渲染单个文件夹（递归渲染子文件夹）
     * @param {Object} folder - 文件夹数据
     * @param {HTMLElement} container - 容器元素
     * @param {number} level - 层级（0=根，1=子）
     */
    renderFolder(folder, container, level = 0) {
        // ✨ 使用 BaseTab 的状态管理
        const searchQuery = this.getState('searchQuery');
        const folderStates = this.getPersistentState('folderStates');
        
        // ✨ 检查文件夹名是否匹配
        const folderNameMatches = searchQuery && folder.name.toLowerCase().includes(searchQuery);
        
        // ✨ 搜索模式下，过滤收藏项
        // 如果文件夹名匹配，显示所有收藏项；否则过滤收藏项
        const filteredItems = searchQuery 
            ? (folderNameMatches 
                ? folder.items  // 文件夹名匹配，显示所有
                : folder.items.filter(item => this.matchesSearch(item, searchQuery)))  // 过滤
            : folder.items;
        
        // ✨ 递归检查子文件夹是否有匹配项
        const hasMatchingChildren = (folder.children || []).some(child => {
            const childFolderNameMatches = searchQuery && child.name.toLowerCase().includes(searchQuery);
            const childHasItems = child.items.some(item => this.matchesSearch(item, searchQuery));
            const childHasMatchingChildren = (child.children || []).length > 0; // 递归检查
            return childFolderNameMatches || childHasItems || childHasMatchingChildren;
        });
        
        // ✨ 如果搜索模式下，当前文件夹和子文件夹都没有匹配项，隐藏该文件夹
        if (searchQuery && !folderNameMatches && filteredItems.length === 0 && !hasMatchingChildren) {
            return; // 不渲染该文件夹
        }
        
        // ✨ 搜索模式下自动展开有匹配项的文件夹
        const isExpanded = searchQuery 
            ? true  // 搜索时自动展开
            : (folderStates[folder.id] === true); // 否则使用保存的状态
        
        const folderElement = document.createElement('div');
        folderElement.className = `ait-folder-item ait-folder-level-${level}`;
        folderElement.dataset.folderId = folder.id;
        
        // 文件夹头部
        const folderHeader = document.createElement('div');
        folderHeader.className = 'ait-folder-header';
        
        // 展开/折叠图标
        const toggleIcon = document.createElement('span');
        toggleIcon.className = `ait-folder-toggle ${isExpanded ? 'expanded' : ''}`;
        toggleIcon.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 6 15 12 9 18"></polyline>
            </svg>
        `;
        toggleIcon.addEventListener('click', () => this.toggleFolder(folder.id));
        
        // 文件夹图标和名称
        const folderInfo = document.createElement('div');
        folderInfo.className = 'ait-folder-info';
        
        let folderIconHtml;
        if (folder.icon) {
            folderIconHtml = this.escapeHtml(folder.icon);
        } else {
            folderIconHtml = isExpanded ? this._folderSvgOpen : this._folderSvgClosed;
        }
        
        const totalItems = this._countAllItems(folder);
        
        folderInfo.innerHTML = `
            <span class="ait-folder-icon">
                ${folderIconHtml}
            </span>
            <span class="ait-folder-name">${this.escapeHtml(folder.name)}</span>
            <span class="ait-folder-count">(${totalItems})</span>
        `;
        // 点击文件夹名称也可以展开/收起
        folderInfo.style.cursor = 'pointer';
        folderInfo.addEventListener('click', () => this.toggleFolder(folder.id));
        
        // 操作按钮（使用 Dropdown）
        const folderActions = document.createElement('div');
        folderActions.className = 'ait-folder-actions';
        
        // 操作按钮（三个横向的点）
        const actionsBtn = document.createElement('button');
        actionsBtn.className = 'ait-folder-action-btn';
        actionsBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2"/>
                <circle cx="12" cy="12" r="2"/>
                <circle cx="19" cy="12" r="2"/>
            </svg>
        `;
        
        // 点击显示下拉菜单
        actionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // 构建下拉菜单选项
            const items = [];
            
            // 新建子文件夹（只在根文件夹显示）
            if (level === 0) {
                const addChildIcon = document.createElement('div');
                addChildIcon.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        <line x1="12" y1="11" x2="12" y2="17"/>
                        <line x1="9" y1="14" x2="15" y2="14"/>
                    </svg>
                `;
                items.push({
                    label: chrome.i18n.getMessage('vpmzkx'),
                    icon: addChildIcon.firstElementChild.outerHTML,
                    onClick: () => this.handleCreateFolder(folder.id)
                });
            }
            
            // 编辑
            const editIcon = document.createElement('div');
            editIcon.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
            `;
            items.push({
                label: chrome.i18n.getMessage('xvkpmz'),
                icon: editIcon.firstElementChild.outerHTML,
                onClick: () => this.handleEditFolder(folder.id, folder.name)
            });
            
            // 删除
            if (items.length > 0) {
                items.push({ type: 'divider' });
            }
            const deleteIcon = document.createElement('div');
            deleteIcon.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/>
                    <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
            `;
            items.push({
                label: chrome.i18n.getMessage('mzxvkp'),
                icon: deleteIcon.firstElementChild.outerHTML,
                className: 'danger',
                onClick: () => this.handleDeleteFolder(folder.id)
            });
            
            // 显示下拉菜单
            window.globalDropdownManager.show({
                trigger: actionsBtn,
                items: items,
                position: 'bottom-right',
                width: 160
            });
        });
        
        folderActions.appendChild(actionsBtn);
        
        folderHeader.appendChild(toggleIcon);
        folderHeader.appendChild(folderInfo);
        folderHeader.appendChild(folderActions);
        folderElement.appendChild(folderHeader);
        
        // 文件夹内容（可折叠）
        const folderContent = document.createElement('div');
        folderContent.className = `ait-folder-content ${isExpanded ? 'expanded' : ''}`;
        
        // ✨ 渲染过滤后的收藏项
        for (const item of filteredItems) {
            folderContent.appendChild(this.renderStarredItem(item));
        }
        
        // 递归渲染子文件夹
        if (folder.children && folder.children.length > 0) {
            for (const childFolder of folder.children) {
                this.renderFolder(childFolder, folderContent, level + 1);
            }
        }
        
        folderElement.appendChild(folderContent);
        container.appendChild(folderElement);
    }
    
    /**
     * 渲染默认文件夹（虚拟，不存储）
     * @param {Array} items - 未分类的收藏项
     * @param {HTMLElement} container - 容器元素
     * @param {boolean} onlyDefaultFolder - 是否只有默认文件夹（如果是，则默认展开）
     */
    renderUncategorized(items, container, onlyDefaultFolder = false) {
        // ✨ 使用 BaseTab 的状态管理
        const searchQuery = this.getState('searchQuery');
        const folderStates = this.getPersistentState('folderStates');
        
        // ✨ 搜索模式下，过滤收藏项
        const filteredItems = searchQuery 
            ? items.filter(item => this.matchesSearch(item, searchQuery))
            : items;
        
        // ✨ 如果搜索模式下没有匹配项，隐藏默认文件夹
        if (searchQuery && filteredItems.length === 0) {
            return; // 不渲染默认文件夹
        }
        
        // 如果只有默认文件夹且有收藏项，则默认展开
        const shouldAutoExpand = onlyDefaultFolder && filteredItems.length > 0;
        // ✨ 搜索模式下自动展开
        const isExpanded = searchQuery 
            ? true 
            : (shouldAutoExpand || folderStates['default'] === true);
        
        const defaultFolder = document.createElement('div');
        defaultFolder.className = 'ait-folder-item default-folder';
        defaultFolder.dataset.folderId = 'default';
        
        // 文件夹头部
        const header = document.createElement('div');
        header.className = 'ait-folder-header';
        
        // 展开/折叠图标
        const toggleIcon = document.createElement('span');
        toggleIcon.className = `ait-folder-toggle ${isExpanded ? 'expanded' : ''}`;
        toggleIcon.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 6 15 12 9 18"></polyline>
            </svg>
        `;
        toggleIcon.addEventListener('click', () => this.toggleFolder('default'));
        
        // 文件夹信息
        const folderInfo = document.createElement('div');
        folderInfo.className = 'ait-folder-info';
        
        folderInfo.innerHTML = `
            <span class="ait-folder-icon">
                ${isExpanded ? this._folderSvgOpen : this._folderSvgClosed}
            </span>
            <span class="ait-folder-name">${chrome.i18n.getMessage('pkxvmz')}</span>
            <span class="ait-folder-count">(${filteredItems.length})</span>
        `;
        // 点击文件夹名称也可以展开/收起
        folderInfo.style.cursor = 'pointer';
        folderInfo.addEventListener('click', () => this.toggleFolder('default'));
        
        header.appendChild(toggleIcon);
        header.appendChild(folderInfo);
        defaultFolder.appendChild(header);
        
        // 文件夹内容
        const content = document.createElement('div');
        content.className = `ait-folder-content ${isExpanded ? 'expanded' : ''}`;
        
        // ✨ 渲染过滤后的收藏项
        for (const item of filteredItems) {
            content.appendChild(this.renderStarredItem(item));
        }
        
        defaultFolder.appendChild(content);
        container.appendChild(defaultFolder);
    }
    
    /**
     * 渲染单个收藏项
     */
    renderStarredItem(item) {
        
        const itemElement = document.createElement('div');
        itemElement.className = 'timeline-starred-item';
        itemElement.dataset.turnId = item.turnId;
        
        // 获取网站信息
        const siteInfo = this.getSiteInfo(item.url);
        
        // 左侧：Logo
        const logo = document.createElement('div');
        logo.className = 'timeline-starred-item-logo';
        
        if (siteInfo.logo) {
            const img = document.createElement('img');
            img.src = siteInfo.logo;
            img.alt = siteInfo.name;
            logo.appendChild(img);
        } else {
            // 如果没有logo，显示网站名称首字母
            const initial = document.createElement('div');
            initial.className = 'timeline-starred-item-initial';
            initial.textContent = siteInfo.name.charAt(0).toUpperCase();
            logo.appendChild(initial);
        }
        
        itemElement.appendChild(logo);
        
        // 中间：名称（可点击）
        const name = document.createElement('div');
        name.className = 'timeline-starred-item-name';
        name.textContent = item.theme;
        
        // 点击跳转
        name.addEventListener('click', async () => {
            // 判断是否是当前网站
            const isSameSite = this.isSameSite(item.url);
            
            // ✅ 获取收藏项的 nodeId/index（用于滚动到具体节点）
            // nodeId === -1 或 index === -1 表示整个对话的收藏，不需要滚动
            // nodeId 优先于 index（兼容新旧数据）
            const nodeKey = item.nodeId !== undefined ? item.nodeId : item.index;
            const needsScroll = nodeKey !== undefined && nodeKey !== -1;
            
            // ✅ 辅助函数：根据 nodeKey 查找 marker（支持 nodeId 和 index fallback）
            const findMarkerByNodeKey = (tm, nodeKey) => {
                if (nodeKey === null || nodeKey === undefined) return null;
                // 优先使用 adapter 的查找方法
                if (tm.adapter?.findMarkerByStoredIndex) {
                    return tm.adapter.findMarkerByStoredIndex(nodeKey, tm.markers, tm.markerMap);
                }
                // 默认逻辑：尝试用 generateTurnIdFromIndex 构建 turnId
                if (tm.adapter?.generateTurnIdFromIndex) {
                    const turnId = tm.adapter.generateTurnIdFromIndex(nodeKey);
                    const marker = tm.markerMap?.get(turnId);
                    if (marker) return marker;
                }
                // Fallback：数字索引
                if (typeof nodeKey === 'number' && nodeKey >= 0 && nodeKey < tm.markers.length) {
                    return tm.markers[nodeKey];
                }
                return null;
            };
            
            if (isSameSite) {
                // 同网站：在当前标签页跳转
                
                // ✅ 检查是否是当前页面（URL 完全相同）
                const isSamePage = location.href === item.url || 
                    location.href.replace(/^https?:\/\//, '') === item.url.replace(/^https?:\/\//, '');
                
                if (isSamePage) {
                    // ✅ 当前页面
                    const tm = window.timelineManager;
                    if (needsScroll && tm) {
                        const marker = findMarkerByNodeKey(tm, nodeKey);
                        if (marker && marker.element) {
                            tm.smoothScrollTo(marker.element);
                        }
                    }
                    // 不需要滚动（整个对话收藏）：直接关闭弹窗，无需刷新
                    if (window.panelModal) {
                        window.panelModal.hide();
                    }
                } else {
                    // ✅ 同网站不同页面：设置导航数据后跳转
                    const tm2 = window.timelineManager;
                    if (needsScroll && tm2) {
                        await tm2.setNavigateDataForUrl(item.url, nodeKey);
                    }
                    location.href = item.url;
                    if (window.panelModal) {
                        window.panelModal.hide();
                    }
                }
            } else {
                // ✅ 不同网站：设置跨站导航数据后，新标签页打开
                const tm3 = window.timelineManager;
                if (needsScroll && tm3) {
                    await tm3.setNavigateDataForUrl(item.url, nodeKey);
                }
                window.open(item.url, '_blank');
            }
        });
        
        itemElement.appendChild(name);
        
        // 操作按钮（三个点 - 使用 Dropdown）
        const actions = document.createElement('div');
        actions.className = 'timeline-starred-item-actions';
        
        // 更多按钮（三个横向的点）
        const moreBtn = document.createElement('button');
        moreBtn.className = 'timeline-starred-item-more';
        moreBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2"/>
                <circle cx="12" cy="12" r="2"/>
                <circle cx="19" cy="12" r="2"/>
            </svg>
        `;
        
        // 点击显示下拉菜单
        moreBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            
            // 构建"移动到"子菜单
            const moveChildren = await this._buildMoveToSubmenu(item.turnId);
            
            const items = [
                {
                    label: chrome.i18n.getMessage('vxkpmz'),
                    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="17 1 21 5 17 9"/>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                        <polyline points="7 23 3 19 7 15"/>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                    </svg>`,
                    children: moveChildren  // ✨ 使用子菜单
                },
                {
                    label: chrome.i18n.getMessage('vkpxzm'),
                    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>`,
                    onClick: () => this.handleEditStarred(item.turnId, item.theme)
                },
                {
                    label: chrome.i18n.getMessage('mvkxpz'),
                    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>`,
                    onClick: () => this.handleCopy(item.theme)
                },
                { type: 'divider' },
                {
                    label: chrome.i18n.getMessage('bpxjkw'),
                    icon: `<svg viewBox="0 0 24 24" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="0.5">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>`,
                    className: 'danger',
                    onClick: () => this.handleUnstar(item.turnId, item.url)
                }
            ];
            
            window.globalDropdownManager.show({
                trigger: moreBtn,
                items: items,
                position: 'bottom-right',
                width: 160
            });
        });
        
        actions.appendChild(moreBtn);
        itemElement.appendChild(actions);
        
        return itemElement;
    }
    
    /**
     * 创建操作按钮
     */
    createActionButton(type, title, onClick) {
        const button = document.createElement('button');
        button.className = `timeline-starred-item-${type}`;
        
        // 添加 tooltip（使用 GlobalTooltipManager）
        button.addEventListener('mouseenter', () => {
            window.globalTooltipManager.show(
                `starred-item-${type}-btn`,
                'button',
                button,
                title,
                { placement: 'top' }
            );
        });
        button.addEventListener('mouseleave', () => {
            window.globalTooltipManager.hide();
        });
        
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        
        // 添加 SVG 图标
        let svgHTML = '';
        switch (type) {
            case 'move':
                // 转移图标（双向箭头）
                svgHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="17 1 21 5 17 9"/>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                    <polyline points="7 23 3 19 7 15"/>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>`;
                break;
            case 'edit':
                // 编辑图标（铅笔）
                svgHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>`;
                break;
            case 'copy':
                // 复制内容图标（双文档）
                svgHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>`;
                break;
            case 'link':
                // 复制链接图标（链接符号）
                svgHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>`;
                break;
            case 'star':
                // 取消收藏图标（实心五角星）
                svgHTML = `<svg viewBox="0 0 24 24" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="0.5">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>`;
                break;
        }
        
        if (svgHTML) {
            button.innerHTML = svgHTML;
        }
        
        return button;
    }
    
    /**
     * 检查收藏项是否匹配搜索
     * @param {Object} item - 收藏项
     * @param {string} query - 搜索关键词（已转小写）
     * @returns {boolean}
     */
    matchesSearch(item, query) {
        if (!query) return true;
        
        // 只搜索标题
        if (item.theme && item.theme.toLowerCase().includes(query)) {
            return true;
        }
        
        return false;
    }
    
    /**
     * 切换文件夹展开/折叠
     * ✨ 使用 BaseTab 的持久状态管理
     */
    toggleFolder(folderId) {
        // ✨ 使用 BaseTab 的持久状态
        const folderStates = this.getPersistentState('folderStates');
        const isExpanded = folderStates[folderId] === true;
        folderStates[folderId] = !isExpanded;
        this.setPersistentState('folderStates', folderStates);
        
        const listContainer = this.getDomRef('listContainer');
        if (!listContainer) return;
        
        const folderElement = listContainer.querySelector(`[data-folder-id="${folderId}"]`);
        if (folderElement) {
            const toggle = folderElement.querySelector('.ait-folder-toggle');
            const content = folderElement.querySelector('.ait-folder-content');
            const folderIcon = folderElement.querySelector('.ait-folder-icon');
            
            if (toggle && content) {
                const isExpanded = folderStates[folderId];
                
                if (isExpanded) {
                    toggle.classList.add('expanded');
                    content.classList.add('expanded');
                } else {
                    toggle.classList.remove('expanded');
                    content.classList.remove('expanded');
                }
                
                if (folderIcon && !folderIcon.textContent.trim()) {
                    folderIcon.innerHTML = isExpanded ? this._folderSvgOpen : this._folderSvgClosed;
                }
            }
        }
    }
    
    /**
     * 处理创建文件夹
     */
    async handleCreateFolder(parentId = null) {
        try {
            if (!window.folderEditModal) return;

            const parentPath = parentId ? await this.folderManager.getFolderPath(parentId) : '';
            const title = parentId 
                ? chrome.i18n.getMessage('xmkvpz').replace('{folderName}', parentPath)
                : chrome.i18n.getMessage('kxvpmz');

            const result = await window.folderEditModal.show({
                mode: 'create',
                title: title,
                placeholder: chrome.i18n.getMessage('vzkpmx'),
                requiredMessage: chrome.i18n.getMessage('kmxpvz'),
                maxLength: 10
            });

            if (!result) return;

            const exists = await this.folderManager.isFolderNameExists(result.name, parentId);
            if (exists) {
                window.globalToastManager.error(chrome.i18n.getMessage('kpvzmx'), null, { color: this.toastColor });
                return;
            }

            await this.folderManager.createFolder(result.name, parentId, result.icon);
            window.globalToastManager.success(chrome.i18n.getMessage('xzvkpm'), null, { color: this.toastColor });
            await this.updateList();
        } catch (error) {
            console.error('[StarredTab] Create folder failed:', error);
            if (error.message) {
                window.globalToastManager.error(error.message);
            }
        }
    }
    
    /**
     * 处理编辑文件夹
     */
    async handleEditFolder(folderId, currentName) {
        try {
            if (!window.folderEditModal) return;

            const folders = await this.folderManager.getFolders();
            const folder = folders.find(f => f.id === folderId);
            if (!folder) return;

            const parentId = folder.parentId || null;

            const result = await window.folderEditModal.show({
                mode: 'edit',
                title: chrome.i18n.getMessage('pxmzvk'),
                name: currentName,
                icon: folder.icon || '',
                placeholder: chrome.i18n.getMessage('mvzxkp'),
                maxLength: 10
            });

            if (!result) return;

            const nameChanged = result.name !== currentName;
            const iconChanged = result.icon !== (folder.icon || '');

            if (!nameChanged && !iconChanged) return;

            if (nameChanged) {
                const exists = await this.folderManager.isFolderNameExists(result.name, parentId, folderId);
                if (exists) {
                    window.globalToastManager.error(chrome.i18n.getMessage('kpvzmx'), null, { color: this.toastColor });
                    return;
                }
            }

            await this.folderManager.updateFolder(folderId, result.name, result.icon);
            window.globalToastManager.success(chrome.i18n.getMessage('folderUpdated'), null, { color: this.toastColor });
            await this.updateList();
        } catch (error) {
            console.error('[StarredTab] Edit folder failed:', error);
        }
    }
    
    /**
     * 处理删除文件夹
     */
    async handleDeleteFolder(folderId) {
        try {
            // 获取文件夹信息
            const tree = await this.folderManager.getStarredByFolder();
            let folderData = tree.folders.find(f => f.id === folderId);
            
            if (!folderData) {
                // 可能是子文件夹
                for (const parent of tree.folders) {
                    if (parent.children) {
                        folderData = parent.children.find(c => c.id === folderId);
                        if (folderData) break;
                    }
                }
            }
            
            if (!folderData) {
                window.globalToastManager.error(chrome.i18n.getMessage('zpxmkv'), null, { color: this.toastColor });
                return;
            }
            
            // 递归统计文件夹及其所有子孙文件夹的收藏项总数
            const totalItems = this._countAllItems(folderData);
            
            // 根据是否有收藏项，显示不同的确认消息
            let message;
            if (totalItems > 0) {
                // 有收藏项：显示详细提示（包含数量）
                message = chrome.i18n.getMessage('wjxnkp')
                    .replace('{folderName}', folderData.name)
                    .replace('{count}', totalItems);
            } else {
                // 空文件夹：显示简单提示
                message = chrome.i18n.getMessage('qzmvkx').replace('{folderName}', folderData.name);
            }
            
            const confirmed = confirm(message);
            if (!confirmed) return;
            
            await this.folderManager.deleteFolder(folderId, null);
            window.globalToastManager.success(chrome.i18n.getMessage('kvpzmx'), null, { color: this.toastColor });
            await this.updateList();
        } catch (error) {
            console.error('[StarredTab] Delete folder failed:', error);
            window.globalToastManager.error(chrome.i18n.getMessage('mxkvzp'), null, { color: this.toastColor });
        }
    }
    
    /**
     * 构建"移动到"子菜单
     * @param {string} turnId - 收藏项 ID
     * @returns {Array} 子菜单数组
     */
    async _buildMoveToSubmenu(turnId) {
        console.log('[StarredTab] Building move submenu for:', turnId);
        const folders = await this.folderManager.getFolders();
        console.log('[StarredTab] Folders count:', folders.length);
        const children = [];
        
        // 添加"默认文件夹"选项
        children.push({
            label: chrome.i18n.getMessage('pkxvmz'),
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>`,
            onClick: () => this.handleMoveToFolder(turnId, null)
        });
        
        if (folders.length > 0) {
            children.push({ type: 'divider' });
        }
        
        // 添加文件夹选项（包括根文件夹和子文件夹）
        // 按层级排序：先根文件夹，再子文件夹
        const rootFolders = folders.filter(f => !f.parentId).sort((a, b) => a.order - b.order);
        
        rootFolders.forEach(rootFolder => {
            // 检查该根文件夹是否有子文件夹
            const childFolders = folders
                .filter(f => f.parentId === rootFolder.id)
                .sort((a, b) => a.order - b.order);
            
            const folderItem = {
                label: rootFolder.name,
                icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>`,
                onClick: () => this.handleMoveToFolder(turnId, rootFolder.id)
            };
            
            // ✨ 如果有子文件夹，添加 children 属性（三级菜单）
            if (childFolders.length > 0) {
                folderItem.children = childFolders.map(childFolder => ({
                    label: childFolder.name,
                    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>`,
                    onClick: () => this.handleMoveToFolder(turnId, childFolder.id)
                }));
            }
            
            children.push(folderItem);
        });
        
        console.log('[StarredTab] Built submenu children:', children.length, children);
        return children;
    }
    
    /**
     * 处理移动收藏项到指定文件夹
     * @param {string} turnId - 收藏项 ID
     * @param {string|null} targetFolderId - 目标文件夹 ID（null = 未分类）
     */
    async handleMoveToFolder(turnId, targetFolderId) {
        try {
            await this.folderManager.moveStarredToFolder(turnId, targetFolderId);
            window.globalToastManager.success(chrome.i18n.getMessage('pzvkmx'), null, { color: this.toastColor });
            await this.updateList();
        } catch (error) {
            console.error('[StarredTab] Move starred failed:', error);
        }
    }
    
    /**
     * 处理编辑收藏项
     */
    async handleEditStarred(turnId, currentTheme) {
        try {
            const newTheme = await window.globalInputModal.show({
                title: chrome.i18n.getMessage('vkpxzm'),
                defaultValue: currentTheme,
                placeholder: chrome.i18n.getMessage('zmxvkp'),
                required: true,
                requiredMessage: chrome.i18n.getMessage('mzpxvk')
            });
            
            if (!newTheme || !newTheme.trim()) {
                return;
            }
            
            // turnId 格式：url:index
            const key = `chatTimelineStar:${turnId}`;
            const item = await StarStorageManager.findByKey(key);
            
            if (item) {
                // 更新 question 字段（原有字段名）
                await StarStorageManager.update(key, { question: newTheme.trim() });
                
                window.globalToastManager.success(chrome.i18n.getMessage('vmkxpz'), null, { color: this.toastColor });
                
                // 手动刷新列表（确保立即更新）
                await this.updateList();
            }
        } catch (error) {
            console.error('[StarredTab] Edit starred failed:', error);
        }
    }
    
    /**
     * 处理复制（内容或链接）
     */
    async handleCopy(text) {
        try {
            await navigator.clipboard.writeText(text);
            window.globalToastManager.success(chrome.i18n.getMessage('xpzmvk'), null, { color: this.toastColor });
        } catch (err) {
            // Fallback: 使用传统方法
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            
            try {
                document.execCommand('copy');
                window.globalToastManager.success(chrome.i18n.getMessage('xpzmvk'), null, { color: this.toastColor });
            } catch (e) {
                console.error('[StarredTab] Copy failed:', e);
                window.globalToastManager.error(chrome.i18n.getMessage('kpzmvx'), null, { color: this.toastColor });
            } finally {
                document.body.removeChild(textarea);
            }
        }
    }
    
    /**
     * 处理取消收藏
     */
    async handleUnstar(turnId, url) {
        try {
            // turnId 格式：urlWithoutProtocol:nodeKey（由 extractItemInfo 从 Storage Key 解析）
            const key = `chatTimelineStar:${turnId}`;
            await StarStorageManager.remove(key);
            
            // 显示成功提示
            window.globalToastManager.success(chrome.i18n.getMessage('pzmvkx'), null, { color: this.toastColor });
            
            // 手动刷新列表（确保立即更新，不依赖 storage listener）
            await this.updateList();
        } catch (error) {
            console.error('[StarredTab] Unstar failed:', error);
        }
    }
    
    /**
     * 递归统计文件夹及其所有子孙文件夹的收藏项总数
     * @param {Object} folder - 文件夹数据
     * @returns {number} 收藏项总数
     */
    _countAllItems(folder) {
        let count = folder.items.length;
        if (folder.children && folder.children.length > 0) {
            for (const child of folder.children) {
                count += this._countAllItems(child);  // 递归统计
            }
        }
        return count;
    }
    
    /**
     * 判断 URL 是否与当前页面是同一个网站
     * @param {string} url - 要检查的 URL
     * @returns {boolean}
     */
    isSameSite(url) {
        try {
            const urlObj = new URL(url);
            const currentHostname = location.hostname;
            const targetHostname = urlObj.hostname;
            
            // 完全匹配
            if (currentHostname === targetHostname) {
                return true;
            }
            
            // 处理子域名情况（如 chatgpt.com 和 chat.openai.com 都算同网站）
            // 提取主域名（去掉子域名）
            const getMainDomain = (hostname) => {
                const parts = hostname.split('.');
                if (parts.length >= 2) {
                    return parts.slice(-2).join('.');
                }
                return hostname;
            };
            
            const currentMainDomain = getMainDomain(currentHostname);
            const targetMainDomain = getMainDomain(targetHostname);
            
            return currentMainDomain === targetMainDomain;
        } catch (e) {
            return false;
        }
    }
    
    /**
     * 获取网站信息
     * 使用共享的 constants.js 中的函数
     */
    getSiteInfo(url) {
        return getSiteInfoByUrl(url);
    }
    
    /**
     * HTML转义
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
