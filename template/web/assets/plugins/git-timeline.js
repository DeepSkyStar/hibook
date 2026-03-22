function gitTimelinePlugin(hook, vm) {
  hook.afterEach(function(html, next) {
    // Inject the timeline container at the bottom of the article
    var timelineHtml = '<div id="git-timeline-container" style="margin-top: 60px; padding-top: 30px; border-top: 1px solid #eaecef;">' +
                       '<h3 style="margin-bottom: 20px; color: #2c3e50;">' +
                       '<svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" style="margin-right:8px;vertical-align:text-bottom"><path fill-rule="evenodd" d="M1.643 3.143L.427 1.927A.25.25 0 000 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 00.177-.427L2.715 4.215a6.5 6.5 0 11-1.18 4.458.75.75 0 10-1.493.154 8.001 8.001 0 101.6-5.684zM7.75 4a.75.75 0 01.75.75v2.992l2.028.812a.75.75 0 01-.557 1.392l-2.5-1A.75.75 0 017 8.25v-3.5A.75.75 0 017.75 4z"></path></svg>' +
                       '变更时间线 (Git Timeline)</h3>' +
                       '<div id="git-timeline-content"><span style="color:#999">加载中...</span></div>' +
                       '</div>';
    next(html + timelineHtml);
  });

  hook.doneEach(function() {
    var container = document.getElementById('git-timeline-content');
    if (!container || !vm.route.file) return;

    fetch('/_api/history?file=' + encodeURIComponent(vm.route.file))
      .then(function(response) {
        if (!response.ok) throw new Error('API off or file not tracked');
        return response.json();
      })
      .then(function(history) {
        if (!history || history.length === 0) {
          container.innerHTML = '<span style="color:#999; font-size: 0.9em;">暂无 Git 变更记录。</span>';
          return;
        }

        var listHtml = '<ul style="list-style:none; padding-left:0; border-left: 2px solid #eaecef; margin-left: 10px; margin-bottom: 0;">';
        history.forEach(function(commit) {
          listHtml += '<li style="position: relative; margin-bottom: 20px; padding-left: 20px;">' +
                      '<div style="position: absolute; left: -7px; top: 6px; width: 12px; height: 12px; border-radius: 50%; background: #42b983; border: 2px solid #fff; box-shadow: 0 0 0 1px #eaecef;"></div>' +
                      '<div style="font-size: 0.85em; color: #888; margin-bottom: 6px;">' +
                      '<strong style="color: #555;">' + commit.date + '</strong> • ' + commit.author + ' ' +
                      '<code style="background: #f1f1f1; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; margin-left: 5px;">' + commit.hash + '</code>' +
                      '</div>' +
                      '<div style="color: #444; font-size: 0.95em; line-height: 1.5;">' + commit.message + '</div>' +
                      '</li>';
        });
        listHtml += '</ul>';
        container.innerHTML = listHtml;
      })
      .catch(function(err) {
        container.innerHTML = '<span style="color:#999; font-size: 0.9em;">无法获取时间线（环境脱机或仅静态预览支持）。</span>';
      });
  });
}

window.$docsify = window.$docsify || {};
window.$docsify.plugins = (window.$docsify.plugins || []).concat(gitTimelinePlugin);
