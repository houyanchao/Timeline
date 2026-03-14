/**
 * Formula Manager - 公式交互管理器
 * 
 * 负责处理 AI 回复中的数学公式（KaTeX）交互
 * 功能：
 * - Hover 高亮效果
 * - Tooltip 提示（显示"复制公式"）
 * - 点击复制 LaTeX 源码（纯文本，不包装 Markdown）
 * - 复制成功反馈
 * - 动态监听新增公式
 * - ✨ 组件自治：URL 变化时自动清理公式交互标记（无需外部管理）
 */

// ==================== 公式格式辅助函数 ====================

/**
 * 应用公式格式模板
 * @param {string} formula - 原始公式内容
 * @param {string} formatId - 格式 ID
 * @returns {string} 格式化后的公式
 */
function applyFormulaFormat(formula, formatId) {
    const format = FORMULA_FORMATS.find(f => f.id === formatId);
    const template = format ? format.template : '%s';
    return template.replace('%s', formula);
}

// ==================== FormulaManager 类 ====================

class FormulaManager {
    constructor() {
        this.tooltip = null;
        this.copyFeedback = null;
        this.currentHoverElement = null;
        this.tooltipTimer = null;
        this.feedbackTimer = null;
        this.isEnabled = false;
        
        // DOMObserverManager 取消订阅函数
        this._unsubscribeObserver = null;
        
        // ✅ URL 变化监听（组件自治）
        this._currentUrl = location.href;
        
        // ✅ Storage 监听器
        this.storageListener = null;
        
        // 缓存开关状态
        this._latexEnabled = true;
        this._mathmlEnabled = false;
        
        // 绑定事件处理器
        this.handleMouseEnter = this.handleMouseEnter.bind(this);
        this.handleMouseLeave = this.handleMouseLeave.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleClick = this.handleClick.bind(this);
        this._boundHandleUrlChange = this._handleUrlChange.bind(this);
        
        // ✅ 监听 URL 变化（组件自治）
        this._attachUrlListeners();
    }

    /**
     * 初始化公式管理器
     */
    async init() {
        if (this.isEnabled) return;
        
        // ✅ 检查功能是否启用
        const enabled = await this.checkIfEnabled();
        if (!enabled) {
            console.log('[FormulaManager] Feature is disabled, skip initialization');
            return;
        }
        
        this.isEnabled = true;

        // 读取开关状态
        try {
            const r = await chrome.storage.local.get(['formulaLatexEnabled', 'formulaMathMLEnabled']);
            this._latexEnabled = r.formulaLatexEnabled !== false;
            // MathML 暂时禁用，后续重新实现
            // this._mathmlEnabled = r.formulaMathMLEnabled === true;
            this._mathmlEnabled = false;
        } catch (e) {}

        // ✅ 始终创建降级方案的 tooltip 和反馈元素（以防全局管理器失败）
        this.createTooltip();
        this.createCopyFeedback();
        
        // 处理现有公式
        this.scanAndAttachFormulas();
        
        // 监听新增公式
        this.observeNewFormulas();
        
        // ✅ 监听功能开关变化
        this.attachStorageListener();
    }
    
    /**
     * ✅ 检查功能是否启用
     */
    async checkIfEnabled() {
        try {
            const result = await chrome.storage.local.get(['formulaLatexEnabled', 'formulaMathMLEnabled']);
            const latexOn = result.formulaLatexEnabled !== false;
            // MathML 暂时禁用，后续重新实现
            // const mathmlOn = result.formulaMathMLEnabled === true;
            const mathmlOn = false;
            return latexOn || mathmlOn;
        } catch (e) {
            console.error('[FormulaManager] Failed to check if enabled:', e);
            // 出错默认开启
            return true;
        }
    }
    
    /**
     * ✅ 监听 Storage 变化（功能开关）
     * 注：功能禁用时会直接调用 destroy()，所以这里只做日志记录
     */
    attachStorageListener() {
        this.storageListener = (changes, areaName) => {
            if (areaName !== 'local') return;
            if (changes.formulaLatexEnabled) {
                this._latexEnabled = changes.formulaLatexEnabled.newValue !== false;
            }
            if (changes.formulaMathMLEnabled) {
                this._mathmlEnabled = changes.formulaMathMLEnabled.newValue === true;
            }
        };
        
        chrome.storage.onChanged.addListener(this.storageListener);
    }
    
    /**
     * ✅ 移除 Storage 监听器
     */
    detachStorageListener() {
        if (this.storageListener) {
            chrome.storage.onChanged.removeListener(this.storageListener);
            this.storageListener = null;
        }
    }

    /**
     * 创建 tooltip 元素
     */
    createTooltip() {
        if (this.tooltip) return;
        
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'timeline-tooltip-base formula-tooltip';
        this.tooltip.setAttribute('data-placement', 'top');
        this.tooltip.textContent = this._getTooltipText();
        
        // 设置颜色（根据当前主题模式）
        const isDarkMode = document.documentElement.classList.contains('dark');
        const backgroundColor = isDarkMode ? '#ffffff' : '#0d0d0d';
        const textColor = isDarkMode ? '#1f2937' : '#ffffff';
        const borderColor = isDarkMode ? '#e5e7eb' : '#0d0d0d';
        
        this.tooltip.style.backgroundColor = backgroundColor;
        this.tooltip.style.color = textColor;
        this.tooltip.style.borderColor = borderColor;
        // 设置CSS变量（用于箭头）
        this.tooltip.style.setProperty('--timeline-tooltip-bg', backgroundColor);
        this.tooltip.style.setProperty('--timeline-tooltip-text', textColor);
        this.tooltip.style.setProperty('--timeline-tooltip-border', borderColor);
        
        document.body.appendChild(this.tooltip);
    }

    /**
     * 创建复制成功反馈元素
     */
    createCopyFeedback() {
        if (this.copyFeedback) return;
        
        this.copyFeedback = document.createElement('div');
        this.copyFeedback.className = 'timeline-copy-feedback';
        this.copyFeedback.textContent = '✓ 已复制';
        document.body.appendChild(this.copyFeedback);
    }

    /**
     * 为公式元素添加事件监听
     */
    attachFormulaListeners(formulaElement) {
        // 避免重复添加
        if (formulaElement.hasAttribute('data-latex-source')) return;
        
        // 检查元素是否在 DOM 中且可见
        if (!formulaElement.isConnected) return;
        
        // 前置提取逻辑：使用独立的 LatexExtractor
        let latexCode = FormulaSourceParser.parseLatex(formulaElement);
        if (!latexCode) {
            // 无法提取公式，不添加交互功能
            return;
        }
        
        // 特殊处理：如果是维基百科的 mwe-math-element，清理格式
        if (formulaElement.classList.contains('mwe-math-element') || formulaElement.closest('.mwe-math-element')) {
            // 如果开头是 {\displaystyle，则删除它，同时删除结尾的 }
            if (latexCode.startsWith('{\\displaystyle')) {
                latexCode = latexCode.replace(/^\{\\displaystyle\s*/, '').replace(/\}\s*$/, '').trim();
            }
        }
        
        // 存储 LaTeX 源码到元素属性（同时作为已处理标记）
        formulaElement.setAttribute('data-latex-source', latexCode);
        
        formulaElement.addEventListener('mouseenter', this.handleMouseEnter);
        formulaElement.addEventListener('mouseleave', this.handleMouseLeave);
        // ✅ mousedown 捕获阶段拦截，防止 canvas 编辑模式
        formulaElement.addEventListener('mousedown', this.handleMouseDown, true);
        // ✅ click 捕获阶段处理复制逻辑
        formulaElement.addEventListener('click', this.handleClick, true);
        
        // 添加样式类（用于 CSS 控制）
        formulaElement.classList.add('formula-interactive');
    }

    /**
     * 鼠标进入公式区域
     */
    handleMouseEnter(e) {
        const formulaElement = e.currentTarget;
        this.currentHoverElement = formulaElement;
        
        // 添加 hover 样式
        formulaElement.classList.add('formula-hover');
        
        // 显示 tooltip - 优先使用全局管理器
        if (typeof window.globalTooltipManager !== 'undefined' && window.globalTooltipManager) {
            try {
                // 使用全局管理器
                const formulaId = 'formula-' + Date.now();
                
                const tooltipText = this._getTooltipText();
                
                window.globalTooltipManager.show(
                    formulaId,
                    'formula',
                    formulaElement,
                    tooltipText,
                    { placement: 'top' }
                );
            } catch (error) {
                console.error('[FormulaManager] Failed to show tooltip via global manager:', error);
                // 降级到旧逻辑
                this.showTooltip(formulaElement);
            }
        } else {
            // 降级：使用旧逻辑
            this.showTooltip(formulaElement);
        }
    }

    /**
     * 鼠标离开公式区域
     */
    handleMouseLeave(e) {
        const formulaElement = e.currentTarget;
        
        // 移除 hover 样式
        formulaElement.classList.remove('formula-hover');
        
        // 清空当前 hover 元素
        if (this.currentHoverElement === formulaElement) {
            this.currentHoverElement = null;
        }
        
        // 隐藏 tooltip
        if (typeof window.globalTooltipManager !== 'undefined') {
            window.globalTooltipManager.hide();
        } else {
            this.hideTooltip();
        }
    }

    /**
     * mousedown 事件处理 - 阻止 canvas 编辑模式
     */
    handleMouseDown(e) {
        // 只需阻止默认行为，canvas 就不会进入编辑模式
        e.preventDefault();
    }

    /**
     * 点击公式复制（根据用户设置的格式复制 LaTeX 源码）
     */
    async handleClick(e) {
        const formulaElement = e.currentTarget;

        // 隐藏 tooltip
        if (typeof window.globalTooltipManager !== 'undefined') {
            window.globalTooltipManager.hide(true);
        } else {
            this.hideTooltip();
        }

        if (!this._latexEnabled && !this._mathmlEnabled) return;

        const bothEnabled = this._latexEnabled && this._mathmlEnabled;

        if (bothEnabled) {
            if (window.globalDropdownManager) {
                const rect = formulaElement.getBoundingClientRect();
                const dropdownWidth = 210;
                const centerX = rect.left + rect.width / 2 - dropdownWidth / 2;
                const virtualTrigger = document.createElement('div');
                virtualTrigger.style.cssText = `position:fixed;left:${centerX}px;top:${rect.top}px;width:${dropdownWidth}px;height:0;pointer-events:none;`;
                document.body.appendChild(virtualTrigger);

                window.globalDropdownManager.show({
                    trigger: virtualTrigger,
                    items: [
                        {
                            label: chrome.i18n.getMessage('mvxkpz') || '复制 LaTeX 公式',
                            icon: '📐',
                            onClick: () => this._copyAsLatex(formulaElement)
                        },
                        {
                            label: chrome.i18n.getMessage('formulaCopyMathML') || '复制 MathML 公式',
                            icon: '📊',
                            onClick: () => this._copyAsMathML(formulaElement)
                        }
                    ],
                    position: 'top-left',
                    width: dropdownWidth,
                    className: 'formula-dropdown'
                });

                setTimeout(() => virtualTrigger.remove(), 100);
            }
        } else if (this._mathmlEnabled) {
            await this._copyAsMathML(formulaElement);
        } else if (this._latexEnabled) {
            await this._copyAsLatex(formulaElement);
        }
    }

    /**
     * 复制为 LaTeX
     */
    async _copyAsLatex(formulaElement) {
        try {
            const latexCode = formulaElement.getAttribute('data-latex-source');
            if (!latexCode) {
                this.showCopyFeedback('⚠ 无法获取公式', formulaElement, true);
                return;
            }
            const result = await chrome.storage.local.get('formulaFormat');
            const formatId = result.formulaFormat || 'none';
            const formatted = applyFormulaFormat(latexCode, formatId);
            await navigator.clipboard.writeText(formatted);
            this.showCopyFeedback(chrome.i18n.getMessage('xpzmvk'), formulaElement, false);
        } catch (err) {
            console.error('复制 LaTeX 失败:', err);
            this.showCopyFeedback('⚠ 复制失败', formulaElement, true);
        }
    }

    /**
     * 复制为 MathML
     */
    async _copyAsMathML(formulaElement) {
        try {
            const mathml = FormulaSourceParser.parseMathML(formulaElement);
            if (!mathml) {
                this.showCopyFeedback('⚠ 无法获取 MathML', formulaElement, true);
                return;
            }
            if (navigator.clipboard.write) {
                const htmlContent = `<html xmlns:mml="http://www.w3.org/1998/Math/MathML"><body>${mathml}</body></html>`;
                const clipboardItem = new ClipboardItem({
                    'text/plain': new Blob([mathml], { type: 'text/plain' }),
                    'text/html': new Blob([htmlContent], { type: 'text/html' })
                });
                await navigator.clipboard.write([clipboardItem]);
            } else {
                await navigator.clipboard.writeText(mathml);
            }
            this.showCopyFeedback(chrome.i18n.getMessage('xpzmvk'), formulaElement, false);
        } catch (err) {
            console.error('复制 MathML 失败:', err);
            this.showCopyFeedback('⚠ 复制失败', formulaElement, true);
        }
    }

    /**
     * 根据开关状态返回 tooltip 文案
     */
    _getTooltipText() {
        if (this._latexEnabled && this._mathmlEnabled) {
            return chrome.i18n.getMessage('formulaCopyGeneric') || '复制公式';
        } else if (this._mathmlEnabled) {
            return chrome.i18n.getMessage('formulaCopyMathML') || '复制 MathML 公式';
        }
        return chrome.i18n.getMessage('mvxkpz') || '复制 LaTeX 公式';
    }


    /**
     * 显示 tooltip
     */
    showTooltip(formulaElement) {
        if (!this.tooltip) return;

        // 检查元素是否还在 DOM 中
        if (!formulaElement.isConnected) return;

        // 动态更新 tooltip 文案
        this.tooltip.textContent = this._getTooltipText();

        // 清除之前的隐藏定时器
        if (this.tooltipTimer) {
            clearTimeout(this.tooltipTimer);
            this.tooltipTimer = null;
        }

        // ✅ 先临时显示 tooltip（opacity 0），以便获取准确尺寸
        this.tooltip.style.visibility = 'hidden';
        this.tooltip.style.opacity = '0';
        this.tooltip.classList.add('visible');

        // 计算位置
        const rect = formulaElement.getBoundingClientRect();
        
        // 检查是否获取到有效的位置
        if (rect.width === 0 && rect.height === 0) {
            this.tooltip.classList.remove('visible');
            return;
        }
        
        const tooltipRect = this.tooltip.getBoundingClientRect();
        
        // 默认显示在上方
        let top = rect.top - tooltipRect.height - 12;
        let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        
        // 边界检查：如果上方空间不足，显示在下方
        if (top < 10) {
            top = rect.bottom + 12;
            this.tooltip.setAttribute('data-placement', 'bottom');
        } else {
            this.tooltip.setAttribute('data-placement', 'top');
        }
        
        // 左右边界检查
        if (left < 10) {
            left = 10;
        } else if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }

        // 设置位置
        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = `${top}px`;
        
        // ✅ 恢复可见性并显示
        this.tooltip.style.visibility = '';
        this.tooltip.style.opacity = '';
    }

    /**
     * 隐藏 tooltip
     */
    hideTooltip() {
        if (!this.tooltip) return;

        // 延迟隐藏，避免闪烁
        this.tooltipTimer = setTimeout(() => {
            this.tooltip.classList.remove('visible');
        }, 100);
    }

    /**
     * 显示复制反馈（使用全局 Toast 管理器）
     */
    showCopyFeedback(message, formulaElement, isError = false) {
        // 检查元素是否还在 DOM 中
        if (!formulaElement.isConnected) return;

        if (typeof window.globalToastManager !== 'undefined') {
            // 使用全局 Toast 管理器
            if (isError) {
                window.globalToastManager.error(message, formulaElement, {
                    duration: 2000
                });
            } else {
                window.globalToastManager.success(message, formulaElement, {
                    duration: 2000
                    // ✅ 使用默认的 ✓ 图标
                });
            }
        } else {
            // 降级：旧逻辑
            if (!this.copyFeedback) return;
            
            clearTimeout(this.feedbackTimer);
            this.feedbackTimer = null;
            
            this.copyFeedback.textContent = message;
            
            if (isError) {
                this.copyFeedback.style.backgroundColor = '#ef4444';
            } else {
                this.copyFeedback.style.backgroundColor = 'var(--timeline-tooltip-bg)';
            }
            
            const rect = formulaElement.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return;
            
            const feedbackRect = this.copyFeedback.getBoundingClientRect();
            const top = rect.top - feedbackRect.height - 8;
            const left = rect.left + rect.width / 2 - feedbackRect.width / 2;
            
            if (top < 10) {
                this.copyFeedback.style.top = `${rect.bottom + 8}px`;
            } else {
                this.copyFeedback.style.top = `${top}px`;
            }
            
            if (left < 10) {
                this.copyFeedback.style.left = '10px';
            } else if (left + feedbackRect.width > window.innerWidth - 10) {
                this.copyFeedback.style.left = `${window.innerWidth - feedbackRect.width - 10}px`;
            } else {
                this.copyFeedback.style.left = `${left}px`;
            }
            
            this.copyFeedback.classList.add('visible');
            
            this.feedbackTimer = setTimeout(() => {
                this.copyFeedback.classList.remove('visible');
            }, 2000);
        }
    }

    /**
     * 监听新增的公式元素
     * 使用 DOMObserverManager 的 节流+防抖 策略：
     * - 节流：持续变化时每 2 秒扫描一次（实时渲染）
     * - 防抖：变化结束后 2 秒兜底扫描（确保不遗漏）
     */
    observeNewFormulas() {
        if (this._unsubscribeObserver) return;

        // 使用 DOMObserverManager 统一管理
        if (window.DOMObserverManager) {
            this._unsubscribeObserver = window.DOMObserverManager.getInstance().subscribeBody('formula-manager', {
                callback: () => {
                    if (this.isEnabled) {
                        this.scanAndAttachFormulas();
                    }
                },
                filter: { hasAddedNodes: true },
                throttle: 2000,  // 持续变化时每 2 秒执行一次
                debounce: 2000   // 变化结束后 2 秒兜底执行
            });
        }
    }

    /**
     * 扫描并附加所有未处理的公式
     */
    scanAndAttachFormulas() {
        if (!this.isEnabled) return;
        
        // 扫描 KaTeX 公式（ChatGPT, Gemini, DeepSeek, Grok）
        const katexFormulas = document.querySelectorAll('.katex:not([data-latex-source])');
        katexFormulas.forEach(formula => this.attachFormulaListeners(formula));
        
        // 扫描豆包的 .math-inline 公式
        const doubaoFormulas = document.querySelectorAll('.math-inline:not([data-latex-source])');
        doubaoFormulas.forEach(formula => this.attachFormulaListeners(formula));
        
        // 扫描维基百科的 .mwe-math-element 公式
        const wikiFormulas = document.querySelectorAll('.mwe-math-element:not([data-latex-source])');
        wikiFormulas.forEach(formula => this.attachFormulaListeners(formula));
        
        // 扫描 MathJax 公式 - 查找 script[type="math/tex"] 的兄弟元素
        const mathJaxScripts = document.querySelectorAll('script[type^="math/tex"]');
        mathJaxScripts.forEach(script => {
            if (!script.parentElement) return;
            
            // 查找兄弟元素中的 .MathJax_SVG 或 .MathJax
            const mathJaxElement = script.parentElement.querySelector('.MathJax_SVG:not([data-latex-source]), .MathJax:not([data-latex-source])');
            if (mathJaxElement) {
                this.attachFormulaListeners(mathJaxElement);
            }
        });
    }
    
    /**
     * 强制重新扫描页面上的所有公式
     * 用于功能重新开启时，识别在关闭期间生成的新公式
     */
    rescan() {
        console.log('[FormulaManager] Rescanning all formulas...');
        this.scanAndAttachFormulas();
    }

    /**
     * 销毁公式管理器
     */
    destroy() {
        // ✅ 先设置为 false，阻止所有异步回调继续执行
        this.isEnabled = false;
        
        // ✅ 移除 Storage 监听器
        this.detachStorageListener();

        // 取消 DOMObserverManager 订阅
        if (this._unsubscribeObserver) {
            this._unsubscribeObserver();
            this._unsubscribeObserver = null;
        }

        // 清除所有其他定时器
        if (this.tooltipTimer) {
            clearTimeout(this.tooltipTimer);
            this.tooltipTimer = null;
        }

        if (this.feedbackTimer) {
            clearTimeout(this.feedbackTimer);
            this.feedbackTimer = null;
        }

        // 清理公式交互标记
        this._cleanupFormulaMarkers();

        // 移除 UI 元素
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }

        if (this.copyFeedback) {
            this.copyFeedback.remove();
            this.copyFeedback = null;
        }

        // 清理 URL 监听器
        this._detachUrlListeners();

        // 重置状态变量
        this.currentHoverElement = null;
    }
    
    // ==================== URL 变化监听（组件自治）====================
    
    /**
     * 附加 URL 变化监听器
     * 当 URL 变化时自动清理公式交互标记，无需外部调用
     */
    _attachUrlListeners() {
        try {
            window.addEventListener('popstate', this._boundHandleUrlChange);
            window.addEventListener('hashchange', this._boundHandleUrlChange);
        } catch (error) {
            console.error('[FormulaManager] Failed to attach URL listeners:', error);
        }
    }
    
    /**
     * 移除 URL 变化监听器
     */
    _detachUrlListeners() {
        try {
            window.removeEventListener('popstate', this._boundHandleUrlChange);
            window.removeEventListener('hashchange', this._boundHandleUrlChange);
        } catch (error) {
            console.error('[FormulaManager] Failed to detach URL listeners:', error);
        }
    }
    
    /**
     * 处理 URL 变化
     * ✅ 组件自治：URL 变化时自动清理公式交互标记
     */
    _handleUrlChange() {
        const newUrl = location.href;
        
        // URL 变化了，自动清理公式交互标记
        if (newUrl !== this._currentUrl) {
            this._currentUrl = newUrl;
            
            // 清理所有公式的交互标记
            this._cleanupFormulaMarkers();
        }
    }
    
    /**
     * 清理所有公式的交互标记和样式类
     */
    _cleanupFormulaMarkers() {
        const formulas = document.querySelectorAll('.katex[data-latex-source], .math-inline[data-latex-source], .mwe-math-element[data-latex-source], .MathJax_SVG[data-latex-source], .MathJax[data-latex-source]');
        formulas.forEach(formula => {
            formula.removeEventListener('mouseenter', this.handleMouseEnter);
            formula.removeEventListener('mouseleave', this.handleMouseLeave);
            formula.removeEventListener('mousedown', this.handleMouseDown, true);
            formula.removeEventListener('click', this.handleClick, true);
            formula.removeAttribute('data-latex-source');
            formula.classList.remove('formula-interactive', 'formula-hover');
        });
    }
}

