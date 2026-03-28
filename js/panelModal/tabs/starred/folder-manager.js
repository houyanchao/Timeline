/**
 * Folder Manager - 文件夹管理器
 * 
 * 功能：
 * - 支持最多2级文件夹（根文件夹 + 子文件夹）
 * - 创建、编辑、删除文件夹
 * - 移动收藏项到文件夹
 * - 按文件夹分组展示
 */

class FolderManager {
    constructor(storageAdapter) {
        this.storage = storageAdapter;
    }
    
    /**
     * 获取所有文件夹
     * @returns {Promise<Array>}
     */
    async getFolders() {
        const data = await this.storage.get('folders');
        return data || [];
    }
    
    /**
     * 创建文件夹
     * @param {string} name - 文件夹名称
     * @param {string|null} parentId - 父文件夹 ID（null = 根文件夹）
     * @param {string} icon - emoji 图标
     * @returns {Promise<Object>} 新创建的文件夹
     */
    async createFolder(name, parentId = null, icon = '') {
        // 检查嵌套层级（最多2级）
        if (parentId) {
            const folders = await this.getFolders();
            const parent = folders.find(f => f.id === parentId);
            
            if (parent && parent.parentId !== null) {
                throw new Error('最多支持2级文件夹');
            }
        }
        
        const folders = await this.getFolders();
        
        // 计算当前层级的 order
        const siblings = folders.filter(f => f.parentId === parentId);
        
        const newFolder = {
            id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            icon,
            parentId,
            createdAt: Date.now(),
            order: siblings.length
        };
        
        folders.push(newFolder);
        await this.storage.set('folders', folders);
        
        console.log('[FolderManager] Created folder:', newFolder);
        return newFolder;
    }
    
    /**
     * 编辑文件夹
     * @param {string} folderId - 文件夹 ID
     * @param {string} newName - 新名称
     * @param {string} [newIcon] - 新 emoji 图标（可选）
     */
    async updateFolder(folderId, newName, newIcon) {
        const folders = await this.getFolders();
        const folder = folders.find(f => f.id === folderId);
        
        if (!folder) {
            throw new Error('文件夹不存在');
        }
        
        folder.name = newName;
        if (newIcon !== undefined) folder.icon = newIcon;
        await this.storage.set('folders', folders);
        
        console.log('[FolderManager] Updated folder:', folderId, newName, newIcon);
    }
    
    /**
     * 删除文件夹
     * @param {string} folderId - 要删除的文件夹 ID
     * @param {Object} [options]
     * @param {boolean} [options.deleteItems=true] - true: 连同收藏项一起删除; false: 移到未分类
     */
    async deleteFolder(folderId, options = {}) {
        const { deleteItems = true } = options;
        const folders = await this.getFolders();
        const folderToDelete = folders.find(f => f.id === folderId);
        
        if (!folderToDelete) {
            throw new Error('文件夹不存在');
        }
        
        const childFolderIds = folders
            .filter(f => f.parentId === folderId)
            .map(f => f.id);
        
        const newFolders = folders.filter(f => 
            f.id !== folderId && !childFolderIds.includes(f.id)
        );
        await this.storage.set('folders', newFolders);
        
        const allDeletedFolderIds = [folderId, ...childFolderIds];
        
        await StarStorageManager.batchUpdate(items => {
            if (deleteItems) {
                return items.filter(item => !allDeletedFolderIds.includes(item.folderId));
            }
            return items.map(item => {
                if (allDeletedFolderIds.includes(item.folderId)) {
                    return { ...item, folderId: null };
                }
                return item;
            });
        });
        
        console.log('[FolderManager] Deleted folder:', folderId, 'and', childFolderIds.length, 'children', deleteItems ? '(items deleted)' : '(items moved)');
    }
    
    /**
     * 移动收藏项到文件夹
     * @param {string} turnId - 收藏项 ID（格式：url:index）
     * @param {string|null} targetFolderId - 目标文件夹 ID（null = 未分类）
     */
    async moveStarredToFolder(turnId, targetFolderId) {
        // 构建原始的 storage key: chatTimelineStar:url:index
        const key = `chatTimelineStar:${turnId}`;
        const item = await StarStorageManager.findByKey(key);
        
        if (!item) {
            throw new Error('收藏项不存在');
        }
        
        // 更新 folderId 字段
        await StarStorageManager.update(key, { folderId: targetFolderId });
        
        console.log('[FolderManager] Moved starred:', turnId, 'to folder:', targetFolderId);
    }
    
    /**
     * 按文件夹分组收藏项（树状结构）
     * @returns {Promise<Object>} 分组后的数据
     */
    async getStarredByFolder() {
        const folders = await this.getFolders();
        
        // 使用 StarStorageManager 获取所有收藏项
        const starredItemsArray = await StarStorageManager.getAll();
        
        // ✅ 辅助函数：从 item 中提取信息
        // ⚠️ 重要：turnId 必须从 item.key 中解析，确保 handleUnstar 时能正确删除
        const extractItemInfo = (item) => {
            const key = item.key || '';
            // key 格式：chatTimelineStar:{urlWithoutProtocol}:{nodeKey}
            const keyWithoutPrefix = key.replace('chatTimelineStar:', '');
            const lastColonIndex = keyWithoutPrefix.lastIndexOf(':');
            
            let urlWithoutProtocol, nodeKeyStr;
            if (lastColonIndex === -1) {
                // 异常情况：没有冒号分隔
                urlWithoutProtocol = keyWithoutPrefix;
                nodeKeyStr = '';
            } else {
                urlWithoutProtocol = keyWithoutPrefix.substring(0, lastColonIndex);
                nodeKeyStr = keyWithoutPrefix.substring(lastColonIndex + 1);
            }
            
            // 优先使用 item 中的 nodeId/index
            const nodeKey = item.nodeId !== undefined ? item.nodeId : item.index;
            
            // ⚠️ turnId 必须用 nodeKeyStr（原始字符串），确保和 Storage Key 完全一致
            const turnId = `${urlWithoutProtocol}:${nodeKeyStr}`;
            return { urlWithoutProtocol, nodeKey, turnId };
        };
        
        const mapItem = (item, info) => ({
            turnId: info.turnId,
            url: item.url || `https://${info.urlWithoutProtocol}`,
            urlWithoutProtocol: info.urlWithoutProtocol,
            index: info.nodeKey, nodeId: info.nodeKey,
            theme: item.question || '整个对话',
            timestamp: item.timestamp || 0,
            folderId: item.folderId,
            pinned: !!item.pinned
        });

        const sortItems = (arr) => arr.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return 0;
        });

        // 构建树状结构
        const tree = {
            folders: [],      // 根文件夹列表
            uncategorized: [] // 未分类收藏项（默认文件夹）
        };
        
        // 创建文件夹 ID 集合，用于快速查找
        const folderIds = new Set(folders.map(f => f.id));
        const assignedTurnIds = new Set(); // 记录已分配的收藏项
        
        
        // 1. 先构建根文件夹（置顶的在前）
        const rootFolders = folders.filter(f => f.parentId === null);
        rootFolders.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return a.order - b.order;
        });
        
        // 2. 为每个根文件夹添加子文件夹和收藏项
        for (const rootFolder of rootFolders) {
            const folderNode = {
                ...rootFolder,
                children: [], // 子文件夹
                items: []     // 当前文件夹的收藏项
            };
            
            // 找出子文件夹
            const childFolders = folders.filter(f => f.parentId === rootFolder.id);
            childFolders.sort((a, b) => a.order - b.order);
            
            for (const childFolder of childFolders) {
                const childNode = {
                    ...childFolder,
                    items: [] // 子文件夹的收藏项
                };
                
                for (const item of starredItemsArray) {
                    if (item.folderId !== childFolder.id) continue;
                    const info = extractItemInfo(item);
                    childNode.items.push(mapItem(item, info));
                    assignedTurnIds.add(info.turnId);
                }
                sortItems(childNode.items);
                
                folderNode.children.push(childNode);
            }
            
            for (const item of starredItemsArray) {
                if (item.folderId !== rootFolder.id) continue;
                const info = extractItemInfo(item);
                folderNode.items.push(mapItem(item, info));
                assignedTurnIds.add(info.turnId);
            }
            sortItems(folderNode.items);
            
            tree.folders.push(folderNode);
        }
        
        // 3. 添加未分类收藏项（没有 folderId 或 folderId 指向已删除文件夹的收藏项）
        
        for (const item of starredItemsArray) {
            const { urlWithoutProtocol, nodeKey, turnId } = extractItemInfo(item);
            
            // 如果该收藏项还没有被分配到任何文件夹，则归为未分类（默认文件夹）
            // 这包括：folderId 为 null/undefined 或 folderId 指向已删除的文件夹
            if (!assignedTurnIds.has(turnId)) {
                tree.uncategorized.push(mapItem(item, { urlWithoutProtocol, nodeKey, turnId }));
            }
        }
        
        sortItems(tree.uncategorized);
        
        
        return tree;
    }
    
    /**
     * 获取文件夹路径（用于显示）
     * @param {string} folderId - 文件夹 ID
     * @returns {Promise<string>} 文件夹路径，如 "工作/重要项目"
     */
    async getFolderPath(folderId) {
        if (!folderId) return '';
        
        const folders = await this.getFolders();
        const folder = folders.find(f => f.id === folderId);
        
        if (!folder) return '';
        
        if (folder.parentId) {
            const parent = folders.find(f => f.id === folder.parentId);
            return parent ? `${parent.name} / ${folder.name}` : folder.name;
        }
        
        return folder.name;
    }
    
    /**
     * 检查文件夹名称是否已存在（同级）
     * @param {string} name - 文件夹名称
     * @param {string|null} parentId - 父文件夹 ID
     * @param {string|null} excludeId - 排除的文件夹 ID（用于编辑时）
     * @returns {Promise<boolean>}
     */
    async isFolderNameExists(name, parentId = null, excludeId = null) {
        const folders = await this.getFolders();
        const siblings = folders.filter(f => 
            f.parentId === parentId && 
            f.id !== excludeId
        );
        
        return siblings.some(f => f.name === name);
    }

    /**
     * 在文件夹内重新排列收藏项位置（基于 storage 数组顺序）
     * @param {string} turnId - 被拖拽项的 turnId
     * @param {string|null} targetFolderId - 目标文件夹 ID
     * @param {string|null} refTurnId - 参考项的 turnId（null = 放到末尾）
     * @param {'before'|'after'} position - 放在参考项前面还是后面
     */
    async reorderStarredInFolder(turnId, targetFolderId, refTurnId, position) {
        const srcKey = `chatTimelineStar:${turnId}`;
        await StarStorageManager.batchUpdate(items => {
            const srcIdx = items.findIndex(i => i.key === srcKey);
            if (srcIdx === -1) return items;

            const [item] = items.splice(srcIdx, 1);
            item.folderId = targetFolderId;

            if (!refTurnId) {
                items.push(item);
                return items;
            }

            const refKey = `chatTimelineStar:${refTurnId}`;
            const refIdx = items.findIndex(i => i.key === refKey);
            if (refIdx === -1) { items.push(item); return items; }

            const insertIdx = position === 'before' ? refIdx : refIdx + 1;
            items.splice(insertIdx, 0, item);
            return items;
        });
    }

    /**
     * 移动文件夹到目标位置（同级排序）
     * @param {string} folderId - 要移动的文件夹 ID
     * @param {string} targetFolderId - 目标文件夹 ID
     * @param {'before'|'after'} position - 插入到目标的前面还是后面
     */
    async moveFolderToPosition(folderId, targetFolderId, position) {
        const folders = await this.getFolders();
        const folder = folders.find(f => f.id === folderId);
        const target = folders.find(f => f.id === targetFolderId);
        if (!folder || !target) return;
        if ((folder.parentId || null) !== (target.parentId || null)) return;

        const parentId = folder.parentId || null;
        const siblings = folders.filter(f => (f.parentId || null) === parentId);
        siblings.sort((a, b) => (a.order || 0) - (b.order || 0));

        const fromIdx = siblings.findIndex(f => f.id === folderId);
        if (fromIdx === -1) return;
        siblings.splice(fromIdx, 1);

        const toIdx = siblings.findIndex(f => f.id === targetFolderId);
        if (toIdx === -1) return;
        const insertIdx = position === 'before' ? toIdx : toIdx + 1;
        siblings.splice(insertIdx, 0, folder);

        for (let i = 0; i < siblings.length; i++) {
            const original = folders.find(f => f.id === siblings[i].id);
            if (original) original.order = i;
        }

        await this.storage.set('folders', folders);
        console.log('[FolderManager] Reordered folder:', folderId, position, targetFolderId);
    }

    /**
     * 移动文件夹到新的父级（跨级拖拽）
     * @param {string} folderId - 要移动的文件夹 ID
     * @param {string|null} newParentId - 新父文件夹 ID（null = 移到根级别）
     * @returns {Promise<{ok:boolean, error?:string}>}
     */
    async moveFolderToParent(folderId, newParentId) {
        const folders = await this.getFolders();
        const folder = folders.find(f => f.id === folderId);
        if (!folder) return { ok: false, error: 'Folder not found' };

        if ((folder.parentId || null) === (newParentId || null)) return { ok: true };

        if (newParentId === folderId) return { ok: false, error: 'Cannot move into itself' };

        if (newParentId) {
            const hasChildren = folders.some(f => f.parentId === folderId);
            if (hasChildren) {
                return { ok: false, error: 'hasChildren' };
            }
            const parent = folders.find(f => f.id === newParentId);
            if (!parent) return { ok: false, error: 'Target not found' };
            if (parent.parentId) {
                return { ok: false, error: 'maxDepth' };
            }
        }

        const oldParentId = folder.parentId || null;
        folder.parentId = newParentId || null;

        const newSiblings = folders.filter(f => (f.parentId || null) === (newParentId || null) && f.id !== folderId);
        folder.order = newSiblings.length;

        const oldSiblings = folders.filter(f => (f.parentId || null) === oldParentId && f.id !== folderId);
        oldSiblings.sort((a, b) => (a.order || 0) - (b.order || 0));
        oldSiblings.forEach((f, i) => { f.order = i; });

        await this.storage.set('folders', folders);
        console.log('[FolderManager] Moved folder to parent:', folderId, '->', newParentId);
        return { ok: true };
    }

    async togglePinFolder(folderId) {
        const folders = await this.getFolders();
        const folder = folders.find(f => f.id === folderId);
        if (!folder) return;
        folder.pinned = !folder.pinned;
        await this.storage.set('folders', folders);
    }

    async togglePinStarred(turnId) {
        const key = `chatTimelineStar:${turnId}`;
        const item = await StarStorageManager.findByKey(key);
        if (!item) return;
        await StarStorageManager.update(key, { pinned: !item.pinned });
    }
}

