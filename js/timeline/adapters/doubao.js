/**
 * Doubao (豆包) Adapter
 *
 * Supports: doubao.com
 * Features: Uses data-testid for selection, index-based ID, extracts from message_text_content
 */

class DoubaoAdapter extends SiteAdapter {
    constructor() {
        super();
    }

    matches(url) {
        return matchesPlatform(url, "doubao");
    }

    getUserMessageSelector() {
        // Doubao changed its DOM structure.
        // We try multiple known selectors, and add a generic fallback.
        // 豆包最新UI可能会使用一些动态 class，但通常会有特定结构的包裹
        return '[data-testid="chat_message_user"], [data-testid="user_message"], [data-testid="send_message"], .chat-message-user, [class*="user-message"], [data-message-id], [class*="message-item"]';
    }

    filterUserMessages(elements) {
        // 如果使用了泛型选择器（如 [data-message-id]），则可能包含 AI 消息
        // 我们需要通过一些启发式规则过滤出真正的“用户消息”

        // 启发式1：交替出现的通常是 用户 -> AI -> 用户 -> AI
        // 启发式2：AI 消息通常包含特定的操作按钮（如“重新生成”、“复制”、“踩/赞”），而用户消息通常只有“编辑”或较少操作
        // 启发式3：AI 消息通常包含 markdown 结构，如 p, pre, code 等，而用户消息相对简单

        if (elements.length === 0) return elements;

        // 如果我们找到的元素很少，且明确有 user 相关的属性，可能不需要过滤
        const firstEl = elements[0];
        if (firstEl.getAttribute("data-testid")?.includes("user") || firstEl.className.includes("user")) {
            return elements;
        }

        // 尝试通过奇偶性（第一条总是用户消息）
        // 但为了安全，我们检查元素内部是否有典型的 AI 特征（如 svg 图标过多，或者特定的 bot class）
        const userMessages = [];

        for (let i = 0; i < elements.length; i++) {
            const el = elements[i];

            // 如果元素本身或其内部有明显的 bot/ai 标识，跳过
            const html = el.innerHTML.toLowerCase();
            if (html.includes('data-testid="bot_message"') || html.includes('data-testid="chat_message_bot"')) {
                continue;
            }

            // 启发式：用户消息通常排在前面，且如果我们获取到了所有 message-id
            // 假设他们是成对出现的（Doubao的特点）
            // 在没有明确标识的情况下，我们只能假设奇数索引（0, 2, 4）是用户，偶数索引是 AI
            // 更好的方法是检查元素内部是否有重新生成/点赞按钮等专属 AI 的功能
            const hasCopyBtn = html.includes("copy") || html.includes("复制");
            const hasRegenerateBtn = html.includes("regenerate") || html.includes("重新生成");
            const hasDislikeBtn = html.includes("dislike") || html.includes("踩");

            // 如果包含很明显的 AI 独有按钮，则认为是 AI 消息
            if (hasRegenerateBtn || hasDislikeBtn || html.includes("markdown-body")) {
                continue;
            }

            // 否则认为是用户消息
            userMessages.push(el);
        }

        return userMessages.length > 0 ? userMessages : elements;
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

        const messageEl = element.querySelector("[data-message-id]");
        const nodeId = messageEl?.getAttribute("data-message-id") || null;
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
        if (turnId.startsWith("doubao-")) {
            const part = turnId.substring(7); // 'doubao-'.length = 7
            // ✅ 尝试解析为数字（降级到 index 时的数据）
            const parsed = parseInt(part, 10);
            // 如果是纯数字字符串，返回数字；否则返回字符串
            return String(parsed) === part ? parsed : part;
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
        if (typeof storedKey === "number" && storedKey >= 0 && storedKey < markers.length) {
            return markers[storedKey];
        }

        return null;
    }

    extractText(element) {
        // Extract from message_text_content element
        let textEl = element.querySelector('[data-testid="message_text_content"]');
        if (!textEl) {
            // Fallbacks for newer UI
            textEl = element.querySelector(".content-wrapper, .message-content, .text-content, p");
        }
        const text = (textEl ? textEl.textContent : element.textContent || "").trim();
        return text || "[图片或文件]";
    }

    getTextContainer(element) {
        return (
            element.querySelector(
                '[data-testid="message_text_content"], .content-wrapper, .message-content, .text-content, p',
            ) || element
        );
    }

    isConversationRoute(pathname) {
        // Doubao conversation URLs: /chat/数字ID
        return pathname.includes("/chat/");
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
            messageSelector: this.getUserMessageSelector(),
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
            top: "120px", // 避开顶部导航栏
            right: "22px", // 右侧边距
            bottom: "120px", // 避开底部输入框
        };
    }

    /**
     * 检测 AI 是否正在生成回复
     * 豆包: 当存在 class 包含 "break-btn-" 的元素时，表示正在生成
     * @returns {boolean}
     */
    isAIGenerating() {
        const breakBtn = document.querySelector('[class*="break-btn-"]');
        return !!breakBtn;
    }

    /**
     * 获取时间标签位置配置
     */
    getTimeLabelPosition() {
        // 相对于消息元素定位
        return {
            top: "-18px",
            right: "5px",
        };
    }

    getStarChatButtonTarget() {
        // 返回分享按钮，收藏按钮将插入到它前面
        return document.querySelector('[data-testid="thread_share_btn_right_side"]');
    }

    getDefaultChatTheme() {
        // 豆包使用页面标题作为默认主题，并过滤尾部的 " - 豆包"
        const title = document.title || "";
        return title.replace(/\s*-\s*豆包\s*$/i, "").trim();
    }
}
