// backlinks.js
// A Docsify plugin to fetch and display Linked Mentions at the bottom of the article
(function () {
  function install(hook, vm) {
    hook.doneEach(function () {
      const file = vm.route.file; 
      if (!file) return;

      fetch(`/_api/backlinks?file=${encodeURIComponent(file)}`)
        .then(response => response.json())
        .then(links => {
          if (!links || links.length === 0) return;

          const container = document.createElement('div');
          container.className = 'backlinks-container';
          container.style.marginTop = '60px';
          container.style.borderTop = '2px dashed #eee';
          container.style.paddingTop = '30px';
          container.style.marginBottom = '40px';

          const title = document.createElement('h3');
          title.textContent = 'Linked Mentions';
          title.style.color = 'var(--theme-color, #42b983)';
          title.style.marginBottom = '20px';
          container.appendChild(title);

          const list = document.createElement('ul');
          list.style.listStyle = 'none';
          list.style.padding = '0';

          links.forEach(link => {
            const li = document.createElement('li');
            li.style.marginBottom = '15px';
            li.style.backgroundColor = 'var(--sidebar-bg, #f8f8f8)';
            li.style.padding = '15px';
            li.style.borderRadius = '8px';
            
            const a = document.createElement('a');
            const route = link.source.replace(/\.md$/, '');
            a.href = '#/' + route;
            a.textContent = route.split('/').pop() || route;
            a.style.fontWeight = 'bold';
            a.style.color = 'var(--theme-color, #42b983)';
            a.style.textDecoration = 'none';
            
            li.appendChild(a);
            
            if (link.snippet) {
              const snippet = document.createElement('p');
              snippet.style.fontSize = '0.9em';
              snippet.style.color = 'var(--textColor, #666)';
              snippet.style.margin = '10px 0 0 0';
              snippet.style.borderLeft = '3px solid var(--theme-color, #42b983)';
              snippet.style.paddingLeft = '10px';
              // Add simple bolding for the matched text
              const boldedSnippet = link.snippet.replace(new RegExp(link.text, 'g'), `<strong>${link.text}</strong>`);
              snippet.innerHTML = '... ' + boldedSnippet + ' ...';
              li.appendChild(snippet);
            }
            
            list.appendChild(li);
          });

          container.appendChild(list);
          const article = document.querySelector('.markdown-section');
          if (article) {
             article.appendChild(container);
          }
        });
    });
  }

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = (window.$docsify.plugins || []).concat(install);
})();
