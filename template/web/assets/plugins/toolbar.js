// toolbar.js
// Provides a unified floating toolbar for Hibook
(function() {
  function initToolbar() {
    if (document.getElementById('hibook-toolbar')) return;
    
    // Create floating toolbar container
    const toolbar = document.createElement('div');
    toolbar.id = 'hibook-toolbar';
    toolbar.style.position = 'fixed';
    toolbar.style.top = '15px';
    toolbar.style.right = '20px';
    toolbar.style.display = 'flex';
    toolbar.style.gap = '10px';
    toolbar.style.zIndex = '9999';
    document.body.appendChild(toolbar);
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
    btn.innerHTML = `<span style="margin-right: 4px; font-size: 1.1em;">${icon}</span><span style="font-size: 0.9em; font-weight: 500;">${text}</span>`;
    btn.style.backgroundColor = 'var(--theme-color, #42b983)';
    btn.style.color = '#fff';
    btn.style.padding = '6px 12px';
    btn.style.borderRadius = '20px';
    btn.style.cursor = 'pointer';
    btn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    btn.style.fontFamily = 'var(--baseFontFamily, sans-serif)';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.onclick = onClick;
    
    btn.onmouseenter = () => btn.style.transform = 'scale(1.05)';
    btn.onmouseleave = () => btn.style.transform = 'scale(1)';
    btn.style.transition = 'transform 0.2s';
    
    toolbar.appendChild(btn);
  };

  // Ensure initialized on load
  window.addEventListener('load', initToolbar);
})();
