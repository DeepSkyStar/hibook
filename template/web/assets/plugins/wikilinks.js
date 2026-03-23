// wikilinks.js
// A Docsify plugin to convert [[Page Name]] into standard links dynamically via Graph API
(function () {
  function install(hook, vm) {
    hook.beforeEach(function (content) {
      return content.replace(/\[\[(.*?)\]\]/g, function (match, p1) {
        return `<span class="wikilink-placeholder" data-target="${p1}">[[${p1}]]</span>`;
      });
    });

    hook.doneEach(function () {
      const placeholders = document.querySelectorAll('.wikilink-placeholder');
      if (placeholders.length === 0) return;

      fetch((window.HIBOOK_ROOT || '/') + '_api/graph')
        .then(response => response.json())
        .then(data => {
          const basenameToId = {};
          if (data && data.nodes) {
            data.nodes.forEach(node => {
              const basename = node.id.split('/').pop().replace('.md', '');
              basenameToId[basename] = node.id.replace('.md', '');
            });
          }

          placeholders.forEach(el => {
            const target = el.getAttribute('data-target');
            let route = target;
            if (basenameToId[target]) {
              route = basenameToId[target];
            }
            
            const link = document.createElement('a');
            link.href = '#/' + route;
            link.className = 'wikilink docsify-wikilink';
            link.textContent = target;
            link.style.color = 'var(--theme-color, #42b983)';
            link.style.textDecoration = 'none';
            link.style.fontWeight = '500';
            link.style.borderBottom = '1px dashed var(--theme-color, #42b983)';
            
            el.parentNode.replaceChild(link, el);
          });
        });
    });
  }

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = (window.$docsify.plugins || []).concat(install);
})();
