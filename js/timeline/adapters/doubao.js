/**
 * Doubao (豆包) Adapter
 * 
 * Supports: doubao.com
 * Features: Uses data-message-id + justify-end for user messages, data-plugin-identifier for text extraction
 */

class DoubaoAdapter extends SiteAdapter {
    constructor() {
        super();
    }

    matches(url) {
        return matchesPlatform(url, 'doubao');
    }

    getUserMessageSelector() {
        return '[data-message-id].justify-end';
    }

    /**
     * 从 DOM 元素中提取 nodeId
     * 豆包的 nodeId 来自子元素的 data-message-id 属性
     * 
     * ✅ 降级方案：返回 null 时，generateTurnId 会降级使用 index（数字类型）
     * @param {Element} element - 用户消息元素
     * @returns {string|null} - nodeId（字符串），失败返回 null
     */
    _extractNodeIdFromDom(element) {
        if (!element) return null;
        
        const nodeId = element.getAttribute('data-message-id')
            || element.querySelector('[data-message-id]')?.getAttribute('data-message-id')
            || null;
        return nodeId ? String(nodeId) : null;
    }
    
    /**
     * 生成节点的唯一标识 turnId
     * 优先使用 data-message-id（稳定），回退到数组索引（兼容）
     */
    generateTurnId(element, index) {
        // 优先使用 data-message-id（稳定标识），回退到数组索引
        const nodeId = this._extractNodeIdFromDom(element);
        return nodeId ? `doubao-${nodeId}` : `doubao-${index}`;
    }
    
    /**
     * 从存储的 nodeId 生成 turnId（用于收藏跳转）
     * @param {string|number} identifier - nodeId（字符串）或 index（数字）
     * @returns {string}
     */
    generateTurnIdFromIndex(identifier) {
        return `doubao-${identifier}`;
    }
    
    /**
     * 从 turnId 中提取 nodeId/index
     * @param {string} turnId - 格式为 doubao-{nodeId} 或 doubao-{index}
     * @returns {string|number|null} - nodeId（字符串）或 index（数字）
     */
    extractIndexFromTurnId(turnId) {
        if (!turnId) return null;
        if (turnId.startsWith('doubao-')) {
            const part = turnId.substring(7); // 'doubao-'.length = 7
            // ✅ 尝试解析为数字（降级到 index 时的数据）
            const parsed = parseInt(part, 10);
            // 如果是纯数字字符串，返回数字；否则返回字符串
            return (String(parsed) === part) ? parsed : part;
        }
        return null;
    }
    
    /**
     * 根据存储的 nodeId/index 查找 marker
     * 支持新数据（nodeId 字符串）和旧数据（index 数字）
     * @param {string|number} storedKey - 存储的 nodeId 或 index
     * @param {Array} markers - marker 数组
     * @param {Map} markerMap - markerMap
     * @returns {Object|null} - 匹配的 marker
     */
    findMarkerByStoredIndex(storedKey, markers, markerMap) {
        if (storedKey === null || storedKey === undefined) return null;
        
        // 1. 先尝试用 nodeId/index 构建 turnId 查找
        const turnId = `doubao-${storedKey}`;
        const marker = markerMap.get(turnId);
        if (marker) return marker;
        
        // 2. Fallback：如果是数字，尝试用数组索引（兼容旧数据）
        if (typeof storedKey === 'number' && storedKey >= 0 && storedKey < markers.length) {
            return markers[storedKey];
        }
        
        return null;
    }

    extractText(element) {
        const textEl = element.querySelector('[data-plugin-identifier]') || element;
        const text = (textEl?.textContent || '').trim();
        return text || '[图片或文件]';
    }
    
    getTextContainer(element) {
        return element.querySelector('[data-plugin-identifier]') || element;
    }

    isConversationRoute(pathname) {
        // Doubao conversation URLs: /chat/数字ID
        return pathname.includes('/chat/');
    }

    extractConversationId(pathname) {
        try {
            // Extract conversation ID from /chat/数字 pattern
            const match = pathname.match(/\/chat\/(\d+)/);
            return match ? match[1] : null;
        } catch {
            return null;
        }
    }

    findConversationContainer(firstMessage) {
        /**
         * 查找对话容器
         * 
         * 使用 LCA（最近共同祖先）算法查找所有对话记录的最近父容器。
         * 传递 messageSelector 参数，让 ContainerFinder 能够：
         * 1. 查询所有用户消息元素
         * 2. 找到它们的最近共同祖先
         * 3. 确保容器是直接包裹所有对话的最小容器
         * 
         * 优势：比传统的向上遍历更精确，避免找到过于外层的容器
         */
        return ContainerFinder.findConversationContainer(firstMessage, {
            messageSelector: this.getUserMessageSelector()
        });
    }
    
    /**
     * ✅ 豆包使用反向滚动布局（scrollTop=0在底部，负数向上）
     * 其他平台如果也有反向滚动，可以在适配器中添加此方法返回 true
     * @returns {boolean}
     */
    isReverseScroll() {
        return true;
    }

    getTimelinePosition() {
        // Doubao 位置配置（可根据实际情况调整）
        return {
            top: '120px',      // 避开顶部导航栏
            right: '22px',    // 右侧边距
            bottom: '120px',   // 避开底部输入框
        };
    }
    
    /**
     * 检测 AI 是否正在生成回复
     * 豆包: 当存在 class 包含 "break-btn-" 的元素时，表示正在生成
     * @returns {boolean}
     */
    isAIGenerating() {
        const breakBtn = document.querySelector('[class*="break-btn-"]');
        return !!breakBtn && !breakBtn.classList.contains('!hidden');
    }
    
    /**
     * 获取时间标签位置配置
     */
    getTimeLabelPosition() {
        // 相对于消息元素定位
        return {
            top: '-18px',
            right: '5px'
        };
    }
    
    getStarChatButtonTarget() {
        return document.querySelector('button[data-trigger-type="hover"]');
    }
    
    getDefaultChatTheme() {
        // 豆包使用页面标题作为默认主题，并过滤尾部的 " - 豆包"
        const title = document.title || '';
        return title.replace(/\s*-\s*豆包\s*$/i, '').trim();
    }
    
}

