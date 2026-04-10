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
        return matchesSmartInputPlatform("doubao");
    }

    /**
     * 获取输入框选择器
     * 豆包使用 textarea，data-testid="chat_input_input"
     */
    getInputSelector() {
        return '#chat-input, [data-testid="chat_input_input"], textarea[placeholder*="输入"], [class*="chat-input"] textarea, [class*="input-container"] textarea, [class*="input-area"] textarea, [class*="chat-input"] [contenteditable="true"], [class*="input-container"] [contenteditable="true"]';
    }

    /**
     * 获取定位参考元素
     * 使用 input-content-container-xxx 作为定位参考
     * @param {HTMLElement} inputElement - 输入框元素
     */
    getPositionReferenceElement(inputElement) {
        return (
            inputElement?.closest('[class*="input-content-container-"]') ||
            inputElement?.closest('[class*="input-container"]') ||
            inputElement?.closest('[class*="chat-input"]') ||
            inputElement?.closest(".input-area") ||
            inputElement
        );
    }

    /**
     * 获取提示词按钮位置偏移量
     */
    getPromptButtonOffset() {
        return { top: 10, left: -2 };
    }
}
