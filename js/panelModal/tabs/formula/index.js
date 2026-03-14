/**
 * FormulaTab - 公式复制功能的设置面板
 * 
 * 提供公式复制相关的用户配置界面，包括：
 * - LaTeX 复制开关及输出格式选择
 * - MathML 复制开关（当前通过 CSS 隐藏，后续重新实现）
 */

class FormulaTab extends BaseTab {
    constructor() {
        super();
        this.id = 'formula';
        this.name = chrome.i18n.getMessage('kpxvmz');
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 3H4l5 8-5 8h10"/>
            <path d="M14 15l3 3 5-6"/>
        </svg>`;
    }
    
    /**
     * 构建设置面板 DOM 结构
     * 包含 MathML 开关区域（CSS 隐藏）和 LaTeX 开关区域（含格式选项）
     */
    render() {
        const container = document.createElement('div');
        container.className = 'formula-settings';
        
        const formatOptionsHtml = FORMULA_FORMATS.map(format => `
            <label class="format-option">
                <input type="radio" name="formula-format" value="${format.id}">
                <span class="format-radio"></span>
                <span class="format-label">${format.label}</span>
            </label>
        `).join('');
        
        container.innerHTML = `
            <div class="setting-section mathml-section-hidden">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">${chrome.i18n.getMessage('formulaMathMLTitle') || '复制 MathML 公式'}</div>
                        <div class="setting-hint">${chrome.i18n.getMessage('formulaMathMLHint') || '点击公式复制为 MathML 格式，可直接粘贴到 Word'}</div>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" id="formula-mathml-toggle">
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>
            </div>
            
            <div class="setting-section">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">${chrome.i18n.getMessage('formulaLatexTitle') || '复制 LaTeX 公式'}</div>
                        <div class="setting-hint">${chrome.i18n.getMessage('formulaLatexHint') || '点击公式复制为 LaTeX 格式'}</div>
                        <div class="format-inline" id="format-section" style="display: none;">
                            <div class="format-inline-title">${chrome.i18n.getMessage('formulaFormatTitle') || '选择复制格式'}</div>
                            <div class="format-options">
                                ${formatOptionsHtml}
                            </div>
                        </div>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" id="formula-latex-toggle">
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>
            </div>
        `;
        
        return container;
    }
    
    /**
     * Tab 激活后初始化：从 Storage 读取开关状态并绑定事件
     * - 读取 LaTeX / MathML 开关状态和复制格式偏好
     * - 绑定开关切换和格式选择的 change 事件
     * - 当所有开关都关闭时，同步禁用整个公式复制功能
     */
    async mounted() {
        super.mounted();
        
        const latexToggle = document.getElementById('formula-latex-toggle');
        const mathmlToggle = document.getElementById('formula-mathml-toggle');
        const formatSection = document.getElementById('format-section');
        const formatRadios = document.querySelectorAll('input[name="formula-format"]');
        
        if (!latexToggle || !mathmlToggle) return;
        
        try {
            const result = await chrome.storage.local.get(['formulaLatexEnabled', 'formulaMathMLEnabled', 'formulaFormat']);
            
            const latexEnabled = result.formulaLatexEnabled !== false;
            const mathmlEnabled = result.formulaMathMLEnabled === true;
            
            latexToggle.checked = latexEnabled;
            mathmlToggle.checked = mathmlEnabled;
            
            if (formatSection) {
                formatSection.style.display = latexEnabled ? 'block' : 'none';
            }
            
            const currentFormat = result.formulaFormat || 'none';
            formatRadios.forEach(radio => {
                radio.checked = radio.value === currentFormat;
            });
        } catch (e) {
            console.error('[FormulaTab] Failed to load state:', e);
            latexToggle.checked = true;
            mathmlToggle.checked = false;
        }
        
        this.addEventListener(latexToggle, 'change', async (e) => {
            try {
                const enabled = e.target.checked;
                await chrome.storage.local.set({ formulaLatexEnabled: enabled });
                if (formatSection) {
                    formatSection.style.display = enabled ? 'block' : 'none';
                }
            } catch (e) {
                console.error('[FormulaTab] Failed to save state:', e);
                latexToggle.checked = !latexToggle.checked;
            }
        });
        
        this.addEventListener(mathmlToggle, 'change', async (e) => {
            try {
                const enabled = e.target.checked;
                await chrome.storage.local.set({ formulaMathMLEnabled: enabled });
            } catch (e) {
                console.error('[FormulaTab] Failed to save state:', e);
                mathmlToggle.checked = !mathmlToggle.checked;
            }
        });
        
        formatRadios.forEach(radio => {
            this.addEventListener(radio, 'change', async (e) => {
                try {
                    await chrome.storage.local.set({ formulaFormat: e.target.value });
                } catch (e) {
                    console.error('[FormulaTab] Failed to save format:', e);
                }
            });
        });
    }
    
    /**
     * Tab 卸载时清理所有事件监听和 DOM 引用
     */
    unmounted() {
        super.unmounted();
    }
}
