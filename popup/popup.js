// YouTube Channel Blocker Plus - Popup Script
class PopupManager {
  constructor() {
    this.blockedChannels = [];
    this.settings = {};
    
    this.initializeElements();
    this.setupEventListeners();
    this.loadData();
    this.initializeI18n();
  }

  initializeElements() {
    this.elements = {
      channelInput: document.getElementById('channelInput'),
      blockBtn: document.getElementById('blockBtn'),
      blockedList: document.getElementById('blockedList'),
      blockedCount: document.getElementById('blockedCount'),
      showButtons: document.getElementById('showButtons'),
      buttonColor: document.getElementById('buttonColor'),
      syncEnabled: document.getElementById('syncEnabled'),
      importBtn: document.getElementById('importBtn'),
      exportBtn: document.getElementById('exportBtn'),
      clearBtn: document.getElementById('clearBtn'),
      importFile: document.getElementById('importFile')
    };
  }

  setupEventListeners() {
    // Block channel
    this.elements.blockBtn.addEventListener('click', () => this.blockChannel());
    this.elements.channelInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.blockChannel();
    });

    // Settings
    this.elements.showButtons.addEventListener('change', () => this.updateSettings());
    this.elements.buttonColor.addEventListener('change', () => this.updateSettings());
    this.elements.syncEnabled.addEventListener('change', () => this.updateSettings());

    // Import/Export
    this.elements.importBtn.addEventListener('click', () => this.elements.importFile.click());
    this.elements.exportBtn.addEventListener('click', () => this.exportData());
    this.elements.clearBtn.addEventListener('click', () => this.clearAllData());
    this.elements.importFile.addEventListener('change', (e) => this.importData(e));

    // Auto-focus input
    this.elements.channelInput.focus();
  }

  async loadData() {
    try {
      // Load blocked channels
      const response = await this.sendMessage({ type: 'GET_BLOCKED_CHANNELS' });
      this.blockedChannels = response?.blockedChannels || [];
      
      // Load settings
      const settings = await this.sendMessage({ type: 'GET_SETTINGS' });
      this.settings = settings || {};
      
      this.updateUI();
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }

  updateUI() {
    this.renderBlockedChannels();
    this.updateSettings();
    this.updateStats();
  }

  renderBlockedChannels() {
    const container = this.elements.blockedList;
    
    if (this.blockedChannels.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span data-i18n="noBlockedChannels">No blocked channels yet</span>
        </div>
      `;
      return;
    }

    container.innerHTML = this.blockedChannels
      .sort()
      .map(channel => `
        <div class="blocked-item">
          <span class="channel-name">${this.escapeHtml(channel)}</span>
          <button class="remove-btn" data-channel="${this.escapeHtml(channel)}" data-i18n="remove">
            Remove
          </button>
        </div>
      `).join('');

    // Add event listeners to remove buttons
    container.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const channel = e.target.getAttribute('data-channel');
        this.unblockChannel(channel);
      });
    });
  }

  updateSettings() {
    // Update UI with current settings
    this.elements.showButtons.checked = this.settings.showButtons !== false;
    this.elements.buttonColor.value = this.settings.buttonColor || '#ff4444';
    this.elements.syncEnabled.checked = this.settings.syncEnabled !== false;
  }

  updateStats() {
    this.elements.blockedCount.textContent = this.blockedChannels.length;
  }

  async blockChannel() {
    const channelName = this.elements.channelInput.value.trim();
    if (!channelName) return;

    try {
      await this.sendMessage({
        type: 'ADD_BLOCKED_CHANNEL',
        channelName: channelName
      });

      this.elements.channelInput.value = '';
      this.elements.channelInput.focus();
      
      // Reload data
      await this.loadData();
      
      this.showNotification(this.getText('channelBlocked', [channelName]));
    } catch (error) {
      console.error('Failed to block channel:', error);
      this.showNotification(this.getText('error'), 'error');
    }
  }

  async unblockChannel(channelName) {
    try {
      await this.sendMessage({
        type: 'REMOVE_BLOCKED_CHANNEL',
        channelName: channelName
      });

      // Reload data
      await this.loadData();
      
      this.showNotification(this.getText('channelUnblocked', [channelName]));
    } catch (error) {
      console.error('Failed to unblock channel:', error);
      this.showNotification(this.getText('error'), 'error');
    }
  }

  async updateSettings() {
    const newSettings = {
      showButtons: this.elements.showButtons.checked,
      buttonColor: this.elements.buttonColor.value,
      syncEnabled: this.elements.syncEnabled.checked
    };

    try {
      await this.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: newSettings
      });

      this.settings = { ...this.settings, ...newSettings };
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  }

  async exportData() {
    try {
      const data = await this.sendMessage({ type: 'GET_BLOCKED_CHANNELS' });
      const settings = await this.sendMessage({ type: 'GET_SETTINGS' });
      
      const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        data: data,
        settings: settings
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `youtube-blocker-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showNotification(this.getText('dataExported'));
    } catch (error) {
      console.error('Failed to export data:', error);
      this.showNotification(this.getText('error'), 'error');
    }
  }

  async importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      if (!importData.data) {
        throw new Error('Invalid file format');
      }

      // Import blocked channels
      if (importData.data.blockedChannels) {
        for (const channel of importData.data.blockedChannels) {
          await this.sendMessage({
            type: 'ADD_BLOCKED_CHANNEL',
            channelName: channel
          });
        }
      }

      // Import settings
      if (importData.settings) {
        await this.sendMessage({
          type: 'UPDATE_SETTINGS',
          settings: importData.settings
        });
      }

      // Reload data
      await this.loadData();
      
      this.showNotification(this.getText('dataImported'));
    } catch (error) {
      console.error('Failed to import data:', error);
      this.showNotification(this.getText('importError'), 'error');
    }

    // Reset file input
    event.target.value = '';
  }

  async clearAllData() {
    if (!confirm(this.getText('confirmClearAll'))) return;

    try {
      // Remove all blocked channels
      for (const channel of this.blockedChannels) {
        await this.sendMessage({
          type: 'REMOVE_BLOCKED_CHANNEL',
          channelName: channel
        });
      }

      // Reload data
      await this.loadData();
      
      this.showNotification(this.getText('allDataCleared'));
    } catch (error) {
      console.error('Failed to clear data:', error);
      this.showNotification(this.getText('error'), 'error');
    }
  }

  sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  showNotification(message, type = 'success') {
    // Create simple toast notification
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 12px 16px;
      border-radius: 4px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
      background: ${type === 'error' ? '#dc3545' : '#28a745'};
    `;

    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    }, 10);

    // Animate out and remove
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  initializeI18n() {
    // Basic i18n implementation
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const text = this.getText(key);
      if (text) {
        element.textContent = text;
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      const text = this.getText(key);
      if (text) {
        element.placeholder = text;
      }
    });
  }

  getText(key, params = []) {
    // Fallback English messages
    const messages = {
      appName: 'YouTube Channel Blocker Plus',
      quickBlock: 'Quick Block',
      enterChannelName: 'Enter channel name...',
      block: 'Block',
      blockedChannels: 'Blocked Channels',
      loading: 'Loading...',
      settings: 'Settings',
      showBlockButtons: 'Show block buttons',
      buttonColor: 'Button color:',
      enableSync: 'Enable sync across devices',
      import: 'Import',
      export: 'Export',
      clearAll: 'Clear All',
      blockedCount: 'Blocked:',
      remove: 'Remove',
      noBlockedChannels: 'No blocked channels yet',
      channelBlocked: `Blocked: ${params[0] || ''}`,
      channelUnblocked: `Unblocked: ${params[0] || ''}`,
      error: 'An error occurred',
      dataExported: 'Data exported successfully',
      dataImported: 'Data imported successfully',
      importError: 'Failed to import data',
      confirmClearAll: 'Are you sure you want to clear all blocked channels?',
      allDataCleared: 'All data cleared'
    };

    try {
      return chrome.i18n.getMessage(key, params) || messages[key] || key;
    } catch {
      return messages[key] || key;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});