/**
 * Base Smart Enter Adapter
 * 
 * 所有平台适配器的基类
 * 定义适配器必须实现的接口
 */

class BaseSmartEnterAdapter {
    /**
     * 检测是否匹配当前页面
     * @returns {boolean|Promise<boolean>}
     */
    matches() {
        throw new Error('BaseSmartEnterAdapter.matches() must be implemented');
    }
    
    /**
     * 获取输入框的 CSS 选择器
     * @returns {string}
     */
    getInputSelector() {
        throw new Error('BaseSmartEnterAdapter.getInputSelector() must be implemented');
    }
    
    /**
     * 获取发送按钮的 CSS 选择器
     * 默认返回 null，表示该平台未提供（调用方需自行降级）
     * @returns {string|null}
     */
    getSendButtonSelector() {
        return null;
    }
    
    /**
     * 判断是否可以发送消息（输入框是否有内容）
     * @param {HTMLElement} inputElement - 输入框元素
     * @returns {boolean}
     */
    canSend(inputElement) {
        if (!inputElement) return false;
        
        // 默认实现：检查是否有非空文本
        const isContentEditable = inputElement.contentEditable === 'true';
        let text = '';
        
        if (isContentEditable) {
            text = inputElement.textContent || inputElement.innerText || '';
        } else {
            text = inputElement.value || '';
        }
        
        return text.trim().length > 0;
    }
    
    /**
     * 获取平台名称（用于日志）
     * @returns {string}
     */
    getName() {
        return this.constructor.name.replace('SmartEnterAdapter', '');
    }
    
    /**
     * 获取提示词按钮位置偏移量
     * 用于微调按钮相对于输入框左上角的位置
     * @returns {{ top: number, left: number }}
     */
    getPromptButtonOffset() {
        return { top: 0, left: 0 };
    }

    /**
     * 获取电子宠物（输入框上方动画）位置偏移量
     * 用于微调宠物相对于定位参考元素顶部的位置，负值向上
     * @returns {{ top: number, left: number }}
     */
    getAnimationOffset() {
        return { top: 0, left: 0 };
    }
}
