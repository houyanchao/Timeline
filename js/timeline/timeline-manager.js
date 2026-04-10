/**
 * Timeline Manager - Core Class
 *
 * This is the heart of the timeline extension
 * Manages all UI, interactions, virtualization, and state
 *
 * Responsibilities:
 * - Timeline UI injection and management
 * - Marker calculation and rendering
 * - Event handling (click, hover, long-press)
 * - Scroll synchronization
 * - Tooltip management
 * - Star/highlight persistence
 * - Virtual rendering for performance
 */

class TimelineManager {
    constructor(adapter) {
        if (!adapter) {
            throw new Error("TimelineManager requires a SiteAdapter");
        }
        this.adapter = adapter;
        this.scrollContainer = null;
        this.conversationContainer = null;
        this.markers = [];
        this.activeTurnId = null;
        this.ui = { timelineBar: null, tooltip: null, track: null, trackContent: null };

        // ✅ 上次渲染时的节点状态（用于变化检测，决定是否需要重新计算）
        this._renderedNodeCount = 0;
        this._renderedNodeIds = new Set();

        this.mutationObserver = null;
        this.resizeObserver = null;
        this.intersectionObserver = null;
        this.visibleUserTurns = new Set();

        // DOMObserverManager 取消订阅函数
        this._unsubscribeDomCheck = null; // 合并 hideState + conflicting
        this._unsubscribeTheme = null;

        // Event handlers
        this.onTimelineBarClick = null;
        this.onScroll = null;
        this.onTimelineBarOver = null;
        this.onTimelineBarOut = null;
        this.onTimelineBarFocusIn = null;
        this.onTimelineBarFocusOut = null;
        // ✅ 移除：tooltip hover 事件由 GlobalTooltipManager 管理
        this.onWindowResize = null;
        this.onTimelineWheel = null;
        this.onStorage = null;
        this.onVisualViewportResize = null;
        // ✅ 长按相关事件处理器
        this.startLongPress = null;
        this.checkLongPressMove = null;
        this.cancelLongPress = null;
        // ✅ 键盘导航
        this.onKeyDown = null;
        // ✅ 键盘导航功能启用状态（内存缓存，默认开启）
        this.arrowKeysNavigationEnabled = true;
        // ✅ 平台设置（内存缓存）
        this.platformSettings = {};
        // Timers and RAF IDs
        this.scrollRafId = null;
        this.activeChangeTimer = null;
        // ✅ 移除：tooltipHideTimer 由 GlobalTooltipManager 管理
        this.showRafId = null;
        this.resizeIdleTimer = null;
        this.resizeIdleRICId = null;
        this.zeroTurnsTimer = null;

        // Padding 管理：AI 生成中不更新，生成结束后更新
        this._pendingPaddingUpdate = null;
        this.debouncedUpdateScrollPadding = this.debounce((lastOffsetTop, cleanMaxScrollTop) => {
            this._updateScrollPadding(lastOffsetTop, cleanMaxScrollTop);
        }, 500);

        // Active state management
        this.lastActiveChangeTime = 0;
        this.pendingActiveId = null;

        // Tooltip and measurement
        this.measureEl = null;
        this.truncateCache = new Map();
        this.measureCanvas = null;
        this.measureCtx = null;

        // ✅ 优化：Tooltip 配置缓存（避免频繁读取 CSS 变量）
        this.tooltipConfigCache = null;

        // ✅ 优化：Tooltip 更新防抖（快速移动时避免闪烁）
        this.tooltipUpdateDebounceTimer = null;

        // Long-canvas scrollable track (Linked mode)
        this.scale = 1;
        this.contentHeight = 0;
        this.yPositions = [];
        this.visibleRange = { start: 0, end: -1 };
        this.firstUserTurnOffset = 0;
        this.contentSpanPx = 1;
        this.usePixelTop = false;
        this._cssVarTopSupported = null;

        // ✅ 紧凑模式状态
        this.isCompactMode = false;

        // ✅ 节点激活配置
        this.ACTIVATE_AHEAD = 120; // 提前激活距离（像素）：scrollTop >= offsetTop - 120 时激活
        // 注：滚动偏移量已移至 adapter.getScrollOffset()，各平台可自定义

        // Markers and rendering
        this.markersVersion = 0;

        // Performance debugging
        this.debugPerf = false;
        try {
            this.debugPerf = localStorage.getItem("chatgptTimelineDebugPerf") === "1";
        } catch {}

        this.debouncedRecalculateAndRender = this.debounce(
            this.recalculateAndRenderMarkers,
            TIMELINE_CONFIG.DEBOUNCE_DELAY,
        );

        // Star/Highlight feature state
        this.starred = new Set();
        this.markerMap = new Map();
        this.conversationId = this.adapter.extractConversationId(location.pathname);
        // 临时存储加载的收藏 index（在 markers 创建前）
        this.starredIndexes = new Set();

        // ✅ Pin（标记）功能状态
        this.pinned = new Set();
        this.pinnedIndexes = new Set();

        // ✅ URL 到网站信息的映射字典（包含名称和 logo）
        // 使用 constants.js 中的函数生成 siteNameMap
        this.siteNameMap = getSiteNameMap();

        // ✅ 文件夹管理器（用于收藏功能）
        this.folderManager = null;
        // 延迟初始化，确保 FolderManager 类已加载
        setTimeout(() => {
            if (typeof FolderManager !== "undefined") {
                this.folderManager = new FolderManager(StorageAdapter);
            }
        }, 0);

        // ✅ 健康检查定时器
        this.healthCheckInterval = null;
    }

    perfStart(name) {
        if (!this.debugPerf) return;
        try {
            performance.mark(`tg-${name}-start`);
        } catch {}
    }

    perfEnd(name) {
        if (!this.debugPerf) return;
        try {
            performance.mark(`tg-${name}-end`);
            performance.measure(`tg-${name}`, `tg-${name}-start`, `tg-${name}-end`);
        } catch {}
    }

    async init() {
        const elementsFound = await this.findCriticalElements();
        if (!elementsFound) return;

        // ✅ 同步深色模式状态到 html 元素
        this.syncDarkModeClass();

        this.injectTimelineUI();
        this.setupEventListeners();
        this.setupObservers();

        // Load persisted star markers for current conversation
        this.conversationId = this.adapter.extractConversationId(location.pathname);
        await this.loadStars();
        // ✅ 加载标记数据
        await this.loadPins();
        // ✅ 加载键盘导航功能状态
        await this.loadArrowKeysNavigationState();
        // ✅ 加载平台设置
        await this.loadPlatformSettings();

        // Trigger initial rendering after a short delay to ensure DOM is stable
        // This fixes the bug where nodes don't appear until scroll
        setTimeout(async () => {
            this.recalculateAndRenderMarkers();
            // 初始化后手动触发一次滚动同步，确保激活状态正确
            this.scheduleScrollSync();

            // ✅ 延迟二次计算：页面初始化后某些元素可能还没展开
            setTimeout(() => this.recalculateAndRenderMarkers(), 500);

            // ✅ 等待时间轴渲染完成后，再显示收藏按钮
            // 使用双重 requestAnimationFrame 确保浏览器完成绘制
            requestAnimationFrame(() => {
                requestAnimationFrame(async () => {
                    // 此时浏览器已经完成时间轴的渲染
                    await this.updateStarredBtnVisibility();
                });
            });

            // ✅ 启动健康检查
            this.startHealthCheck();
        }, TIMELINE_CONFIG.INITIAL_RENDER_DELAY);
    }

    async findCriticalElements() {
        const selector = this.adapter.getUserMessageSelector();
        const firstTurn = await this.waitForElement(selector);
        if (!firstTurn) return false;

        this.conversationContainer = this.adapter.findConversationContainer(firstTurn);
        if (!this.conversationContainer) return false;

        let parent = this.conversationContainer;
        while (parent && parent !== document.body) {
            const style = window.getComputedStyle(parent);
            const overflowY = style.overflowY;
            if (overflowY === "auto" || overflowY === "scroll") {
                this.scrollContainer = parent;
                break;
            }
            parent = parent.parentElement;
        }

        // 如果没找到滚动容器，使用 document 作为备用（通用方案）
        if (!this.scrollContainer) {
            this.scrollContainer = document.scrollingElement || document.documentElement || document.body;
        }

        return this.scrollContainer !== null;
    }

    injectTimelineUI() {
        // ✅ 创建或获取包装容器
        let wrapper = document.querySelector(".ait-chat-timeline-wrapper");
        if (!wrapper) {
            wrapper = document.createElement("div");
            wrapper.className = "ait-chat-timeline-wrapper";
            document.body.appendChild(wrapper);
        }
        this.ui.wrapper = wrapper;

        // Idempotent: ensure bar exists, then ensure track + content exist
        let timelineBar = wrapper.querySelector(".ait-chat-timeline-bar");
        if (!timelineBar) {
            timelineBar = document.createElement("div");
            timelineBar.className = "ait-chat-timeline-bar";
            wrapper.appendChild(timelineBar);
        }
        this.ui.timelineBar = timelineBar;

        // Apply site-specific position from adapter to wrapper
        const position = this.adapter.getTimelinePosition();
        if (position) {
            if (position.top) wrapper.style.top = position.top;

            // ✅ 支持左右两侧定位
            if (position.right) {
                wrapper.style.right = position.right;
                wrapper.style.left = "auto"; // 清除可能存在的 left 样式
            } else if (position.left) {
                wrapper.style.left = position.left;
                wrapper.style.right = "auto"; // 清除可能存在的 right 样式
            }

            if (position.bottom) {
                // ✅ 修复：确保高度至少为 200px，避免窗口太小导致时间轴高度为 0
                // 使用 max() 函数确保即使 calc 结果为负数，也会有最小高度
                timelineBar.style.height = `max(200px, calc(100vh - ${position.top} - ${position.bottom}))`;
            }
        }
        // Track + content
        let track = this.ui.timelineBar.querySelector(".ait-timeline-track");
        if (!track) {
            track = document.createElement("div");
            track.className = "ait-timeline-track";
            this.ui.timelineBar.appendChild(track);
        }
        let trackContent = track.querySelector(".ait-timeline-track-content");
        if (!trackContent) {
            trackContent = document.createElement("div");
            trackContent.className = "ait-timeline-track-content";
            track.appendChild(trackContent);
        }
        this.ui.track = track;
        this.ui.trackContent = trackContent;

        // ✅ 重新设计：测量元素应该模拟内容区的样式
        if (!this.measureEl) {
            const m = document.createElement("div");
            m.setAttribute("aria-hidden", "true");
            m.style.position = "fixed";
            m.style.left = "-9999px";
            m.style.top = "0px";
            m.style.visibility = "hidden";
            m.style.pointerEvents = "none";

            // ✅ 关键：模拟 tooltip 内容区的样式（使用固定值）
            Object.assign(m.style, {
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                fontSize: "13px",
                lineHeight: "18px",
                // ✅ 内容区的 padding（重要！）
                padding: "10px 12px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxWidth: "none",
                display: "block",
            });

            document.body.appendChild(m);
            this.measureEl = m;
        }
        // Create canvas for text layout based truncation (primary)
        if (!this.measureCanvas) {
            this.measureCanvas = document.createElement("canvas");
            this.measureCtx = this.measureCanvas.getContext("2d");
        }

        // ✅ 优化：延迟到下一帧缓存 CSS 变量（确保样式已应用）
        requestAnimationFrame(() => {
            this.cacheTooltipConfig();
        });

        // ✅ 添加提问列表按钮（在收藏按钮上方）
        let questionListBtn = document.querySelector(".ait-question-list-btn");
        if (!questionListBtn) {
            questionListBtn = document.createElement("button");
            questionListBtn.className = "ait-question-list-btn";
            questionListBtn.innerHTML =
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>';
            questionListBtn.setAttribute("aria-label", chrome.i18n.getMessage("questionListTitle") || "Questions");
            questionListBtn.style.display = "none";

            questionListBtn.addEventListener("mouseenter", () => {
                window.globalTooltipManager.show(
                    "question-list-btn",
                    "button",
                    questionListBtn,
                    chrome.i18n.getMessage("questionListTitle") || "Questions",
                    { placement: "left" },
                );
            });
            questionListBtn.addEventListener("mouseleave", () => {
                window.globalTooltipManager.hide();
            });

            wrapper.appendChild(questionListBtn);
        }
        this.ui.questionListBtn = questionListBtn;

        // ✅ 绑定提问列表面板到 wrapper
        if (window.questionListPopup) {
            window.questionListPopup.bind(wrapper, timelineBar);
        }

        // ✅ 添加收藏按钮（在 timeline-bar 下方 10px 处，垂直居中对齐）
        let starredBtn = document.querySelector(".timeline-starred-btn");
        if (!starredBtn) {
            starredBtn = document.createElement("button");
            starredBtn.className = "timeline-starred-btn";
            starredBtn.innerHTML =
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
            starredBtn.setAttribute("aria-label", chrome.i18n.getMessage("hkjvnr"));
            // ✅ 初始状态：隐藏，等时间轴渲染完成后再显示
            starredBtn.style.display = "none";

            // 鼠标悬停事件 - 使用全局 Tooltip 管理器
            starredBtn.addEventListener("mouseenter", async () => {
                window.globalTooltipManager.show(
                    "starred-btn",
                    "button",
                    starredBtn,
                    chrome.i18n.getMessage("vnkxpm"),
                    { placement: "left" },
                );
            });

            starredBtn.addEventListener("mouseleave", () => {
                window.globalTooltipManager.hide();
            });

            // ✅ 将收藏按钮添加到包装容器内（时间轴的兄弟元素）
            wrapper.appendChild(starredBtn);
        }
        // 如果按钮已存在，直接复用，保留原有事件监听器
        this.ui.starredBtn = starredBtn;

        // ✅ 添加闪记按钮（在收藏按钮下方）
        let notepadBtn = document.querySelector(".ait-notepad-btn");
        if (!notepadBtn) {
            notepadBtn = document.createElement("button");
            notepadBtn.className = "ait-notepad-btn";
            notepadBtn.innerHTML =
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V16a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1.3A7 7 0 0 0 12 2Z"/></svg>';
            notepadBtn.setAttribute("aria-label", "Notepad");
            notepadBtn.style.display = "none";

            notepadBtn.addEventListener("mouseenter", () => {
                window.globalTooltipManager.show(
                    "notepad-btn",
                    "button",
                    notepadBtn,
                    chrome.i18n.getMessage("notepadTitle") || "闪记",
                    { placement: "left" },
                );
            });

            notepadBtn.addEventListener("mouseleave", () => {
                window.globalTooltipManager.hide();
            });

            wrapper.appendChild(notepadBtn);
        }
        // 恢复激活状态（跨页面导航后按钮重建时同步）
        if (window.notepadManager && window.notepadManager.isOpen) {
            notepadBtn.classList.add("active");
        }
        this.ui.notepadBtn = notepadBtn;

        // ✅ 收藏按钮使用相对定位，不需要动态计算位置

        // ✅ 添加收藏整个聊天的按钮（插入到平台原生UI中）
        this.injectStarChatButton();
    }

    // ✅ 收起/展开按钮的 SVG 图标常量
    static TOGGLE_ICON_COLLAPSE =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>'; // >> 收起
    static TOGGLE_ICON_EXPAND =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>'; // << 展开

    /**
     * ✅ 注入时间轴收起/展开切换按钮
     */
    injectToggleButton() {
        // 已存在则跳过
        if (this.ui.toggleBtn) return;

        let toggleBtn = document.querySelector(".timeline-toggle-btn");
        const isNewlyCreated = !toggleBtn;

        if (isNewlyCreated) {
            toggleBtn = document.createElement("button");
            toggleBtn.className = "timeline-toggle-btn";
            toggleBtn.innerHTML = TimelineManager.TOGGLE_ICON_COLLAPSE; // 默认展开状态，显示 >> 收起按钮

            // ✅ 使用事件委托（解决长时间停留后事件失效问题）
            window.eventDelegateManager.on("click", ".timeline-toggle-btn", () => {
                this.toggleTimelineVisibility();
            });

            // hover 事件由 setupToggleButtonHover 统一管理

            document.body.appendChild(toggleBtn);
        }

        this.ui.toggleBtn = toggleBtn;

        // 只在首次创建时恢复状态和绑定 wrapper hover 事件
        if (isNewlyCreated) {
            this.restoreTimelineVisibility();
            this.setupToggleButtonHover();
        }
    }

    /**
     * ✅ 设置 wrapper hover 时显示收起按钮
     * 优化：显示后3秒内如果用户未 hover 到按钮上，自动隐藏
     *
     * 使用事件委托解决页面长时间停留后事件失效的问题
     */
    setupToggleButtonHover() {
        if (!this.ui.wrapper || !this.ui.toggleBtn) return;

        // 使用实例属性存储定时器
        this._autoHideTimer = null;

        // 清除自动隐藏定时器
        const clearAutoHideTimer = () => {
            if (this._autoHideTimer) {
                clearTimeout(this._autoHideTimer);
                this._autoHideTimer = null;
            }
        };

        // 隐藏按钮
        const hideButton = () => {
            clearAutoHideTimer();
            if (this.ui.toggleBtn) {
                this.ui.toggleBtn.classList.remove("visible");
            }
        };

        // 1. 鼠标进入时间轴：显示按钮，启动3秒自动隐藏
        this.ui.wrapper.addEventListener("mouseenter", () => {
            if (!this.ui.wrapper || !this.ui.toggleBtn) return;

            // 只有时间轴展开时且应该显示按钮时才需要通过 hover 显示按钮
            if (!this.ui.wrapper.classList.contains("ait-collapsed") && this.shouldShowCollapseButton()) {
                clearAutoHideTimer();
                this.ui.toggleBtn.classList.add("visible");

                // 3秒后自动隐藏（如果用户没有 hover 到按钮上）
                this._autoHideTimer = setTimeout(() => {
                    if (this.ui.toggleBtn && !this.ui.toggleBtn.matches(":hover")) {
                        hideButton();
                    }
                }, 3000);
            }
        });

        // 2. 鼠标离开时间轴：延迟隐藏，避免鼠标移到按钮时闪烁
        this.ui.wrapper.addEventListener("mouseleave", () => {
            if (!this.ui.toggleBtn) return;

            setTimeout(() => {
                // 如果鼠标已经在 toggleBtn 上，不移除
                if (this.ui.toggleBtn && !this.ui.toggleBtn.matches(":hover")) {
                    hideButton();
                }
            }, 50);
        });

        // 3. 鼠标进入按钮：取消自动隐藏
        this.ui.toggleBtn.addEventListener("mouseenter", () => {
            clearAutoHideTimer();
        });

        // 4. 鼠标离开按钮：隐藏
        this.ui.toggleBtn.addEventListener("mouseleave", () => {
            if (!this.ui.wrapper || !this.ui.toggleBtn) return;

            // 如果鼠标回到 wrapper 上，重新启动定时器
            if (this.ui.wrapper.matches(":hover")) {
                this._autoHideTimer = setTimeout(() => {
                    if (this.ui.toggleBtn && !this.ui.toggleBtn.matches(":hover")) {
                        hideButton();
                    }
                }, 3000);
            } else {
                hideButton();
            }
        });
    }

    /**
     * ✅ 判断是否应该显示收起按钮
     * 条件：消息体右侧距离浏览器右边框 < n px
     */
    shouldShowCollapseButton() {
        try {
            const selector = this.adapter.getUserMessageSelector();
            if (!selector || !this.conversationContainer) return true;

            // 只查第一个消息体，所有消息布局一致
            const firstMsg = this.conversationContainer.querySelector(selector);
            if (!firstMsg) return true;

            const rect = firstMsg.getBoundingClientRect();
            if (rect.width === 0) return true; // 不可见时默认显示

            // 计算距离浏览器右边框的距离
            const distanceToRight = window.innerWidth - rect.right;

            // 距离小于 n px 时显示收起按钮
            return distanceToRight < 200;
        } catch (e) {
            return true;
        }
    }

    /**
     * ✅ 切换时间轴显示/隐藏（用户点击时调用）
     */
    toggleTimelineVisibility() {
        if (!this.ui.wrapper || !this.ui.toggleBtn) return;

        const isCollapsed = this.ui.wrapper.classList.toggle("ait-collapsed");
        this.updateToggleButtonIcon(isCollapsed);

        // 收起时关闭闪记面板
        if (isCollapsed && window.notepadManager && window.notepadManager.isOpen) {
            window.notepadManager.close();
        }

        // 保存状态到 localStorage
        try {
            localStorage.setItem("ait-timeline-collapsed", isCollapsed ? "1" : "0");
        } catch (e) {}
    }

    /**
     * ✅ 恢复时间轴显示状态（初始化时调用）
     */
    restoreTimelineVisibility() {
        try {
            const isCollapsed = localStorage.getItem("ait-timeline-collapsed") === "1";
            if (isCollapsed && this.ui.wrapper && this.ui.toggleBtn) {
                this.ui.wrapper.classList.add("ait-collapsed");
                this.updateToggleButtonIcon(true);
            }
        } catch (e) {}
    }

    /**
     * ✅ 更新切换按钮图标
     */
    updateToggleButtonIcon(isCollapsed) {
        if (!this.ui.toggleBtn) return;
        this.ui.toggleBtn.innerHTML = isCollapsed
            ? TimelineManager.TOGGLE_ICON_EXPAND
            : TimelineManager.TOGGLE_ICON_COLLAPSE;
        this.ui.toggleBtn.classList.toggle("collapsed", isCollapsed);
    }

    /**
     * ✅ 注入收藏聊天按钮（原生插入模式）
     */
    async injectStarChatButton() {
        // 1. 获取Adapter提供的目标元素
        const targetElement = this.adapter.getStarChatButtonTarget?.();

        // 如果没有目标元素，不显示按钮
        if (!targetElement) {
            return;
        }

        // 2. 检查是否已存在按钮
        let starChatBtn = document.querySelector(".ait-timeline-star-chat-btn-native");

        if (starChatBtn) {
            // ✅ 按钮已存在，只更新状态，不重建（避免事件监听器丢失）
            const isStarred = await this.isChatStarred();
            const svg = starChatBtn.querySelector("svg");
            if (svg) {
                svg.setAttribute("fill", isStarred ? "rgb(255, 125, 3)" : "none");
                svg.setAttribute("stroke", isStarred ? "rgb(255, 125, 3)" : "currentColor");
            }
            // 保存引用
            this.ui.starChatBtn = starChatBtn;
            return;
        }

        // 3. 创建新按钮
        starChatBtn = document.createElement("button");
        starChatBtn.className = "ait-timeline-star-chat-btn-native";

        // 4. 检查收藏状态并设置图标
        const isStarred = await this.isChatStarred();
        starChatBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${isStarred ? "rgb(255, 125, 3)" : "none"}" stroke="${isStarred ? "rgb(255, 125, 3)" : "currentColor"}" stroke-width="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
        `;

        // 5. 设置基础样式（适配原生UI）
        const isDeepSeek = this.adapter.constructor.name === "DeepSeekAdapter";
        starChatBtn.style.cssText = `
            width: 36px;
            height: 36px;
            padding: 0;
            background: transparent;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s;
            ${isDeepSeek ? "position: absolute; top: 14px; right: 56px; z-index: 1000;" : "position: relative;"}
        `;

        // 6. Hover效果和tooltip - 直接绑定（mouseenter/mouseleave 不冒泡）
        starChatBtn.addEventListener("mouseenter", async () => {
            starChatBtn.style.backgroundColor = "rgba(0, 0, 0, 0.05)";

            const isStarred = await this.isChatStarred();
            const tooltipText = isStarred ? chrome.i18n.getMessage("bpxjkw") : chrome.i18n.getMessage("zmvkpx");

            window.globalTooltipManager?.show("star-chat-btn", "button", starChatBtn, tooltipText, {
                placement: "bottom",
            });
        });

        starChatBtn.addEventListener("mouseleave", () => {
            starChatBtn.style.backgroundColor = "transparent";
            window.globalTooltipManager?.hide();
        });

        // 7. 点击事件 - 使用事件委托（click 可以冒泡）
        this._setupStarChatBtnClickEvent();

        // 9. 插入按钮到原生UI
        targetElement.parentNode.insertBefore(starChatBtn, targetElement);

        // 10. 保存引用
        this.ui.starChatBtn = starChatBtn;
    }

    /**
     * ✅ 设置收藏聊天按钮的点击事件委托
     * 使用事件委托解决页面长时间停留后点击事件失效的问题
     */
    _setupStarChatBtnClickEvent() {
        const edm = window.eventDelegateManager;
        if (!edm) {
            console.warn("[TimelineManager] eventDelegateManager not available for star chat btn");
            return;
        }

        // 点击：切换收藏状态
        edm.on("click", ".ait-timeline-star-chat-btn-native", async (e, btn) => {
            const result = await this.toggleChatStar();

            if (result && result.success) {
                const nowStarred = await this.isChatStarred();
                const svg = btn.querySelector("svg");
                if (svg) {
                    svg.setAttribute("fill", nowStarred ? "rgb(255, 125, 3)" : "none");
                    svg.setAttribute("stroke", nowStarred ? "rgb(255, 125, 3)" : "currentColor");
                }

                // 更新 tooltip 文本
                const newText = nowStarred ? chrome.i18n.getMessage("bpxjkw") : chrome.i18n.getMessage("zmvkpx");
                window.globalTooltipManager?.updateContent(newText);

                // 显示 toast
                if (window.globalToastManager) {
                    const toastColor = {
                        light: { backgroundColor: "#0d0d0d", textColor: "#ffffff", borderColor: "#262626" },
                        dark: { backgroundColor: "#ffffff", textColor: "#1f2937", borderColor: "#d1d5db" },
                    };

                    if (result.action === "star") {
                        window.globalToastManager.success(chrome.i18n.getMessage("kxpmzv"), null, {
                            color: toastColor,
                        });
                    } else if (result.action === "unstar") {
                        window.globalToastManager.info(chrome.i18n.getMessage("pzmvkx"), null, { color: toastColor });
                    }
                }
            }
        });
    }

    /**
     * ✅ 显示编辑对话框（使用全局 Input Modal）
     */
    async showEditDialog(currentText) {
        if (!window.globalInputModal) {
            console.error("[TimelineManager] globalInputModal not available");
            return null;
        }

        return await window.globalInputModal.show({
            title: chrome.i18n.getMessage("vkpxzm"),
            defaultValue: currentText,
            placeholder: chrome.i18n.getMessage("zmxvkp"),
            required: true,
            requiredMessage: chrome.i18n.getMessage("pzmkvx"),
            maxLength: 100,
        });
    }

    /**
     * ✅ 检查当前聊天是否已被收藏
     */
    async isChatStarred() {
        try {
            const urlWithoutProtocol = location.href.replace(/^https?:\/\//, "");
            const key = `chatTimelineStar:${urlWithoutProtocol}:-1`;
            return await StarStorageManager.exists(key);
        } catch (e) {
            return false;
        }
    }

    /**
     * ✅ 切换聊天收藏状态
     */
    async toggleChatStar() {
        try {
            const urlWithoutProtocol = location.href.replace(/^https?:\/\//, "");
            const key = `chatTimelineStar:${urlWithoutProtocol}:-1`;
            const existingValue = await StarStorageManager.findByKey(key);

            if (existingValue) {
                // 已收藏，取消收藏
                await StarStorageManager.remove(key);
                return { success: true, action: "unstar" };
            } else {
                // 未收藏，显示输入主题弹窗（带文件夹选择器）
                if (!window.starInputModal) {
                    console.error("[TimelineManager] starInputModal not available");
                    return { success: false, action: null };
                }

                // 获取默认主题（通过 Adapter 提供）
                const defaultTheme = this.adapter.getDefaultChatTheme?.() || "";

                const result = await window.starInputModal.show({
                    title: chrome.i18n.getMessage("zmvkpx"),
                    defaultValue: defaultTheme,
                    placeholder: chrome.i18n.getMessage("zmxvkp"),
                    folderManager: this.folderManager,
                    defaultFolderId: null,
                });

                if (!result) {
                    // 用户取消了
                    return { success: false, action: "cancelled" };
                }

                // 添加收藏
                // ✅ 限制收藏文字长度为前100个字符
                const truncatedTheme = this.truncateText(result.value, 100);
                const value = {
                    key,
                    url: location.href,
                    urlWithoutProtocol: urlWithoutProtocol,
                    index: -1,
                    question: truncatedTheme,
                    timestamp: Date.now(),
                    folderId: result.folderId || null,
                };
                await StarStorageManager.add(value);

                // ✅ 不再需要手动更新收藏列表UI，StarredTab 会自动监听存储变化
                return { success: true, action: "star" };
            }
        } catch (e) {
            console.error("Failed to toggle chat star:", e);
            return { success: false, action: null };
        }
    }

    /**
     * ✅ 显示主题输入对话框（使用全局 Input Modal）
     */
    async showThemeInputDialog() {
        if (!window.globalInputModal) {
            console.error("[TimelineManager] globalInputModal not available");
            return null;
        }

        // 获取默认主题（通过 Adapter 提供）
        const defaultTheme = this.adapter.getDefaultChatTheme?.() || "";

        return await window.globalInputModal.show({
            title: chrome.i18n.getMessage("qwxpzm"),
            defaultValue: defaultTheme,
            placeholder: chrome.i18n.getMessage("zmxvkp"),
            required: true,
            requiredMessage: chrome.i18n.getMessage("mzpxvk"),
            maxLength: 100,
        });
    }

    /**
     * ✅ 缓存 Tooltip 的 CSS 变量配置
     * 使用固定值，与 CSS 中的 .timeline-tooltip 样式保持一致
     */
    cacheTooltipConfig() {
        try {
            // ✅ 使用固定值（与 CSS 变量的默认值一致）
            this.tooltipConfigCache = {
                arrowOut: 6, // --timeline-tooltip-arrow-outside
                baseGap: 12, // --timeline-tooltip-gap-visual
                boxGap: 8, // --timeline-tooltip-gap-box
                lineH: 18, // --timeline-tooltip-lh
                padY: 10, // --timeline-tooltip-pad-y
                borderW: 1, // --timeline-tooltip-border-w
                maxW: 288, // --timeline-tooltip-max
            };
        } catch (e) {
            // 使用默认值
            this.tooltipConfigCache = {
                arrowOut: 6,
                baseGap: 12,
                boxGap: 8,
                lineH: 18,
                padY: 10,
                borderW: 1,
                maxW: 288,
            };
        }
    }

    recalculateAndRenderMarkers() {
        this.perfStart("recalc");
        if (!this.conversationContainer || !this.ui.timelineBar || !this.scrollContainer) return;

        if (window.questionListPopup) window.questionListPopup.onMarkersRebuilt();

        const selector = this.adapter.getUserMessageSelector();
        let userTurnElements = Array.from(this.conversationContainer.querySelectorAll(selector));

        // ✅ 允许适配器进一步过滤消息元素（如区分用户消息和AI消息）
        if (typeof this.adapter.filterUserMessages === "function") {
            userTurnElements = this.adapter.filterUserMessages(userTurnElements);
        }

        // Reset visible window to avoid cleaning with stale indices after rebuild
        this.visibleRange = { start: 0, end: -1 };
        // If the conversation is transiently empty (branch switching), don't wipe UI immediately
        if (userTurnElements.length === 0) {
            if (!this.zeroTurnsTimer) {
                this.zeroTurnsTimer = setTimeout(() => {
                    this.zeroTurnsTimer = null;
                    this.recalculateAndRenderMarkers();
                }, TIMELINE_CONFIG.ZERO_TURNS_TIMER);
            }
            return;
        }
        this.zeroTurnsTimer = TimelineUtils.clearTimerSafe(this.zeroTurnsTimer);

        // ✅ 确定有节点要渲染，注入收起/展开切换按钮（首次调用时创建，后续调用直接跳过）
        this.injectToggleButton();

        /**
         * ✅ 按照元素在页面上的实际位置（从上往下）排序
         * 确保节点顺序和视觉顺序完全一致，适用于所有网站
         *
         * ✅ 性能优化：批量读取所有 rect 后再排序
         * 原因：getBoundingClientRect() 会触发浏览器重排
         * 批量读取可以让浏览器合并重排操作，减少布局抖动
         */
        // 一次性批量读取所有 rect（利用浏览器批量优化）
        const rectsMap = new Map();
        userTurnElements.forEach((el) => rectsMap.set(el, el.getBoundingClientRect()));
        // 使用缓存的 rect 进行排序
        userTurnElements.sort((a, b) => rectsMap.get(a).top - rectsMap.get(b).top);

        /**
         * ✅ 性能优化：只在节点真正变化时重新计算位置
         *
         * 背景：
         * MutationObserver 会在各种 DOM 变化时触发，包括：
         * - 图片加载完成（样式变化）
         * - 代码高亮渲染（内容样式化）
         * - 公式渲染（LaTeX/KaTeX）
         * - 动画效果
         *
         * 这些变化不会影响对话节点的数量和顺序，但会触发不必要的位置重新计算。
         *
         * 优化策略：
         * 通过比对节点 ID 集合，只在节点真正增加/删除时才重新计算。
         * 这样可以减少 80%+ 的不必要计算，提升性能和稳定性。
         */

        // 生成当前节点的 ID 集合
        const currentNodeIds = new Set();
        userTurnElements.forEach((el, index) => {
            const id = this.adapter.generateTurnId(el, index);
            currentNodeIds.add(id);
        });

        // 判断节点是否变化：数量变化 或 ID 集合变化 或 DOM 引用失效
        const nodeCountChanged = userTurnElements.length !== this._renderedNodeCount;
        const nodeIdsChanged =
            currentNodeIds.size !== this._renderedNodeIds.size ||
            ![...currentNodeIds].every((id) => this._renderedNodeIds.has(id));
        // ✅ 新增：检查是否有 DOM 引用失效（处理虚拟滚动导致的 DOM 回收）
        const hasInvalidDom = this.markers.some((m) => !m.element?.isConnected);
        const needsRecalculation = nodeCountChanged || nodeIdsChanged || hasInvalidDom;

        // 如果节点没有变化，只更新渲染，不重新计算位置
        if (!needsRecalculation && this.markers.length > 0) {
            // 只更新视图和同步状态（不涉及位置计算）
            this.syncTimelineTrackToMain();
            this.updateVirtualRangeAndRender();
            this.updateActiveDotUI();
            this.scheduleScrollSync();
            this.perfEnd("recalc");
            return;
        }

        // console.log('🔄 [重新计算] 节点发生变化:', {
        //     nodeCount: userTurnElements.length,
        //     countChanged: nodeCountChanged,
        //     idsChanged: nodeIdsChanged
        // });

        // ✅ 节点数量变化时，对外派发事件
        let pendingNodesChange = null;
        if (nodeCountChanged) {
            // 使用 lastNodesChange.count 获取上一次的节点数（不受 resize 重置影响）
            const previousCount = this.lastNodesChange?.count ?? 0;
            const currentCount = userTurnElements.length;

            // ✅ 检查数据是否真的变化了（避免重复 emit 相同数据）
            const lastChange = this.lastNodesChange;
            // 帮我打一些console，我要看下节点数量的变化
            const shouldEmit = !(
                lastChange &&
                lastChange.count === currentCount &&
                lastChange.previousCount === previousCount
            );

            if (shouldEmit) {
                // ✅ 存储变更记录，外部可通过 window.timelineManager.lastNodesChange 获取
                this.lastNodesChange = {
                    count: currentCount,
                    previousCount: previousCount,
                    timestamp: Date.now(),
                };

                pendingNodesChange = { previousCount, currentCount };
            }
        }

        // 更新跟踪状态
        this._renderedNodeCount = userTurnElements.length;
        this._renderedNodeIds = currentNodeIds;

        // 节点发生变化，清除旧的 dots，准备重新计算和渲染
        (this.ui.trackContent || this.ui.timelineBar).querySelectorAll(".ait-timeline-dot").forEach((n) => n.remove());

        /**
         * ✅ 计算元素相对于容器顶部的距离（使用 offsetTop）
         *
         * 为什么使用 offsetTop 而不是 getBoundingClientRect？
         * - getBoundingClientRect().top 是相对于视口的，会随滚动变化
         * - offsetTop 是相对于 offsetParent 的，不受滚动影响，更稳定
         *
         * 算法说明：
         * 1. 从元素开始，向上遍历到 container
         * 2. 累加每一层的 offsetTop
         * 3. 如果 offsetParent 跳出了 container（如 position:fixed），使用后备方案
         *
         * @param {HTMLElement} element - 目标元素
         * @param {HTMLElement} container - 容器元素
         * @returns {number} 元素距离容器顶部的像素距离
         */
        /**
         * ✅ 使用 getBoundingClientRect 计算元素相对于容器内容区域顶部的距离
         *
         * 公式：elemRect.top - contRect.top + container.scrollTop
         *
         * 解释：
         * - elemRect.top - contRect.top = 元素相对于容器可见区域顶部的距离
         * - + scrollTop = 加上已滚动的距离
         * - 结果 = 元素相对于容器内容区域顶部的绝对距离
         */
        const getOffsetTop = (element, container) => {
            const elemRect = element.getBoundingClientRect();
            const contRect = container.getBoundingClientRect();
            let contScrollTop = container.scrollTop || 0;

            // ✅ 反向滚动时，scrollTop 是负数，取绝对值
            const isReverseScroll =
                typeof this.adapter.isReverseScroll === "function" && this.adapter.isReverseScroll();
            if (isReverseScroll) {
                contScrollTop = Math.abs(contScrollTop);
            }

            return elemRect.top - contRect.top + contScrollTop;
        };

        /**
         * ✅ 新设计：基于滚动进度的 n 值计算
         *
         * 核心思想：
         * - 节点N 的 n 值 = 节点(N+1) 顶部位置 / maxScrollTop
         * - 最后一个节点的 n 值 = 1
         * - 激活判断：找第一个 n > scrollProgress 的节点
         *
         * 这样 n 值代表"当滚动进度超过这个值时，应该激活下一个节点"
         * 即 n 是当前节点的"有效范围上限"
         *
         * 示例：
         * ┌─────────────────────────┐
         * │ 节点1 (n=0.4)           │ ← n 值来自节点2的位置
         * │ 节点2 (n=0.7)           │ ← n 值来自节点3的位置
         * │ 节点3 (n=1.0)           │ ← 最后一个，固定为1
         * └─────────────────────────┘
         *
         * 当 scrollProgress = 0.5 时，第一个 n > 0.5 的是节点2，激活节点2
         */

        // ✅ 获取"干净"的滚动区域尺寸（不包含我们添加的 padding）
        const { scrollHeight, clientHeight, maxScrollTop: cleanMaxScrollTop } = this._getCleanScrollMetrics();

        // 缓存用于后续计算
        this.maxScrollTop = cleanMaxScrollTop > 0 ? cleanMaxScrollTop : 1;

        // ✅ 统一使用 scrollContainer 计算所有位置
        const nodeOffsets = Array.from(userTurnElements).map((el) => getOffsetTop(el, this.scrollContainer));

        // 用于时间轴圆点定位（也使用 scrollContainer，保持一致）
        const firstOffsetTop = nodeOffsets[0];
        const lastOffsetTop = nodeOffsets[nodeOffsets.length - 1];
        let contentSpan = lastOffsetTop - firstOffsetTop;
        if (userTurnElements.length < 2 || contentSpan <= 0) {
            contentSpan = 1;
        }
        this.contentSpanPx = contentSpan;

        /**
         * ✅ 底部 padding 管理
         *
         * 问题：当最后几个节点距离很近时，点击某个节点后可能激活错误的节点
         * 原因：原来的 activateAt 和 offsetTop 的映射关系不是 1:1
         *
         * 解决方案：添加底部 padding，确保 maxScrollTop >= lastOffsetTop
         * 这样可以直接用 offsetTop 判断激活，避免压缩问题
         */
        this._updateScrollPadding(lastOffsetTop, cleanMaxScrollTop);

        // Build markers with normalized position along conversation
        this.markerMap.clear();

        this.markers = Array.from(userTurnElements).map((el, index, arr) => {
            /**
             * ✅ 节点位置信息：
             *
             * - offsetTop: 节点顶部距离滚动区域顶部的距离（像素）
             * - offsetBottom: 节点结束位置 = offsetTop + 节点高度（像素）
             * - visualN: 用于时间轴圆点定位（0~1）
             *
             * 激活逻辑：直接使用 offsetTop，找最后一个 (offsetTop - 提前量) <= scrollTop 的节点
             * 注意：需要配合底部空白元素使用，确保所有节点都能被滚动激活
             */

            // 节点顶部距离滚动区域的距离（像素）
            const offsetTop = nodeOffsets[index];

            // offsetBottom: 节点结束位置 = offsetTop + 节点高度（像素）
            const nodeHeight = el.offsetHeight || 0;
            const offsetBottom = offsetTop + nodeHeight;

            // visualN: 用于时间轴圆点定位（0~1，保留6位小数）
            const offsetFromStart = offsetTop - firstOffsetTop;
            let visualN = offsetFromStart / contentSpan;
            visualN = Math.round(Math.max(0, Math.min(1, visualN)) * 1000000) / 1000000;

            const id = this.adapter.generateTurnId(el, index);

            const m = {
                id: id,
                element: el,
                summary: this.adapter.extractText(el),
                offsetTop, // 节点顶部距离（像素）- 用于激活判断
                offsetBottom, // 节点结束位置（像素）
                visualN, // 原始位置比例（0~1）
                dotN: visualN, // 圆点定位值（0~1，经过 minGap 调整，用于视觉渲染）
                dotElement: null,
                starred: false,
                pinned: false,
            };
            this.markerMap.set(m.id, m);
            return m;
        });

        // ✅ 应用收藏状态：根据 starredIndexes 设置 starred 和填充 this.starred
        // 支持 nodeId（字符串）和 index（数字），并有 fallback 逻辑
        this.starredIndexes.forEach((nodeKey) => {
            let marker = null;

            // 1. 先尝试用 adapter 的 findMarkerByStoredIndex（支持 nodeId 和 fallback）
            if (this.adapter.findMarkerByStoredIndex) {
                marker = this.adapter.findMarkerByStoredIndex(nodeKey, this.markers, this.markerMap);
            } else {
                // 默认逻辑：尝试用 generateTurnIdFromIndex 构建 turnId
                if (this.adapter.generateTurnIdFromIndex) {
                    const turnId = this.adapter.generateTurnIdFromIndex(nodeKey);
                    marker = this.markerMap.get(turnId);
                }
                // Fallback：如果是数字，用数组索引
                if (!marker && typeof nodeKey === "number" && nodeKey >= 0 && nodeKey < this.markers.length) {
                    marker = this.markers[nodeKey];
                }
            }

            if (marker && marker.id) {
                marker.starred = true;
                this.starred.add(marker.id);
            }
        });

        // ✅ 应用标记状态：根据 pinnedIndexes 设置 pinned 和填充 this.pinned
        // 与收藏状态相同的逻辑
        this.pinnedIndexes.forEach((nodeKey) => {
            let marker = null;

            if (this.adapter.findMarkerByStoredIndex) {
                marker = this.adapter.findMarkerByStoredIndex(nodeKey, this.markers, this.markerMap);
            } else {
                if (this.adapter.generateTurnIdFromIndex) {
                    const turnId = this.adapter.generateTurnIdFromIndex(nodeKey);
                    marker = this.markerMap.get(turnId);
                }
                if (!marker && typeof nodeKey === "number" && nodeKey >= 0 && nodeKey < this.markers.length) {
                    marker = this.markers[nodeKey];
                }
            }

            if (marker && marker.id) {
                marker.pinned = true;
                this.pinned.add(marker.id);
            }
        });

        // Bump version after markers are rebuilt to invalidate concurrent passes
        this.markersVersion++;

        // ✅ 动态调整时间轴高度（根据节点数量）
        this.updateTimelineHeight();

        // Compute geometry and virtualize render
        this.updateTimelineGeometry();
        if (!this.activeTurnId && this.markers.length > 0) {
            this.activeTurnId = this.markers[this.markers.length - 1].id;
        }
        this.syncTimelineTrackToMain();
        this.updateVirtualRangeAndRender();
        // Ensure active class is applied after dots are created
        this.updateActiveDotUI();
        this.scheduleScrollSync();
        this.updateIntersectionObserverTargets();

        // ✅ 对外派发节点数量变化事件
        if (pendingNodesChange) {
            const nodesChangeDetail = {
                count: pendingNodesChange.currentCount, // 当前节点总数
                previousCount: pendingNodesChange.previousCount, // 变化前节点数
                adapter: this.adapter, // 传递 adapter 引用
            };
            console.log("[TimelineManager] timeline:nodesChange", {
                count: nodesChangeDetail.count,
                previousCount: nodesChangeDetail.previousCount,
            });
            try {
                window.dispatchEvent(
                    new CustomEvent("timeline:nodesChange", {
                        detail: nodesChangeDetail,
                    }),
                );
            } catch (e) {
                // 静默处理事件派发失败
            }
        }

        // ✅ 辅助函数：根据 nodeKey 查找 marker（支持 nodeId 和 index fallback）
        const findMarkerByNodeKey = (nodeKey) => {
            if (nodeKey === null || nodeKey === undefined) return null;
            if (this.adapter.findMarkerByStoredIndex) {
                return this.adapter.findMarkerByStoredIndex(nodeKey, this.markers, this.markerMap);
            }
            // 默认逻辑
            if (this.adapter.generateTurnIdFromIndex) {
                const turnId = this.adapter.generateTurnIdFromIndex(nodeKey);
                const marker = this.markerMap.get(turnId);
                if (marker) return marker;
            }
            // Fallback：数字索引
            if (typeof nodeKey === "number" && nodeKey >= 0 && nodeKey < this.markers.length) {
                return this.markers[nodeKey];
            }
            return null;
        };

        // ✅ 检查是否有跨页面导航任务（同站跳转，如从收藏列表点击）
        this.getNavigateData("targetIndex")
            .then((nodeKey) => {
                const marker = findMarkerByNodeKey(nodeKey);
                if (marker && marker.element) {
                    // 延迟500ms，等待页面完全加载后再定位
                    setTimeout(() => {
                        this.smoothScrollTo(marker.element);
                    }, 500);
                }
            })
            .catch(() => {});

        // ✅ 检查是否有跨网站导航任务（跨站跳转，如从收藏列表点击其他网站的记录）
        this.checkCrossSiteNavigate()
            .then((nodeKey) => {
                const marker = findMarkerByNodeKey(nodeKey);
                if (marker && marker.element) {
                    // 延迟500ms，等待页面完全加载后再定位
                    setTimeout(() => {
                        this.smoothScrollTo(marker.element);
                    }, 500);
                }
            })
            .catch(() => {});

        this.perfEnd("recalc");
    }

    setupObservers() {
        this.mutationObserver = new MutationObserver((mutations) => {
            /**
             * ✅ 防御性检查：确保有实际的节点增删变化
             *
             * 理论上，由于只配置了 childList: true，所有 mutation 都应该
             * 包含 addedNodes 或 removedNodes。但作为防御性编程，
             * 我们仍然检查以处理可能的边缘情况。
             *
             * 真正的性能优化在 recalculateAndRenderMarkers() 中：
             * 通过比较 turnId 集合来判断是否需要重建 markers。
             */
            const hasRelevantChange = mutations.some(
                (m) => m.type === "childList" && (m.addedNodes.length > 0 || m.removedNodes.length > 0),
            );
            if (!hasRelevantChange) return;

            // ✅ 注意：padding 恢复逻辑已移至 scheduleScrollSync()
            // 当用户滚动时恢复 padding，而不是用定时器猜测 AI 回答是否结束

            try {
                this.ensureContainersUpToDate();
            } catch {}
            this.debouncedRecalculateAndRender();
        });
        this.mutationObserver.observe(this.conversationContainer, { childList: true, subtree: true });
        // Resize: update long-canvas geometry and virtualization
        // ⚠️ 注意：这里只监听时间轴自身大小变化，不需要重新计算节点位置
        // 因为时间轴大小变化不影响对话区域节点的 offsetTop
        this.resizeObserver = new ResizeObserver(() => {
            this.updateTimelineGeometry();
            this.syncTimelineTrackToMain();
            this.updateVirtualRangeAndRender();
        });
        if (this.ui.timelineBar) {
            this.resizeObserver.observe(this.ui.timelineBar);
        }

        this.intersectionObserver = new IntersectionObserver(
            (entries) => {
                // Maintain which user turns are currently visible
                entries.forEach((entry) => {
                    const target = entry.target;
                    if (entry.isIntersecting) {
                        this.visibleUserTurns.add(target);
                    } else {
                        this.visibleUserTurns.delete(target);
                    }
                });

                // Defer active state decision to scroll-based computation
                this.scheduleScrollSync();
            },
            {
                root: this.scrollContainer,
                threshold: 0.1,
                rootMargin: "-40% 0px -59% 0px",
            },
        );

        this.updateIntersectionObserverTargets();

        // ✅ 设置 DOM 检查监听（隐藏状态 + 冲突插件检测）
        this.setupDomCheckObserver();
    }

    /**
     * ✅ 设置 DOM 检查监听器（合并：隐藏状态 + 冲突插件检测）
     *
     * 功能1：监听 DOM 变化，调用 adapter 的检测方法判断是否应该隐藏时间轴
     * 功能2：检测并隐藏冲突的第三方时间轴插件元素
     *
     * 使用 DOMObserverManager 统一管理，减少订阅数量
     */
    setupDomCheckObserver() {
        // 已知的冲突时间轴选择器（包括其他插件和平台自带的时间轴）
        const conflictingSelectors = [
            ".gemini-timeline-bar", // Gemini 时间轴插件
            ".chatgpt-timeline-bar", // ChatGPT 时间轴插件
            '[style*="--scroll-nav-page-padding"]', // DeepSeek 原生滚动导航时间轴
        ];

        // 检查并更新时间轴可见性
        const checkAndUpdateTimelineVisibility = () => {
            const shouldHide = this.adapter.shouldHideTimeline();
            if (this.ui.wrapper) {
                this.ui.wrapper.style.display = shouldHide ? "none" : "flex";
            }
            // ✅ 切换按钮跟随时间轴显示/隐藏
            if (this.ui.toggleBtn) {
                this.ui.toggleBtn.style.display = shouldHide ? "none" : "flex";
            }
        };

        // 立即执行一次检查
        checkAndUpdateTimelineVisibility();
        this.hideConflictingElements(conflictingSelectors);

        // 使用 DOMObserverManager 监听 DOM 变化（合并为 1 个订阅）
        if (window.DOMObserverManager) {
            this._unsubscribeDomCheck = window.DOMObserverManager.getInstance().subscribeBody("timeline-dom-check", {
                callback: () => {
                    checkAndUpdateTimelineVisibility();
                    this.hideConflictingElements(conflictingSelectors);
                },
                filter: { hasAddedNodes: true, hasRemovedNodes: true },
                debounce: 300, // 300ms 防抖，降低执行频率
            });
        }
    }

    /**
     * ✅ 隐藏冲突的时间轴元素
     * @param {string[]} selectors - 需要隐藏的元素选择器数组
     */
    hideConflictingElements(selectors) {
        selectors.forEach((selector) => {
            const elements = document.querySelectorAll(selector);
            elements.forEach((el) => {
                // 只处理尚未隐藏的元素，避免重复操作
                if (el.style.display !== "none") {
                    el.style.display = "none";
                }
            });
        });
    }

    /**
     * ✅ 启动健康检查，定期检测容器是否有效
     * 处理 SPA 页面 DOM 整体替换的情况
     */
    startHealthCheck() {
        if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);

        this.healthCheckInterval = setInterval(() => {
            // 检查容器是否仍然连接在文档中
            const isContainerValid = this.conversationContainer && this.conversationContainer.isConnected;

            if (!isContainerValid) {
                // 容器失效，尝试更新
                this.ensureContainersUpToDate();
            }
        }, 5000); // 每 5 秒检查一次
    }

    // Ensure our conversation/scroll containers are still current after DOM replacements
    ensureContainersUpToDate() {
        const selector = this.adapter.getUserMessageSelector();
        const first = document.querySelector(selector);
        if (!first) return;

        const newConv = this.adapter.findConversationContainer(first);
        // ✅ 增强判断：如果新容器存在且 (新容器不等于旧容器 OR 旧容器已经断开连接)
        if (newConv && (newConv !== this.conversationContainer || !this.conversationContainer?.isConnected)) {
            // Rebind observers and listeners to the new conversation root
            this.rebindConversationContainer(newConv);
        }
    }

    rebindConversationContainer(newConv) {
        // Detach old listeners
        if (this.scrollContainer && this.onScroll) {
            try {
                this.scrollContainer.removeEventListener("scroll", this.onScroll);
            } catch {}
        }
        try {
            this.mutationObserver?.disconnect();
        } catch {}
        try {
            this.intersectionObserver?.disconnect();
        } catch {}

        this.conversationContainer = newConv;

        // ✅ 重置节点跟踪状态，因为切换了对话
        this._renderedNodeCount = 0;
        this._renderedNodeIds = new Set();

        // ✅ 重置 ChatTimeRecorder 状态（解耦：通过全局函数调用）
        if (typeof resetChatTimeRecorder === "function") {
            resetChatTimeRecorder();
        }

        // ✅ Padding 状态由 adapter.isAIGenerating() 实时控制

        // Find (or re-find) scroll container
        let parent = newConv;
        let newScroll = null;
        while (parent && parent !== document.body) {
            const style = window.getComputedStyle(parent);
            if (style.overflowY === "auto" || style.overflowY === "scroll") {
                newScroll = parent;
                break;
            }
            parent = parent.parentElement;
        }
        if (!newScroll) newScroll = document.scrollingElement || document.documentElement || document.body;
        this.scrollContainer = newScroll;
        // Reattach scroll listener
        this.onScroll = () => this.scheduleScrollSync();
        this.scrollContainer.addEventListener("scroll", this.onScroll, { passive: true });

        // Recreate IntersectionObserver with new root
        this.intersectionObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const target = entry.target;
                    if (entry.isIntersecting) {
                        this.visibleUserTurns.add(target);
                    } else {
                        this.visibleUserTurns.delete(target);
                    }
                });
                this.scheduleScrollSync();
            },
            { root: this.scrollContainer, threshold: 0, rootMargin: "0px" },
        );
        this.updateIntersectionObserverTargets();

        // Re-observe mutations on the new conversation container
        this.mutationObserver.observe(this.conversationContainer, { childList: true, subtree: true });

        // Force a recalc right away to rebuild markers
        this.recalculateAndRenderMarkers();
    }

    updateIntersectionObserverTargets() {
        if (!this.intersectionObserver || !this.conversationContainer) return;
        this.intersectionObserver.disconnect();
        this.visibleUserTurns.clear();
        const selector = this.adapter.getUserMessageSelector();
        const userTurns = this.conversationContainer.querySelectorAll(selector);
        userTurns.forEach((el) => this.intersectionObserver.observe(el));
    }

    setupEventListeners() {
        // ✅ 长按标记功能：长按节点切换图钉
        let longPressTimer = null;
        let longPressTarget = null;
        let longPressStartPos = null;
        let longPressTriggered = false; // 标记长按是否已触发，用于阻止点击事件

        this.onTimelineBarClick = (e) => {
            // ✅ 如果刚刚触发了长按，阻止点击事件（避免长按后又滚动）
            if (longPressTriggered) {
                longPressTriggered = false;
                return;
            }

            const dot = e.target.closest(".ait-timeline-dot");
            if (dot) {
                const targetId = dot.dataset.targetTurnId;
                // Find target element by matching marker ID
                const marker = this.markers.find((m) => m.id === targetId);
                const targetElement = marker?.element;
                if (targetElement) {
                    // Only scroll; let scroll-based computation set active to avoid double-flash
                    this.smoothScrollTo(targetElement);
                }
            }
        };
        this.ui.timelineBar.addEventListener("click", this.onTimelineBarClick);

        // ✅ 键盘导航：上下方向键切换节点
        this.onKeyDown = (e) => {
            // 只处理上下方向键
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

            // ✅ 检查焦点元素，避免干扰可编辑元素和表单控件
            const activeElement = document.activeElement;
            if (activeElement) {
                // 检查是否为可编辑元素或表单控件
                // 按常见程度排序，优化短路求值性能
                const isEditableElement =
                    activeElement.isContentEditable || // 最常见：ChatGPT/富文本编辑器
                    activeElement.tagName === "INPUT" || // 常见：普通输入框
                    activeElement.tagName === "TEXTAREA" || // 常见：多行文本
                    activeElement.tagName === "SELECT" || // 常见：下拉框
                    activeElement.tagName === "IFRAME" || // 特殊：iframe 内可能有输入框
                    activeElement.contentEditable === "true"; // 冗余检查，增加兼容性

                // 如果焦点在可编辑元素上，不拦截，让原生行为生效
                if (isEditableElement) return;
            }

            // ✅ 检查功能是否启用
            if (!this.arrowKeysNavigationEnabled) {
                return; // 功能关闭，不处理
            }

            // ✅ 检查当前平台是否启用
            if (!this.isPlatformEnabled()) {
                return; // 当前平台被禁用，不处理
            }

            // 阻止默认滚动行为
            e.preventDefault();

            // 如果没有节点，不处理
            if (this.markers.length === 0) return;

            // ✅ 优化：只查找一次索引，避免重复遍历
            let currentIndex = -1;
            if (this.activeTurnId) {
                currentIndex = this.markers.findIndex((m) => m.id === this.activeTurnId);
            }

            // 如果没有激活节点，或激活节点已失效（索引为-1），提供智能默认行为
            if (currentIndex === -1) {
                // 没有激活节点或激活节点失效（DOM 替换后可能发生）
                // 根据按键方向选择合适的默认节点
                let defaultMarker;
                if (e.key === "ArrowUp") {
                    // 按上键：从最后一个节点开始（符合用户向上浏览的意图）
                    defaultMarker = this.markers[this.markers.length - 1];
                } else {
                    // 按下键：从第一个节点开始（符合用户向下浏览的意图）
                    defaultMarker = this.markers[0];
                }

                if (defaultMarker && defaultMarker.element) {
                    this.smoothScrollTo(defaultMarker.element);
                }
                return;
            }

            // 此时 currentIndex 一定是有效的（>= 0），直接计算目标索引
            let targetIndex;
            if (e.key === "ArrowUp") {
                // 上键：跳转到上一个节点（索引减小）
                targetIndex = currentIndex - 1;
                // 边界检查：已经在第一个节点，保持不动
                if (targetIndex < 0) return;
            } else {
                // 下键：跳转到下一个节点（索引增加）
                targetIndex = currentIndex + 1;
                // 边界检查：已经在最后一个节点，保持不动
                if (targetIndex >= this.markers.length) return;
            }

            // 获取目标节点并跳转
            const targetMarker = this.markers[targetIndex];
            if (targetMarker && targetMarker.element) {
                this.smoothScrollTo(targetMarker.element);
            }
        };
        document.addEventListener("keydown", this.onKeyDown);

        // ✅ 保存为实例方法以便在 destroy 中清理
        this.startLongPress = (e) => {
            const dot = e.target.closest(".ait-timeline-dot");
            if (!dot) return;

            longPressTarget = dot;
            longPressTriggered = false; // 重置标志

            // 记录起始位置
            const pos = e.type.startsWith("touch") ? e.touches[0] : e;
            longPressStartPos = { x: pos.clientX, y: pos.clientY };

            longPressTimer = setTimeout(async () => {
                const targetId = dot.dataset.targetTurnId;
                if (targetId) {
                    // ✅ 标记长按已触发
                    longPressTriggered = true;

                    // ✅ 触觉反馈（如果支持）
                    if (navigator.vibrate) {
                        navigator.vibrate(50); // 震动 50ms
                    }

                    // ✅ 切换图钉状态
                    await this.togglePin(targetId);
                }
                longPressTimer = null;
            }, 500); // 500ms 触发长按
        };

        this.checkLongPressMove = (e) => {
            if (!longPressTimer || !longPressStartPos) return;

            // 如果移动超过5px，取消长按
            const pos = e.type.startsWith("touch") ? e.touches[0] : e;
            const dx = pos.clientX - longPressStartPos.x;
            const dy = pos.clientY - longPressStartPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) {
                this.cancelLongPress();
            }
        };

        this.cancelLongPress = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            longPressTarget = null;
            longPressStartPos = null;
        };

        this.ui.timelineBar.addEventListener("mousedown", this.startLongPress);
        this.ui.timelineBar.addEventListener("touchstart", this.startLongPress, { passive: true });
        this.ui.timelineBar.addEventListener("mousemove", this.checkLongPressMove);
        this.ui.timelineBar.addEventListener("touchmove", this.checkLongPressMove, { passive: true });
        this.ui.timelineBar.addEventListener("mouseup", this.cancelLongPress);
        this.ui.timelineBar.addEventListener("mouseleave", this.cancelLongPress);
        this.ui.timelineBar.addEventListener("touchend", this.cancelLongPress);
        this.ui.timelineBar.addEventListener("touchcancel", this.cancelLongPress);

        // Listen to container scroll to keep marker active state in sync
        this.onScroll = () => this.scheduleScrollSync();
        this.scrollContainer.addEventListener("scroll", this.onScroll, { passive: true });

        // Tooltip interactions (delegated)
        this.onTimelineBarOver = (e) => {
            const dot = e.target.closest(".ait-timeline-dot");
            if (dot) this.showTooltipForDot(dot);
        };

        // ✅ 需求2：修改逻辑 - 只在鼠标不是移到 tooltip 时才隐藏
        this.onTimelineBarOut = (e) => {
            const fromDot = e.target.closest(".ait-timeline-dot");
            const toDot = e.relatedTarget?.closest?.(".ait-timeline-dot");
            const toTooltip = e.relatedTarget?.closest?.(".timeline-tooltip");

            // 如果从圆点移出，且不是移到另一个圆点或 tooltip，才隐藏
            if (fromDot && !toDot && !toTooltip) {
                this.hideTooltip();
            }
        };

        this.onTimelineBarFocusIn = (e) => {
            const dot = e.target.closest(".ait-timeline-dot");
            if (dot) this.showTooltipForDot(dot);
        };
        this.onTimelineBarFocusOut = (e) => {
            const dot = e.target.closest(".ait-timeline-dot");
            if (dot) this.hideTooltip();
        };

        this.ui.timelineBar.addEventListener("mouseover", this.onTimelineBarOver);
        this.ui.timelineBar.addEventListener("mouseout", this.onTimelineBarOut);
        this.ui.timelineBar.addEventListener("focusin", this.onTimelineBarFocusIn);
        this.ui.timelineBar.addEventListener("focusout", this.onTimelineBarFocusOut);

        // ✅ 移除：tooltip hover 事件由 GlobalTooltipManager 内部管理

        /**
         * 窗口大小变化处理
         *
         * 需要重新计算节点位置的原因：
         * 1. 窗口宽度变化 → 对话容器宽度变化
         * 2. 文字重新折行 → 元素高度变化
         * 3. 元素高度变化 → offsetTop 变化
         * 4. 如果不重新计算，节点位置会不准确
         *
         * 性能考虑：
         * 使用 debouncedRecalculateAndRender 避免频繁计算
         */
        this.onWindowResize = () => {
            // ✅ GlobalTooltipManager 会处理 tooltip 在 resize 时的行为
            // ✅ 强制重新计算节点位置（包括 padding，由 isAIGenerating 实时控制）
            this._renderedNodeCount = 0;
            this._renderedNodeIds.clear();
            this.debouncedRecalculateAndRender();
        };
        window.addEventListener("resize", this.onWindowResize);
        /**
         * 视口缩放处理（VisualViewport API）
         *
         * 触发场景：
         * - 用户通过手势或快捷键缩放页面（Ctrl + +/-）
         * - 移动设备上的双指缩放
         *
         * 为什么需要重新计算：
         * 缩放会改变页面布局和元素尺寸，导致 offsetTop 变化
         */
        if (window.visualViewport) {
            this.onVisualViewportResize = () => {
                // ✅ 强制重新计算节点位置（包括 padding，由 isAIGenerating 实时控制）
                this._renderedNodeCount = 0;
                this._renderedNodeIds.clear();
                this.debouncedRecalculateAndRender();
            };
            try {
                window.visualViewport.addEventListener("resize", this.onVisualViewportResize);
            } catch {}
        }

        // Scroll wheel on the timeline controls the main scroll container (Linked mode)
        this.onTimelineWheel = (e) => {
            // Prevent page from attempting to scroll anything else
            try {
                e.preventDefault();
            } catch {}
            const delta = e.deltaY || 0;
            this.scrollContainer.scrollTop += delta;
            // Keep markers in sync on next frame
            this.scheduleScrollSync();
        };
        this.ui.timelineBar.addEventListener("wheel", this.onTimelineWheel, { passive: false });

        // Cross-tab/cross-site star sync via chrome.storage change event
        this.onStorage = async (changes, areaName) => {
            try {
                // ✅ 辅助函数：根据 nodeKey 查找 marker（支持 nodeId 和 index fallback）
                const findMarkerByNodeKey = (nodeKey) => {
                    if (this.adapter.findMarkerByStoredIndex) {
                        return this.adapter.findMarkerByStoredIndex(nodeKey, this.markers, this.markerMap);
                    }
                    // 默认逻辑
                    if (this.adapter.generateTurnIdFromIndex) {
                        const turnId = this.adapter.generateTurnIdFromIndex(nodeKey);
                        const marker = this.markerMap.get(turnId);
                        if (marker) return marker;
                    }
                    // Fallback：数字索引
                    if (typeof nodeKey === "number" && nodeKey >= 0 && nodeKey < this.markers.length) {
                        return this.markers[nodeKey];
                    }
                    return null;
                };

                // ✅ 处理收藏数组变化
                if (changes.chatTimelineStars) {
                    // 重新加载收藏数据
                    await this.loadStars();

                    // 同步收藏整个对话按钮的状态
                    const starBtn = this.ui.starChatBtn || document.querySelector(".ait-timeline-star-chat-btn-native");
                    if (starBtn) {
                        const nowStarred = await this.isChatStarred();
                        const svg = starBtn.querySelector("svg");
                        if (svg) {
                            svg.setAttribute("fill", nowStarred ? "rgb(255, 125, 3)" : "none");
                            svg.setAttribute("stroke", nowStarred ? "rgb(255, 125, 3)" : "currentColor");
                        }
                    }

                    // 同步收藏状态到所有 marker
                    this.markers.forEach((marker) => {
                        const nodeId = this.adapter.extractIndexFromTurnId?.(marker.id);
                        const nodeKey = nodeId !== null && nodeId !== undefined ? nodeId : this.markers.indexOf(marker);

                        const isStarred = this.starredIndexes.has(nodeKey);

                        if (isStarred) {
                            this.starred.add(marker.id);
                            marker.starred = true;
                        } else {
                            this.starred.delete(marker.id);
                            marker.starred = false;
                        }

                        // 更新圆点样式
                        if (marker.dotElement) {
                            try {
                                marker.dotElement.classList.toggle("starred", isStarred);
                                this._updateTooltipStarIfVisible(marker.dotElement, marker.id);
                            } catch {}
                        }
                    });
                }

                // ✅ 处理 Pin 数组变化
                if (changes.chatTimelinePins) {
                    // 重新加载 Pin 数据
                    await this.loadPins();

                    // 同步 Pin 状态到所有 marker
                    this.markers.forEach((marker) => {
                        const nodeId = this.adapter.extractIndexFromTurnId?.(marker.id);
                        const nodeKey = nodeId !== null && nodeId !== undefined ? nodeId : this.markers.indexOf(marker);

                        const isPinned = this.pinnedIndexes.has(nodeKey);

                        if (isPinned) {
                            this.pinned.add(marker.id);
                            marker.pinned = true;
                        } else {
                            this.pinned.delete(marker.id);
                            marker.pinned = false;
                        }

                        // 更新图钉图标
                        this.updatePinIcon(marker);
                    });

                    // ✅ 重新渲染所有图钉
                    this.renderPinMarkers();
                }

                // ✅ 监听箭头键导航功能状态变化
                if (changes.arrowKeysNavigationEnabled) {
                    this.arrowKeysNavigationEnabled = changes.arrowKeysNavigationEnabled.newValue !== false;
                }

                // ✅ 监听平台设置变化
                if (changes.timelinePlatformSettings) {
                    this.platformSettings = changes.timelinePlatformSettings.newValue || {};
                }

                // 更新收藏按钮显示状态
                this.updateStarredBtnVisibility();
            } catch {}
        };
        try {
            StorageAdapter.addChangeListener(this.onStorage);
        } catch {}

        // ✅ 提问列表按钮点击事件
        window.eventDelegateManager.on("click", ".ait-question-list-btn", () => {
            if (window.questionListPopup) {
                window.questionListPopup.toggle();
            }
        });

        // ✅ 收藏按钮点击事件（打开 Panel Modal 并显示收藏 tab）
        // 使用事件委托（解决长时间停留后事件失效问题）
        window.eventDelegateManager.on("click", ".timeline-starred-btn", () => {
            if (window.panelModal) {
                window.panelModal.show("starred");
            }
        });

        // ✅ 闪记按钮点击事件
        window.eventDelegateManager.on("click", ".ait-notepad-btn", () => {
            if (window.notepadManager) {
                window.notepadManager.toggle();
            }
        });

        // ✅ 优化：监听主题变化，清空缓存
        this.setupThemeChangeListener();

        // ✅ 注册依赖 Timeline 的 Panel Modal tabs
        // PanelModal 已在脚本加载时自动初始化，这里只注册需要 timeline 的 tabs
        if (typeof registerTimelineTabs === "function") {
            registerTimelineTabs(this);
        }

        // ✅ 挂载到 window 以便其他模块访问
        window.timelineManager = this;

        // ✅ 初始化时间记录器（解耦模块，确保 adapter 已就绪）
        if (typeof initChatTimeRecorder === "function") {
            initChatTimeRecorder();
        }
    }

    /**
     * ✅ 同步深色模式状态到 html 元素
     * 使用 data-timeline-theme 属性，避免与 detectDarkMode() 的检测冲突
     */
    syncDarkModeClass() {
        const isDarkMode = this.adapter.detectDarkMode?.() || false;
        const htmlElement = document.documentElement;

        if (isDarkMode) {
            htmlElement.setAttribute("data-timeline-theme", "dark");
        } else {
            htmlElement.setAttribute("data-timeline-theme", "light");
        }
    }

    /**
     * ✅ 优化：设置主题变化监听器
     * 当主题切换时，重新缓存 CSS 变量并清空截断缓存
     * 使用 DOMObserverManager 统一管理
     */
    setupThemeChangeListener() {
        // 使用 DOMObserverManager 监听主题变化
        if (window.DOMObserverManager) {
            this._unsubscribeTheme = window.DOMObserverManager.getInstance().subscribeTheme("timeline", () => {
                this.onThemeChange();
            });
        }

        // 监听系统主题变化（prefers-color-scheme）
        try {
            const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
            const mediaQueryHandler = () => {
                this.onThemeChange();
            };

            // 使用现代 API（如果支持）
            if (mediaQuery.addEventListener) {
                mediaQuery.addEventListener("change", mediaQueryHandler);
            } else {
                // 降级到旧 API
                mediaQuery.addListener(mediaQueryHandler);
            }

            // 保存引用以便在 destroy 时清理
            this.mediaQuery = mediaQuery;
            this.mediaQueryHandler = mediaQueryHandler;
        } catch (e) {}
    }

    /**
     * ✅ 优化：主题变化处理
     */
    onThemeChange() {
        // 延迟到下一帧，确保新主题的样式已应用
        requestAnimationFrame(() => {
            // ✅ 同步深色模式类
            this.syncDarkModeClass();

            // 重新缓存 CSS 变量
            this.cacheTooltipConfig();

            // 清空截断缓存（因为颜色/字体可能变化）
            this.truncateCache.clear();
        });
    }

    /**
     * ✅ 对外 API：根据索引滚动到指定节点
     * @param {number} index - 节点索引（0-based），支持负数（-1 表示最后一个）
     * @returns {boolean} - 是否成功滚动
     */
    scrollToIndex(index) {
        if (!this.markers || this.markers.length === 0) return false;

        // 支持负数索引（如 -1 表示最后一个）
        let targetIndex = index;
        if (index < 0) {
            targetIndex = this.markers.length + index;
        }

        // 边界检查
        if (targetIndex < 0 || targetIndex >= this.markers.length) return false;

        const marker = this.markers[targetIndex];
        if (!marker?.element) return false;

        this.smoothScrollTo(marker.element);
        return true;
    }

    /**
     * ✅ 对外 API：滚动到最后一个节点（底部）
     * @returns {boolean} - 是否成功滚动
     */
    scrollToLast() {
        return this.scrollToIndex(-1);
    }

    /**
     * ✅ 对外 API：滚动到第一个节点（顶部）
     * @returns {boolean} - 是否成功滚动
     */
    scrollToFirst() {
        return this.scrollToIndex(0);
    }

    smoothScrollTo(targetElement, duration = 600) {
        if (!targetElement || !this.scrollContainer) return;

        this._recalcMarkerPositions();

        const scrollOffset = this.adapter?.getScrollOffset?.() ?? 30;
        const startPosition = this.scrollContainer.scrollTop;

        // 计算初始目标位置
        const getTargetPosition = () => {
            const containerRect = this.scrollContainer.getBoundingClientRect();
            const targetRect = targetElement.getBoundingClientRect();
            return targetRect.top - containerRect.top + this.scrollContainer.scrollTop - scrollOffset;
        };

        let startTime = null;

        const animation = (currentTime) => {
            if (!targetElement.isConnected) return;
            if (startTime === null) startTime = currentTime;
            const timeElapsed = currentTime - startTime;
            const progress = Math.min(timeElapsed / duration, 1);
            const easedProgress = this.easeInOutQuad(progress, 0, 1, 1);

            // 每帧重新计算目标位置，应对 DOM 动态插入
            const currentTarget = getTargetPosition();
            const currentPosition = startPosition + (currentTarget - startPosition) * easedProgress;

            this.scrollContainer.scrollTop = currentPosition;

            if (progress < 1) {
                requestAnimationFrame(animation);
            } else {
                // 动画结束后做最终修正
                this.scrollContainer.scrollTop = getTargetPosition();
            }
        };
        requestAnimationFrame(animation);
    }

    easeInOutQuad(t, b, c, d) {
        t /= d / 2;
        if (t < 1) return (c / 2) * t * t + b;
        t--;
        return (-c / 2) * (t * (t - 2) - 1) + b;
    }

    updateActiveDotUI() {
        this.markers.forEach((marker) => {
            marker.dotElement?.classList.toggle("active", marker.id === this.activeTurnId);
        });
    }

    debounce(func, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // Read numeric CSS var from the timeline bar element
    getCSSVarNumber(el, name, fallback) {
        const v = getComputedStyle(el).getPropertyValue(name).trim();
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : fallback;
    }

    getTrackPadding() {
        if (!this.ui.timelineBar) return 12;
        return this.getCSSVarNumber(this.ui.timelineBar, "--ait-timeline-track-padding", 12);
    }

    getMinGap() {
        if (!this.ui.timelineBar) return 25;
        return this.getCSSVarNumber(this.ui.timelineBar, "--timeline-min-gap", 25);
    }

    /**
     * ✅ 获取紧凑模式的默认间距
     */
    getCompactGap() {
        if (!this.ui.timelineBar) return 30;
        return this.getCSSVarNumber(this.ui.timelineBar, "--timeline-compact-gap", 30);
    }

    /**
     * ✅ 判断是否应该使用紧凑模式
     * 简单逻辑：平均空间 = 时间轴高度 / 节点数
     * 平均空间 < 40px → 切换到紧凑模式
     * 平均空间 > 45px → 切换回正常模式
     * 40-45px 之间 → 保持当前模式（滞后区间）
     */
    shouldBeCompactMode() {
        const N = this.markers.length;
        if (N === 0) return false;

        const barHeight = this.ui.timelineBar?.clientHeight || 0;
        if (barHeight <= 0) return false;

        const avgSpace = barHeight / N;

        // 滞后阈值，防止频繁切换
        const threshold = this.isCompactMode ? 45 : 40;
        return avgSpace < threshold;
    }

    /**
     * ✅ 更新紧凑模式状态
     */
    updateCompactMode() {
        const shouldBeCompact = this.shouldBeCompactMode();
        if (shouldBeCompact !== this.isCompactMode) {
            this.isCompactMode = shouldBeCompact;
            if (this.ui.timelineBar) {
                this.ui.timelineBar.classList.toggle("ait-compact-mode", this.isCompactMode);
            }
        }
    }

    // Enforce a minimum pixel gap between positions while staying within bounds
    applyMinGap(positions, minTop, maxTop, gap) {
        const n = positions.length;
        if (n === 0) return positions;
        const out = positions.slice();
        // Clamp first and forward pass (monotonic increasing)
        out[0] = Math.max(minTop, Math.min(positions[0], maxTop));
        for (let i = 1; i < n; i++) {
            const minAllowed = out[i - 1] + gap;
            out[i] = Math.max(positions[i], minAllowed);
        }
        // If last exceeds max, backward pass
        if (out[n - 1] > maxTop) {
            out[n - 1] = maxTop;
            for (let i = n - 2; i >= 0; i--) {
                const maxAllowed = out[i + 1] - gap;
                out[i] = Math.min(out[i], maxAllowed);
            }
            // Ensure first still within min
            if (out[0] < minTop) {
                out[0] = minTop;
                for (let i = 1; i < n; i++) {
                    const minAllowed = out[i - 1] + gap;
                    out[i] = Math.max(out[i], minAllowed);
                }
            }
        }
        // Final clamp
        for (let i = 0; i < n; i++) {
            if (out[i] < minTop) out[i] = minTop;
            if (out[i] > maxTop) out[i] = maxTop;
        }
        return out;
    }

    // Debounced scheduler: after resize/zoom settles, re-apply min-gap based on cached normalized positions
    scheduleMinGapCorrection() {
        this.resizeIdleTimer = TimelineUtils.clearTimerSafe(this.resizeIdleTimer);
        this.resizeIdleRICId = TimelineUtils.clearIdleCallbackSafe(this.resizeIdleRICId);

        this.resizeIdleTimer = setTimeout(() => {
            this.resizeIdleTimer = null;
            // Prefer idle callback to avoid contention; fallback to immediate
            try {
                if (typeof requestIdleCallback === "function") {
                    this.resizeIdleRICId = requestIdleCallback(
                        () => {
                            this.resizeIdleRICId = null;
                            this.reapplyMinGapAfterResize();
                        },
                        { timeout: TIMELINE_CONFIG.RESIZE_IDLE_TIMEOUT },
                    );
                    return;
                }
            } catch {}
            this.reapplyMinGapAfterResize();
        }, TIMELINE_CONFIG.RESIZE_IDLE_DELAY);
    }

    // Lightweight correction: map cached n -> pixel, apply min-gap, write back updated n
    reapplyMinGapAfterResize() {
        this.perfStart("minGapIdle");
        if (!this.ui.timelineBar || !this.ui.trackContent || this.markers.length === 0) return;

        const trackPadding = this.getTrackPadding();
        const minGap = this.getMinGap();
        const N = this.markers.length;

        // ✅ 使用实际内容高度，确保有足够空间容纳所有节点的最小间距
        const barHeight = this.ui.timelineBar.clientHeight || 0;
        const requiredHeight = 2 * trackPadding + Math.max(0, N - 1) * minGap;
        const contentHeight = Math.max(barHeight, requiredHeight);

        // 更新 trackContent 高度
        try {
            this.ui.trackContent.style.height = `${contentHeight}px`;
        } catch {}

        const usable = Math.max(1, contentHeight - 2 * trackPadding);
        const minTop = trackPadding;
        const maxTop = trackPadding + usable;

        // Use cached normalized positions (default 0)
        // ✅ 使用 visualN（圆点定位）而不是 n（激活判断）
        const desired = this.markers.map((m) => {
            const vn = Math.max(0, Math.min(1, m.visualN ?? 0));
            return minTop + vn * usable;
        });
        const adjusted = this.applyMinGap(desired, minTop, maxTop, minGap);
        for (let i = 0; i < this.markers.length; i++) {
            const top = adjusted[i];
            const vn = (top - minTop) / Math.max(1, usable);
            // ✅ 存储到 dotN（用于圆点 CSS 定位）
            this.markers[i].dotN = Math.max(0, Math.min(1, vn));
            try {
                this.markers[i].dotElement?.style.setProperty("--n", String(this.markers[i].dotN));
            } catch {}
        }
        this.perfEnd("minGapIdle");
    }

    /**
     * ✅ 优化：显示 Tooltip（使用全局管理器）
     */
    showTooltipForDot(dot) {
        if (!dot) return;

        const id = "node-" + (dot.dataset.targetTurnId || "");
        const messageText = (dot.getAttribute("aria-label") || "").trim();

        // 构建内容元素（包含交互逻辑）
        const contentElement = this._buildNodeTooltipElement(dot, messageText);

        window.globalTooltipManager.show(
            id,
            "node",
            dot,
            {
                element: contentElement,
            },
            {
                placement: "auto",
                maxWidth: 288, // ✅ 使用固定值（与 CSS 中的默认值一致）
            },
        );
    }

    /**
     * ✅ 构建节点 tooltip 元素（包含完整交互逻辑）
     */
    _buildNodeTooltipElement(dot, messageText) {
        // 计算位置信息
        const p = this.computePlacementInfo(dot);

        // 截断文本
        const layout = this.truncateToFiveLines(messageText, p.width, true);

        // 检查是否收藏
        const id = dot.dataset.targetTurnId;
        const isStarred = id && this.starred.has(id);

        // 创建容器（垂直：内容区在上 + 操作区在下）
        const container = document.createElement("div");
        container.className = "timeline-tooltip-container";

        // 内容区（垂直：时间在上 + 文字在下）
        const contentWrap = document.createElement("div");
        contentWrap.className = "timeline-tooltip-content-wrap";

        // 时间标签（从节点 DOM 读取）
        const marker = this.markerMap.get(id);
        const timeStr = marker?.element?.getAttribute("data-ait-time");
        if (timeStr) {
            const timeTag = document.createElement("span");
            timeTag.className = "timeline-tooltip-time";
            timeTag.textContent = timeStr;
            contentWrap.appendChild(timeTag);
        }

        // 创建内容区
        const content = document.createElement("div");
        content.className = "timeline-tooltip-content";
        content.textContent = layout.text;

        // ✅ 添加点击复制功能
        content.addEventListener("click", (e) => {
            e.stopPropagation();
            this.copyToClipboard(messageText, content);
        });

        // 底部操作区（图钉 + 星标，水平排列）
        const actions = document.createElement("div");
        actions.className = "timeline-tooltip-actions";

        // 创建图钉图标
        const isPinned = id && this.pinned.has(id);
        const pinSpan = document.createElement("span");
        pinSpan.className = "timeline-tooltip-pin";
        pinSpan.dataset.targetTurnId = id;
        if (!isPinned) pinSpan.classList.add("not-pinned");
        pinSpan.dataset.tip = isPinned
            ? chrome.i18n.getMessage("unpinAction") || "取消标记重点"
            : chrome.i18n.getMessage("pinAction") || "标记重点";
        pinSpan.addEventListener("click", async (e) => {
            e.stopPropagation();
            window.globalTooltipManager.hideOverlay();
            const turnId = pinSpan.dataset.targetTurnId;
            const ok = await this.togglePin(turnId);
            if (ok) {
                const nowPinned = this.pinned.has(turnId);
                pinSpan.classList.toggle("not-pinned", !nowPinned);
                pinSpan.dataset.tip = nowPinned
                    ? chrome.i18n.getMessage("unpinAction") || "取消标记重点"
                    : chrome.i18n.getMessage("pinAction") || "标记重点";
            }
        });
        pinSpan.addEventListener("mouseenter", () => {
            window.globalTooltipManager.showOverlay(pinSpan, pinSpan.dataset.tip, { placement: "top" });
        });
        pinSpan.addEventListener("mouseleave", () => {
            window.globalTooltipManager.hideOverlay();
        });

        // 创建星标图标
        const starSpan = document.createElement("span");
        starSpan.className = "timeline-tooltip-star";
        starSpan.dataset.targetTurnId = id;
        if (!isStarred) starSpan.classList.add("not-starred");
        starSpan.dataset.tip = isStarred
            ? chrome.i18n.getMessage("unstarAction") || "取消收藏"
            : chrome.i18n.getMessage("starAction") || "收藏到文件夹";
        starSpan.addEventListener("click", async (e) => {
            e.stopPropagation();
            window.globalTooltipManager.hideOverlay();
            const turnId = starSpan.dataset.targetTurnId;
            const result = await this.toggleStar(turnId);
            if (result && result.success) {
                const toastColor = {
                    light: { backgroundColor: "#0d0d0d", textColor: "#ffffff", borderColor: "#262626" },
                    dark: { backgroundColor: "#ffffff", textColor: "#1f2937", borderColor: "#d1d5db" },
                };
                if (result.action === "star") {
                    starSpan.classList.remove("not-starred");
                    starSpan.dataset.tip = chrome.i18n.getMessage("unstarAction") || "取消收藏";
                    if (window.globalToastManager) {
                        window.globalToastManager.success(chrome.i18n.getMessage("kxpmzv"), null, {
                            color: toastColor,
                        });
                    }
                } else if (result.action === "unstar") {
                    starSpan.classList.add("not-starred");
                    starSpan.dataset.tip = chrome.i18n.getMessage("starAction") || "收藏到文件夹";
                    if (window.globalToastManager) {
                        window.globalToastManager.info(chrome.i18n.getMessage("pzmvkx"), null, { color: toastColor });
                    }
                }
            }
        });
        starSpan.addEventListener("mouseenter", () => {
            window.globalTooltipManager.showOverlay(starSpan, starSpan.dataset.tip, { placement: "top" });
        });
        starSpan.addEventListener("mouseleave", () => {
            window.globalTooltipManager.hideOverlay();
        });

        actions.appendChild(pinSpan);
        actions.appendChild(starSpan);

        // 组装
        contentWrap.appendChild(content);
        container.appendChild(contentWrap);
        container.appendChild(actions);

        return container;
    }

    /**
     * ✅ 已废弃：完全使用 GlobalTooltipManager
     * 保留此方法签名以避免可能的调用错误
     */
    _showTooltipImmediate(dot) {
        console.warn("[TimelineManager] _showTooltipImmediate is deprecated, use GlobalTooltipManager instead");
        // 降级：使用全局管理器
        if (typeof window.globalTooltipManager !== "undefined" && dot) {
            const id = dot.dataset.targetTurnId;
            const messageText = (dot.getAttribute("aria-label") || "").trim();
            const contentElement = this._buildNodeTooltipElement(dot, messageText);
            window.globalTooltipManager.show(id, "node", dot, { element: contentElement });
        }
    }

    /**
     * ✅ 优化：获取 Tooltip 文本（提取为独立方法）
     */
    _getTooltipText(dot) {
        let text = (dot.getAttribute("aria-label") || "").trim();

        try {
            const id = dot.dataset.targetTurnId;
            if (id && this.starred.has(id)) {
                text = `★ ${text}`;
            }
        } catch {}

        return text;
    }

    hideTooltip(immediate = false) {
        window.globalTooltipManager.hide(immediate);
    }

    /**
     * ✅ 已废弃：完全使用 GlobalTooltipManager
     */
    placeTooltipAt(dot, placement, width, height) {
        console.warn("[TimelineManager] placeTooltipAt is deprecated, use GlobalTooltipManager instead");
    }

    /**
     * ✅ 已废弃：完全使用 GlobalTooltipManager
     */
    refreshTooltipForDot(dot) {
        console.warn("[TimelineManager] refreshTooltipForDot is deprecated, use GlobalTooltipManager instead");
    }

    /**
     * ✅ 更新 tooltip 中的星标状态（如果 tooltip 正在显示该节点）
     * 用于：当通过收藏面板或 storage 同步改变收藏状态时，更新已显示的 tooltip
     */
    _updateTooltipStarIfVisible(dotElement, turnId) {
        if (!dotElement || !turnId) return;

        try {
            // 检查 GlobalTooltipManager 是否正在显示此节点的 tooltip
            const tooltipManager = window.globalTooltipManager;
            if (!tooltipManager || !tooltipManager.state || !tooltipManager.state.isVisible) {
                return;
            }

            // 检查当前 tooltip 是否属于这个节点
            const currentId = tooltipManager.state.currentId;
            if (!currentId || !currentId.includes(turnId)) {
                return;
            }

            // 查找 tooltip 中的星标图标
            const tooltipInstances = tooltipManager.instances;
            for (const [type, instance] of tooltipInstances) {
                if (instance && instance.tooltip) {
                    const starSpan = instance.tooltip.querySelector(".timeline-tooltip-star");
                    if (starSpan && starSpan.dataset.targetTurnId === turnId) {
                        // 更新星标状态
                        const isStarred = this.starred.has(turnId);
                        if (isStarred) {
                            starSpan.classList.remove("not-starred");
                        } else {
                            starSpan.classList.add("not-starred");
                        }
                        break;
                    }
                }
            }
        } catch (e) {
            // 静默失败，不影响主流程
        }
    }

    /**
     * ✅ 更新时间轴高度和包装容器位置
     */
    updateTimelineHeight() {
        if (!this.ui.timelineBar || !this.ui.wrapper) return;

        const position = this.adapter.getTimelinePosition();
        if (!position || !position.top || !position.bottom) return;

        const defaultTop = parseInt(position.top, 10) || 100;
        const defaultBottom = parseInt(position.bottom, 10) || 100;

        // 统一使用默认高度
        const topValue = `${defaultTop}px`;
        const bottomValue = `${defaultBottom}px`;

        // 设置包装容器位置（包含时间轴和收藏按钮）
        this.ui.wrapper.style.top = topValue;

        // 设置时间轴高度
        this.ui.timelineBar.style.height = `max(200px, calc(100vh - ${topValue} - ${bottomValue}))`;

        // ✅ 收藏按钮使用相对定位，不需要动态调整位置
    }

    /**
     * 更新时间轴几何布局
     *
     * 核心逻辑：将归一化位置（n，范围 0-1）转换为时间轴上的实际像素位置
     *
     * 布局策略：
     * 1. 计算可用空间：usableC = contentHeight - 2*pad
     *    - 顶部预留 pad 像素
     *    - 底部预留 pad 像素
     *    - 中间是实际可用空间
     *
     * 2. 计算节点位置：y = pad + n * usableC
     *    - 第一个节点（n=0）：y = pad（离顶部有边距）
     *    - 最后一个节点（n=1）：y = pad + usableC = contentHeight - pad（离底部有边距）
     *    - 中间节点按比例分布
     *
     * 3. 应用最小间距约束：确保相邻节点之间至少有 minGap 像素
     */
    updateTimelineGeometry() {
        if (!this.ui.timelineBar || !this.ui.trackContent) return;

        // ✅ 检查并更新紧凑模式
        this.updateCompactMode();

        const H = this.ui.timelineBar.clientHeight || 0;
        const pad = this.getTrackPadding();
        const N = this.markers.length;

        let adjusted;

        if (this.isCompactMode) {
            // ✅ 紧凑模式：均匀分布，间距自适应，整体垂直居中
            this.contentHeight = H;
            this.scale = 1;
            try {
                this.ui.trackContent.style.height = `${H}px`;
            } catch {}

            const defaultGap = this.getCompactGap();
            const usableH = Math.max(1, H - 2 * pad);
            const requiredHeight = Math.max(0, N - 1) * defaultGap;

            // 如果空间不足，自动缩小间距
            const actualGap =
                N <= 1 ? defaultGap : requiredHeight > usableH ? usableH / Math.max(1, N - 1) : defaultGap;

            const totalHeight = Math.max(0, N - 1) * actualGap;
            const startY = (H - totalHeight) / 2; // 垂直居中
            adjusted = this.markers.map((_, i) => startY + i * actualGap);
        } else {
            // 正常模式：原有逻辑
            const minGap = this.getMinGap();
            const desired = Math.max(H, N > 0 ? 2 * pad + Math.max(0, N - 1) * minGap : H);
            this.contentHeight = Math.ceil(desired);
            this.scale = H > 0 ? this.contentHeight / H : 1;
            try {
                this.ui.trackContent.style.height = `${this.contentHeight}px`;
            } catch {}

            const usableC = Math.max(1, this.contentHeight - 2 * pad);
            const desiredY = this.markers.map((m) => pad + Math.max(0, Math.min(1, m.visualN ?? 0)) * usableC);
            adjusted = this.applyMinGap(desiredY, pad, pad + usableC, minGap);
        }

        this.yPositions = adjusted;

        // ✅ 更新 dotN（经过 minGap 调整的圆点定位值）
        const usableForN = Math.max(1, this.contentHeight - 2 * pad);
        for (let i = 0; i < N; i++) {
            const top = adjusted[i];
            const dn = (top - pad) / usableForN;
            // dotN: 用于圆点 CSS 定位（经过 minGap 调整）
            this.markers[i].dotN = Math.max(0, Math.min(1, dn));
            if (this.markers[i].dotElement && !this.usePixelTop) {
                try {
                    this.markers[i].dotElement.style.setProperty("--n", String(this.markers[i].dotN));
                } catch {}
            }
        }
        if (this._cssVarTopSupported === null) {
            this._cssVarTopSupported = this.detectCssVarTopSupport(pad, usableForN);
            this.usePixelTop = !this._cssVarTopSupported;
        }
    }

    detectCssVarTopSupport(pad, usableC) {
        try {
            if (!this.ui.trackContent) return false;
            const test = document.createElement("button");
            test.className = "ait-timeline-dot";
            test.style.visibility = "hidden";
            test.style.pointerEvents = "none";
            test.setAttribute("aria-hidden", "true");
            const expected = pad + 0.5 * usableC;
            test.style.setProperty("--n", "0.5");
            this.ui.trackContent.appendChild(test);
            const cs = getComputedStyle(test);
            const topStr = cs.top || "";
            const px = parseFloat(topStr);
            test.remove();
            if (!Number.isFinite(px)) return false;
            return Math.abs(px - expected) <= TIMELINE_CONFIG.CSS_VAR_DETECTION_TOLERANCE;
        } catch {
            return false;
        }
    }

    syncTimelineTrackToMain() {
        if (!this.ui.track || !this.scrollContainer || !this.contentHeight) return;
        const scrollTop = this.scrollContainer.scrollTop;
        const ref = scrollTop + this.scrollContainer.clientHeight * 0.45;
        const span = Math.max(1, this.contentSpanPx || 1);
        const r = Math.max(0, Math.min(1, (ref - (this.firstUserTurnOffset || 0)) / span));
        const maxScroll = Math.max(0, this.contentHeight - (this.ui.track.clientHeight || 0));
        const target = Math.round(r * maxScroll);
        if (Math.abs((this.ui.track.scrollTop || 0) - target) > 1) {
            this.ui.track.scrollTop = target;
        }
    }

    updateVirtualRangeAndRender() {
        const localVersion = this.markersVersion;
        if (!this.ui.track || !this.ui.trackContent || this.markers.length === 0) return;
        const st = this.ui.track.scrollTop || 0;
        const vh = this.ui.track.clientHeight || 0;
        const buffer = Math.max(TIMELINE_CONFIG.VIRTUAL_BUFFER_MIN, vh);
        const minY = st - buffer;
        const maxY = st + vh + buffer;
        const start = this.lowerBound(this.yPositions, minY);
        const end = Math.max(start - 1, this.upperBound(this.yPositions, maxY));

        let prevStart = this.visibleRange.start;
        let prevEnd = this.visibleRange.end;
        const len = this.markers.length;
        // Clamp previous indices into current bounds to avoid undefined access
        if (len > 0) {
            prevStart = Math.max(0, Math.min(prevStart, len - 1));
            prevEnd = Math.max(-1, Math.min(prevEnd, len - 1));
        }
        if (prevEnd >= prevStart) {
            for (let i = prevStart; i < Math.min(start, prevEnd + 1); i++) {
                const m = this.markers[i];
                if (m && m.dotElement) {
                    try {
                        m.dotElement.remove();
                    } catch {}
                    m.dotElement = null;
                }
            }
            for (let i = Math.max(end + 1, prevStart); i <= prevEnd; i++) {
                const m = this.markers[i];
                if (m && m.dotElement) {
                    try {
                        m.dotElement.remove();
                    } catch {}
                    m.dotElement = null;
                }
            }
        } else {
            (this.ui.trackContent || this.ui.timelineBar)
                .querySelectorAll(".ait-timeline-dot")
                .forEach((n) => n.remove());
            this.markers.forEach((m) => {
                m.dotElement = null;
            });
        }

        const frag = document.createDocumentFragment();
        for (let i = start; i <= end; i++) {
            const marker = this.markers[i];
            if (!marker) continue;
            if (!marker.dotElement) {
                const dot = document.createElement("button");
                dot.className = "ait-timeline-dot";
                dot.dataset.targetTurnId = marker.id;
                dot.setAttribute("aria-label", marker.summary);
                dot.setAttribute("tabindex", "0");
                try {
                    dot.setAttribute("aria-describedby", "chat-timeline-tooltip");
                } catch {}
                try {
                    dot.style.setProperty("--n", String(marker.dotN || 0));
                } catch {}
                if (this.usePixelTop) {
                    dot.style.top = `${Math.round(this.yPositions[i])}px`;
                }
                // Apply active state immediately if this is the active marker
                try {
                    dot.classList.toggle("active", marker.id === this.activeTurnId);
                } catch {}
                // ✅ 添加：如果已收藏，添加 starred 类（标记点变橙金色）
                try {
                    dot.classList.toggle("starred", this.starred.has(marker.id));
                } catch {}
                // ✅ 添加：如果已标记，添加 pinned 类（CSS自动显示图钉）
                try {
                    dot.classList.toggle("pinned", this.pinned.has(marker.id));
                } catch {}
                // ✅ 添加：奇偶标识（用于紧凑模式长短交替）
                try {
                    dot.classList.add(i % 2 === 0 ? "line-even" : "line-odd");
                } catch {}
                marker.dotElement = dot;
                frag.appendChild(dot);
            } else {
                try {
                    marker.dotElement.style.setProperty("--n", String(marker.dotN || 0));
                } catch {}
                if (this.usePixelTop) {
                    marker.dotElement.style.top = `${Math.round(this.yPositions[i])}px`;
                }
                // ✅ 移除：不再更新圆点的 starred 类
            }
        }
        if (localVersion !== this.markersVersion) return; // stale pass, abort
        if (frag.childNodes.length) this.ui.trackContent.appendChild(frag);
        this.visibleRange = { start, end };

        // ✅ 节点渲染完成后，重新渲染图钉
        requestAnimationFrame(() => {
            this.renderPinMarkers();
        });
    }

    lowerBound(arr, x) {
        let lo = 0,
            hi = arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (arr[mid] < x) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    upperBound(arr, x) {
        let lo = 0,
            hi = arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (arr[mid] <= x) lo = mid + 1;
            else hi = mid;
        }
        return lo - 1;
    }

    computePlacementInfo(dot) {
        // ✅ 使用 document.body 作为参考（tooltip 已经不由 Timeline 创建）
        const dotRect = dot.getBoundingClientRect();
        const vw = window.innerWidth;

        // ✅ 使用缓存的配置值
        const config = this.tooltipConfigCache || {};
        const arrowOut = config.arrowOut ?? 6;
        const baseGap = config.baseGap ?? 12;
        const boxGap = config.boxGap ?? 8;
        const maxW = config.maxW ?? 288;

        const gap = baseGap + Math.max(0, arrowOut) + Math.max(0, boxGap);
        const viewportPad = 8;
        const minW = 160;
        const leftAvail = Math.max(0, dotRect.left - gap - viewportPad);
        const rightAvail = Math.max(0, vw - dotRect.right - gap - viewportPad);
        let placement = rightAvail > leftAvail ? "right" : "left";
        let avail = placement === "right" ? rightAvail : leftAvail;
        // choose width tier for determinism
        const tiers = [280, 240, 200, 160];
        const hardMax = Math.max(minW, Math.min(maxW, Math.floor(avail)));
        let width = tiers.find((t) => t <= hardMax) || Math.max(minW, Math.min(hardMax, 160));
        // if no tier fits (very tight), try switching side
        if (width < minW && placement === "left" && rightAvail > leftAvail) {
            placement = "right";
            avail = rightAvail;
            const hardMax2 = Math.max(minW, Math.min(maxW, Math.floor(avail)));
            width = tiers.find((t) => t <= hardMax2) || Math.max(120, Math.min(hardMax2, minW));
        } else if (width < minW && placement === "right" && leftAvail >= rightAvail) {
            placement = "left";
            avail = leftAvail;
            const hardMax2 = Math.max(minW, Math.min(maxW, Math.floor(avail)));
            width = tiers.find((t) => t <= hardMax2) || Math.max(120, Math.min(hardMax2, minW));
        }
        width = Math.max(120, Math.min(width, maxW));
        return { placement, width };
    }

    /**
     * ✅ 优化：截断文本为 5 行（添加缓存 + Emoji 安全截断）
     */
    truncateToFiveLines(text, targetWidth, wantLayout = false) {
        try {
            if (!this.measureEl) {
                return wantLayout ? { text, height: 0 } : text;
            }

            // ✅ 优化：检查缓存
            const cacheKey = `${text}|${targetWidth}|${wantLayout}`;
            if (this.truncateCache.has(cacheKey)) {
                return this.truncateCache.get(cacheKey);
            }

            // ✅ 使用缓存的配置值
            const config = this.tooltipConfigCache || {};
            const lineH = config.lineH ?? 18;
            const padY = config.padY ?? 10;

            // ✅ 重新设计：maxH 应该是内容区的最大高度（5行 + padding）
            // measureEl 已经模拟了内容区的样式（有 padding），所以不需要加 border
            const maxH = Math.round(5 * lineH + 2 * padY);
            const ell = "…";
            const el = this.measureEl;
            el.style.width = `${Math.max(0, Math.floor(targetWidth))}px`;

            // fast path: full text fits within 5 lines
            el.textContent = String(text || "")
                .replace(/\s+/g, " ")
                .trim();
            let h = el.offsetHeight;
            if (h <= maxH) {
                const result = wantLayout ? { text: el.textContent, height: h } : el.textContent;
                // ✅ 优化：存入缓存（限制大小避免内存泄漏）
                this._addToTruncateCache(cacheKey, result);
                return result;
            }

            // binary search longest prefix that fits
            const raw = el.textContent;
            let lo = 0,
                hi = raw.length,
                ans = 0;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                // ✅ 优化：使用 Emoji 安全截断
                const slice = this._safeSlice(raw, mid);
                el.textContent = slice.trimEnd() + ell;
                h = el.offsetHeight;
                if (h <= maxH) {
                    ans = mid;
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }

            // ✅ 优化：最终截断也使用安全方法
            const out = ans >= raw.length ? raw : this._safeSlice(raw, ans).trimEnd() + ell;
            el.textContent = out;
            h = el.offsetHeight;

            const result = wantLayout ? { text: out, height: Math.min(h, maxH) } : out;
            // ✅ 优化：存入缓存
            this._addToTruncateCache(cacheKey, result);
            return result;
        } catch (e) {
            return wantLayout ? { text, height: 0 } : text;
        }
    }

    /**
     * ✅ 优化：安全截断字符串（避免破坏 Emoji/代理对）
     */
    _safeSlice(text, end) {
        if (end >= text.length) return text;
        if (end <= 0) return "";

        // 检查是否在代理对中间截断（Emoji 等多字节字符）
        const charCode = text.charCodeAt(end - 1);

        // 高代理对范围 0xD800-0xDBFF
        if (charCode >= 0xd800 && charCode <= 0xdbff) {
            // 向前退一位，避免截断代理对
            return text.slice(0, end - 1);
        }

        return text.slice(0, end);
    }

    /**
     * ✅ 优化：添加到截断缓存（LRU 策略，限制大小）
     */
    _addToTruncateCache(key, value) {
        const MAX_CACHE_SIZE = 100;

        // 如果缓存已满，删除最旧的条目（Map 的第一个）
        if (this.truncateCache.size >= MAX_CACHE_SIZE) {
            const firstKey = this.truncateCache.keys().next().value;
            this.truncateCache.delete(firstKey);
        }

        this.truncateCache.set(key, value);
    }

    scheduleScrollSync() {
        if (this.scrollRafId !== null) return;
        this.scrollRafId = requestAnimationFrame(() => {
            this.scrollRafId = null;

            // 节流：最多每秒重算一次节点位置，避免每帧触发强制重排
            const now = Date.now();
            if (now - (this._lastRecalcTime || 0) >= 1000) {
                this._lastRecalcTime = now;
                this._recalcMarkerPositions();
            }

            // Sync long-canvas scroll and virtualized dots before computing active
            this.syncTimelineTrackToMain();
            this.updateVirtualRangeAndRender();
            this.computeActiveByScroll();
        });
    }

    /**
     * 管理底部空白元素，确保最后节点可滚动激活
     * @param {number} lastOffsetTop - 最后节点的 offsetTop
     * @param {number} cleanMaxScrollTop - 不含空白元素的最大滚动距离
     */
    _updateScrollPadding(lastOffsetTop, cleanMaxScrollTop) {
        if (!this.conversationContainer) return;

        // ✅ 如果节点数 <= 1，不需要 padding，移除已存在的元素并返回
        if (this.markers.length <= 1) {
            const existingPadding = this.conversationContainer.querySelector(".ait-scroll-padding");
            if (existingPadding) {
                existingPadding.remove();
                this._currentPadding = 0;
            }
            return;
        }

        // 查找 padding 元素
        let paddingEl = this.conversationContainer.querySelector(".ait-scroll-padding");

        // isAIGenerating: null=未实现, true=生成中, false=生成结束
        const aiGeneratingState = this.adapter?.isAIGenerating?.();

        const containerStyle = window.getComputedStyle(this.conversationContainer);
        const isReversed = containerStyle.flexDirection === "column-reverse";

        // 创建 padding 元素（order:9999 确保视觉在底部）
        if (!paddingEl) {
            paddingEl = document.createElement("div");
            paddingEl.className = "ait-scroll-padding";
            paddingEl.style.cssText =
                "pointer-events: none; width: 100%; flex-shrink: 0; order: 9999; height: 0; transition: height 0.3s ease-out;";
            this._currentPadding = 0;
        }

        // 定位 padding：避免成为 lastChild 以免干扰平台的自动滚动逻辑
        if (isReversed) {
            if (paddingEl !== this.conversationContainer.firstElementChild) {
                this.conversationContainer.prepend(paddingEl);
            }
        } else {
            const isFlexContainer = /flex/.test(containerStyle.display || "");
            if (isFlexContainer) {
                const tailEl = this.conversationContainer.lastElementChild;
                if (!tailEl) {
                    this.conversationContainer.appendChild(paddingEl);
                } else if (tailEl === paddingEl) {
                    let anchor = paddingEl.previousElementSibling;
                    while (anchor && anchor.classList?.contains("ait-scroll-padding")) {
                        anchor = anchor.previousElementSibling;
                    }
                    if (anchor) {
                        this.conversationContainer.insertBefore(paddingEl, anchor);
                    }
                } else {
                    if (
                        paddingEl.parentElement !== this.conversationContainer ||
                        paddingEl.nextElementSibling !== tailEl
                    ) {
                        this.conversationContainer.insertBefore(paddingEl, tailEl);
                    }
                }
            } else {
                if (paddingEl !== this.conversationContainer.lastElementChild) {
                    this.conversationContainer.appendChild(paddingEl);
                }
            }
        }

        // 只有1个节点或未实现检测时，高度设为0
        const shouldSetZeroHeight = this.markers.length <= 1 || aiGeneratingState === null;
        if (shouldSetZeroHeight) {
            if (this._currentPadding !== 0) {
                paddingEl.style.height = "0px";
                this._currentPadding = 0;
            }
            return;
        }

        // AI 生成中：保持高度不变
        if (aiGeneratingState === true) {
            return;
        }

        // AI 生成结束：计算 padding = lastOffsetTop - ACTIVATE_AHEAD + 20 - cleanMaxScrollTop
        // 向上取整，确保 padding 足够激活最后节点
        const paddingNeeded = Math.ceil(Math.max(0, lastOffsetTop - this.ACTIVATE_AHEAD + 20 - cleanMaxScrollTop));

        // 只有高度变化时才更新（触发 CSS 过渡动画）
        if (this._currentPadding !== paddingNeeded) {
            paddingEl.style.height = paddingNeeded + "px";
            this._currentPadding = paddingNeeded;
        }
    }

    /**
     * ✅ 获取"干净"的滚动区域尺寸（不包含我们添加的空白元素）
     * @returns {{ scrollHeight: number, clientHeight: number, maxScrollTop: number }}
     */
    _getCleanScrollMetrics() {
        if (!this.scrollContainer) {
            return { scrollHeight: 0, clientHeight: 0, maxScrollTop: 0 };
        }

        const clientHeight = this.scrollContainer.clientHeight;
        // 减去 padding 元素高度
        const paddingEl = this.conversationContainer?.querySelector(".ait-scroll-padding");
        const actualPadding = paddingEl ? paddingEl.offsetHeight : 0;
        const cleanScrollHeight = this.scrollContainer.scrollHeight - actualPadding;
        const cleanMaxScrollTop = Math.max(cleanScrollHeight - clientHeight, 0);

        return { scrollHeight: cleanScrollHeight, clientHeight, maxScrollTop: cleanMaxScrollTop };
    }

    /**
     * 重新计算节点位置（offsetTop, visualN），不重建节点
     */
    _recalcMarkerPositions() {
        if (!this.scrollContainer || this.markers.length === 0) return;

        // DOM 引用失效时触发完整重算
        const hasInvalidElement = this.markers.some((m) => !m.element?.isConnected);
        if (hasInvalidElement) {
            if (!this._pendingDomRefresh) {
                this._pendingDomRefresh = true;
                requestAnimationFrame(() => {
                    this._pendingDomRefresh = false;
                    this.recalculateAndRenderMarkers();
                });
            }
            return;
        }

        const getOffsetTop = (element, container) => {
            const elemRect = element.getBoundingClientRect();
            const contRect = container.getBoundingClientRect();
            return elemRect.top - contRect.top + (container.scrollTop || 0);
        };

        const { maxScrollTop: cleanMaxScrollTop } = this._getCleanScrollMetrics();
        const nodeOffsets = this.markers.map((m) => getOffsetTop(m.element, this.scrollContainer));
        const firstOffsetTop = nodeOffsets[0];
        const lastOffsetTop = nodeOffsets[nodeOffsets.length - 1];
        const contentSpan = lastOffsetTop - firstOffsetTop || 1;

        this.debouncedUpdateScrollPadding(lastOffsetTop, cleanMaxScrollTop);

        let visualNChanged = false;
        this.markers.forEach((m, index) => {
            m.offsetTop = nodeOffsets[index];

            const nodeHeight = m.element.offsetHeight || 0;
            m.offsetBottom = m.offsetTop + nodeHeight;

            // visualN: 位置比例 0~1
            const offsetFromStart = m.offsetTop - firstOffsetTop;
            let newVisualN = offsetFromStart / contentSpan;
            newVisualN = Math.round(Math.max(0, Math.min(1, newVisualN)) * 1000000) / 1000000;

            if (Math.abs(newVisualN - (m.visualN || 0)) > 0.000001) {
                visualNChanged = true;
            }
            m.visualN = newVisualN;
        });

        if (visualNChanged) {
            this.updateTimelineGeometry();
        }
    }

    /**
     * 根据滚动位置计算当前激活节点
     * 激活最后一个 (offsetTop - 提前量) <= scrollTop 的节点
     */
    computeActiveByScroll() {
        if (!this.scrollContainer || this.markers.length === 0) return;

        const isReverseScroll = typeof this.adapter.isReverseScroll === "function" && this.adapter.isReverseScroll();

        let activeId = this.markers[0].id;

        if (isReverseScroll) {
            // 反向滚动：实时计算位置
            const containerTop = this.scrollContainer.getBoundingClientRect().top;
            const activateThreshold = containerTop + this.ACTIVATE_AHEAD;

            for (let i = this.markers.length - 1; i >= 0; i--) {
                const m = this.markers[i];
                if (!m.element) continue;
                if (m.element.getBoundingClientRect().top <= activateThreshold) {
                    activeId = m.id;
                    break;
                }
            }
        } else {
            // 正常滚动：使用缓存的 offsetTop
            const scrollTop = this.scrollContainer.scrollTop;
            for (let i = 0; i < this.markers.length; i++) {
                const m = this.markers[i];
                if (m.offsetTop - this.ACTIVATE_AHEAD <= scrollTop) {
                    activeId = m.id;
                } else {
                    break;
                }
            }
        }

        // 更新激活状态（防抖）
        if (this.activeTurnId !== activeId) {
            const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
            const since = now - this.lastActiveChangeTime;
            if (since < TIMELINE_CONFIG.MIN_ACTIVE_CHANGE_INTERVAL) {
                this.pendingActiveId = activeId;
                if (!this.activeChangeTimer) {
                    const delay = Math.max(TIMELINE_CONFIG.MIN_ACTIVE_CHANGE_INTERVAL - since, 0);
                    this.activeChangeTimer = setTimeout(() => {
                        this.activeChangeTimer = null;
                        if (this.pendingActiveId && this.pendingActiveId !== this.activeTurnId) {
                            const previousId = this.activeTurnId;
                            this.activeTurnId = this.pendingActiveId;
                            this.updateActiveDotUI();
                            this.lastActiveChangeTime =
                                typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
                            // ✅ 对外派发激活节点变化事件
                            this._emitActiveChange(previousId, this.activeTurnId);
                        }
                        this.pendingActiveId = null;
                    }, delay);
                }
            } else {
                const previousId = this.activeTurnId;
                this.activeTurnId = activeId;
                this.updateActiveDotUI();
                this.lastActiveChangeTime = now;
                // ✅ 对外派发激活节点变化事件
                this._emitActiveChange(previousId, activeId);
            }
        }
    }

    /**
     * ✅ 对外派发激活节点变化事件
     * @param {string} previousId - 变化前的激活节点 ID
     * @param {string} currentId - 当前激活的节点 ID
     */
    _emitActiveChange(previousId, currentId) {
        // 查找当前和之前激活节点的索引
        const currentIndex = this.markers.findIndex((m) => m.id === currentId);
        const previousIndex = previousId ? this.markers.findIndex((m) => m.id === previousId) : -1;
        const totalCount = this.markers.length;
        const isFirst = currentIndex === 0;
        const isLast = currentIndex === totalCount - 1;

        // 滚动方向：1=向下（index增加），-1=向上（index减少），0=初始化
        const direction = previousIndex === -1 ? 0 : currentIndex > previousIndex ? 1 : -1;

        // ✅ previousIndex 无效时不对外派发
        if (previousIndex === -1) {
            return;
        }

        // ✅ 存储最新的激活状态，外部可通过 window.timelineManager.lastActiveChange 获取
        this.lastActiveChange = {
            currentIndex,
            totalCount,
            isFirst,
            isLast,
            direction,
            timestamp: Date.now(),
        };

        try {
            console.log("[Timeline] 📢 timeline:activeChange detail:", {
                currentIndex,
                previousIndex,
                totalCount,
                isFirst,
                isLast,
                direction,
            });
            window.dispatchEvent(
                new CustomEvent("timeline:activeChange", {
                    detail: {
                        currentIndex, // 当前选中节点索引（0-based）
                        previousIndex, // 之前选中节点索引（-1 表示初始化）
                        totalCount, // 当前节点总数
                        isFirst, // 是否是第一个节点（顶部）
                        isLast, // 是否是最后一个节点（底部）
                        direction, // 滚动方向：1=向下，-1=向上，0=初始化
                    },
                }),
            );
        } catch (e) {
            // 静默处理事件派发失败
        }
    }

    waitForElement(selector) {
        return new Promise((resolve) => {
            const element = document.querySelector(selector);
            if (element) return resolve(element);
            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    try {
                        observer.disconnect();
                    } catch {}
                    resolve(el);
                }
            });
            try {
                observer.observe(document.body, { childList: true, subtree: true });
            } catch {}
            // Guard against long-lived observers on wrong pages
            setTimeout(() => {
                TimelineUtils.disconnectObserverSafe(observer);
                resolve(null);
            }, TIMELINE_CONFIG.OBSERVER_TIMEOUT);
        });
    }

    destroy() {
        // Disconnect observers
        TimelineUtils.disconnectObserverSafe(this.mutationObserver);
        TimelineUtils.disconnectObserverSafe(this.resizeObserver);
        TimelineUtils.disconnectObserverSafe(this.intersectionObserver);

        // 取消 DOMObserverManager 订阅
        if (this._unsubscribeDomCheck) {
            this._unsubscribeDomCheck();
            this._unsubscribeDomCheck = null;
        }
        if (this._unsubscribeTheme) {
            this._unsubscribeTheme();
            this._unsubscribeTheme = null;
        }

        // ✅ 清理健康检查定时器
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        // ✅ 清理节点上的时间标签
        this.cleanupNodeTimeLabels();

        // ✅ 销毁时间记录器（解耦模块）
        if (typeof destroyChatTimeRecorder === "function") {
            destroyChatTimeRecorder();
        }

        this.visibleUserTurns.clear();

        // ✅ 优化：清理媒体查询监听器
        if (this.mediaQuery && this.mediaQueryHandler) {
            try {
                if (this.mediaQuery.removeEventListener) {
                    this.mediaQuery.removeEventListener("change", this.mediaQueryHandler);
                } else {
                    this.mediaQuery.removeListener(this.mediaQueryHandler);
                }
            } catch {}
        }

        // Remove event listeners
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, "click", this.onTimelineBarClick);
        // ✅ 清理键盘导航监听器
        TimelineUtils.removeEventListenerSafe(document, "keydown", this.onKeyDown);
        // ✅ 正确清理存储监听器（使用 StorageAdapter）
        try {
            if (this.onStorage) {
                StorageAdapter.removeChangeListener(this.onStorage);
            }
        } catch {}
        // ✅ 清理长按相关的事件监听器
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, "mousedown", this.startLongPress);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, "touchstart", this.startLongPress);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, "mousemove", this.checkLongPressMove);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, "touchmove", this.checkLongPressMove);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, "mouseup", this.cancelLongPress);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, "mouseleave", this.cancelLongPress);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, "touchend", this.cancelLongPress);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, "touchcancel", this.cancelLongPress);
        TimelineUtils.removeEventListenerSafe(this.scrollContainer, "scroll", this.onScroll, { passive: true });
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, "mouseover", this.onTimelineBarOver);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, "mouseout", this.onTimelineBarOut);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, "focusin", this.onTimelineBarFocusIn);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, "focusout", this.onTimelineBarFocusOut);
        // ✅ 注意：不再需要清理 tooltip 事件监听器（因为 tooltip 不由 Timeline 创建）
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, "wheel", this.onTimelineWheel);
        TimelineUtils.removeEventListenerSafe(window, "resize", this.onWindowResize);
        TimelineUtils.removeEventListenerSafe(window.visualViewport, "resize", this.onVisualViewportResize);

        // Clear timers and RAF
        this.scrollRafId = TimelineUtils.clearRafSafe(this.scrollRafId);
        this.activeChangeTimer = TimelineUtils.clearTimerSafe(this.activeChangeTimer);
        // ✅ 移除：tooltipHideTimer 由 GlobalTooltipManager 管理
        this.tooltipUpdateDebounceTimer = TimelineUtils.clearTimerSafe(this.tooltipUpdateDebounceTimer);
        this.resizeIdleTimer = TimelineUtils.clearTimerSafe(this.resizeIdleTimer);
        this.resizeIdleRICId = TimelineUtils.clearIdleCallbackSafe(this.resizeIdleRICId);
        // ✅ 移除：longPressTimer 已删除
        this.zeroTurnsTimer = TimelineUtils.clearTimerSafe(this.zeroTurnsTimer);
        this.showRafId = TimelineUtils.clearRafSafe(this.showRafId);

        // Remove DOM elements
        TimelineUtils.removeElementSafe(this.ui.timelineBar);
        // ✅ 注意：不再清理 tooltip（由 GlobalTooltipManager 管理）
        TimelineUtils.removeElementSafe(this.measureEl);

        // ✅ 修复：清理收藏按钮
        TimelineUtils.removeElementSafe(this.ui.starredBtn);

        // ✅ 清理闪记按钮，并关闭面板
        if (window.notepadManager && window.notepadManager.isOpen) {
            window.notepadManager.close();
        }
        TimelineUtils.removeElementSafe(this.ui.notepadBtn);

        // ✅ 清理切换按钮
        TimelineUtils.removeElementSafe(this.ui.toggleBtn);

        // ✅ 清理底部空白元素
        if (this.conversationContainer) {
            const paddingEl = this.conversationContainer.querySelector(".ait-scroll-padding");
            if (paddingEl) paddingEl.remove();
        }

        // Clear references
        this.ui = { timelineBar: null, track: null, trackContent: null };
        this.markers = [];
        this.activeTurnId = null;
        this.scrollContainer = null;
        this.conversationContainer = null;
        this.onTimelineBarClick = null;
        this.onTimelineBarOver = null;
        this.onTimelineBarOut = null;
        this.onTimelineBarFocusIn = null;
        this.onTimelineBarFocusOut = null;
        // ✅ 移除：tooltip hover 事件由 GlobalTooltipManager 管理
        this.onScroll = null;
        this.onWindowResize = null;
        this.onVisualViewportResize = null;
        // ✅ 清理长按相关的引用
        this.startLongPress = this.checkLongPressMove = this.cancelLongPress = null;
        // ✅ 清理键盘导航引用
        this.onKeyDown = null;
        this.pendingActiveId = null;
    }

    // --- Star/Highlight helpers ---
    async loadStars() {
        this.starred.clear();
        this.starredIndexes.clear();
        try {
            // 使用完整 URL（去掉协议）筛选当前页面的收藏
            const url = location.href.replace(/^https?:\/\//, "");

            // 使用 StarStorageManager 获取当前 URL 的收藏
            const items = await StarStorageManager.getByUrl(url);

            // ✅ 提取 nodeId/index（支持字符串和数字）
            items.forEach((item) => {
                // 优先使用 nodeId，其次 index
                const nodeKey = item.nodeId !== undefined ? item.nodeId : item.index;
                if (nodeKey !== undefined && nodeKey !== "" && !Number.isNaN(nodeKey)) {
                    this.starredIndexes.add(nodeKey);
                }
            });
        } catch (e) {
            // Silently fail
        }
    }

    /**
     * ✅ 加载标记数据（与loadStars类似）
     */
    async loadPins() {
        this.pinned.clear();
        this.pinnedIndexes.clear();
        try {
            const url = location.href.replace(/^https?:\/\//, "");

            // 使用 PinStorageManager 获取当前 URL 的 Pin
            const items = await PinStorageManager.getByUrl(url);

            // ✅ 提取 nodeId/index（支持字符串和数字，与 loadStars 保持一致）
            items.forEach((item) => {
                // 优先使用 nodeId，其次 index
                const nodeKey = item.nodeId !== undefined ? item.nodeId : item.index;
                if (nodeKey !== undefined && nodeKey !== "" && !Number.isNaN(nodeKey)) {
                    this.pinnedIndexes.add(nodeKey);
                }
            });
        } catch (e) {
            // Silently fail
        }
    }

    /**
     * ✅ 加载箭头键导航功能状态
     */
    async loadArrowKeysNavigationState() {
        try {
            const result = await chrome.storage.local.get("arrowKeysNavigationEnabled");
            // 默认开启（!== false）
            this.arrowKeysNavigationEnabled = result.arrowKeysNavigationEnabled !== false;
        } catch (e) {
            console.error("[Timeline] Failed to load arrow keys navigation state:", e);
            // 读取失败，默认开启
            this.arrowKeysNavigationEnabled = true;
        }
    }

    /**
     * ✅ 加载平台设置
     */
    async loadPlatformSettings() {
        try {
            const result = await chrome.storage.local.get("timelinePlatformSettings");
            this.platformSettings = result.timelinePlatformSettings || {};
        } catch (e) {
            console.error("[Timeline] Failed to load platform settings:", e);
            this.platformSettings = {};
        }
    }

    /**
     * ✅ 清理节点上的时间标签（移除 data-ait-time 属性，::before 自动消失）
     */
    cleanupNodeTimeLabels() {
        document.querySelectorAll("[data-ait-time]").forEach((el) => {
            el.removeAttribute("data-ait-time");
        });
    }

    /**
     * ✅ 检查当前平台是否启用箭头键导航
     */
    isPlatformEnabled() {
        try {
            // 获取当前平台信息
            const platform = getCurrentPlatform();
            if (!platform) return true; // 未知平台，默认启用

            // ✅ 首先检查平台是否支持时间轴功能
            if (platform.features?.timeline !== true) {
                return false; // 平台不支持该功能
            }

            // 从缓存中检查（默认启用）
            return this.platformSettings[platform.id] !== false;
        } catch (e) {
            return true; // 出错默认启用
        }
    }

    /**
     * ✅ 截断文本到指定长度，超出添加 "..."
     *
     * 用途：
     * 用于收藏和标记功能，限制保存的文本长度，保持 UI 整洁。
     *
     * @param {string} text - 原始文本
     * @param {number} maxLength - 最大长度（默认100字符）
     * @returns {string} 截断后的文本
     *
     * @example
     * truncateText('Hello World', 100) // "Hello World"（不超长，原样返回）
     * truncateText('这是一段很长的文本内容需要被截断', 10)   // "这是一段很长的文..."（前10个字符 + "..."）
     */
    truncateText(text, maxLength = 100) {
        if (!text) return "";
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + "...";
    }

    async saveStarItem(index, question) {
        try {
            const urlWithoutProtocol = location.href.replace(/^https?:\/\//, "");
            const key = `chatTimelineStar:${urlWithoutProtocol}:${index}`;
            // ✅ 限制收藏文字长度为前100个字符
            const truncatedQuestion = this.truncateText(question, 100);
            const value = {
                key,
                url: location.href,
                urlWithoutProtocol: urlWithoutProtocol,
                index: index,
                question: truncatedQuestion,
                timestamp: Date.now(),
            };
            await StarStorageManager.add(value);
        } catch (e) {
            // Silently fail
        }
    }

    /**
     * ✅ 保存收藏项（带文件夹）
     * @param {string|number} nodeKey - nodeId（字符串，如 Gemini）或 index（数字）
     * @param {string} question - 收藏的问题文本
     * @param {string|null} folderId - 文件夹 ID
     */
    async saveStarItemWithFolder(nodeKey, question, folderId = null) {
        try {
            const urlWithoutProtocol = location.href.replace(/^https?:\/\//, "");
            const key = `chatTimelineStar:${urlWithoutProtocol}:${nodeKey}`;
            // ✅ 限制收藏文字长度为前100个字符
            const truncatedQuestion = this.truncateText(question, 100);
            const value = {
                key,
                url: location.href,
                urlWithoutProtocol: urlWithoutProtocol,
                // ✅ 根据 nodeKey 类型决定存储字段
                // 字符串：使用 nodeId 字段（Gemini 等）
                // 数字：使用 index 字段（其他网站，兼容旧数据）
                ...(typeof nodeKey === "string" ? { nodeId: nodeKey } : { index: nodeKey }),
                question: truncatedQuestion,
                timestamp: Date.now(),
                folderId: folderId || null,
            };
            await StarStorageManager.add(value);
        } catch (e) {
            // Silently fail
        }
    }

    // ✅ 从 URL 获取网站信息
    getSiteInfoFromUrl(url) {
        try {
            // 提取域名
            let hostname = url;
            if (url.startsWith("http://") || url.startsWith("https://")) {
                hostname = new URL(url).hostname;
            } else {
                // 如果是 url without protocol，取第一个 / 之前的部分
                hostname = url.split("/")[0];
            }

            // 遍历映射字典，查找匹配的域名
            for (const [domain, info] of Object.entries(this.siteNameMap)) {
                if (hostname.includes(domain)) {
                    return info;
                }
            }

            // 如果没有匹配，返回域名的主要部分
            const parts = hostname.split(".");
            if (parts.length >= 2) {
                return {
                    name: parts[parts.length - 2],
                    logo: null,
                };
            }
            return { name: "未知网站", logo: null };
        } catch {
            return { name: "未知网站", logo: null };
        }
    }

    // ✅ 从 URL 获取网站名称
    getSiteNameFromUrl(url) {
        return this.getSiteInfoFromUrl(url).name;
    }

    async removeStarItem(nodeKey) {
        try {
            const url = location.href.replace(/^https?:\/\//, "");
            const key = `chatTimelineStar:${url}:${nodeKey}`;
            await StarStorageManager.remove(key);
        } catch (e) {
            // Silently fail
        }
    }

    async toggleStar(turnId) {
        const id = String(turnId || "");
        if (!id) return { success: false, action: null };

        const m = this.markerMap.get(id);
        if (!m) return { success: false, action: null };

        // ✅ 检查是否是 stableNodeId 平台但还没有真正的 ID
        // 临时 ID 格式：平台名-小数字（如 doubao-0），真实 ID 的数字部分远大于 1000
        const features = getCurrentPlatform()?.features;
        if (features?.stableNodeId) {
            const tempMatch = id.match(/-(\d+)$/);
            const isTempId = tempMatch && parseInt(tempMatch[1], 10) < 1000;
            if (isTempId) {
                if (window.globalToastManager) {
                    window.globalToastManager.info(chrome.i18n.getMessage("pleaseWait") || "请稍等，节点ID正在加载...");
                }
                return { success: false, action: null };
            }
        }

        // ✅ 使用 adapter 提取稳定的 nodeId（可能是字符串或数字）
        // Gemini: 父元素 id（字符串如 'r_abc123'）
        // 其他网站: 数组索引（数字如 0, 1, 2）
        const nodeId = this.adapter.extractIndexFromTurnId?.(id);
        if (nodeId === null || nodeId === undefined) {
            // Fallback: 使用数组索引
            const index = this.markers.indexOf(m);
            if (index === -1) return { success: false, action: null };
        }

        // 最终使用的存储 key（nodeId 或 fallback 到数组索引）
        const storageKey = nodeId !== null && nodeId !== undefined ? nodeId : this.markers.indexOf(m);

        // 切换收藏状态
        if (this.starred.has(id)) {
            // 取消收藏
            this.starred.delete(id);
            this.starredIndexes.delete(storageKey);
            await this.removeStarItem(storageKey);

            // ✅ 兼容性修复：如果 storageKey 是字符串（nodeId），
            // 还需要尝试清理可能存在的旧数据（数字索引）
            // 防止旧数据导致状态复活
            if (typeof storageKey !== "number") {
                const index = this.markers.indexOf(m);
                if (index !== -1) {
                    this.starredIndexes.delete(index);
                    await this.removeStarItem(index);
                }
            }

            m.starred = false;

            // ✅ 更新圆点样式
            if (m.dotElement) {
                try {
                    m.dotElement.classList.remove("starred");
                    this._updateTooltipStarIfVisible(m.dotElement, id);
                } catch {}
            }

            this.updateStarredBtnVisibility();
            return { success: true, action: "unstar" };
        } else {
            // 添加收藏 - 显示弹窗输入主题和选择文件夹
            if (!window.starInputModal) {
                console.error("[TimelineManager] starInputModal not available");
                return { success: false, action: null };
            }

            const result = await window.starInputModal.show({
                title: chrome.i18n.getMessage("zmvkpx"),
                defaultValue: m.summary,
                placeholder: chrome.i18n.getMessage("zmxvkp"),
                folderManager: this.folderManager,
                defaultFolderId: null,
            });

            if (!result) {
                // 用户取消了
                return { success: false, action: "cancelled" };
            }

            this.starred.add(id);
            this.starredIndexes.add(storageKey);
            // ✅ 使用 nodeId 或数组索引保存
            this.saveStarItemWithFolder(storageKey, result.value, result.folderId);

            m.starred = true;

            // ✅ 更新圆点样式
            if (m.dotElement) {
                try {
                    m.dotElement.classList.add("starred");
                    this._updateTooltipStarIfVisible(m.dotElement, id);
                } catch {}
            }

            this.updateStarredBtnVisibility();
            return { success: true, action: "star" };
        }
    }

    // 获取所有收藏的消息（所有网站的收藏，不限于当前网站）
    async getStarredMessages() {
        const starredMessages = [];
        try {
            // ✅ 使用 StarStorageManager 获取所有网站的收藏（跨网站共享）
            const items = await StarStorageManager.getAll();

            // ✅ 辅助函数：解析 nodeKey（支持字符串和数字）
            const parseNodeKey = (keyPart) => {
                if (keyPart === undefined || keyPart === "") return null;
                const parsed = parseInt(keyPart, 10);
                return String(parsed) === keyPart ? parsed : keyPart;
            };

            items.forEach((data) => {
                try {
                    // ✅ 兼容逻辑：优先使用 data 中的字段，缺失则从 data.key 解析
                    let urlWithoutProtocol = data.urlWithoutProtocol;
                    let nodeKey = data.nodeId !== undefined ? data.nodeId : data.index;

                    // 如果字段缺失，从 data.key 中解析（格式：chatTimelineStar:url:nodeKey）
                    if (!urlWithoutProtocol || nodeKey === undefined) {
                        const key = data.key || "";
                        const keyWithoutPrefix = key.replace("chatTimelineStar:", "");
                        const lastColonIndex = keyWithoutPrefix.lastIndexOf(":");

                        if (lastColonIndex !== -1) {
                            if (!urlWithoutProtocol) {
                                urlWithoutProtocol = keyWithoutPrefix.substring(0, lastColonIndex);
                            }
                            if (nodeKey === undefined) {
                                const nodeKeyStr = keyWithoutPrefix.substring(lastColonIndex + 1);
                                nodeKey = parseNodeKey(nodeKeyStr);
                            }
                        }
                    }

                    // 确保 urlWithoutProtocol 有值
                    urlWithoutProtocol = urlWithoutProtocol || "";
                    const fullUrl = data.url || `https://${urlWithoutProtocol}`;

                    // ✅ 处理整个聊天收藏（nodeKey = -1）和普通问题收藏
                    if (nodeKey === -1) {
                        // 整个聊天的收藏
                        const siteInfo = this.getSiteInfoFromUrl(fullUrl);
                        starredMessages.push({
                            index: -1,
                            nodeId: -1,
                            question: data.question || "整个对话",
                            url: fullUrl,
                            urlWithoutProtocol: urlWithoutProtocol,
                            siteName: siteInfo.name,
                            timestamp: data.timestamp || 0,
                            isCurrentPage: urlWithoutProtocol === location.href.replace(/^https?:\/\//, ""),
                        });
                    } else if (
                        nodeKey !== null &&
                        nodeKey !== undefined &&
                        (typeof nodeKey === "string" || (typeof nodeKey === "number" && nodeKey >= 0))
                    ) {
                        // 普通问题的收藏（nodeKey 可以是字符串或非负数字）
                        const siteInfo = this.getSiteInfoFromUrl(fullUrl);
                        starredMessages.push({
                            index: nodeKey, // 兼容旧代码
                            nodeId: nodeKey, // 新字段
                            question: data.question || "",
                            url: fullUrl,
                            urlWithoutProtocol: urlWithoutProtocol,
                            siteName: siteInfo.name,
                            timestamp: data.timestamp || 0,
                            isCurrentPage: urlWithoutProtocol === location.href.replace(/^https?:\/\//, ""),
                        });
                    }
                } catch (e) {
                    // 忽略解析错误的条目
                }
            });
        } catch (e) {
            // Silently fail
        }

        // 按时间倒序排序（最新的在前）
        return starredMessages.sort((a, b) => b.timestamp - a.timestamp);
    }

    // ✅ 复制文本到剪贴板并显示反馈
    async copyToClipboard(text, targetElement) {
        try {
            // 使用现代 Clipboard API
            await navigator.clipboard.writeText(text);

            // 显示复制成功提示
            this.showCopyFeedback(targetElement);
        } catch (err) {
            // 降级方案：使用传统方法
            try {
                const textarea = document.createElement("textarea");
                textarea.value = text;
                textarea.style.position = "fixed";
                textarea.style.left = "-9999px";
                textarea.style.top = "0";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);

                // 显示复制成功提示
                this.showCopyFeedback(targetElement);
            } catch (e) {
                console.error("复制失败:", e);
            }
        }
    }

    // ✅ 显示复制成功的反馈提示（使用全局 Toast 管理器）
    showCopyFeedback(targetElement) {
        window.globalToastManager.success(chrome.i18n.getMessage("xpzmvk"), targetElement);
    }

    // ✅ 显示错误提示（使用全局 Toast 管理器）
    showErrorToast(message, targetElement) {
        window.globalToastManager.error(message, targetElement);
    }

    // ✅ 检查是否有收藏数据
    async hasStarredData() {
        try {
            const items = await StarStorageManager.getAll();
            return items.length > 0;
        } catch (e) {
            return false;
        }
    }

    // ✅ 更新收藏按钮显示状态
    async updateStarredBtnVisibility() {
        if (this.ui.questionListBtn) {
            this.ui.questionListBtn.style.display = "flex";
        }
        if (!this.ui.starredBtn) return;

        // 隐藏收藏按钮（功能已合并到提问列表中）
        this.ui.starredBtn.style.display = "none";

        // 同步显示闪记按钮（受开关控制，默认开启）
        if (this.ui.notepadBtn) {
            try {
                const result = await chrome.storage.local.get("aitNotepadEnabled");
                const enabled = result.aitNotepadEnabled !== false;
                this.ui.notepadBtn.style.display = enabled ? "flex" : "none";
            } catch (e) {
                this.ui.notepadBtn.style.display = "flex";
            }
        }

        // 根据是否有收藏数据来设置不同的颜色状态
        const hasData = await this.hasStarredData();
        if (hasData) {
            // 有收藏记录：移除灰色类，使用橙色
            this.ui.starredBtn.classList.remove("no-starred-data");
        } else {
            // 没有收藏记录：添加灰色类
            this.ui.starredBtn.classList.add("no-starred-data");
        }
    }

    // ✅ 设置导航数据（用于跨页面导航）
    async setNavigateData(key, value) {
        try {
            await StorageAdapter.set(`chatTimelineNavigate:${key}`, value);
        } catch (e) {
            // Silently fail
        }
    }

    // ✅ 设置导航数据（用于跨网站导航，使用目标URL作为key）
    async setNavigateDataForUrl(targetUrl, index) {
        try {
            // 使用目标URL（去掉协议）作为key
            const urlKey = targetUrl.replace(/^https?:\/\//, "");
            await StorageAdapter.set(`chatTimelineCrossNavigate:${urlKey}`, {
                targetIndex: index,
                timestamp: Date.now(),
                expires: Date.now() + 60000, // 1分钟后过期
            });
        } catch (e) {
            // Silently fail
        }
    }

    // ✅ 获取并删除导航数据
    async getNavigateData(key) {
        try {
            const fullKey = `chatTimelineNavigate:${key}`;
            const value = await StorageAdapter.get(fullKey);
            if (value !== undefined) {
                await StorageAdapter.remove(fullKey);
                return value;
            }
        } catch (e) {
            // Silently fail
        }
        return null;
    }

    // ✅ 检查跨网站导航数据
    async checkCrossSiteNavigate() {
        try {
            // 使用当前URL查找导航数据
            const currentUrl = location.href.replace(/^https?:\/\//, "");
            const key = `chatTimelineCrossNavigate:${currentUrl}`;
            const data = await StorageAdapter.get(key);

            if (data && data.targetIndex !== undefined) {
                // 检查是否过期（1分钟）
                if (data.expires && Date.now() < data.expires) {
                    // 删除数据（只使用一次）
                    await StorageAdapter.remove(key);
                    return data.targetIndex;
                } else {
                    // 过期，删除
                    await StorageAdapter.remove(key);
                }
            }
        } catch (e) {
            // Silently fail
        }
        return null;
    }

    escapeHTML(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * ✅ 切换节点的标记状态
     */
    async togglePin(id) {
        if (!id) {
            return false;
        }

        const marker = this.markers.find((m) => m.id === id);
        if (!marker) {
            return false;
        }

        // ✅ 检查是否是 stableNodeId 平台但还没有真正的 ID
        // 临时 ID 格式：平台名-小数字（如 doubao-0），真实 ID 的数字部分远大于 1000
        const features = getCurrentPlatform()?.features;
        if (features?.stableNodeId) {
            const tempMatch = id.match(/-(\d+)$/);
            const isTempId = tempMatch && parseInt(tempMatch[1], 10) < 1000;
            if (isTempId) {
                if (window.globalToastManager) {
                    window.globalToastManager.info(chrome.i18n.getMessage("pleaseWait") || "请稍等，节点ID正在加载...");
                }
                return false;
            }
        }

        // ✅ 使用 adapter 提取稳定的 nodeId（与 toggleStar 一致）
        const nodeId = this.adapter.extractIndexFromTurnId?.(id);
        // 最终使用的存储 key（nodeId 或 fallback 到数组索引）
        const nodeKey = nodeId !== null && nodeId !== undefined ? nodeId : this.markers.indexOf(marker);

        if (nodeKey === -1) {
            return false;
        }

        try {
            // ✅ 修复：动态计算 urlWithoutProtocol
            const urlWithoutProtocol = location.href.replace(/^https?:\/\//, "");
            const key = `chatTimelinePin:${urlWithoutProtocol}:${nodeKey}`;
            const isPinned = await PinStorageManager.findByKey(key);

            if (isPinned) {
                // 取消标记
                await PinStorageManager.remove(key);

                // ✅ 兼容性修复：清理可能存在的旧数据（数字索引）
                if (typeof nodeKey !== "number") {
                    const index = this.markers.indexOf(marker);
                    if (index !== -1) {
                        const oldKey = `chatTimelinePin:${urlWithoutProtocol}:${index}`;
                        await PinStorageManager.remove(oldKey);
                        this.pinnedIndexes.delete(index);
                    }
                }

                marker.pinned = false;
                this.pinned.delete(id);
                this.pinnedIndexes.delete(nodeKey);
            } else {
                // 添加标记
                // ✅ 限制标记文字长度为前100个字符
                const truncatedSummary = this.truncateText(marker.summary || "", 100);
                const pinData = {
                    key,
                    url: location.href,
                    urlWithoutProtocol: urlWithoutProtocol,
                    // ✅ 根据 nodeKey 类型决定存储字段（与 saveStarItemWithFolder 一致）
                    ...(typeof nodeKey === "string" ? { nodeId: nodeKey } : { index: nodeKey }),
                    question: truncatedSummary,
                    siteName: this.getSiteNameFromUrl(location.href),
                    timestamp: Date.now(),
                };
                await PinStorageManager.add(pinData);
                marker.pinned = true;
                this.pinned.add(id);
                this.pinnedIndexes.add(nodeKey);
            }

            // 更新节点UI
            this.updatePinIcon(marker);
            // ✅ 重新渲染所有图钉
            this.renderPinMarkers();
            return true;
        } catch (e) {
            console.error("Failed to toggle pin:", e);
            return false;
        }
    }

    /**
     * ✅ 更新节点的图钉图标显示
     */
    updatePinIcon(marker) {
        // ✅ 简化：只更新 pinned class，图钉在单独的方法中渲染
        if (marker.dotElement) {
            marker.dotElement.classList.toggle("pinned", marker.pinned);
        }
    }

    /**
     * ✅ 渲染所有图钉（独立于节点渲染）
     */
    renderPinMarkers() {
        // 清除所有旧的图钉
        const oldPins = this.ui.timelineBar.querySelectorAll(".timeline-pin-marker");
        oldPins.forEach((pin) => pin.remove());

        // 为所有标记的节点渲染图钉
        this.markers.forEach((marker) => {
            if (marker.pinned && marker.dotElement) {
                const pinMarker = document.createElement("span");
                pinMarker.className = "timeline-pin-marker";
                pinMarker.dataset.markerId = marker.id;

                // 使用节点的 dotN 来定位图钉（与圆点位置一致）
                const n = marker.dotN || 0;
                pinMarker.style.setProperty("--n", String(n));

                // 添加到 timelineBar
                this.ui.timelineBar.appendChild(pinMarker);
            }
        });
    }

    // ✅ 移除：cancelLongPress 方法已删除，长按收藏功能已移除
}
