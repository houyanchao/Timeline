/**
 * InputBox Animation Manager
 *
 * 管理输入框区域的电子宠物。只允许同时开启一个动画。
 * 支持养成系统：发送消息越多，动物越多越大。
 *
 * Storage keys:
 *   activeAnimation — 当前选中的动画 id
 *   animationPetData — 养成数据 { [id]: { count, messages } }
 */

class InputBoxAnimationManager {
    constructor() {
        this._animations = new Map();
        this._active = null;
        this._storageKey = 'activeAnimation';
        this._petDataKey = 'animationPetData';
        this._petData = {};
        this._needsPlacement = false;
    }

    register(animation) {
        this._animations.set(animation.id, animation);
    }

    getAll() {
        return [...this._animations.values()];
    }

    getActiveId() {
        return this._active?.id || null;
    }

    getPetData(id) {
        return this._petData[id] || { count: 1, messages: 0 };
    }

    async init() {
        await TimelineI18n.ready();

        this._petData = await StorageAdapter.get(this._petDataKey) || {};
        const savedId = await StorageAdapter.get(this._storageKey);
        // 默认动画为巫师
        const activeId = savedId !== undefined ? savedId : 'wizard';
        if (activeId && this._animations.has(activeId)) {
            this._activate(activeId);
        }
        this._startStorageListener();
        this._startAIStateListener();
        this.pauseActive();
    }

    async toggle(id) {
        this._cancelPreview();
        if (this._active?.id === id) {
            this._deactivate();
            await StorageAdapter.set(this._storageKey, '');
        } else {
            this._deactivate();
            this._activate(id);
            await StorageAdapter.set(this._storageKey, id);
            this._startPreview();
        }
    }

    async _onMessage() {
        const id = this.getActiveId();
        if (!id) return;
        const anim = this._animations.get(id);
        if (!anim || !anim.maxCount) return;

        const data = this.getPetData(id);
        const maxMsg = anim.growAt?.[anim.growAt.length - 1];
        if (maxMsg && data.messages >= maxMsg) return;
        data.messages++;
        let newCount = 1;
        if (anim.growAt) {
            for (let i = 0; i < anim.growAt.length; i++) {
                if (data.messages >= anim.growAt[i]) newCount = i + 2;
            }
            newCount = Math.min(newCount, anim.maxCount);
        }
        const grew = newCount > data.count;
        data.count = newCount;
        this._petData[id] = data;
        await StorageAdapter.set(this._petDataKey, this._petData);

        if (grew && anim.addFollower) {
            anim.addFollower(data.count);
        }
    }

    _startPreview() {
        this._cancelPreview();
        const aiMon = window.AIStateMonitor?.getInstance();
        if (aiMon?.isGenerating) return;
        this.resumeActive();
        const duration = this._active?.marchDuration || 60;
        this._previewTimer = setTimeout(() => {
            this._previewTimer = null;
            const aiMon = window.AIStateMonitor?.getInstance();
            if (!aiMon?.isGenerating) this.pauseActive();
        }, (duration / 3) * 1000);
    }

    _cancelPreview() {
        if (this._previewTimer) {
            clearTimeout(this._previewTimer);
            this._previewTimer = null;
        }
    }

    updatePosition(referenceRect) {
        if (this._active) {
            this._active.updatePosition(referenceRect);
            // 首次拿到有效布局后，把宠物放到可见位置（而不是停在屏幕外的起点）
            if (this._needsPlacement) this._ensureVisible();
        }
    }

    hideActive() {
        if (this._active) this._active.hide();
    }

    pauseActive() {
        const el = this._active?._el;
        if (!el) return;
        if (!el.classList.contains('anim-paused')) el.classList.add('anim-paused');
        // 停下时如果恰好走到了屏幕外，把它挪回可见区域，避免"宠物不见了"
        this._ensureVisible();
    }

    /**
     * 确保领队处于可见区域内。行进动画是 translateX(-100%) → translateX(--pw + 10px)
     * 的无限循环，两端都在遮罩之外；若当前停在屏幕外，则通过 WAAPI 把进度
     * 调整到刚从左侧走进来的位置，并做一个淡入。
     */
    _ensureVisible() {
        const el = this._active?._el;
        if (!el) return;
        const group = el.querySelector('[class$="-group"]');
        if (!group || typeof group.getAnimations !== 'function') return;

        const containerWidth = el.clientWidth;
        const groupWidth = group.offsetWidth;
        if (!containerWidth || !groupWidth) return;

        const march = group.getAnimations().find(a => /march$/.test(a.animationName || ''));
        const duration = march?.effect?.getComputedTiming?.().duration;
        if (!march || !duration || typeof march.currentTime !== 'number') return;

        // 领队是最右侧那一只；遮罩两端各有 30px 渐隐
        const leaderWidth = group.lastElementChild?.offsetWidth || 0;
        const edgeFade = 30;
        const travel = containerWidth + 10 + groupWidth;
        const progress = (march.currentTime % duration) / duration;
        const groupLeft = -groupWidth + progress * travel;
        const leaderCenter = groupLeft + groupWidth - leaderWidth / 2;
        const isVisible = leaderCenter > edgeFade && leaderCenter < containerWidth - edgeFade;

        this._needsPlacement = false;
        if (isVisible) return;

        // 目标：整队刚好走出左侧遮罩；队伍太长时至少保证领队完整可见
        const targetLeft = Math.min(edgeFade, containerWidth - edgeFade - groupWidth);
        const targetProgress = Math.max(0, Math.min(1, (targetLeft + groupWidth) / travel));

        // 先关掉过渡瞬间置为透明（否则会触发一次 1→0 的过渡，随后又被反向打断，看不到淡入），
        // 强制刷新样式后同步恢复，得到干净的 0→1 淡入。全程同步、不依赖 rAF，
        // 这样后台标签页里生成结束时也不会残留 opacity:0 的内联样式。
        group.style.transition = 'none';
        group.style.opacity = '0';
        void getComputedStyle(group).opacity;
        march.currentTime = targetProgress * duration;
        group.style.transition = '';
        group.style.opacity = '';
    }

    resumeActive() {
        const el = this._active?._el;
        if (!el?.classList.contains('anim-paused')) return;
        el.classList.remove('anim-paused');
    }

    destroy() {
        this._cancelPreview();
        this._deactivate();
        if (this._storageListener) {
            StorageAdapter.removeChangeListener(this._storageListener);
            this._storageListener = null;
        }
        if (this._aiStateHandler) {
            window.removeEventListener('ai:stateChange', this._aiStateHandler);
            this._aiStateHandler = null;
        }
    }

    _activate(id) {
        const anim = this._animations.get(id);
        if (!anim) return;
        const data = this.getPetData(id);
        if (anim.growAt) {
            let correct = 1;
            for (let i = 0; i < anim.growAt.length; i++) {
                if (data.messages >= anim.growAt[i]) correct = i + 2;
            }
            data.count = Math.min(correct, anim.maxCount);
        }
        anim.create(data.count);
        this._needsPlacement = true;
        if (anim._el) {
            const clickTarget = anim._el.querySelector('[class$="-group"], [class$="-runner"]') || anim._el;
            clickTarget.addEventListener('click', () => {
                if (window.panelModal) window.panelModal.show('animation');
            });
            clickTarget.addEventListener('mouseenter', () => {
                if (window.globalTooltipManager) {
                    window.globalTooltipManager.show('anim-hint', 'button', clickTarget,
                        TimelineI18n.getMessage('animViewMore') || '更换宠物',
                        { style: 'mini', placement: 'top' }
                    );
                }
            });
            clickTarget.addEventListener('mouseleave', () => {
                if (window.globalTooltipManager) {
                    window.globalTooltipManager.hide();
                }
            });
        }
        this._active = anim;
        const aiMon = window.AIStateMonitor?.getInstance();
        if (!aiMon?.isGenerating) {
            this.pauseActive();
        }
    }

    _deactivate() {
        if (this._active) {
            this._active.destroy();
            this._active = null;
        }
        this._needsPlacement = false;
    }

    _startAIStateListener() {
        this._aiStateHandler = (e) => {
            if (e.detail.generating) {
                this._cancelPreview();
                this.resumeActive();
                this._onMessage();
            } else {
                this.pauseActive();
            }
        };
        window.addEventListener('ai:stateChange', this._aiStateHandler);
    }

    _startStorageListener() {
        this._storageListener = (changes, areaName) => {
            if (areaName !== 'local' || !changes[this._storageKey]) return;
            const newId = changes[this._storageKey].newValue;
            if (newId !== this.getActiveId()) {
                this._deactivate();
                if (newId && this._animations.has(newId)) {
                    this._activate(newId);
                }
            }
        };
        StorageAdapter.addChangeListener(this._storageListener);
    }
}

if (typeof window.inputBoxAnimationManager === 'undefined') {
    window.inputBoxAnimationManager = new InputBoxAnimationManager();
    if (typeof SnailAnimation !== 'undefined') {
        window.inputBoxAnimationManager.register(new SnailAnimation());
    }
    if (typeof ZombieAnimation !== 'undefined') {
        window.inputBoxAnimationManager.register(new ZombieAnimation());
    }
    if (typeof AntAnimation !== 'undefined') {
        window.inputBoxAnimationManager.register(new AntAnimation());
    }
    if (typeof WizardAnimation !== 'undefined') {
        window.inputBoxAnimationManager.register(new WizardAnimation());
    }
}
