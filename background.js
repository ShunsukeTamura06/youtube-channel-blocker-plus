// Service Worker for YouTube Channel Blocker Plus
chrome.runtime.onInstalled.addListener(() => {
  // Initialize default settings
  chrome.storage.sync.get(['blockedChannels', 'settings'], (result) => {
    if (!result.blockedChannels) {
      chrome.storage.sync.set({
        blockedChannels: [],
        excludedChannels: [],
        blockedTitles: [],
        blockedComments: [],
        settings: {
          showButtons: true,
          buttonColor: '#ff4444',
          buttonSize: 'medium',
          syncEnabled: true
        }
      });
    }
  });
});

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'ADD_BLOCKED_CHANNEL':
      addBlockedChannel(message.channelName);
      break;
    case 'REMOVE_BLOCKED_CHANNEL':
      removeBlockedChannel(message.channelName);
      break;
    case 'IS_CHANNEL_BLOCKED':
      isChannelBlocked(message.channelName, sendResponse);
      return true; // Keep message channel open for async response
    case 'GET_BLOCKED_CHANNELS':
      getBlockedChannels(sendResponse);
      return true;
    case 'UPDATE_SETTINGS':
      updateSettings(message.settings);
      break;
    case 'GET_SETTINGS':
      getSettings(sendResponse);
      return true;
  }
});

async function addBlockedChannel(channelName) {
  const result = await chrome.storage.sync.get(['blockedChannels']);
  const blockedChannels = result.blockedChannels || [];
  
  if (!blockedChannels.includes(channelName)) {
    blockedChannels.push(channelName);
    await chrome.storage.sync.set({ blockedChannels });
    
    // Notify all YouTube tabs
    notifyContentScripts('CHANNELS_UPDATED');
  }
}

async function removeBlockedChannel(channelName) {
  const result = await chrome.storage.sync.get(['blockedChannels']);
  const blockedChannels = result.blockedChannels || [];
  const index = blockedChannels.indexOf(channelName);
  
  if (index > -1) {
    blockedChannels.splice(index, 1);
    await chrome.storage.sync.set({ blockedChannels });
    
    // Notify all YouTube tabs
    notifyContentScripts('CHANNELS_UPDATED');
  }
}

async function isChannelBlocked(channelName, sendResponse) {
  const result = await chrome.storage.sync.get(['blockedChannels', 'excludedChannels']);
  const blockedChannels = result.blockedChannels || [];
  const excludedChannels = result.excludedChannels || [];
  
  // Check if channel is explicitly excluded
  if (excludedChannels.includes(channelName)) {
    sendResponse(false);
    return;
  }
  
  // Check exact match
  if (blockedChannels.includes(channelName)) {
    sendResponse(true);
    return;
  }
  
  // Check partial matches and patterns
  const isBlocked = blockedChannels.some(blocked => {
    // Simple wildcard matching
    if (blocked.includes('*')) {
      const pattern = blocked.replace(/\*/g, '.*');
      return new RegExp(pattern, 'i').test(channelName);
    }
    // Partial string matching
    return channelName.toLowerCase().includes(blocked.toLowerCase());
  });
  
  sendResponse(isBlocked);
}

async function getBlockedChannels(sendResponse) {
  const result = await chrome.storage.sync.get(['blockedChannels', 'excludedChannels', 'blockedTitles', 'blockedComments']);
  sendResponse(result);
}

async function updateSettings(newSettings) {
  const result = await chrome.storage.sync.get(['settings']);
  const settings = { ...result.settings, ...newSettings };
  await chrome.storage.sync.set({ settings });
  
  // Notify all YouTube tabs
  notifyContentScripts('SETTINGS_UPDATED');
}

async function getSettings(sendResponse) {
  const result = await chrome.storage.sync.get(['settings']);
  sendResponse(result.settings || {});
}

async function notifyContentScripts(message) {
  const tabs = await chrome.tabs.query({ url: '*://www.youtube.com/*' });
  tabs.forEach(tab => {
    chrome.tabs.sendMessage(tab.id, { type: message }).catch(() => {
      // Ignore errors for inactive tabs
    });
  });
}

// Handle tab updates to refresh blocked content
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com')) {
    chrome.tabs.sendMessage(tabId, { type: 'PAGE_UPDATED' }).catch(() => {
      // Ignore errors for inactive tabs
    });
  }
});