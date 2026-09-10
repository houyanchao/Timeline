/**
 * DeepSeek Smart Enter Adapter
 * 
 * DeepSeek 平台的智能 Enter 适配器
 */

class DeepSeekSmartEnterAdapter extends BaseSmartEnterAdapter {
    /**
     * 检测是否为 DeepSeek 页面
     */
    async matches() {
        return matchesSmartInputPlatform('deepseek');
    }
    
    /**
     * 获取输入框选择器
     * DeepSeek 使用 class="ds-scroll-area" 且 rows="2" 的 textarea
     */
    getInputSelector() {
        return 'textarea.ds-scroll-area[rows="2"]';
    }

    /**
     * 获取定位参考元素
     * 使用 .ds-scroll-area__gutters 祖先元素作为定位参考
     * @param {HTMLElement} inputElement - 输入框元素
     */
    getPositionReferenceElement(inputElement) {
        return inputElement?.closest('.ds-scroll-area__gutters') || inputElement;
    }
    
    /**
     * 获取提示词按钮位置偏移量
     */
    getPromptButtonOffset() {
        return { top: 10, left: -2 };
    }

    /**
     * 电子宠物位置偏移：DeepSeek 输入框容器上边缘偏低，宠物整体上移 5px
     */
    getAnimationOffset() {
        return { top: -5, left: 0 };
    }
}

