// Service Worker for YouTube Channel Blocker Plus
chrome.runtime.onInstalled.addListener(() => {
  // Initialize default settings
  chrome.storage.sync.get(['blockedChannels', 'settings', 'smartFilters'], (result) => {
    if (!result.blockedChannels) {
      chrome.storage.sync.set({
        blockedChannels: [],
        excludedChannels: [],
        blockedTitles: [],
        blockedComments: [],
        smartFilters: {
          keywords: [],
          patterns: []
        },
        settings: {
          showButtons: true,
          buttonColor: '#ff4444',
          buttonSize: 'medium',
          syncEnabled: true,
          hideShorts: false
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
    case 'ADD_SMART_FILTER':
      addSmartFilter(message.filterType, message.filterData);
      break;
    case 'REMOVE_SMART_FILTER':
      removeSmartFilter(message.filterType, message.filterId);
      break;
    case 'GET_SMART_FILTERS':
      getSmartFilters(sendResponse);
      return true;
    case 'CHECK_CONTENT_BLOCKED':
      checkContentBlocked(message.content, sendResponse);
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
  const result = await chrome.storage.sync.get([
    'blockedChannels', 
    'excludedChannels', 
    'blockedTitles', 
    'blockedComments',
    'smartFilters'
  ]);
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

// Smart Filter Functions
async function addSmartFilter(filterType, filterData) {
  const result = await chrome.storage.sync.get(['smartFilters']);
  const smartFilters = result.smartFilters || { keywords: [], patterns: [] };
  
  if (filterType === 'keyword') {
    const newFilter = {
      id: Date.now(),
      text: filterData.text,
      matchType: filterData.matchType || 'partial',
      enabled: true
    };
    smartFilters.keywords.push(newFilter);
  } else if (filterType === 'pattern') {
    const newFilter = {
      id: Date.now(),
      type: filterData.type,
      value: filterData.value,
      enabled: true
    };
    smartFilters.patterns.push(newFilter);
  }
  
  await chrome.storage.sync.set({ smartFilters });
  notifyContentScripts('FILTERS_UPDATED');
}

async function removeSmartFilter(filterType, filterId) {
  const result = await chrome.storage.sync.get(['smartFilters']);
  const smartFilters = result.smartFilters || { keywords: [], patterns: [] };
  
  if (filterType === 'keyword') {
    smartFilters.keywords = smartFilters.keywords.filter(f => f.id !== filterId);
  } else if (filterType === 'pattern') {
    smartFilters.patterns = smartFilters.patterns.filter(f => f.id !== filterId);
  }
  
  await chrome.storage.sync.set({ smartFilters });
  notifyContentScripts('FILTERS_UPDATED');
}

async function getSmartFilters(sendResponse) {
  const result = await chrome.storage.sync.get(['smartFilters']);
  sendResponse(result.smartFilters || { keywords: [], patterns: [] });
}

async function checkContentBlocked(content, sendResponse) {
  const result = await chrome.storage.sync.get(['smartFilters', 'blockedChannels']);
  const smartFilters = result.smartFilters || { keywords: [], patterns: [] };
  const blockedChannels = result.blockedChannels || [];
  
  const { channelName, videoTitle, description } = content;
  
  // Check channel blocking first
  if (blockedChannels.includes(channelName)) {
    sendResponse({ blocked: true, reason: 'channel' });
    return;
  }
  
  const textToCheck = `${channelName} ${videoTitle} ${description}`.toLowerCase();
  
  // Check keyword filters
  for (const keyword of smartFilters.keywords) {
    if (!keyword.enabled) continue;
    
    const keywordText = keyword.text.toLowerCase();
    let matches = false;
    
    if (keyword.matchType === 'exact') {
      matches = textToCheck.split(/\s+/).includes(keywordText);
    } else {
      matches = textToCheck.includes(keywordText);
    }
    
    if (matches) {
      sendResponse({ blocked: true, reason: 'keyword', filter: keyword });
      return;
    }
  }
  
  // Check pattern filters
  for (const pattern of smartFilters.patterns) {
    if (!pattern.enabled) continue;
    
    let matches = false;
    const patternValue = pattern.value.toLowerCase();
    
    switch (pattern.type) {
      case 'contains':
        matches = textToCheck.includes(patternValue);
        break;
      case 'startsWith':
        matches = channelName.toLowerCase().startsWith(patternValue) ||
                  videoTitle.toLowerCase().startsWith(patternValue);
        break;
      case 'endsWith':
        matches = channelName.toLowerCase().endsWith(patternValue) ||
                  videoTitle.toLowerCase().endsWith(patternValue);
        break;
      case 'exactly':
        matches = channelName.toLowerCase() === patternValue ||
                  videoTitle.toLowerCase() === patternValue;
        break;
    }
    
    if (matches) {
      sendResponse({ blocked: true, reason: 'pattern', filter: pattern });
      return;
    }
  }
  
  sendResponse({ blocked: false });
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

// Clear old data on startup (cleanup)
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.sync.get(['smartFilters'], (result) => {
    if (result.smartFilters) {
      // Clean up any orphaned filters
      const smartFilters = result.smartFilters;
      smartFilters.keywords = smartFilters.keywords?.filter(f => f.text && f.text.trim()) || [];
      smartFilters.patterns = smartFilters.patterns?.filter(f => f.value && f.value.trim()) || [];
      chrome.storage.sync.set({ smartFilters });
    }
  });
});