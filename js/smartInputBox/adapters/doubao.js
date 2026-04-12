/**
 * Doubao (豆包) Smart Enter Adapter
 * 
 * 豆包平台的智能输入适配器
 */

class DoubaoSmartEnterAdapter extends BaseSmartEnterAdapter {
    /**
     * 检测是否为豆包页面
     */
    matches() {
        return matchesSmartInputPlatform('doubao');
    }
    
    /**
     * 获取输入框选择器
     * 豆包使用 textarea.semi-input-textarea
     */
    getInputSelector() {
        return 'textarea.semi-input-textarea';
    }

    /**
     * 获取定位参考元素
     * 使用 input-content-container-xxx 作为定位参考
     * @param {HTMLElement} inputElement - 输入框元素
     */
    getPositionReferenceElement(inputElement) {
        return inputElement?.closest('[class*="input-content-container-"]') || inputElement;
    }
    
    /**
     * 获取提示词按钮位置偏移量
     */
    getPromptButtonOffset() {
        return { top: 10, left: -2 };
    }
}


