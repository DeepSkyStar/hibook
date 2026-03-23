// graph-view.js
// Provides a floating button to open an interactive ECharts Knowledge Graph
(function () {

  class HiGraphView extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.myChart = null;
      
      this.openGraphModal = this.openGraphModal.bind(this);
      this.closeGraphModal = this.closeGraphModal.bind(this);
    }

    connectedCallback() {
      this.render();
      if (typeof echarts === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js';
        script.onload = () => this.setupDocsifyIntegration();
        document.head.appendChild(script);
      } else {
        this.setupDocsifyIntegration();
      }
    }

    render() {
      this.shadowRoot.innerHTML = `
        <style>
          .modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background-color: rgba(0,0,0,0.85);
            z-index: 10000;
            display: none;
            justify-content: center;
            align-items: center;
          }
          .close-btn {
            position: absolute;
            top: 25px;
            right: 35px;
            color: #333;
            font-size: 30px;
            cursor: pointer;
            background: rgba(0,0,0,0.05);
            width: 50px;
            height: 50px;
            border-radius: 25px;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .chart-container {
            width: 90vw;
            height: 85vh;
            background-color: #ffffff;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
          }
          .fallback-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: var(--theme-color, #42b983);
            color: #fff;
            padding: 10px 15px;
            border-radius: 30px;
            cursor: pointer;
            box-shadow: 0 4px 6px rgba(0,0,0,0.2);
            z-index: 9999;
            font-family: var(--baseFontFamily, sans-serif);
            font-weight: bold;
            transition: transform 0.2s;
          }
          .fallback-btn:hover {
            transform: scale(1.05);
          }
        </style>
        <div id="fallback-btn-container"></div>
        <div class="modal" id="graph-modal">
          <div class="close-btn" id="close-btn">✕</div>
          <div class="chart-container" id="graph-chart"></div>
        </div>
      `;

      this.shadowRoot.getElementById('close-btn').addEventListener('click', this.closeGraphModal);
    }

    setupDocsifyIntegration() {
      if (window.addToolbarButton) {
        window.addToolbarButton('btn-graph-view', '🕸️', 'Graph', this.openGraphModal, 50);
      } else {
        // Fallback if toolbar.js is missing
        const btnContainer = this.shadowRoot.getElementById('fallback-btn-container');
        const btn = document.createElement('div');
        btn.className = 'fallback-btn';
        btn.innerHTML = '🕸️ Graph';
        btn.onclick = this.openGraphModal;
        btnContainer.appendChild(btn);
      }
    }

    closeGraphModal() {
      const modal = this.shadowRoot.getElementById('graph-modal');
      modal.style.display = 'none';
      if (this.myChart) {
          this.myChart.dispose();
          this.myChart = null;
      }
    }

    openGraphModal() {
      const modal = this.shadowRoot.getElementById('graph-modal');
      modal.style.display = 'flex';
      
      const chartDom = this.shadowRoot.getElementById('graph-chart');
      
      // Re-init chart each time to ensure sizing works well
      if (this.myChart) {
          this.myChart.dispose();
      }
      this.myChart = echarts.init(chartDom);
      
      this.myChart.showLoading({ color: '#42b983', textColor: '#333', maskColor: 'rgba(255,255,255,0.8)' });
      
      fetch((window.HIBOOK_ROOT || '/') + '_api/graph')
        .then(res => res.json())
        .then(data => {
          this.myChart.hideLoading();
          
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
          this.myChart.setOption(option, true);
          
          this.myChart.on('click', (params) => {
            if (params.dataType === 'node') {
              this.myChart.dispatchAction({ type: 'unselect', seriesIndex: 0 });
              this.myChart.dispatchAction({ type: 'downplay', seriesIndex: 0 });
              this.closeGraphModal();
              window.location.hash = '#/' + params.data.id.replace('.md', '');
            }
          });
  
          this.myChart.on('mouseover', { dataType: 'node' }, (params) => {
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
                this.myChart.dispatchAction({
                    type: 'select',
                    dataType: 'node',
                    seriesIndex: 0,
                    dataIndex: neighborIndices
                });
              }
          });
          
          this.myChart.on('mouseout', { dataType: 'node' }, (params) => {
              let allIndices = data.nodes.map((n, i) => i);
              this.myChart.dispatchAction({
                  type: 'unselect',
                  seriesIndex: 0,
                  dataIndex: allIndices
              });
          });
        })
        .catch(e => {
            if (this.myChart) this.myChart.hideLoading();
            console.error('Failed to load graph data', e);
        });
    }
  }

  customElements.define('hi-graph-view', HiGraphView);

  window.addEventListener('load', () => {
    if (!document.querySelector('hi-graph-view')) {
      const gv = document.createElement('hi-graph-view');
      document.body.appendChild(gv);
    }
  });

})();
