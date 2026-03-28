const PLATFORMS = [
    { name: 'ChatGPT', url: 'https://chatgpt.com', logo: 'images/logo/chatgpt.webp' },
    { name: 'Gemini', url: 'https://gemini.google.com', logo: 'images/logo/gemini.webp' },
    { name: 'Claude', url: 'https://claude.ai', logo: 'images/logo/claude.webp' },
    { name: 'DeepSeek', url: 'https://chat.deepseek.com', logo: 'images/logo/deepseek.webp' },
    { name: 'Kimi', url: 'https://kimi.com', logo: 'images/logo/kimi.webp' },
    { name: 'Grok', url: 'https://grok.com', logo: 'images/logo/grok.webp' },
    { name: 'Perplexity', url: 'https://perplexity.ai', logo: 'images/logo/perplexity.webp' },
    { name: '豆包', url: 'https://doubao.com', logo: 'images/logo/doubao.webp' },
    { name: '千问', url: 'https://qianwen.com', logo: 'images/logo/tongyi.webp' },
    { name: '千问国际版', url: 'https://chat.qwen.ai', logo: 'images/logo/tongyi.webp' },
    { name: '元宝', url: 'https://yuanbao.tencent.com', logo: 'images/logo/yuanbao.webp' },
    { name: 'NotebookLM', url: 'https://notebooklm.google.com', logo: 'images/logo/notebooklm.svg' }
];

document.getElementById('logo').src = chrome.runtime.getURL('icons/icon128.png');
document.getElementById('subtitle').textContent = chrome.i18n.getMessage('guideSubtitle') || 'AI conversation enhancement extension';
document.getElementById('guideTitle').textContent = chrome.i18n.getMessage('guideTitle') || 'Quick Start';
document.getElementById('step1').textContent = chrome.i18n.getMessage('guideStep1') || 'Open an AI platform you use.';
document.getElementById('step2').textContent = chrome.i18n.getMessage('guideStep2') || 'Start a conversation.';
document.getElementById('step3').textContent = chrome.i18n.getMessage('guideStep3') || 'If a timeline appears on the right side of the conversation page, the installation is successful. If not, please refresh the page.';
document.getElementById('platformsTitle').textContent = chrome.i18n.getMessage('guidePlatformsTitle') || 'Supported Platforms';

const grid = document.getElementById('platformGrid');
for (const p of PLATFORMS) {
    const a = document.createElement('a');
    a.className = 'platform-item';
    a.href = p.url;
    a.target = '_blank';
    a.innerHTML = `<img src="${chrome.runtime.getURL(p.logo)}" alt="${p.name}"><span>${p.name}</span>`;
    grid.appendChild(a);
}
