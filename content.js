// Content script for YouTube Channel Blocker Plus
class YouTubeChannelBlocker {
  constructor() {
    this.blockedChannels = [];
    this.settings = {};
    this.observer = null;
    this.buttonStyle = '';
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.createButtonStyle();
    this.setupObserver();
    this.setupMessageListener();
    
    // Initial scan
    this.scanAndProcessVideos();
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_BLOCKED_CHANNELS' }, (result) => {
        this.blockedChannels = result?.blockedChannels || [];
        resolve();
      });
      
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (settings) => {
        this.settings = settings || {};
        resolve();
      });
    });
  }

  createButtonStyle() {
    if (document.getElementById('ycb-button-style')) return;
    
    const style = document.createElement('style');
    style.id = 'ycb-button-style';
    style.textContent = `
      .ycb-block-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        margin: 0 8px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: ${this.settings.buttonColor || '#ff4444'};
        color: white;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        opacity: 0.8;
        transition: all 0.2s ease;
        z-index: 1000;
        position: relative;
      }
      
      .ycb-block-btn:hover {
        opacity: 1;
        transform: scale(1.1);
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      }
      
      .ycb-block-btn:active {
        transform: scale(0.95);
      }
      
      .ycb-blocked {
        opacity: 0.3 !important;
        filter: grayscale(100%) blur(2px);
        pointer-events: none;
        transition: all 0.3s ease;
      }
      
      .ycb-blocked::after {
        content: '${chrome.i18n.getMessage('blocked') || 'BLOCKED'}';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(255, 68, 68, 0.9);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: bold;
        pointer-events: none;
        z-index: 1001;
      }
    `;
    document.head.appendChild(style);
  }

  setupObserver() {
    // Disconnect existing observer
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          shouldProcess = true;
        }
      });
      
      if (shouldProcess) {
        setTimeout(() => this.scanAndProcessVideos(), 100);
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message) => {
      switch (message.type) {
        case 'CHANNELS_UPDATED':
        case 'SETTINGS_UPDATED':
        case 'PAGE_UPDATED':
          this.loadSettings().then(() => {
            this.createButtonStyle();
            this.scanAndProcessVideos();
          });
          break;
      }
    });
  }

  scanAndProcessVideos() {
    // Different selectors for different YouTube layouts
    const videoSelectors = [
      // Home page, search results
      'ytd-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-rich-item-renderer',
      // Shorts
      'ytd-shorts-video-renderer',
      'ytd-reel-item-renderer',
      // Sidebar recommendations
      'ytd-compact-video-renderer',
      // Comments
      'ytd-comment-thread-renderer',
      'ytd-comment-renderer'
    ];

    videoSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => this.processVideoElement(element));
    });
  }

  processVideoElement(element) {
    if (element.hasAttribute('data-ycb-processed')) return;
    element.setAttribute('data-ycb-processed', 'true');

    const channelInfo = this.extractChannelInfo(element);
    if (!channelInfo) return;

    // Add block button
    if (this.settings.showButtons !== false) {
      this.addBlockButton(element, channelInfo);
    }

    // Check if should be blocked
    this.checkAndBlockElement(element, channelInfo);
  }

  extractChannelInfo(element) {
    // Try multiple selectors to find channel name
    const channelSelectors = [
      'ytd-channel-name a',
      '#channel-name a',
      '.ytd-channel-name a',
      '[id="channel-name"] a',
      '#owner-text a',
      '.owner-text a',
      '#text.ytd-channel-name',
      '.ytd-video-meta-block #channel-name',
      // For comments
      '#author-text',
      '.ytd-comment-renderer #author-text'
    ];

    let channelName = null;
    let channelElement = null;

    for (const selector of channelSelectors) {
      channelElement = element.querySelector(selector);
      if (channelElement) {
        channelName = channelElement.textContent?.trim();
        if (channelName && channelName !== '@') {
          break;
        }
      }
    }

    if (!channelName) return null;

    // Clean up channel name
    channelName = channelName.replace(/^@/, '').trim();

    return {
      name: channelName,
      element: channelElement,
      container: element
    };
  }

  addBlockButton(element, channelInfo) {
    // Don't add button if already exists
    if (element.querySelector('.ycb-block-btn')) return;

    const button = document.createElement('button');
    button.className = 'ycb-block-btn';
    button.innerHTML = '✕';
    button.title = chrome.i18n.getMessage('blockChannel', [channelInfo.name]) || `Block ${channelInfo.name}`;
    
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.blockChannel(channelInfo.name);
    });

    // Try to insert button near channel name
    const insertTarget = channelInfo.element?.parentNode || 
                         element.querySelector('#channel-info') ||
                         element.querySelector('.ytd-video-meta-block') ||
                         element.querySelector('#meta') ||
                         element;

    if (insertTarget) {
      insertTarget.style.display = 'flex';
      insertTarget.style.alignItems = 'center';
      insertTarget.appendChild(button);
    }
  }

  async blockChannel(channelName) {
    // Add to blocked list
    chrome.runtime.sendMessage({
      type: 'ADD_BLOCKED_CHANNEL',
      channelName: channelName
    });

    // Show confirmation
    this.showNotification(chrome.i18n.getMessage('channelBlocked', [channelName]) || `Blocked: ${channelName}`);

    // Immediately hide videos from this channel
    setTimeout(() => this.scanAndProcessVideos(), 100);
  }

  async checkAndBlockElement(element, channelInfo) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'IS_CHANNEL_BLOCKED',
        channelName: channelInfo.name
      }, (isBlocked) => {
        if (isBlocked) {
          element.classList.add('ycb-blocked');
          // For some layouts, hide the entire container
          const container = element.closest('ytd-rich-item-renderer') || 
                           element.closest('ytd-video-renderer') ||
                           element.closest('ytd-grid-video-renderer') ||
                           element;
          if (container !== element) {
            container.classList.add('ycb-blocked');
          }
        }
        resolve(isBlocked);
      });
    });
  }

  showNotification(message) {
    // Create a simple notification
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: all 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new YouTubeChannelBlocker();
  });
} else {
  new YouTubeChannelBlocker();
}

// Handle SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(() => {
      if (window.youtubeChannelBlocker) {
        window.youtubeChannelBlocker.scanAndProcessVideos();
      }
    }, 1000);
  }
}).observe(document, { subtree: true, childList: true });
