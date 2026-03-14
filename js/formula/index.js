/**
 * Formula Module Entry Point
 * 公式复制功能的入口，自动初始化，完全独立运行
 * 
 * 特性：
 * - 完全独立，不依赖时间轴功能
 * - 自动初始化和清理
 * - 所有匹配的网站都会执行
 */

(function() {
    'use strict';
    
    // 全局 FormulaManager 实例
    let globalFormulaManager = null;
    
    /**
     * 初始化公式复制功能
     */
    async function initFormulaModule() {
        // 避免重复初始化
        if (globalFormulaManager) {
            console.log('[Formula] Already initialized');
            return;
        }
        
        // 检查依赖
        if (typeof FormulaManager === 'undefined') {
            console.error('[Formula] FormulaManager is not loaded');
            return;
        }
        
        if (typeof FormulaSourceParser === 'undefined') {
            console.error('[Formula] FormulaSourceParser is not loaded');
            return;
        }
        
        try {
            // 创建并初始化 FormulaManager（内部会检查是否启用）
            globalFormulaManager = new FormulaManager();
            await globalFormulaManager.init();
            
            console.log('[Formula] Initialized successfully');
        } catch (error) {
            console.error('[Formula] Initialization failed:', error);
        }
    }
    
    /**
     * 清理公式复制功能
     */
    function destroyFormulaModule() {
        if (globalFormulaManager) {
            try {
                globalFormulaManager.destroy();
                globalFormulaManager = null;
                console.log('[Formula] Destroyed successfully');
            } catch (error) {
                console.error('[Formula] Destroy failed:', error);
            }
        }
    }
    
    /**
     * ✅ 监听功能开关变化，动态启用/禁用公式复制功能
     */
    function setupStorageListener() {
        chrome.storage.onChanged.addListener(async (changes, areaName) => {
            if (areaName !== 'local') return;
            
            if (changes.formulaLatexEnabled || changes.formulaMathMLEnabled) {
                const result = await chrome.storage.local.get(['formulaLatexEnabled', 'formulaMathMLEnabled']);
                // MathML 暂时禁用，后续重新实现
                // const isEnabled = (result.formulaLatexEnabled !== false || result.formulaMathMLEnabled === true);
                const isEnabled = (result.formulaLatexEnabled !== false);
                
                if (isEnabled) {
                    if (!globalFormulaManager) {
                        console.log('[Formula] Feature enabled, initializing...');
                        initFormulaModule();
                    } else {
                        console.log('[Formula] Feature re-enabled, rescanning...');
                        globalFormulaManager.rescan();
                    }
                } else {
                    if (globalFormulaManager) {
                        console.log('[Formula] Feature disabled, destroying...');
                        destroyFormulaModule();
                    }
                }
            }
        });
    }
    
    // 页面加载完成后自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFormulaModule);
    } else {
        // 如果已经加载完成，立即初始化
        initFormulaModule();
    }
    
    // ✅ 设置 Storage 监听器
    setupStorageListener();
    
    // 页面卸载时清理
    window.addEventListener('beforeunload', destroyFormulaModule);
    
    // 暴露到全局（用于调试）
    window.__formulaModule__ = {
        init: initFormulaModule,
        destroy: destroyFormulaModule,
        getInstance: () => globalFormulaManager
    };
})();

