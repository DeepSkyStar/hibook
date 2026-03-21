(function () {
  // Ensure $docsify exists
  window.$docsify = window.$docsify || {};

  function katexPlugin(hook, vm) {
    hook.beforeEach(function(content) {
      // 1. Block Math: $$...$$
      content = content.replace(/\$\$([\s\S]+?)\$\$/g, function(match, math) {
        try {
          return katex.renderToString(math, { 
            displayMode: true,
            throwOnError: false 
          });
        } catch (err) {
          console.error('KaTeX Block Error:', err);
          return match;
        }
      });

      // 2. Inline Math: $...$
      // Avoid matching code blocks (backticks) roughly
      content = content.replace(/\$([^$\n`]+?)\$/g, function(match, math) {
        if (!math.trim()) return match;
        try {
          return katex.renderToString(math, { 
            displayMode: false,
            throwOnError: false 
          });
        } catch (err) {
          console.error('KaTeX Inline Error:', err);
          return match;
        }
      });

      return content;
    });
  }

  // Register the plugin
  window.$docsify.plugins = [].concat(katexPlugin, window.$docsify.plugins || []);
})();
