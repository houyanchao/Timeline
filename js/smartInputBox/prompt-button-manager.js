/**
 * Prompt Button Manager
 * 
 * 提示词按钮管理器
 * 在输入框左上角显示一个 fixed 定位的"提示词"按钮
 * 
 * 位置更新策略（事件驱动）：
 * - resize 时立即更新
 * - MutationObserver 检测输入框出现/消失
 * - 不使用持续轮询
 */

class PromptButtonManager {
    constructor(adapter) {
        if (!adapter) {
            throw new Error('PromptButtonManager requires an adapter');
        }
        
        this.adapter = adapter;
        this.buttonElement = null;
        this.inputElement = null;
        this.isEnabled = false;
        this.isDestroyed = false;
        this.platformSettings = {};
        this.storageListener = null;
        this._unsubscribeObserver = null;  // DOMObserverManager 取消订阅函数
        
        // 提示词列表
        this.prompts = [];
        
        // 事件处理器引用
        this._onResize = null;
        this._rafPending = false;  // RAF 节流标志
        
        // 配置
        this.config = {
            gap: 8  // 按钮与输入框的间距
        };
    }
    
    /**
     * 初始化
     */
    async init() {
        // 1. 加载平台设置
        await this._loadPlatformSettings();
        
        // 2. 加载提示词列表
        await this._loadPrompts();
        
        // 3. 监听 Storage 变化
        this._attachStorageListener();
        
        // 4. 创建按钮
        this._createButton();
        
        // 5. 检查是否启用
        if (this._isPlatformEnabled()) {
            this._enable();
        }
    }
    
    /**
     * 加载提示词列表
     */
    async _loadPrompts() {
        try {
            const result = await chrome.storage.local.get('prompts');
            this.prompts = result.prompts || [];
        } catch (e) {
            console.error('[PromptButton] Failed to load prompts:', e);
            this.prompts = [];
        }
    }
    
    /**
     * 启用功能
     */
    _enable() {
        if (this.isEnabled) return;
        this.isEnabled = true;
        
        // 绑定事件
        this._bindEvents();
        
        // 启动输入框检测
        this._startInputDetection();
        
        // 尝试立即查找输入框
        this._findInputAndShow();
    }
    
    /**
     * 禁用功能
     */
    _disable() {
        if (!this.isEnabled) return;
        this.isEnabled = false;
        
        // 解绑事件
        this._unbindEvents();
        
        // 停止检测
        this._stopInputDetection();
        
        // 隐藏按钮
        this._hideButton();
        
        // 清空输入框引用
        this.inputElement = null;
    }
    
    /**
     * 加载平台设置
     */
    async _loadPlatformSettings() {
        try {
            const result = await chrome.storage.local.get('promptButtonPlatformSettings');
            this.platformSettings = result.promptButtonPlatformSettings || {};
        } catch (e) {
            this.platformSettings = {};
        }
    }
    
    /**
     * 检查当前平台是否启用
     */
    _isPlatformEnabled() {
        try {
            const platform = getCurrentPlatform();
            if (!platform) return false;
            if (platform.features?.smartInput !== true) return false;
            return this.platformSettings[platform.id] !== false;
        } catch (e) {
            return true;
        }
    }
    
    /**
     * 监听 Storage 变化
     */
    _attachStorageListener() {
        this.storageListener = (changes, areaName) => {
            // ✅ 已销毁则忽略
            if (this.isDestroyed) return;
            
            if (areaName === 'local') {
                // 监听平台设置变化
                if (changes.promptButtonPlatformSettings) {
                this.platformSettings = changes.promptButtonPlatformSettings.newValue || {};
                const shouldEnable = this._isPlatformEnabled();
                
                if (shouldEnable && !this.isEnabled) {
                    this._enable();
                } else if (!shouldEnable && this.isEnabled) {
                    this._disable();
                    }
                }
                
                // 监听提示词列表变化
                if (changes.prompts) {
                    this.prompts = changes.prompts.newValue || [];
                }
            }
        };
        chrome.storage.onChanged.addListener(this.storageListener);
    }
    
    /**
     * 创建按钮元素
     */
    _createButton() {
        if (this.buttonElement) return;
        
        const button = document.createElement('div');
        button.className = 'smart-input-prompt-btn';
        button.innerHTML = `
            <svg class="smart-input-prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
        `;

        button.style.display = 'none';

        // ✅ 使用事件委托（解决长时间停留后事件失效问题）
        window.eventDelegateManager.on('click', '.smart-input-prompt-btn', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._handleClick();
        });

        document.body.appendChild(button);
        this.buttonElement = button;

        const platform = typeof getCurrentPlatform === 'function' ? getCurrentPlatform() : null;
        if (window.inputBoxAnimationManager && platform?.features?.inputAnimation === true) {
            window.inputBoxAnimationManager.init();
        }
    }
    
    /**
     * 绑定事件（resize）
     */
    _bindEvents() {
        // 使用 RAF 节流，每帧最多更新一次
        const scheduleUpdate = () => {
            if (this._rafPending) return;
            this._rafPending = true;
            
            requestAnimationFrame(() => {
                this._rafPending = false;
                this._updatePosition();
            });
        };
        
        this._onResize = scheduleUpdate;
        
        window.addEventListener('resize', this._onResize);
    }
    
    /**
     * 解绑事件
     */
    _unbindEvents() {
        this._rafPending = false;
        
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
            this._onResize = null;
        }
    }
    
    /**
     * 启动输入框检测
     * 使用 DOMObserverManager 统一管理
     */
    _startInputDetection() {
        if (this._unsubscribeObserver) return;
        
        if (window.DOMObserverManager) {
            this._unsubscribeObserver = window.DOMObserverManager.getInstance().subscribeBody('prompt-button', {
                callback: () => {
                    // 再次检查状态（防止禁用后仍执行）
                    if (!this.isEnabled || this.isDestroyed) return;
                    
                    if (!this.inputElement) {
                        // 还没找到输入框，尝试查找
                        this._findInputAndShow();
                    } else if (!document.body.contains(this.inputElement)) {
                        // 输入框被移除，重新查找
                        this.inputElement = null;
                        this._hideButton();
                        this._findInputAndShow();
                    } else {
                        // 输入框存在，更新位置（处理位置变化的情况）
                        this._updatePosition();
                    }
                },
                filter: { hasAddedNodes: true, hasAttributeChanges: true },
                debounce: 100
            });
        }
    }
    
    /**
     * 停止输入框检测
     */
    _stopInputDetection() {
        if (this._unsubscribeObserver) {
            this._unsubscribeObserver();
            this._unsubscribeObserver = null;
        }
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        if (this._transitionHandler) {
            document.body.removeEventListener('transitionend', this._transitionHandler);
            this._transitionHandler = null;
        }
    }
    
    /**
     * 查找输入框并显示按钮
     */
    _findInputAndShow() {
        if (!this.isEnabled || this.isDestroyed) return;
        
        try {
            const selector = this.adapter.getInputSelector();
            const input = document.querySelector(selector);
            
            if (input) {
                this.inputElement = input;
                this._updatePosition();
                this._observeInputResize();
            }
        } catch (e) {
            // 忽略
        }
    }
    
    _observeInputResize() {
        if (this._resizeObserver) this._resizeObserver.disconnect();
        if (!this.inputElement) return;
        const ref = this.adapter.getPositionReferenceElement?.(this.inputElement) || this.inputElement;
        this._resizeObserver = new ResizeObserver(() => {
            if (this.isEnabled && !this.isDestroyed) this._updatePosition();
        });
        this._resizeObserver.observe(ref);

        if (!this._transitionHandler) {
            this._transitionHandler = () => {
                if (this.isEnabled && !this.isDestroyed) this._updatePosition();
            };
            document.body.addEventListener('transitionend', this._transitionHandler);
        }
    }

    /**
     * 更新按钮位置
     */
    _updatePosition() {
        if (!this.buttonElement || !this.inputElement || this.isDestroyed || !this.isEnabled) {
            return;
        }
        
        try {
            // 获取定位参考元素（适配器可自定义，默认使用输入框）
            const referenceElement = this.adapter.getPositionReferenceElement?.(this.inputElement) || this.inputElement;
            const rect = referenceElement.getBoundingClientRect();
            
            // 参考元素不可见
            if (rect.width === 0 || rect.height === 0) {
                this._hideButton();
                return;
            }
            
            // 获取按钮尺寸
            this.buttonElement.style.visibility = 'hidden';
            this.buttonElement.style.display = 'flex';
            const buttonRect = this.buttonElement.getBoundingClientRect();
            
            // 获取平台偏移量
            const offset = this.adapter.getPromptButtonOffset?.(this.inputElement) || { top: 0, left: 0 };
            
            // 计算位置：相对于参考元素左上角
            const top = rect.top + offset.top;
            const left = rect.left - buttonRect.width - this.config.gap + offset.left;
            
            // 边界检查
            const safeTop = Math.max(8, Math.min(top, window.innerHeight - buttonRect.height - 8));
            const safeLeft = Math.max(8, left);
            
            // 设置位置并显示
            this.buttonElement.style.top = `${safeTop}px`;
            this.buttonElement.style.left = `${safeLeft}px`;
            this.buttonElement.style.visibility = 'visible';

            if (window.inputBoxAnimationManager) {
                const ref = this.adapter.getPositionReferenceElement?.(this.inputElement) || this.inputElement;
                window.inputBoxAnimationManager.updatePosition(ref.getBoundingClientRect());
            }
        } catch (e) {
            this._hideButton();
        }
    }
    
    /**
     * 隐藏按钮
     */
    _hideButton() {
        if (this.buttonElement) {
            this.buttonElement.style.display = 'none';
        }
        if (window.inputBoxAnimationManager) {
            window.inputBoxAnimationManager.hideActive();
        }
    }
    
    /**
     * 处理点击
     */
    _handleClick() {
        console.log('[PromptButton] Button clicked');
        
        if (!this.buttonElement) {
            return;
        }
        
        // 如果已经显示，则关闭
        if (this._promptDropdown) {
            this._hidePromptDropdown();
            return;
        }
        
        // 显示自定义下拉菜单
        this._showPromptDropdown();
    }
    
    /**
     * 显示提示词下拉菜单（委托给共享 prompt-dropdown-ui）
     */
    _showPromptDropdown() {
        if (window.globalDropdownManager) {
            window.globalDropdownManager.hide(true);
        }
        
        this._promptOverlay = document.createElement('div');
        this._promptOverlay.className = 'prompt-dropdown-overlay';
        this._promptOverlay.addEventListener('click', () => this._hidePromptDropdown());
        document.body.appendChild(this._promptOverlay);
        
        const currentPlatform = typeof getCurrentPlatform === 'function' ? getCurrentPlatform() : null;
        const currentPlatformId = currentPlatform?.id || '';
        const filteredPrompts = this.prompts.filter(p => !p.platformId || p.platformId === currentPlatformId);
        
        this._promptDropdown = createPromptDropdownUI({
            prompts: filteredPrompts,
            onItemClick: (prompt) => {
                this._hidePromptDropdown();
                this._insertPrompt(prompt);
            },
            onManageClick: () => {
                this._hidePromptDropdown();
                if (window.panelModal) window.panelModal.show('prompt');
            }
        });
        
        document.body.appendChild(this._promptDropdown);
        this._positionPromptDropdown();
        
        requestAnimationFrame(() => {
            this._promptDropdown.classList.add('visible');
        });
        
        this._boundCloseOnClickOutside = (e) => {
            if (!this._promptDropdown?.contains(e.target) && e.target !== this.buttonElement) {
                this._hidePromptDropdown();
            }
        };
        setTimeout(() => {
            document.addEventListener('click', this._boundCloseOnClickOutside, true);
        }, 0);
    }
    
    /**
     * 计算下拉菜单位置
     */
    _positionPromptDropdown() {
        if (!this._promptDropdown || !this.buttonElement) return;
        
        const buttonRect = this.buttonElement.getBoundingClientRect();
        const dropdownWidth = 320;
        const dropdownHeight = 400;
        const topPadding = 20; // 顶部安全距离
        const gap = 8; // 弹窗与按钮的间距
        
        // 设置固定宽高
        this._promptDropdown.style.width = `${dropdownWidth}px`;
        this._promptDropdown.style.height = `${dropdownHeight}px`;
        this._promptDropdown.style.visibility = 'hidden';
        this._promptDropdown.style.display = 'flex';
        
        // 水平位置：与按钮左对齐
        let left = buttonRect.left;
        if (left + dropdownWidth > window.innerWidth - 8) {
            left = window.innerWidth - dropdownWidth - 8;
        }
        left = Math.max(8, left);
        
        // 垂直位置：往上展开，底部挨着按钮顶部
        // 如果超过顶部安全距离，就把弹窗往下移
        const top = Math.max(topPadding, buttonRect.top - gap - dropdownHeight);
        
        this._promptDropdown.style.left = `${left}px`;
        this._promptDropdown.style.top = `${top}px`;
        this._promptDropdown.style.visibility = 'visible';
    }
    
    /**
     * 隐藏提示词下拉菜单
     */
    _hidePromptDropdown() {
        if (this._boundCloseOnClickOutside) {
            document.removeEventListener('click', this._boundCloseOnClickOutside, true);
            this._boundCloseOnClickOutside = null;
        }
        
        // 关闭可能还在显示的 tooltip
        if (window.globalTooltipManager) {
            window.globalTooltipManager.hide();
        }
        
        if (this._promptDropdown) {
            this._promptDropdown.classList.remove('visible');
            setTimeout(() => {
                if (this._promptDropdown?.parentNode) {
                    this._promptDropdown.parentNode.removeChild(this._promptDropdown);
                }
                this._promptDropdown = null;
            }, 150);
        }
        
        if (this._promptOverlay?.parentNode) {
            this._promptOverlay.parentNode.removeChild(this._promptOverlay);
        }
        this._promptOverlay = null;
    }
    
    /**
     * 插入提示词到输入框
     */
    _insertPrompt(prompt) {
        if (!this.inputElement || !prompt.content) {
            return;
        }
        
        try {
            // 获取适配器的插入方法
            if (this.adapter.insertText) {
                this.adapter.insertText(this.inputElement, prompt.content);
            } else {
                // 默认插入逻辑
                this._defaultInsertText(prompt.content);
            }
        } catch (e) {
            console.error('[PromptButton] Failed to insert prompt:', e);
        }
    }
    
    /**
     * 默认的文本插入逻辑（追加到末尾）
     */
    _defaultInsertText(text) {
        if (!this.inputElement) return;
        
        // 聚焦输入框
        this.inputElement.focus();
        
        if (this.inputElement.isContentEditable) {
            // contenteditable 处理：使用 insertText 追加，避免替换整个内容
            
            // 移动光标到末尾
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(this.inputElement);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
            
            // 配置：空行数（1个空行 = 2个换行符）
            const separatorBlankLines = 1;  // 新旧内容之间的空行数
            const trailingBlankLines = 1;   // 追加内容末尾的空行数
            
            const existingText = this.inputElement.innerText || '';
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
            
            // 使用 insertText 命令追加（execCommand 虽已弃用，但无替代方案能避免框架重格式化问题）
            document.execCommand('insertText', false, appendText);
            
            // 延迟设置焦点、光标和滚动
            setTimeout(() => {
                this.inputElement.focus();
                
                // 设置光标到末尾（contenteditable 需要 selection 才能显示光标）
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(this.inputElement);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
                
                this.inputElement.scrollTop = this.inputElement.scrollHeight;
            }, 50);
        } else {
            // textarea 或 input 处理：内联文本追加逻辑
            const existingText = this.inputElement.value || '';
            let finalText;
            if (!existingText.trim()) {
                finalText = text + '\n\n';
            } else {
                // 清理末尾换行符，添加1个空行（2个换行符）作为分隔
                const cleanedText = existingText.replace(/\n+$/, '');
                finalText = cleanedText + '\n\n' + text + '\n\n';
            }
            this.inputElement.value = finalText;
            this.inputElement.selectionStart = this.inputElement.selectionEnd = this.inputElement.value.length;
            
            // 触发 input 事件
            this.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            
            // 延迟设置焦点和滚动
            setTimeout(() => {
                this.inputElement.focus();
                this.inputElement.selectionStart = this.inputElement.selectionEnd = this.inputElement.value.length;
                this.inputElement.scrollTop = this.inputElement.scrollHeight;
            }, 50);
        }
    }
    
    /**
     * 显示
     */
    show() {
        if (this.isEnabled) {
            this._findInputAndShow();
        }
    }
    
    /**
     * 隐藏
     */
    hide() {
        this._hideButton();
    }
    
    /**
     * 销毁
     */
    destroy() {
        this.isDestroyed = true;
        this._disable();
        
        // 关闭下拉菜单
        this._hidePromptDropdown();
        
        // 移除 Storage 监听
        if (this.storageListener) {
            chrome.storage.onChanged.removeListener(this.storageListener);
            this.storageListener = null;
        }
        
        // 移除按钮
        if (this.buttonElement?.parentNode) {
            this.buttonElement.parentNode.removeChild(this.buttonElement);
            this.buttonElement = null;
        }
        if (window.inputBoxAnimationManager) {
            window.inputBoxAnimationManager.destroy();
        }
    }
}
