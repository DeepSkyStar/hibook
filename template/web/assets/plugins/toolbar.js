// toolbar.js
// Provides a unified floating toolbar for Hibook
(function() {

  // Maintain a global registry so components can register buttons BEFORE the toolbar mounts
  window._hibookToolbarButtons = window._hibookToolbarButtons || [];
  
  // Globally expose function to register toolbar buttons (Backward compatibility API)
  window.addToolbarButton = function(id, icon, text, onClick, order = 0) {
      const existing = window._hibookToolbarButtons.find(b => b.id === id);
      if (existing) {
          Object.assign(existing, { icon, text, onClick, order });
      } else {
          window._hibookToolbarButtons.push({ id, icon, text, onClick, order });
      }
      const evt = new CustomEvent('hibook-toolbar-updated');
      window.dispatchEvent(evt);
  };

  class HiToolbar extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.expanded = true;
      this.onToolbarUpdated = this.onToolbarUpdated.bind(this);
    }

    connectedCallback() {
      this.id = 'hibook-toolbar-wrap'; // Move ID assignment here to avoid DOMException
      this.render();
      window.addEventListener('hibook-toolbar-updated', this.onToolbarUpdated);
      this.syncButtons(); // process any buttons added before we mounted
    }
    
    disconnectedCallback() {
      window.removeEventListener('hibook-toolbar-updated', this.onToolbarUpdated);
    }

    onToolbarUpdated() {
      this.syncButtons();
    }
    
    syncButtons() {
      const buttons = [...window._hibookToolbarButtons];
      buttons.sort((a, b) => (a.order || 0) - (b.order || 0));
      this.renderButtons(buttons);
    }

    toggle() {
      this.expanded = !this.expanded;
      const items = this.shadowRoot.getElementById('items');
      const toggleBtn = this.shadowRoot.getElementById('toggleBtn');
      if (this.expanded) {
          items.style.maxWidth = '500px';
          items.style.opacity = '1';
          items.style.marginLeft = '4px';
          toggleBtn.style.transform = 'rotate(0deg)';
      } else {
          items.style.maxWidth = '0';
          items.style.opacity = '0';
          items.style.marginLeft = '0';
          toggleBtn.style.transform = 'rotate(180deg)';
      }
    }

    renderButtons(buttons) {
      const container = this.shadowRoot.getElementById('items');
      if (!container) return;
      container.innerHTML = '';
      
      buttons.forEach(b => {
        const btn = document.createElement('div');
        btn.className = 'tool-btn';
        btn.id = b.id; // preserve inner ID for potential testing
        btn.title = b.text;
        btn.innerHTML = `<span style="font-size: 1.2em;">${b.icon}</span>`;
        btn.onclick = b.onClick;
        container.appendChild(btn);
      });
    }

    render() {
      // 1:1 translation of the exact same inline styles from the original toolbar.js into scoped CSS
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            position: fixed;
            display: flex;
            align-items: center;
            background-color: #fff;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border-radius: 20px;
            padding: 4px;
            z-index: var(--z-layer-fixed-ui);
            border: 1px solid #eee;
          }
          .toggle-btn {
            width: 30px;
            height: 30px;
            display: flex;
            justify-content: center;
            align-items: center;
            cursor: pointer;
            border-radius: 50%;
            color: #888;
            font-size: 12px;
            transition: transform 0.3s, background-color 0.2s;
          }
          .toggle-btn:hover {
            background-color: rgba(0,0,0,0.05);
          }
          .items {
            display: flex;
            align-items: center;
            gap: 4px;
            overflow: hidden;
            transition: max-width 0.3s ease, opacity 0.3s ease, margin 0.3s ease;
            max-width: 500px;
            opacity: 1;
            margin-left: 4px;
          }
          .tool-btn {
            width: 32px;
            height: 32px;
            display: flex;
            justify-content: center;
            align-items: center;
            border-radius: 50%;
            cursor: pointer;
            transition: background-color 0.2s, transform 0.2s;
          }
          .tool-btn:hover {
            background-color: rgba(66, 185, 131, 0.15);
            transform: scale(1.1);
          }
        </style>
        <div class="toggle-btn" id="toggleBtn">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div>
        <div class="items" id="items"></div>
      `;
      this.shadowRoot.getElementById('toggleBtn').onclick = this.toggle.bind(this);
    }
  }

  customElements.define('hi-toolbar', HiToolbar);

  // Instead of waiting for window.load, eagerly append it natively during script execution
  // The document.body exists because this script is evaluated at the bottom of the body tag!
  if (!document.querySelector('hi-toolbar')) {
      const tb = document.createElement('hi-toolbar');
      document.body.appendChild(tb);
  }

})();
