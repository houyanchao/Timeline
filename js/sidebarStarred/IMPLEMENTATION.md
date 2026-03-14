# 侧边栏树状结构 — DOM 与样式参考

## DOM 结构

```html
<!-- 最外层容器 -->
<div class="ait-sf-container">

  <!-- 头部：标题 + 操作按钮 -->
  <div class="ait-sf-header">
    <span class="ait-sf-title">STARRED</span>
    <div class="ait-sf-header-actions">
      <button class="ait-sf-action-btn"><!-- + 新建文件夹 SVG --></button>
    </div>
  </div>

  <!-- 列表区域 -->
  <div class="ait-sf-list">

    <!-- 文件夹项（可递归嵌套） -->
    <div class="ait-sf-folder-item" data-folder-id="folder_xxx">

      <!-- 文件夹头部行 -->
      <div class="ait-sf-folder-header">
        <!-- 展开/折叠箭头（加 .expanded 时旋转 90°） -->
        <span class="ait-sf-folder-toggle expanded">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 6 15 12 9 18"/>
          </svg>
        </span>
        <!-- 文件夹图标（emoji 或 SVG） -->
        <span class="ait-sf-folder-icon">⭐</span>
        <!-- 文件夹名称 -->
        <span class="ait-sf-folder-name">工作</span>
        <!-- 操作按钮（⋯ 三点菜单，默认隐藏，hover 显示） -->
        <button class="ait-sf-folder-actions-btn">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
          </svg>
        </button>
      </div>

      <!-- 文件夹内容（展开时显示） -->
      <div class="ait-sf-folder-content">

        <!-- 子文件夹（递归，marginLeft 根据 level 递增） -->
        <div class="ait-sf-folder-item" data-folder-id="folder_yyy">
          <div class="ait-sf-folder-header" style="margin-left: 18px;">
            <!-- ... 同上结构 ... -->
          </div>
        </div>

        <!-- 收藏项 -->
        <div class="ait-sf-star-item" data-level="1" style="margin-left: 15px;">
          <span class="ait-sf-star-title">对话标题</span>
          <img class="ait-sf-platform-logo" src="..." alt="Gemini"/>
        </div>

      </div>
    </div>

    <!-- 未分类收藏项（直接在 list 下） -->
    <div class="ait-sf-star-item">
      <span class="ait-sf-star-title">未分类对话</span>
    </div>

    <!-- 空状态 -->
    <div class="ait-sf-empty">暂无收藏</div>

  </div>
</div>
```

### 缩进逻辑

- 文件夹头部：`level > 0` 时 `marginLeft = level * 8 + 10` px
- 收藏项：`level 1 = 15px`，`level 2 = 28px`，`level 3+ = 42px`

---

## 完整 CSS

```css
/* ==================== 容器 ==================== */

.ait-sf-container {
    padding: 8px 0 8px 12px;
    border-bottom: 1px solid var(--gem-sys-color-outline-variant, rgba(0, 0, 0, 0.08));
    font-family: 'Google Sans', 'Helvetica Neue', sans-serif;
    font-size: 16px;
}

/* ==================== 头部 ==================== */

.ait-sf-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 16px 4px 16px;
    min-height: 32px;
    transition: background-color 0.15s;
}

.ait-sf-title {
    font-size: 14px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #444746;
    user-select: none;
}

.ait-sf-header-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    position: relative;
    right: -8px;
}

.ait-sf-action-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #444746;
    transition: background-color 0.15s;
    padding: 0;
}

.ait-sf-action-btn:hover {
    background-color: var(--gem-sys-color-surface-container-highest, rgba(0, 0, 0, 0.06));
}

/* ==================== 文件夹列表 ==================== */

.ait-sf-list {
    padding: 0;
}

.ait-sf-folder-item {
    margin: 0;
}

/* ==================== 文件夹头部行 ==================== */

.ait-sf-folder-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    cursor: pointer;
    border-radius: 20px;
    margin: 0 8px;
    transition: background-color 0.15s;
    user-select: none;
    min-height: 28px;
}

.ait-sf-folder-header:hover {
    background-color: var(--gem-sys-color-surface-container-highest, rgba(0, 0, 0, 0.04));
}

/* ==================== 展开/折叠箭头 ==================== */

.ait-sf-folder-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    transition: transform 0.15s ease;
    color: var(--gem-sys-color-on-surface-variant, #5f6368);
}

.ait-sf-folder-toggle.expanded {
    transform: rotate(90deg);
}

/* ==================== 文件夹图标 ==================== */

.ait-sf-folder-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--gem-sys-color-on-surface-variant, #5f6368);
    font-size: 16px;
    line-height: 1;
}

/* ==================== 文件夹名称 ==================== */

.ait-sf-folder-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    color: #444746;
    line-height: 1.4;
}

/* ==================== 文件夹数量 ==================== */

.ait-sf-folder-count {
    font-size: 13px;
    color: var(--gem-sys-color-on-surface-variant, #5f6368);
    flex-shrink: 0;
    margin-left: 2px;
}

/* ==================== 操作按钮（三点菜单） ==================== */

.ait-sf-folder-actions-btn {
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--gem-sys-color-on-surface-variant, #5f6368);
    opacity: 0;                                    /* 默认隐藏 */
    transition: opacity 0.15s, background-color 0.15s;
    flex-shrink: 0;
    padding: 0;
}

.ait-sf-folder-header:hover .ait-sf-folder-actions-btn {
    opacity: 1;                                    /* hover 时显示 */
}

.ait-sf-folder-actions-btn:hover {
    background-color: var(--gem-sys-color-surface-container-highest, rgba(0, 0, 0, 0.08));
}

/* ==================== 文件夹内容（展开区域） ==================== */

.ait-sf-folder-content {
    padding-left: 8px;
}

/* ==================== 收藏项 ==================== */

.ait-sf-star-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 14px;
    cursor: pointer;
    border-radius: 20px;
    margin: 0 8px;
    transition: background-color 0.15s;
    min-height: 26px;
}

.ait-sf-star-item:hover {
    background-color: var(--gem-sys-color-surface-container-highest, rgba(0, 0, 0, 0.04));
}

.ait-sf-star-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    color: #444746;
    line-height: 1.4;
}

.ait-sf-platform-logo {
    display: none;
}

/* ==================== 空状态 ==================== */

.ait-sf-empty {
    padding: 16px;
    text-align: center;
    font-size: 14px;
    color: var(--gem-sys-color-on-surface-variant, #9aa0a6);
}

/* ==================== 暗色模式 ==================== */

/* 支持 8 种暗色模式检测 */
html.dark .ait-sf-title,
body.dark .ait-sf-title,
body.dark-theme .ait-sf-title,
html[data-theme*="dark"] .ait-sf-title,
html[data-timeline-theme="dark"] .ait-sf-title,
html[yb-theme-mode*="dark"] .ait-sf-title,
body[yb-theme-mode*="dark"] .ait-sf-title,
html[style*="color-scheme: dark"] .ait-sf-title,
html.dark .ait-sf-action-btn,
body.dark .ait-sf-action-btn,
body.dark-theme .ait-sf-action-btn,
html[data-theme*="dark"] .ait-sf-action-btn,
html[data-timeline-theme="dark"] .ait-sf-action-btn,
html[yb-theme-mode*="dark"] .ait-sf-action-btn,
body[yb-theme-mode*="dark"] .ait-sf-action-btn,
html[style*="color-scheme: dark"] .ait-sf-action-btn,
html.dark .ait-sf-folder-name,
body.dark .ait-sf-folder-name,
body.dark-theme .ait-sf-folder-name,
html[data-theme*="dark"] .ait-sf-folder-name,
html[data-timeline-theme="dark"] .ait-sf-folder-name,
html[yb-theme-mode*="dark"] .ait-sf-folder-name,
body[yb-theme-mode*="dark"] .ait-sf-folder-name,
html[style*="color-scheme: dark"] .ait-sf-folder-name {
    color: #e3e3e3;
}

html.dark .ait-sf-star-title,
body.dark .ait-sf-star-title,
body.dark-theme .ait-sf-star-title,
html[data-theme*="dark"] .ait-sf-star-title,
html[data-timeline-theme="dark"] .ait-sf-star-title,
html[yb-theme-mode*="dark"] .ait-sf-star-title,
body[yb-theme-mode*="dark"] .ait-sf-star-title,
html[style*="color-scheme: dark"] .ait-sf-star-title {
    color: #e3e3e3;
}
```
