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
    if (window.addToolbarButton) {
        window.addToolbarButton('btn-graph-view', '🕸️', 'Graph', openGraphModal, 50);
    } else {
        // Fallback if toolbar.js is missing
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
        
        btn.onmouseenter = () => btn.style.transform = 'scale(1.05)';
        btn.onmouseleave = () => btn.style.transform = 'scale(1)';
        btn.style.transition = 'transform 0.2s';
        
        document.body.appendChild(btn);
    }

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
    closeBtn.style.color = '#333';
    closeBtn.style.fontSize = '30px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.background = 'rgba(0,0,0,0.05)';
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
    chartContainer.style.backgroundColor = '#ffffff';
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
    
    myChart.showLoading({ color: '#42b983', textColor: '#333', maskColor: 'rgba(255,255,255,0.8)' });
    
    fetch((window.HIBOOK_ROOT || '/') + '_api/graph')
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
          backgroundColor: '#ffffff',
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
                  color: '#333333',
                  borderColor: '#222222',
                  borderWidth: 1
                },
                label: { 
                  show: (nodeDegrees[n.id] || 0) > 1, // Only show label for nodes with connections by default
                  position: 'bottom', 
                  color: '#666',
                  distance: 8
                },
                emphasis: {
                  label: { show: true, color: '#42b983', fontWeight: 'bold', fontSize: 13 },
                  itemStyle: { color: '#42b983', borderColor: '#2c8f63', borderWidth: 2 }
                },
                select: {
                  label: { show: true, color: '#42b983', fontWeight: 'bold', fontSize: 13 },
                  itemStyle: { color: '#42b983', borderColor: '#2c8f63', borderWidth: 2 }
                }
              })),
              edges: data.edges.map(e => ({
                source: e.source,
                target: e.target,
                lineStyle: { color: '#cccccc', curveness: 0.1, width: 1.5 },
                emphasis: {
                  lineStyle: { color: '#42b983', width: 3, opacity: 0.8 }
                }
              })),
              labelLayout: {
                  hideOverlap: false
              },
              emphasis: {
                focus: 'adjacency'
              },
              selectedMode: 'multiple',
              roam: true,
              force: { repulsion: 250, edgeLength: 120, gravity: 0.1 }
            }
          ]
        };
        myChart.setOption(option, true);
        
        myChart.on('click', function (params) {
          if (params.dataType === 'node') {
            myChart.dispatchAction({ type: 'unselect', seriesIndex: 0 });
            myChart.dispatchAction({ type: 'downplay', seriesIndex: 0 });
            modal.style.display = 'none';
            window.location.hash = '#/' + params.data.id.replace('.md', '');
          }
        });

        myChart.on('mouseover', { dataType: 'node' }, function (params) {
            let neighborIndices = [];
            let nodeId = params.data.id;
            data.nodes.forEach((n, i) => {
                let connected = data.edges.some(e => 
                    (e.source === nodeId && e.target === n.id) || 
                    (e.target === nodeId && e.source === n.id)
                );
                if (connected) {
                    neighborIndices.push(i);
                }
            });
            if (neighborIndices.length > 0) {
              myChart.dispatchAction({
                  type: 'select',
                  dataType: 'node',
                  seriesIndex: 0,
                  dataIndex: neighborIndices
              });
            }
        });
        
        myChart.on('mouseout', { dataType: 'node' }, function (params) {
            let allIndices = data.nodes.map((n, i) => i);
            myChart.dispatchAction({
                type: 'unselect',
                seriesIndex: 0,
                dataIndex: allIndices
            });
        });
      })
      .catch(e => {
          myChart.hideLoading();
          console.error('Failed to load graph data', e);
      });
  }

  window.addEventListener('load', initGraphView);

})();
