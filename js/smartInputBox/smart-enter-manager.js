/**
 * Smart Enter Manager
 * 
 * 智能 Enter 管理器
 * 实现 Enter 换行 + 快速双击 Enter 发送
 */

class SmartEnterManager {
    constructor(adapter, options = {}) {
        if (!adapter) {
            throw new Error('SmartEnterManager requires an adapter');
        }
        
        this.adapter = adapter;
        this.config = {
            doubleClickInterval: options.doubleClickInterval || SMART_ENTER_CONFIG.DOUBLE_CLICK_INTERVAL,
            debug: options.debug || SMART_ENTER_CONFIG.DEBUG
        };
        
        // ✅ 平台设置（内存缓存）
        this.platformSettings = {};
        
        // ✅ 发送模式（内存缓存）
        this.smartEnterMode = SMART_ENTER_MODES.DOUBLE_ENTER;
        
        // 状态
        this.state = {
            lastEnterTime: 0,
            enterCount: 0,
            savedSelection: null,  // 保存的光标位置/选区
            allowNextEnter: false,  // 是否允许下一次 Enter 通过（用于发送）
            isInsertingNewline: false  // 是否正在插入换行（合成事件不应被拦截）
        };
        
        // 定时器
        this.newlineTimer = null;
        this.debounceTimer = null;  // 防抖定时器
        
        // DOMObserverManager 取消订阅函数
        this._unsubscribeObserver = null;
        
        // Storage 监听器
        this.storageListener = null;
        
        // 使用 WeakMap 跟踪已附加的元素及其事件处理器
        // WeakMap 的好处：当元素被移除时会自动清理，不会造成内存泄漏
        this.attachedElements = new WeakMap();
        
        // ✅ 健康检查定时器
        this.healthCheckInterval = null;
        
        // ✅ 提示词按钮管理器
        this.promptButtonManager = null;
    }
    
    /**
     * 初始化
     */
    async init() {
        // 1. 加载平台设置
        await this._loadPlatformSettings();
        
        // 2. 监听 Storage 变化（实时响应用户开关）
        this._attachStorageListener();
        
        // 3. 始终附加到输入框（不管开关状态）
        this._attachToInputIfNeeded();
        
        // 4. 始终启动 DOM 监听（不管开关状态）
        this._startObserving();
        
        // 5. ✅ 启动健康检查
        this._startHealthCheck();
        
        // 6. ✅ 初始化提示词按钮
        await this._initPromptButton();
    }
    
    /**
     * ✅ 初始化提示词按钮
     */
    async _initPromptButton() {
        try {
            // 检查 PromptButtonManager 是否已加载
            if (typeof PromptButtonManager === 'undefined') {
                console.error('[SmartInputBox] PromptButtonManager not loaded');
                return;
            }
            
            // 创建并初始化
            this.promptButtonManager = new PromptButtonManager(this.adapter);
            await this.promptButtonManager.init();
            
        } catch (e) {
            console.error('[SmartInputBox] Failed to init prompt button:', e);
        }
    }
    
    /**
     * ✅ 加载平台设置
     */
    async _loadPlatformSettings() {
        try {
            const result = await chrome.storage.local.get(['smartInputPlatformSettings', 'smartEnterMode']);
            this.platformSettings = result.smartInputPlatformSettings || {};
            this.smartEnterMode = result.smartEnterMode || SMART_ENTER_MODES.DOUBLE_ENTER;
        } catch (e) {
            console.error('[SmartInputBox] Failed to load platform settings:', e);
            this.platformSettings = {};
            this.smartEnterMode = SMART_ENTER_MODES.DOUBLE_ENTER;
        }
    }
    
    /**
     * ✅ 检查当前平台是否启用
     */
    _isPlatformEnabled() {
        try {
            const platform = getCurrentPlatform();
            if (!platform) return true; // 未知平台，默认启用
            
            // ✅ 首先检查平台是否支持智能输入功能
            if (platform.features?.smartInput !== true) {
                return false; // 平台不支持该功能
            }
            
            // ✅ Claude 平台硬编码禁用（其 Enter 键行为无法被拦截）
            if (platform.id === 'claude') {
                return false;
            }
            
            // 从缓存中检查（默认关闭）
            return this.platformSettings[platform.id] === true;
        } catch (e) {
            return false; // 出错默认关闭
        }
    }
    
    /**
     * 附加 Storage 变化监听器
     */
    _attachStorageListener() {
        this.storageListener = (changes, areaName) => {
            if (areaName === 'local') {
                // ✅ 监听平台设置变化
                if (changes.smartInputPlatformSettings) {
                    this.platformSettings = changes.smartInputPlatformSettings.newValue || {};
                }
                // ✅ 监听发送模式变化
                if (changes.smartEnterMode) {
                    this.smartEnterMode = changes.smartEnterMode.newValue || SMART_ENTER_MODES.DOUBLE_ENTER;
                }
            }
        };
        
        chrome.storage.onChanged.addListener(this.storageListener);
    }
    
    /**
     * 移除 Storage 变化监听器
     */
    _detachStorageListener() {
        if (this.storageListener) {
            chrome.storage.onChanged.removeListener(this.storageListener);
            this.storageListener = null;
        }
    }
    
    /**
     * 附加到输入框（带防抖）
     */
    _attachToInputIfNeeded() {
        try {
            const selector = this.adapter.getInputSelector();
            const inputs = document.querySelectorAll(selector);
            let input = null;
            
            // Find the first visible input element
            for (const el of inputs) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    input = el;
                    break;
                }
            }
            
            if (input) {
                // 使用 WeakMap 检查是否已附加
                if (!this.attachedElements.has(input)) {
                    this._attachListener(input);
                }
            }
        } catch (e) {
            console.error('[SmartInputBox] Failed to attach to input:', e);
        }
    }
    
    /**
     * 防抖处理附加逻辑
     */
    _debouncedAttach() {
        // 清除之前的定时器
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        // 延迟执行
        this.debounceTimer = setTimeout(() => {
            this._attachToInputIfNeeded();
            this.debounceTimer = null;
        }, SMART_ENTER_CONFIG.DEBOUNCE_DELAY);
    }
    
    /**
     * 启动 DOM 监听
     * 使用 DOMObserverManager 统一管理
     */
    _startObserving() {
        if (this._unsubscribeObserver) return;
        
        try {
            if (window.DOMObserverManager) {
                this._unsubscribeObserver = window.DOMObserverManager.getInstance().subscribeBody('smart-enter', {
                    callback: () => this._debouncedAttach(),
                    filter: { hasAddedNodes: true },
                    debounce: SMART_ENTER_CONFIG.DEBOUNCE_DELAY  // 200ms 防抖
                });
            }
        } catch (e) {
            console.error('[SmartInputBox] Failed to start observer:', e);
        }
    }
    
    /**
     * 停止 DOM 监听
     */
    _stopObserving() {
        if (this._unsubscribeObserver) {
            this._unsubscribeObserver();
            this._unsubscribeObserver = null;
        }
    }
    
    /**
     * ✅ 启动健康检查
     * 定期检测输入框是否仍然有效，如果失效则重新绑定
     */
    _startHealthCheck() {
        if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
        
        this.healthCheckInterval = setInterval(() => {
            try {
                const selector = this.adapter.getInputSelector();
                const currentInput = document.querySelector(selector);
                
                // 情况1: 页面上找不到输入框了 (可能正在加载或切换)
                if (!currentInput) return;
                
                // 情况2: 找到了输入框，但还没有被绑定 (可能是新生成的)
                if (!this.attachedElements.has(currentInput)) {
                    // console.log('[SmartInputBox] Detected new input element, rebinding...');
                    this._attachListener(currentInput);
                }
                
                // 情况3: 检查已绑定的元素是否还在文档中
                // (由于使用了 WeakMap，不需要手动清理旧的，只需要确保新的被绑定)
                
            } catch (e) {
                // 忽略错误
            }
        }, 5000); // 每 5 秒检查一次
    }
    
    /**
     * 附加键盘监听器到输入框
     * @param {HTMLElement} inputElement - 输入框元素
     */
    _attachListener(inputElement) {
        if (!inputElement) return;
        
        // 创建绑定的事件处理器
        const handleKeyDown = this._handleKeyDown.bind(this, inputElement);
        const handleInput = this._handleInput.bind(this);
        
        // 附加 keydown 监听器（使用 capture 模式优先拦截）
        inputElement.addEventListener('keydown', handleKeyDown, { capture: true });
        
        // 附加 input 监听器（检测内容变化）
        inputElement.addEventListener('input', handleInput);
        
        // 保存事件处理器引用到 WeakMap，方便后续清理
        this.attachedElements.set(inputElement, {
            handleKeyDown,
            handleInput
        });
    }
    
    /**
     * 移除输入框的监听器
     * @param {HTMLElement} inputElement - 输入框元素
     */
    _detachListener(inputElement) {
        if (!inputElement) return;
        
        // 从 WeakMap 获取事件处理器引用
        const handlers = this.attachedElements.get(inputElement);
        if (!handlers) return;
        
        // 移除事件监听器
        inputElement.removeEventListener('keydown', handlers.handleKeyDown, { capture: true });
        inputElement.removeEventListener('input', handlers.handleInput);
        
        // 从 WeakMap 中删除
        this.attachedElements.delete(inputElement);
    }
    
    /**
     * 处理 input 事件（内容变化）
     * 在监听窗口期内，如果内容变化，取消当前的Enter处理
     */
    _handleInput() {
        // 如果有待执行的换行定时器，取消它
        if (this.newlineTimer) {
            clearTimeout(this.newlineTimer);
            this.newlineTimer = null;
            
            // 重置状态（内容变化了，之前的Enter操作失效）
            this._resetState();
        }
    }
    
    /**
     * 处理 Enter 键按下事件
     * @param {HTMLElement} inputElement - 输入框元素
     * @param {KeyboardEvent} e - 键盘事件
     */
    _handleKeyDown(inputElement, e) {
        // 只处理 Enter 键
        if (e.key !== 'Enter') {
            return;
        }
        
        // 如果是我们触发的 Enter（用于发送或插入换行），允许通过
        if (this.state.allowNextEnter || this.state.isInsertingNewline) {
            return;
        }
        
        // ✅ 检查当前平台是否启用
        if (!this._isPlatformEnabled()) {
            return;
        }
        
        const mode = this.smartEnterMode || SMART_ENTER_MODES.DOUBLE_ENTER;
        
        if (mode === SMART_ENTER_MODES.DOUBLE_ENTER) {
            this._handleDoubleEnterMode(inputElement, e);
        } else if (mode === SMART_ENTER_MODES.CTRL_ENTER) {
            this._handleCtrlEnterMode(inputElement, e);
        } else if (mode === SMART_ENTER_MODES.SHIFT_ENTER) {
            this._handleShiftEnterMode(inputElement, e);
        }
    }
    
    /**
     * 模式1：快速双击 Enter 发送（原有逻辑）
     */
    _handleDoubleEnterMode(inputElement, e) {
        if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) {
            return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        const now = Date.now();
        const timeSinceLastEnter = now - this.state.lastEnterTime;
        
        if (this.state.enterCount > 0 && timeSinceLastEnter < this.config.doubleClickInterval) {
            this.state.enterCount++;
            
            if (this.state.enterCount >= 2) {
                if (this.newlineTimer) {
                    clearTimeout(this.newlineTimer);
                    this.newlineTimer = null;
                }
                this._triggerSend(inputElement);
                this._resetState();
            }
        } else {
            if (this.newlineTimer) {
                clearTimeout(this.newlineTimer);
                this.newlineTimer = null;
            }
            
            this._saveSelection(inputElement);
            this.state.enterCount = 1;
            this.state.lastEnterTime = now;
            
            this.newlineTimer = setTimeout(() => {
                this.newlineTimer = null;
                if (this.state.enterCount === 1) {
                    if (this.adapter.canSend(inputElement)) {
                        this._insertNewlineAtSavedPosition(inputElement);
                    }
                }
                this._resetState();
            }, this.config.doubleClickInterval);
        }
    }
    
    /**
     * 模式2：Ctrl/Cmd + Enter 发送
     * Enter 即时换行，Ctrl/Cmd+Enter 发送消息
     */
    _handleCtrlEnterMode(inputElement, e) {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            this._triggerSend(inputElement);
        } else if (!e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            this._insertNewline(inputElement);
            this._showNewlineToast(inputElement);
        }
    }
    
    /**
     * 模式3：Shift + Enter 发送
     * Enter 即时换行，Shift+Enter 发送消息
     */
    _handleShiftEnterMode(inputElement, e) {
        if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            this._triggerSend(inputElement);
        } else if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            this._insertNewline(inputElement);
            this._showNewlineToast(inputElement);
        }
    }
    
    /**
     * 保存当前光标位置/选区
     * @param {HTMLElement} inputElement - 输入框元素
     */
    _saveSelection(inputElement) {
        try {
            const isContentEditable = inputElement.contentEditable === 'true';
            
            if (isContentEditable) {
                // contenteditable: 保存 Range 对象
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    this.state.savedSelection = {
                        type: 'range',
                        range: selection.getRangeAt(0).cloneRange()
                    };
                }
            } else {
                // textarea: 保存光标位置
                this.state.savedSelection = {
                    type: 'offset',
                    start: inputElement.selectionStart,
                    end: inputElement.selectionEnd
                };
            }
        } catch (e) {
            console.error('[SmartInputBox] Failed to save selection:', e);
        }
    }
    
    /**
     * 在保存的位置插入换行
     * @param {HTMLElement} inputElement - 输入框元素
     */
    _insertNewlineAtSavedPosition(inputElement) {
        if (!this.state.savedSelection) {
            this._insertNewline(inputElement);
            this._showNewlineToast(inputElement);
            return;
        }
        
        try {
            const isContentEditable = inputElement.contentEditable === 'true';
            
            if (isContentEditable && this.state.savedSelection.type === 'range') {
                // 恢复选区并插入换行
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(this.state.savedSelection.range);
                
                this._insertNewline(inputElement);
            } else if (!isContentEditable && this.state.savedSelection.type === 'offset') {
                // 恢复光标位置并插入换行
                inputElement.selectionStart = this.state.savedSelection.start;
                inputElement.selectionEnd = this.state.savedSelection.end;
                
                this._insertNewline(inputElement);
            } else {
                // 类型不匹配，使用当前位置
                this._insertNewline(inputElement);
            }
            
            // 显示Toast提示
            this._showNewlineToast(inputElement);
        } catch (e) {
            console.error('[SmartInputBox] Failed to insert at saved position:', e);
            this._insertNewline(inputElement);
            this._showNewlineToast(inputElement);
        }
    }
    
    /**
     * 显示换行提示Toast
     * @param {HTMLElement} inputElement - 输入框元素
     */
    async _showNewlineToast(inputElement) {
        try {
            // 检查全局Toast管理器是否存在
            if (typeof window.globalToastManager === 'undefined' || !window.globalToastManager) {
                return;
            }
            
            // 检查提示次数
            const result = await chrome.storage.local.get('smartEnterToastCount');
            const count = result.smartEnterToastCount || 0;
            
            if (count >= 5) {
                return;
            }
            
            // 根据模式选择 Toast 消息
            const mode = this.smartEnterMode || SMART_ENTER_MODES.DOUBLE_ENTER;
            let toastKey = 'vxmkpz';
            if (mode === SMART_ENTER_MODES.CTRL_ENTER) {
                toastKey = 'smartEnterToastCtrlEnter';
            } else if (mode === SMART_ENTER_MODES.SHIFT_ENTER) {
                toastKey = 'smartEnterToastShiftEnter';
            }
            const ctrlLabel = navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘' : 'Ctrl';
            const message = chrome.i18n.getMessage(toastKey).replace('{ctrl}', ctrlLabel);
            window.globalToastManager.info(message, inputElement, {
                duration: 2500,
                icon: '',  // 不显示图标
                color: {
                    light: {
                        backgroundColor: '#0d0d0d',  // 浅色模式：黑色背景
                        textColor: '#ffffff',        // 浅色模式：白色文字
                        borderColor: '#0d0d0d'       // 浅色模式：黑色边框
                    },
                    dark: {
                        backgroundColor: '#ffffff',  // 深色模式：白色背景
                        textColor: '#1f2937',        // 深色模式：深灰色文字
                        borderColor: '#e5e7eb'       // 深色模式：浅灰色边框
                    }
                }
            });
            
            // 增加提示次数
            await chrome.storage.local.set({ smartEnterToastCount: count + 1 });
        } catch (e) {
            console.error('[SmartInputBox] Failed to show toast:', e);
        }
    }
    
    /**
     * 插入换行符
     * @param {HTMLElement} inputElement - 输入框元素
     */
    _insertNewline(inputElement) {
        try {
            // 检查是否为 contenteditable 元素
            const isContentEditable = inputElement.contentEditable === 'true' || 
                                      inputElement.hasAttribute('contenteditable');
            
            if (isContentEditable) {
                // contenteditable 元素：模拟 Shift+Enter 按键事件
                // 让平台原生处理换行，确保格式正确
                
                // 确保元素有焦点
                if (document.activeElement !== inputElement) {
                    inputElement.focus();
                }
                
                // 标记正在插入换行，防止合成事件被 _handleKeyDown 再次拦截
                this.state.isInsertingNewline = true;
                
                // 创建 Shift+Enter 键盘事件
                const shiftEnterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    shiftKey: true,
                    bubbles: true,
                    cancelable: true
                });
                
                // 触发事件，让平台原生处理换行
                inputElement.dispatchEvent(shiftEnterEvent);
                
                // 触发 keypress 和 keyup 事件
                const shiftEnterPress = new KeyboardEvent('keypress', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    shiftKey: true,
                    bubbles: true,
                    cancelable: true
                });
                inputElement.dispatchEvent(shiftEnterPress);
                
                const shiftEnterUp = new KeyboardEvent('keyup', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    shiftKey: true,
                    bubbles: true,
                    cancelable: true
                });
                inputElement.dispatchEvent(shiftEnterUp);
                
                // 清除标记
                this.state.isInsertingNewline = false;
            } else {
                // 普通 textarea/input 元素
                
                // 获取当前选区
                const start = inputElement.selectionStart;
                const end = inputElement.selectionEnd;
                const value = inputElement.value;
                
                // 插入换行符
                const newValue = value.substring(0, start) + '\n' + value.substring(end);
                inputElement.value = newValue;
                
                // 恢复光标位置
                const newPosition = start + 1;
                inputElement.selectionStart = newPosition;
                inputElement.selectionEnd = newPosition;
                
                // 触发 input 事件
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } catch (e) {
            console.error('[SmartInputBox] Failed to insert newline:', e);
        }
    }
    
    /**
     * 触发发送消息
     * 直接模拟普通的 Enter 键事件，让平台原生处理发送
     * @param {HTMLElement} inputElement - 输入框元素
     */
    _triggerSend(inputElement) {
        try {
            // 检查是否可以发送（输入框非空）
            if (!this.adapter.canSend(inputElement)) {
                return;
            }
            
            // 确保元素有焦点
            if (document.activeElement !== inputElement) {
                inputElement.focus();
            }
            
            // 设置标记，允许下一次 Enter 通过
            this.state.allowNextEnter = true;
            
            // 创建普通的 Enter 键事件（不带任何修饰键）
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            
            // 触发 Enter 事件，让平台原生处理发送
            inputElement.dispatchEvent(enterEvent);
            
            // 延迟清除标记，确保事件传播完成
            setTimeout(() => {
                this.state.allowNextEnter = false;
            }, 50);
        } catch (e) {
            console.error('[SmartInputBox] Failed to trigger send:', e);
        }
    }
    
    /**
     * 重置状态
     */
    _resetState() {
        this.state.lastEnterTime = 0;
        this.state.enterCount = 0;
        this.state.savedSelection = null;
        this.state.allowNextEnter = false;
        this.state.isInsertingNewline = false;
        
        // 清除所有定时器
        if (this.newlineTimer) {
            clearTimeout(this.newlineTimer);
            this.newlineTimer = null;
        }
        
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }
    
    
    /**
     * 销毁管理器，清理所有监听器
     */
    destroy() {
        // 停止 DOM 监听
        this._stopObserving();
        
        // ✅ 停止健康检查
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        
        // 移除 Storage 监听
        this._detachStorageListener();
        
        // 清理输入框的事件监听器
        try {
            const selector = this.adapter.getInputSelector();
            const input = document.querySelector(selector);
            if (input) {
                this._detachListener(input);
            }
        } catch (e) {
            console.error('[SmartInputBox] Failed to detach listener on destroy:', e);
        }
        
        // ✅ 销毁提示词按钮
        if (this.promptButtonManager) {
            try {
                this.promptButtonManager.destroy();
                this.promptButtonManager = null;
            } catch (e) {
                console.error('[SmartInputBox] Failed to destroy prompt button:', e);
            }
        }
        
        // 清除所有定时器和状态
        this._resetState();
    }
}

