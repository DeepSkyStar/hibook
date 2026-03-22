// toolbar.js
// Provides a unified floating toolbar for Hibook
(function() {
  let expanded = true;

  function initToolbar() {
    if (document.getElementById('hibook-toolbar-wrap')) return;
    
    const wrap = document.createElement('div');
    wrap.id = 'hibook-toolbar-wrap';
    wrap.style.position = 'fixed';
    wrap.style.top = '15px';
    wrap.style.right = '20px';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.backgroundColor = '#fff';
    wrap.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    wrap.style.borderRadius = '20px';
    wrap.style.padding = '4px';
    wrap.style.zIndex = 'var(--z-layer-fixed-ui)';
    wrap.style.border = '1px solid #eee';
    
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
       wrap.style.backgroundColor = '#2d2d2d';
       wrap.style.borderColor = '#444';
       wrap.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)';
    }
    
    const toggleBtn = document.createElement('div');
    toggleBtn.innerHTML = '▶';
    toggleBtn.style.width = '30px';
    toggleBtn.style.height = '30px';
    toggleBtn.style.display = 'flex';
    toggleBtn.style.justifyContent = 'center';
    toggleBtn.style.alignItems = 'center';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.borderRadius = '50%';
    toggleBtn.style.color = '#888';
    toggleBtn.style.fontSize = '12px';
    toggleBtn.style.transition = 'transform 0.3s, background-color 0.2s';
    
    toggleBtn.onmouseenter = () => toggleBtn.style.backgroundColor = 'rgba(0,0,0,0.05)';
    toggleBtn.onmouseleave = () => toggleBtn.style.backgroundColor = 'transparent';
    
    const items = document.createElement('div');
    items.id = 'hibook-toolbar'; // Keep ID for existing plugins to attach
    items.style.display = 'flex';
    items.style.alignItems = 'center';
    items.style.gap = '4px';
    items.style.overflow = 'hidden';
    items.style.transition = 'max-width 0.3s ease, opacity 0.3s ease, margin 0.3s ease';
    items.style.maxWidth = '500px'; 
    items.style.opacity = '1';
    items.style.marginLeft = '4px';
    
    toggleBtn.onclick = () => {
        expanded = !expanded;
        if (expanded) {
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
    };
    
    wrap.appendChild(toggleBtn);
    wrap.appendChild(items);
    document.body.appendChild(wrap);
  }

  // Globally expose function to register toolbar buttons
  window.addToolbarButton = function(id, icon, text, onClick) {
    let toolbar = document.getElementById('hibook-toolbar');
    if (!toolbar) {
      initToolbar();
      toolbar = document.getElementById('hibook-toolbar');
    }
    
    // Don't duplicate buttons
    if (document.getElementById(id)) return;

    const btn = document.createElement('div');
    btn.id = id;
    btn.title = text; // Keep text as tooltip!
    btn.innerHTML = `<span style="font-size: 1.2em;">${icon}</span>`;
    
    btn.style.width = '32px';
    btn.style.height = '32px';
    btn.style.display = 'flex';
    btn.style.justifyContent = 'center';
    btn.style.alignItems = 'center';
    btn.style.borderRadius = '50%';
    btn.style.cursor = 'pointer';
    btn.style.transition = 'background-color 0.2s, transform 0.2s';
    
    btn.onmouseenter = () => {
        btn.style.backgroundColor = 'rgba(66, 185, 131, 0.15)';
        btn.style.transform = 'scale(1.1)';
    };
    btn.onmouseleave = () => {
        btn.style.backgroundColor = 'transparent';
        btn.style.transform = 'scale(1)';
    };
    
    btn.onclick = onClick;
    toolbar.appendChild(btn);
  };

  // Ensure initialized on load
  window.addEventListener('load', initToolbar);
})();
