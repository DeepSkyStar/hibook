// graph-view.js
// Provides a floating button to open an interactive ECharts Knowledge Graph
(function () {
  function initGraphView() {
    if (typeof echarts === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js';
      script.onload = () => setupGraphUI();
      document.head.appendChild(script);
    } else {
      setupGraphUI();
    }
  }

  function setupGraphUI() {
    const btn = document.createElement('div');
    btn.innerHTML = '🕸️ Graph';
    btn.style.position = 'fixed';
    btn.style.bottom = '20px';
    btn.style.right = '20px';
    btn.style.backgroundColor = 'var(--theme-color, #42b983)';
    btn.style.color = '#fff';
    btn.style.padding = '10px 15px';
    btn.style.borderRadius = '30px';
    btn.style.cursor = 'pointer';
    btn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.2)';
    btn.style.zIndex = '9999';
    btn.style.fontFamily = 'var(--baseFontFamily, sans-serif)';
    btn.style.fontWeight = 'bold';
    btn.onclick = openGraphModal;
    
    // Add hover effect
    btn.onmouseenter = () => btn.style.transform = 'scale(1.05)';
    btn.onmouseleave = () => btn.style.transform = 'scale(1)';
    btn.style.transition = 'transform 0.2s';
    
    document.body.appendChild(btn);

    const modal = document.createElement('div');
    modal.id = 'graph-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.backgroundColor = 'rgba(0,0,0,0.85)';
    modal.style.zIndex = '10000';
    modal.style.display = 'none';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';

    const closeBtn = document.createElement('div');
    closeBtn.innerHTML = '✕';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '25px';
    closeBtn.style.right = '35px';
    closeBtn.style.color = '#fff';
    closeBtn.style.fontSize = '30px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.background = 'rgba(255,255,255,0.1)';
    closeBtn.style.width = '50px';
    closeBtn.style.height = '50px';
    closeBtn.style.borderRadius = '25px';
    closeBtn.style.display = 'flex';
    closeBtn.style.justifyContent = 'center';
    closeBtn.style.alignItems = 'center';
    closeBtn.onclick = () => modal.style.display = 'none';
    modal.appendChild(closeBtn);

    const chartContainer = document.createElement('div');
    chartContainer.id = 'graph-chart';
    chartContainer.style.width = '90vw';
    chartContainer.style.height = '85vh';
    chartContainer.style.backgroundColor = '#1e1e1e';
    chartContainer.style.borderRadius = '15px';
    chartContainer.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
    modal.appendChild(chartContainer);

    document.body.appendChild(modal);
  }

  function openGraphModal() {
    const modal = document.getElementById('graph-modal');
    modal.style.display = 'flex';
    
    const chartDom = document.getElementById('graph-chart');
    const myChart = echarts.init(chartDom);
    
    myChart.showLoading({ color: '#42b983', textColor: '#fff', maskColor: 'rgba(30,30,30,0.8)' });
    
    fetch('/_api/graph')
      .then(res => res.json())
      .then(data => {
        myChart.hideLoading();
        
        // Calculate node sizes based on degree (backlinks)
        const nodeDegrees = {};
        data.edges.forEach(e => {
            nodeDegrees[e.target] = (nodeDegrees[e.target] || 0) + 1;
            nodeDegrees[e.source] = (nodeDegrees[e.source] || 0) + 0.5;
        });

        const option = {
          backgroundColor: '#1e1e1e',
          tooltip: {
            formatter: '{b}'
          },
          series: [
            {
              type: 'graph',
              layout: 'force',
              nodes: data.nodes.map(n => ({
                id: n.id,
                name: n.label,
                symbolSize: 15 + Math.min((nodeDegrees[n.id] || 0) * 3, 40),
                itemStyle: { 
                  color: '#42b983',
                  borderColor: '#2c8f63',
                  borderWidth: 2
                },
                label: { 
                  show: (nodeDegrees[n.id] || 0) > 1, // Only show label for nodes with connections by default
                  position: 'bottom', 
                  color: '#ccc',
                  distance: 8
                },
                emphasis: {
                    focus: 'adjacency',
                    label: { show: true, color: '#fff', fontWeight: 'bold' }
                }
              })),
              edges: data.edges.map(e => ({
                source: e.source,
                target: e.target,
                lineStyle: { color: 'rgba(66, 185, 131, 0.4)', curveness: 0.1, width: 1.5 }
              })),
              roam: true,
              force: { repulsion: 250, edgeLength: 120, gravity: 0.1 }
            }
          ]
        };
        myChart.setOption(option);
        
        myChart.on('click', function (params) {
          if (params.dataType === 'node') {
            modal.style.display = 'none';
            window.location.hash = '#/' + params.data.id.replace('.md', '');
          }
        });
      })
      .catch(e => {
          myChart.hideLoading();
          console.error('Failed to load graph data', e);
      });
  }

  window.addEventListener('load', initGraphView);

})();
