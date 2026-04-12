/**
 * Quick Ask Manager
 * 
 * 引用回复功能
 * 选中文字后显示"引用回复"按钮，点击后将选中文字以引用格式插入输入框
 */

// 位置回退映射：当首选位置空间不够时，切换到对应的备选位置
const POSITION_FALLBACK = {
    topCenter: 'bottomCenter',
    topLeft: 'bottomLeft',
    topRight: 'bottomRight',
    bottomCenter: 'topCenter',
    bottomLeft: 'topLeft',
    bottomRight: 'topRight'
};

class QuickAskManager {
    constructor() {
        this.buttonElement = null;
        this.currentSelection = null;
        this.hideTimer = null;
        this.isEnabled = false;
        this._boundHandlers = null;
        this._position = 'topLeft'; // 默认位置
        this._adapterRegistry = null; // 独立查找对话容器用，延迟初始化
    }
    
    /**
     * 初始化
     */
    init() {
        if (this.isEnabled) return;
        
        this._loadPosition();
        this._createButton();
        this._bindEvents();
        this.isEnabled = true;
        console.log('[QuickAsk] 初始化完成');
    }
    
    /**
     * 启用功能
     */
    enable() {
        if (this.isEnabled) return;
        
        this._loadPosition();
        this._createButton();
        this._bindEvents();
        this.isEnabled = true;
        console.log('[QuickAsk] 已启用');
    }
    
    /**
     * 加载平台配置的按钮位置
     */
    _loadPosition() {
        try {
            if (typeof getCurrentPlatform === 'function') {
                const platform = getCurrentPlatform();
                if (platform?.features?.quickAskPosition) {
                    this._position = platform.features.quickAskPosition;
                }
            }
        } catch (e) {
            // 使用默认位置
        }
    }
    
    /**
     * 禁用功能
     */
    disable() {
        if (!this.isEnabled) return;
        
        this._hideButton();
        this._unbindEvents();
        
        if (this._docMouseUpHandler) {
            document.removeEventListener('mouseup', this._docMouseUpHandler);
            this._docMouseUpHandler = null;
        }
        if (this.buttonElement) {
            this.buttonElement.remove();
            this.buttonElement = null;
        }
        
        this.isEnabled = false;
        console.log('[QuickAsk] 已禁用');
    }
    
    /**
     * 创建浮动按钮
     */
    _createButton() {
        if (this.buttonElement) return;
        
        const btn = document.createElement('div');
        btn.className = 'ait-quick-ask-btn';
        btn.innerHTML = `
            <button class="ait-quick-ask-action">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/>
                    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
                </svg>
                <span>${chrome.i18n.getMessage('quickAsk') || '追问'}</span>
            </button>
        `;
        btn.style.display = 'none';
        
        // ✅ 使用事件委托（解决长时间停留后事件失效问题）
        // 追问按钮：执行引用追问
        window.eventDelegateManager.on('click', '.ait-quick-ask-action', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._handleQuote();
        });
        window.eventDelegateManager.on('mousedown', '.ait-quick-ask-btn', (e) => {
            e.preventDefault();
        });

        // 标注按钮：集成到追问工具栏
        this._highlightInjected = false;
        window.eventDelegateManager.on('click', '.ait-quick-ask-btn .ait-highlight-action', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this._savedRange) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(this._savedRange);
            }
            if (window.AIChatTimelineHighlight?.onHighlightAction) {
                window.AIChatTimelineHighlight.onHighlightAction();
            }
            this._hideButton();
        });
        
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this._btnMouseDown = true;
        });
        btn.addEventListener('mouseup', () => { this._btnMouseDown = false; });
        this._docMouseUpHandler = () => { this._btnMouseDown = false; };
        document.addEventListener('mouseup', this._docMouseUpHandler);
        document.body.appendChild(btn);
        this.buttonElement = btn;
    }

    /**
     * 检查并注入/移除标注按钮到追问工具栏
     */
    _syncHighlightButton() {
        if (!this.buttonElement) return;
        const hlManager = window.highlightManager;
        const hlEnabled = hlManager?.isEnabled && !hlManager?.isSelectionInsideHighlight();
        const existing = this.buttonElement.querySelector('.ait-highlight-action');

        if (hlEnabled && !existing) {
            const hlInfo = window.AIChatTimelineHighlight;
            const icon = hlInfo?.getButtonIcon?.() || '';
            const divider = document.createElement('div');
            divider.className = 'ait-toolbar-divider';
            const hlBtn = document.createElement('button');
            hlBtn.className = 'ait-highlight-action';
            hlBtn.innerHTML = `${icon}<span>${chrome.i18n.getMessage('highlightMark') || '标注'}</span>`;
            this.buttonElement.appendChild(divider);
            this.buttonElement.appendChild(hlBtn);
        } else if (!hlEnabled && existing) {
            const divider = this.buttonElement.querySelector('.ait-toolbar-divider');
            if (divider) divider.remove();
            existing.remove();
        }
    }
    
    /**
     * 绑定事件
     */
    _bindEvents() {
        // 保存事件处理器引用，以便后续移除
        this._boundHandlers = {
            mouseup: (e) => {
                // 如果点击的是按钮，不处理
                if (this.buttonElement?.contains(e.target)) return;
                
                // 延迟检查，确保选区已更新
                setTimeout(() => this._checkSelection(e), 10);
            },
            keyup: (e) => {
                if (e.shiftKey) {
                    setTimeout(() => this._checkSelection(e), 10);
                }
            },
            selectionchange: () => {
                if (this._btnMouseDown) return;
                const selection = window.getSelection();
                const selectedText = selection?.toString().trim();
                
                // 如果选区为空，隐藏按钮
                if (!selectedText || selectedText.length === 0) {
                    this._hideButton();
                }
            },
            scroll: () => this._hideButton()
        };
        
        // 监听鼠标抬起事件
        document.addEventListener('mouseup', this._boundHandlers.mouseup);
        
        // 监听键盘事件（Shift+方向键选择文字）
        document.addEventListener('keyup', this._boundHandlers.keyup);
        
        // 监听选区变化（文字失去选中时隐藏按钮）
        document.addEventListener('selectionchange', this._boundHandlers.selectionchange);
        
        // 滚动时隐藏按钮
        window.addEventListener('scroll', this._boundHandlers.scroll, { passive: true, capture: true });
    }
    
    /**
     * 解绑事件
     */
    _unbindEvents() {
        if (!this._boundHandlers) return;
        
        document.removeEventListener('mouseup', this._boundHandlers.mouseup);
        document.removeEventListener('keyup', this._boundHandlers.keyup);
        document.removeEventListener('selectionchange', this._boundHandlers.selectionchange);
        window.removeEventListener('scroll', this._boundHandlers.scroll, { capture: true });
        
        this._boundHandlers = null;
    }
    
    /**
     * 检查选区
     */
    _checkSelection(e) {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();
        
        if (!selectedText || selectedText.length === 0) {
            this._hideButton();
            return;
        }
        
        // 检查选区是否在对话区域内（排除输入框）
        if (!this._isValidSelection(selection)) {
            this._hideButton();
            return;
        }
        
        this.currentSelection = selectedText;
        try { this._savedRange = selection.getRangeAt(0).cloneRange(); } catch { this._savedRange = null; }
        this._showButton(selection);
    }
    
    /**
     * 独立获取对话容器（不依赖时间轴模块）
     * 优先复用 timeline 已定位的容器，否则通过 adapter 独立查找
     * @returns {Element|null}
     */
    _getConversationContainer() {
        const tlContainer = window.timelineManager?.conversationContainer;
        if (tlContainer && tlContainer.isConnected) return tlContainer;

        try {
            if (!this._adapterRegistry) {
                if (typeof SiteAdapterRegistry === 'undefined') return null;
                this._adapterRegistry = new SiteAdapterRegistry();
            }
            const adapter = this._adapterRegistry.detectAdapter();
            if (!adapter) return null;

            const selector = adapter.getUserMessageSelector();
            if (!selector) return null;

            const firstMsg = document.querySelector(selector);
            if (!firstMsg) return null;

            return adapter.findConversationContainer(firstMsg);
        } catch (e) {
            return null;
        }
    }

    /**
     * 检查选区是否有效（必须在聊天对话区域内，且不在输入框等区域内）
     */
    _isValidSelection(selection) {
        if (!selection || selection.rangeCount === 0) return false;
        
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
        if (!element) return false;
        
        // 排除输入框
        if (element.closest('textarea, [contenteditable="true"], input')) {
            return false;
        }
        
        // 排除我们自己的 UI 元素
        if (element.closest('.ait-quick-ask-btn, .ait-chat-timeline-wrapper, .ait-panel-modal')) {
            return false;
        }
        
        // 排除代码执行器
        if (element.closest('.runner-panel, .floating-runner-container, .runner-container')) {
            return false;
        }
        
        // 必须在聊天对话区域内（白名单机制）
        const convContainer = this._getConversationContainer();
        if (convContainer && convContainer.isConnected) {
            if (convContainer.contains(element)) return true;
            // Firefox 上 conversationContainer 可能定位偏小，检查是否在同一滚动区域内
            const convParent = convContainer.parentElement;
            if (convParent && convParent.contains(element)) return true;
        }
        
        // 降级：限制在 <main> 区域内（排除侧边栏/导航）
        if (element.closest('main, [role="main"]')) {
            return true;
        }

        // 二次降级：NotebookLM 的对话容器
        if (location.hostname === 'notebooklm.google.com' && element.closest('.chat-panel-content')) {
            return true;
        }
        
        return false;
    }
    
    /**
     * 显示按钮
     */
    _showButton(selection) {
        this._syncHighlightButton();
        if (!this.buttonElement || !selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // 按钮尺寸和间距
        const btnWidth = 100;
        const btnHeight = 32;
        const gap = 8;
        const margin = 10; // 距离屏幕边缘的最小间距
        
        // 计算位置
        let { left, top } = this._calculatePosition(this._position, rect, btnWidth, btnHeight, gap);
        
        // 边界检查和回退
        const needFallback = this._checkBoundary(this._position, top, btnHeight, margin);
        if (needFallback) {
            const fallbackPosition = POSITION_FALLBACK[this._position];
            if (fallbackPosition) {
                const fallbackPos = this._calculatePosition(fallbackPosition, rect, btnWidth, btnHeight, gap);
                left = fallbackPos.left;
                top = fallbackPos.top;
            }
        }
        
        // 水平边界检查（通用）
        if (left < margin) left = margin;
        if (left + btnWidth > window.innerWidth - margin) {
            left = window.innerWidth - btnWidth - margin;
        }
        
        this.buttonElement.style.left = `${left}px`;
        this.buttonElement.style.top = `${top + window.scrollY}px`;
        this.buttonElement.style.display = 'flex';
        
        // 触发动画
        requestAnimationFrame(() => {
            this.buttonElement.classList.add('visible');
        });
    }
    
    /**
     * 根据位置类型计算坐标
     * @param {string} position - 位置类型
     * @param {DOMRect} rect - 选区矩形
     * @param {number} btnWidth - 按钮宽度
     * @param {number} btnHeight - 按钮高度
     * @param {number} gap - 间距
     * @returns {{left: number, top: number}}
     */
    _calculatePosition(position, rect, btnWidth, btnHeight, gap) {
        let left, top;
        
        switch (position) {
            case 'topLeft':
                left = rect.left;
                top = rect.top - btnHeight - gap;
                break;
            case 'topCenter':
                left = rect.left + rect.width / 2 - btnWidth / 2;
                top = rect.top - btnHeight - gap;
                break;
            case 'topRight':
                left = rect.right - btnWidth;
                top = rect.top - btnHeight - gap;
                break;
            case 'bottomLeft':
                left = rect.left;
                top = rect.bottom + gap;
                break;
            case 'bottomCenter':
                left = rect.left + rect.width / 2 - btnWidth / 2;
                top = rect.bottom + gap;
                break;
            case 'bottomRight':
                left = rect.right - btnWidth;
                top = rect.bottom + gap;
                break;
            default:
                // 默认 topCenter
                left = rect.left + rect.width / 2 - btnWidth / 2;
                top = rect.top - btnHeight - gap;
        }
        
        return { left, top };
    }
    
    /**
     * 检查是否需要回退到备选位置
     * @param {string} position - 当前位置
     * @param {number} top - 计算出的 top 值
     * @param {number} btnHeight - 按钮高度
     * @param {number} margin - 边距
     * @returns {boolean} - 是否需要回退
     */
    _checkBoundary(position, top, btnHeight, margin) {
        if (position.startsWith('top')) {
            // 上方位置：检查是否超出顶部
            return top < margin;
        } else if (position.startsWith('bottom')) {
            // 下方位置：检查是否超出底部
            return top + btnHeight > window.innerHeight - margin;
        }
        return false;
    }
    
    /**
     * 隐藏按钮
     */
    _hideButton() {
        if (!this.buttonElement) return;
        
        this.buttonElement.classList.remove('visible');
        this.buttonElement.style.display = 'none';
        this.currentSelection = null;
        this._savedRange = null;
    }
    
    /**
     * 处理引用
     */
    _handleQuote() {
        if (!this.currentSelection) {
            this._hideButton();
            return;
        }
        
        // 格式化为引用格式（每行前加 > ），末尾换行由通用方法处理
        // 先处理伪换行：公式渲染（KaTeX/MathJax）会在元素边界插入单个换行符，
        // 需要将其合并为空格，只保留双换行作为真正的段落分隔
        const normalizedText = this.currentSelection
            .replace(/\n{2,}/g, '\n\n')       // 标准化段落分隔为双换行
            .replace(/(?<!\n)\n(?!\n)/g, ' ')  // 单个换行 → 空格（公式渲染产生的伪换行）
            .replace(/ {2,}/g, ' ');           // 合并多余空格
        
        const quotedText = normalizedText
            .split('\n')
            .map(line => line.trim() ? `> ${line.trim()}` : '>')
            .join('\n');
        
        // 插入到输入框
        this._insertToInput(quotedText);
        
        // 隐藏按钮
        this._hideButton();
        
        // 清除选区
        window.getSelection()?.removeAllRanges();
    }
    
    /**
     * 插入文字到输入框
     */
    _insertToInput(text) {
        // 尝试获取输入框
        const inputElement = this._findInputElement();
        
        if (!inputElement) {
            console.warn('[QuickAsk] 未找到输入框');
            return;
        }
        
        // 滚动到输入框位置
        inputElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // 聚焦输入框
        inputElement.focus();
        
        if (inputElement.isContentEditable) {
            // contenteditable 处理：使用 insertText 追加，避免替换整个内容导致框架重新格式化
            inputElement.focus();
            
            // 移动光标到末尾 - 需要定位到最深层的文本节点
            const selection = window.getSelection();
            const range = document.createRange();
            
            // 查找最后一个可编辑位置
            let targetNode = inputElement;
            let targetOffset = 0;
            
            // 递归查找最后一个叶子节点
            const findLastLeaf = (node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    return { node, offset: node.textContent.length };
                }
                if (node.childNodes.length > 0) {
                    // 从后向前找非空节点
                    for (let i = node.childNodes.length - 1; i >= 0; i--) {
                        const child = node.childNodes[i];
                        // 跳过空文本节点
                        if (child.nodeType === Node.TEXT_NODE && child.textContent === '') continue;
                        const result = findLastLeaf(child);
                        if (result) return result;
                    }
                }
                // 如果没有子节点或都是空的，返回当前节点
                return { node, offset: node.childNodes.length };
            };
            
            const lastLeaf = findLastLeaf(inputElement);
            targetNode = lastLeaf.node;
            targetOffset = lastLeaf.offset;
            
            try {
                range.setStart(targetNode, targetOffset);
                range.setEnd(targetNode, targetOffset);
                selection.removeAllRanges();
                selection.addRange(range);
            } catch (e) {
                // 回退到原来的方式
                range.selectNodeContents(inputElement);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }
            
            // 配置：空行数（1个空行 = 2个换行符）
            const separatorBlankLines = 1;  // 新旧内容之间的空行数
            const trailingBlankLines = 1;   // 追加内容末尾的空行数
            
            const existingText = inputElement.innerText || '';
            const hasContent = existingText.trim().length > 0;
            
            let separator = '';
            if (hasContent) {
                // 检查末尾已有的空行数（换行符数 - 1 = 空行数）
                const trailingMatch = existingText.match(/\n+$/);
                const existingNewlines = trailingMatch ? trailingMatch[0].length : 0;
                const existingBlankLines = Math.max(0, existingNewlines - 1);
                
                // 计算需要补充多少空行才能达到目标
                const needBlankLines = Math.max(0, separatorBlankLines - existingBlankLines);
                // 空行数 + 1 = 换行符数（至少需要 1 个换行符来换行）
                separator = existingNewlines === 0 
                    ? '\n'.repeat(separatorBlankLines + 1)  // 没有换行，加完整的
                    : '\n'.repeat(needBlankLines);          // 有换行，补差值
            }
            
            const trailing = '\n'.repeat(trailingBlankLines + 1);
            const appendText = separator + text + trailing;
            
            // Slate.js 编辑器：使用粘贴模拟（execCommand 和 DOM 操作都无法同步 Slate 内部状态）
            const isSlateEditor = inputElement.hasAttribute('data-slate-editor');

            if (isSlateEditor) {
                const slateText = hasContent ? ('\n' + text + '\n') : text + '\n';

                const slateRange = document.createRange();
                slateRange.selectNodeContents(inputElement);
                if (hasContent) {
                    slateRange.collapse(false);
                }
                const slateSel = window.getSelection();
                slateSel.removeAllRanges();
                slateSel.addRange(slateRange);

                const dt = new DataTransfer();
                dt.setData('text/plain', slateText);
                inputElement.dispatchEvent(new ClipboardEvent('paste', {
                    clipboardData: dt, bubbles: true, cancelable: true
                }));
            } else {
                // 非 Slate 编辑器：尝试 execCommand，失败则 DOM 操作
                let insertSuccess = false;
                const beforeLength = inputElement.innerText?.length || 0;

                const execResult = document.execCommand('insertText', false, appendText);
                const afterExecLength = inputElement.innerText?.length || 0;

                if (execResult && afterExecLength > beforeLength) {
                    insertSuccess = true;
                }

                if (!insertSuccess) {
                    try {
                        if (targetNode.nodeType === Node.TEXT_NODE) {
                            const originalText = targetNode.textContent;
                            targetNode.textContent = originalText + appendText;
                            insertSuccess = true;
                        } else {
                            const textNode = document.createTextNode(appendText);
                            if (targetNode === inputElement) {
                                inputElement.appendChild(textNode);
                            } else {
                                targetNode.parentNode.insertBefore(textNode, targetNode.nextSibling);
                            }
                            insertSuccess = true;
                        }

                        inputElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                        inputElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                    } catch (domError) {
                        console.error('[QuickAsk] DOM manipulation failed:', domError);
                    }
                }
            }
            
            // 延迟设置焦点、光标和滚动
            setTimeout(() => {
                inputElement.focus();
                
                // 设置光标到末尾（contenteditable 需要 selection 才能显示光标）
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(inputElement);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
                
                inputElement.scrollTop = inputElement.scrollHeight;
            }, 100);
        } else {
            // textarea 或 input 处理：内联文本追加逻辑
            const existingText = inputElement.value || '';
            let finalText;
            if (!existingText.trim()) {
                finalText = text + '\n\n';
            } else {
                // 清理末尾换行符，添加1个空行（2个换行符）作为分隔
                const cleanedText = existingText.replace(/\n+$/, '');
                finalText = cleanedText + '\n\n' + text + '\n\n';
            }
            inputElement.value = finalText;
            inputElement.selectionStart = inputElement.selectionEnd = inputElement.value.length;
            
            // 触发 input 事件
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            
            // 延迟设置焦点和滚动
            setTimeout(() => {
                inputElement.focus();
                inputElement.selectionStart = inputElement.selectionEnd = inputElement.value.length;
                inputElement.scrollTop = inputElement.scrollHeight;
            }, 50);
        }
    }
    
    /**
     * 查找输入框元素
     */
    _findInputElement() {
        try {
            const adapter = window.smartEnterAdapterRegistry?.getAdapter?.();
            const selector = adapter?.getInputSelector?.();
            if (!selector) return null;
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                if (el && this._isVisibleElement(el)) {
                    return el;
                }
            }
        } catch (e) {
            console.debug('[QuickAsk] adapter selector failed', e);
        }
        return null;
    }
    
    /**
     * 检查元素是否可见
     */
    _isVisibleElement(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0';
    }
    
    /**
     * 销毁
     */
    destroy() {
        if (this._docMouseUpHandler) {
            document.removeEventListener('mouseup', this._docMouseUpHandler);
            this._docMouseUpHandler = null;
        }
        if (this.buttonElement) {
            this.buttonElement.remove();
            this.buttonElement = null;
        }
        this._adapterRegistry = null;
        this._savedRange = null;
    }
}

// 导出
window.QuickAskManager = QuickAskManager;
