let authToken = localStorage.getItem('kg_token') || null;
    let authMode = 'login';
    let authCanvasRAF = null;

    /* ── Animated graph canvas on auth screen ── */
    function startAuthCanvas() {
      const canvas = document.getElementById('auth-canvas');
      const ctx = canvas.getContext('2d');
      let W, H, nodes, edges;

      function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
      }
      resize();
      window.addEventListener('resize', resize);

      // Create fake nodes
      const N = 28;
      nodes = Array.from({ length: N }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
        r: 2 + Math.random() * 3.5,
        pulse: Math.random() * Math.PI * 2,
      }));
      // Connect nearby nodes
      edges = [];
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          if (Math.hypot(dx, dy) < Math.min(W, H) * 0.22) edges.push([i, j]);
        }
      }

      function draw(t) {
        authCanvasRAF = requestAnimationFrame(draw);
        ctx.clearRect(0, 0, W, H);

        // Move nodes
        nodes.forEach(n => {
          n.x += n.vx; n.y += n.vy;
          if (n.x < 0 || n.x > W) n.vx *= -1;
          if (n.y < 0 || n.y > H) n.vy *= -1;
          n.pulse += 0.018;
        });

        // Draw edges
        edges.forEach(([a, b]) => {
          const na = nodes[a], nb = nodes[b];
          const dx = na.x - nb.x, dy = na.y - nb.y;
          const dist = Math.hypot(dx, dy);
          const maxDist = Math.min(W, H) * 0.22;
          if (dist > maxDist) return;
          const alpha = (1 - dist / maxDist) * 0.18;
          ctx.beginPath();
          ctx.moveTo(na.x, na.y);
          ctx.lineTo(nb.x, nb.y);
          ctx.strokeStyle = `rgba(91, 143, 255, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        });

        // Draw nodes
        nodes.forEach(n => {
          const pulse = 0.5 + 0.5 * Math.sin(n.pulse);
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * (1 + pulse * 0.3), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(91, 143, 255, ${0.25 + pulse * 0.2})`;
          ctx.fill();
          // Glow
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * 3, 0, Math.PI * 2);
          const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 3);
          grad.addColorStop(0, `rgba(91, 143, 255, ${0.06 * pulse})`);
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.fill();
        });
      }
      draw(0);
    }

    function stopAuthCanvas() {
      if (authCanvasRAF) { cancelAnimationFrame(authCanvasRAF); authCanvasRAF = null; }
    }

    /* ── Auth Mode Toggle ── */
    function toggleAuthMode() {
      authMode = authMode === 'login' ? 'register' : 'login';
      const box = document.getElementById('auth-box');
      // Strip the CSS keyframe animation so our JS transition takes over
      box.classList.remove('entering');
      box.style.animation = 'none';
      void box.offsetWidth; // force reflow to flush animation state
      box.style.animation = '';
      // Slide out
      box.style.transition = 'transform 0.2s ease-in, opacity 0.18s ease-in';
      box.style.transform = 'translateY(10px)';
      box.style.opacity = '0';
      setTimeout(() => {
        document.getElementById('auth-title').innerText = authMode === 'login' ? 'Welcome Back' : 'Create Account';
        document.getElementById('auth-subtitle').innerText = authMode === 'login' ? 'Sign in to your knowledge graph' : 'Start mapping your knowledge';
        document.getElementById('auth-submit-btn').innerText = authMode === 'login' ? 'Sign In' : 'Register';
        document.getElementById('auth-toggle-btn').innerText = authMode === 'login' ? 'Create an account' : 'I already have an account';
        const err = document.getElementById('auth-error');
        err.innerText = ''; err.classList.remove('visible');
        // Slide back in from slightly above
        box.style.transform = 'translateY(-10px)';
        void box.offsetWidth;
        box.style.transition = 'transform 0.32s cubic-bezier(0.34, 1.4, 0.64, 1), opacity 0.28s ease-out';
        box.style.transform = 'translateY(0)';
        box.style.opacity = '1';
      }, 200);
    }

    /* ── Submit Auth ── */
    async function submitAuth() {
      const u = document.getElementById('auth-username').value.trim();
      const p = document.getElementById('auth-password').value;
      const errEl = document.getElementById('auth-error');
      const btn = document.getElementById('auth-submit-btn');
      errEl.classList.remove('visible');
      if (!u || !p) {
        errEl.innerText = 'Please fill in all fields.'; errEl.classList.add('visible'); return;
      }

      btn.classList.add('loading');
      btn.innerText = authMode === 'login' ? 'Signing in…' : 'Creating account…';

      let url = authMode === 'login' ? '/auth/login' : '/auth/register';
      let options = {};
      if (authMode === 'login') {
        const formData = new URLSearchParams();
        formData.append('username', u); formData.append('password', p);
        options = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData };
      } else {
        options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) };
      }

      try {
        const res = await window.originalFetch(url, options);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || 'Invalid credentials or user already exists.');
        }
        const data = await res.json();
        authToken = data.access_token;
        localStorage.setItem('kg_token', authToken);
        // Step 1: freeze body opacity so dashboard doesn't pop in
        document.body.style.opacity = '0';
        document.body.style.transition = 'none';
        // Step 2: fade out auth overlay
        stopAuthCanvas();
        const overlay = document.getElementById('auth-overlay');
        overlay.classList.add('hiding');
        setTimeout(async () => {
          overlay.style.display = 'none';
          // Step 3: load graph data (body still invisible)
          await init();
          // Step 4: smooth reveal of dashboard
          document.body.style.transition = 'opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1), filter 0.7s ease';
          document.body.style.filter = 'blur(0px)';
          document.body.style.opacity = '1';
        }, 550);
      } catch (e) {
        errEl.innerText = e.message; errEl.classList.add('visible');
        btn.classList.remove('loading');
        btn.innerText = authMode === 'login' ? 'Sign In' : 'Register';
        // Shake animation
        const box = document.getElementById('auth-box');
        box.animate([
          { transform: 'translateX(0)' }, { transform: 'translateX(-8px)' },
          { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' },
          { transform: 'translateX(0)' }
        ], { duration: 350, easing: 'ease-out' });
      }
    }

    /* ── Allow Enter key ── */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.getElementById('auth-overlay').style.display !== 'none') {
        submitAuth();
      }
    });

    function logout() {
      // Fade the whole page out, then reload
      document.body.classList.add('page-exit');
      authToken = null;
      localStorage.removeItem('kg_token');
      setTimeout(() => location.reload(), 420);
    }

    // Intercept Fetch
    window.originalFetch = window.fetch;
    window.fetch = async function() {
      let [resource, config] = arguments;
      if (!config) config = {};
      if (!config.headers) config.headers = {};
      if (authToken) {
        config.headers['Authorization'] = 'Bearer ' + authToken;
      }
      const response = await window.originalFetch(resource, config);
      const isAuthUrl = typeof resource === 'string' ? resource.startsWith('/auth/') : false;
      if (response.status === 401 && !isAuthUrl) {
        logout();
      }
      return response;
    };

    const API = '/edges/graph';
    const WS_PROTOCOL = location.protocol === 'https:' ? 'wss' : 'ws';
    const WS_URL = `${WS_PROTOCOL}://${location.host}/ws/events`;

    let cy = null;
    let graphData = { elements: { nodes: [], edges: [] } };
    let pendingNodes = new Map(); // nodeId(str) → {el, phase}
    let rafId = null;
    let activePanel = null; // 'add' | 'detail' | 'edge' | null
    let connectingNode = null;
    let targetConnectingNode = null;
    let currentCxtNode = null;

    /* ── Theme Management ── */
    const storedTheme = localStorage.getItem('theme');
    const isLight = storedTheme === 'light';
    if (isLight) document.documentElement.classList.add('light');
    document.getElementById('theme-toggle').textContent = isLight ? '☀️' : '🌙';

    document.getElementById('theme-toggle').addEventListener('click', () => {
      const root = document.documentElement;

      root.classList.add('theme-transition');

      root.classList.toggle('light');
      const lightOn = root.classList.contains('light');
      localStorage.setItem('theme', lightOn ? 'light' : 'dark');
      document.getElementById('theme-toggle').textContent = lightOn ? '☀️' : '🌙';
      if (cy) cy.style(getCyStyles(lightOn)).update();

      setTimeout(() => root.classList.remove('theme-transition'), 400);
    });

    const STATUS_ICONS = {
      'draft': '✏️',
      'in progress': '⚙️',
      'consolidated': '✅'
    };

    function getTagColor(tags) {
      if (!tags || tags.length === 0) return null;
      const tag = tags[0]; 
      let hash = 0;
      for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
      }
      return `hsl(${Math.abs(hash) % 360}, 65%, 55%)`;
    }

    let addEditor, detailEditor;
    function initEditors() {
      const suggestion = {
        items: ({ query }) => {
          return graphData.elements.nodes
            .map(n => n.data)
            .filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 5);
        },
        render: () => {
          let popup;
          return {
            onStart: props => {
              if (!props.clientRect) return;
              popup = document.createElement('div');
              popup.style.cssText = 'position:absolute;background:var(--surface2);border:1px solid var(--border);border-radius:6px;z-index:9999;padding:4px;display:flex;flex-direction:column;max-height:150px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.3);min-width:150px;';
              
              const updateItems = (items) => {
                popup.innerHTML = '';
                if (!items.length) {
                  popup.innerHTML = '<div style="padding:4px 8px;font-size:12px;color:var(--dim);">No results</div>';
                  return;
                }
                items.forEach((item, index) => {
                  const btn = document.createElement('button');
                  btn.style.cssText = 'background:none;border:none;color:var(--text);text-align:left;padding:6px 8px;font-size:12px;border-radius:4px;cursor:pointer;';
                  btn.onmouseover = () => btn.style.background = 'var(--accent)';
                  btn.onmouseout = () => btn.style.background = 'none';
                  btn.textContent = item.name;
                  btn.onclick = () => {
                    props.command({ id: item.id, label: item.name });
                    if (currentNodeId) {
                      // Auto-create edge from current node to mentioned node
                      fetch('/edges/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_id: parseInt(currentNodeId), target_id: parseInt(item.id), name: 'mentions', description: '' }) })
                        .then(r => r.json())
                        .then(edgeData => {
                           const cyEdge = { data: { id: 'e' + edgeData.id, source: String(edgeData.source_id), target: String(edgeData.target_id), name: edgeData.name, description: edgeData.description, similarity: edgeData.similarity, created_at: edgeData.created_at } };
                           if(!cy.getElementById(cyEdge.data.id).length) { cy.add(cyEdge); graphData.elements.edges.push(cyEdge); updateStats(); }
                        });
                    }
                  };
                  popup.appendChild(btn);
                });
              };
              
              updateItems(props.items);
              document.body.appendChild(popup);
              const rect = props.clientRect();
              popup.style.left = rect.left + 'px';
              popup.style.top = rect.bottom + window.scrollY + 5 + 'px';
              popup.updateItems = updateItems;
            },
            onUpdate: props => {
              if (popup && popup.updateItems) popup.updateItems(props.items);
              if (popup && props.clientRect) {
                const rect = props.clientRect();
                popup.style.left = rect.left + 'px';
                popup.style.top = rect.bottom + window.scrollY + 5 + 'px';
              }
            },
            onKeyDown: props => {
              if (props.event.key === 'Escape') { popup?.remove(); return true; }
              return false;
            },
            onExit: () => {
              if (popup) popup.remove();
            }
          }
        }
      };

      const commonEditorProps = {
        handlePaste: function(view, event, slice) {
          const items = (event.clipboardData || event.originalEvent?.clipboardData)?.items;
          if (!items) return false;
          for (let item of items) {
            if (item.kind === 'file') {
              const file = item.getAsFile();
              if (file && file.type.match(/^(image|video|audio)\//)) {
                uploadMediaFile(file, view);
                event.preventDefault();
                return true;
              }
            }
          }
          return false;
        },
        handleDrop: function(view, event, slice, moved) {
          if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
            for (let file of event.dataTransfer.files) {
              if (file.type.match(/^(image|video|audio)\//)) {
                uploadMediaFile(file, view);
              }
            }
            event.preventDefault();
            return true;
          }
          return false;
        }
      };

      addEditor = new window.TiptapEditor({
        element: document.getElementById('add-editor-container'),
        extensions: [
          window.TiptapStarterKit,
          window.TiptapLink.configure({ openOnClick: false, autolink: true }),
          window.TiptapMediaNode,
          window.TiptapPlaceholder.configure({ placeholder: 'Notes... use @ for mentions' }),
          window.TiptapMention.configure({ HTMLAttributes: { class: 'mention' }, suggestion })
        ],
        editorProps: commonEditorProps,
        content: '',
      });
      
      let saveTimeout;
      detailEditor = new window.TiptapEditor({
        element: document.getElementById('detail-editor-container'),
        extensions: [
          window.TiptapStarterKit,
          window.TiptapLink.configure({ openOnClick: false, autolink: true }),
          window.TiptapMediaNode,
          window.TiptapMention.configure({ HTMLAttributes: { class: 'mention' }, suggestion })
        ],
        editorProps: commonEditorProps,
        content: '',
        onUpdate: () => {
          clearTimeout(saveTimeout);
          saveTimeout = setTimeout(() => {
            if (!currentNodeId) return;
            patchNodeMetadata({ content: detailEditor.getHTML() });
          }, 1000);
        }
      });
    }
    
    if (window.tiptapLoaded) {
      initEditors();
    } else {
      document.addEventListener('tiptap-ready', initEditors);
    }

    function getCyStyles(light) {
      return [
        {
          selector: 'node', style: {
            width: 'data(size)', height: 'data(size)', 
            'background-color': function(e){ return e.data('displayColor') || (light ? '#e0e7ff' : '#1e2a4a'); },
            'border-width': 1.5, 'border-color': light ? '#3b82f6' : '#5b8fff', 'border-opacity': .5,
            label: 'data(displayLabel)', color: light ? '#1e3a8a' : '#c8d4f0',
            'font-family': 'Inter,sans-serif', 'font-size': '11px', 'font-weight': '500',
            'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 7,
            'transition-property': 'opacity,border-color,border-opacity,background-color,color',
            'transition-duration': '300ms',
            'transition-timing-function': 'ease-out-cubic',
            'z-index-compare': 'manual',
            'z-index': 2
          }
        },
        {
          selector: 'edge', style: {
            width: 1.5, 'line-color': light ? '#cbd5e1' : '#2d3a5a', 'curve-style': 'bezier', opacity: .7,
            'transition-property': 'opacity,line-color,text-opacity,text-background-opacity', 'transition-duration': '300ms',
            'transition-timing-function': 'ease-out-cubic',
            'label': 'data(name)',
            'font-family': 'Inter,sans-serif', 'font-size': '9px', 'font-weight': '600',
            'color': light ? '#1e3a8a' : '#c8d4f0',
            'text-opacity': 0,
            'text-background-color': light ? '#ffffff' : '#111118',
            'text-background-opacity': 0,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            'edge-text-rotation': 'autorotate',
            'text-margin-y': -14,
            'underlay-color': '#000000',
            'underlay-padding': 15,
            'underlay-opacity': 0.001,
            'text-wrap': 'wrap',
            'text-max-width': '80px',
            'z-index-compare': 'manual',
            'z-index': 1
          }
        },
        { selector: 'node.pending', style: { 'border-color': 'var(--accent)', 'border-opacity': 1, 'border-width': 2 } },
        { selector: 'node.faded', style: { opacity: .4 } },
        { selector: 'edge.faded', style: { opacity: .25 } },
        { selector: 'node.hl, node.active-nb', style: { 'border-color': light ? '#2563eb' : '#7aa3ff', 'border-opacity': 1, 'border-width': 2, color: light ? '#1e3a8a' : '#e8f0ff', opacity: 1, 'z-index': 1000 } },
        { selector: 'node.selected', style: { 'border-color': light ? '#7c3aed' : '#a78bfa', 'border-opacity': 1, 'border-width': 2.5, color: light ? '#0f172a' : '#fff', opacity: 1, 'z-index': 1000 } },
        { selector: 'edge.hl, edge.active-nb', style: { 'line-color': light ? '#2563eb' : '#5b8fff', width: 2.5, opacity: .9, 'text-opacity': 1, 'text-background-opacity': 0.85, 'z-index': 1001 } },
        { selector: 'edge.hover', style: { width: 3.5, opacity: 0.9, 'line-color': light ? '#2563eb' : '#5b8fff', 'text-opacity': 1, 'text-background-opacity': 0.85, 'z-index': 1002 } },
        { selector: 'core', style: { 'active-bg-color': light ? '#000000' : '#ffffff', 'active-bg-opacity': 0.15, 'active-bg-size': 30 } }
      ];
    }

    /* ── Panel management ── */
    function openPanel(name) {
      // Close all first
      document.getElementById('add-panel').classList.remove('open');
      document.getElementById('detail-panel').classList.remove('open');
      document.getElementById('edge-panel').classList.remove('open');
      document.getElementById('cy').classList.remove('add-open', 'detail-open', 'edge-open');

      if (name === 'add') {
        document.getElementById('add-panel').classList.add('open');
        document.getElementById('cy').classList.add('add-open');
      } else if (name === 'detail') {
        document.getElementById('detail-panel').classList.add('open');
        document.getElementById('cy').classList.add('detail-open');
      } else if (name === 'edge') {
        document.getElementById('edge-panel').classList.add('open');
        document.getElementById('cy').classList.add('detail-open'); // reuse margin
      }
      activePanel = name;
    }

    function closeAllPanels() {
      document.getElementById('add-panel').classList.remove('open');
      document.getElementById('detail-panel').classList.remove('open');
      document.getElementById('edge-panel').classList.remove('open');
      document.getElementById('cy').classList.remove('add-open', 'detail-open', 'edge-open');
      
      const selMenu = document.getElementById('selection-menu');
      if (selMenu) {
        selMenu.style.opacity = '0';
        selMenu.style.pointerEvents = 'none';
      }
      
      activePanel = null;
      if (cy) {
        cy.elements().removeClass('selected active-nb hl faded');
        cy.nodes().forEach(n => {
          if (!n.hasClass('dying')) {
            n.animate({ style: { width: n.data('size'), height: n.data('size') } }, { duration: 250, queue: false });
          }
        });
      }
    }

    document.getElementById('btn-add').addEventListener('click', () => openPanel('add'));
    document.getElementById('add-close').addEventListener('click', closeAllPanels);
    document.getElementById('dp-close').addEventListener('click', closeAllPanels);
    document.getElementById('ep-close').addEventListener('click', closeAllPanels);

    document.getElementById('cxt-add-edge').addEventListener('click', () => {
      document.getElementById('cxt-menu').classList.add('hidden');
      if (currentCxtNode) {
        connectingNode = currentCxtNode;
        cy.elements().removeClass('selected active-nb hl faded');
        connectingNode.addClass('selected');
        document.getElementById('connection-tip').classList.remove('hidden');
      }
    });

    document.getElementById('cxt-delete-node').addEventListener('click', () => {
      document.getElementById('cxt-menu').classList.add('hidden');
      if (currentCxtNode) {
        currentNodeId = String(currentCxtNode.id());
        document.getElementById('del-node-name').textContent = `"${currentCxtNode.data('name')}"`;
        document.getElementById('delete-modal').classList.add('open');
      }
    });

    document.getElementById('cxt-delete-edge').addEventListener('click', () => {
      document.getElementById('cxt-menu').classList.add('hidden');
      if (currentCxtEdge) {
        currentEdgeId = parseInt(currentCxtEdge.id().replace('e', ''));
        deleteCurrentEdge();
      }
    });

    /* ── WebSocket ── */
    let ws;
    function connectWS() {
      ws = new WebSocket(WS_URL + '?token=' + authToken);
      ws.onmessage = e => handleWS(JSON.parse(e.data));
      ws.onclose = () => setTimeout(connectWS, 2000);
      setInterval(() => ws && ws.readyState === 1 && ws.send('ping'), 20000);
    }

    function handleWS(msg) {
      if (msg.type !== 'node_status') return;
      const id = String(msg.node_id);

      if (msg.status === 'embedding_done') {
        setPhase(id, 'llm');
      } else if (msg.status === 'processing_edges' || msg.status === 'edge_progress') {
        setPhase(id, 'llm');
      } else if (msg.status === 'done') {
        // Add new edges to graph
        (msg.new_edges || []).forEach(ed => {
          if (!cy.getElementById(ed.data.id).length) {
            cy.add(ed);
            graphData.elements.edges.push(ed);
          }
        });
        updateStats();
        setPhase(id, 'check');
        // Update node state
        const n = cy.getElementById(id);
        if (n) { n.removeClass('pending'); n.data('has_embedding', true); }
        setTimeout(() => removeOverlay(id), 2200);
      } else if (msg.status === 'error') {
        removeOverlay(id);
      }
    }

    /* ── Cytoscape ── */
    function updateNodeSizes() {
      if (!cy) return;
      cy.nodes().forEach(n => {
        const d = n.degree();
        const base = Math.min(140, 46 + (d * 8));
        n.data('size', base);
        n.data('hl_size', base + 6);
        n.data('sel_size', base + 10);

        let currentTarget = base;
        if (n.hasClass('selected')) currentTarget = base + 10;
        else if (n.hasClass('hl') || n.hasClass('active-nb')) currentTarget = base + 6;

        n.animate({ style: { width: currentTarget, height: currentTarget } }, { duration: 900, easing: 'ease-out-cubic', queue: false });
      });
    }

    async function init() {
      const r = await fetch(API);
      graphData = await r.json();
      document.getElementById('loading').classList.add('hidden');

      // Pre-calculate degrees for initial render
      const degrees = {};
      if (graphData.elements.edges) {
        graphData.elements.edges.forEach(e => {
          degrees[e.data.source] = (degrees[e.data.source] || 0) + 1;
          degrees[e.data.target] = (degrees[e.data.target] || 0) + 1;
        });
      }
      if (graphData.elements.nodes) {
        graphData.elements.nodes.forEach(n => {
          const d = degrees[n.data.id] || 0;
          const base = Math.min(140, 46 + (d * 8));
          n.data.size = base;
          n.data.hl_size = base + 6;
          n.data.sel_size = base + 10;
          
          const icon = STATUS_ICONS[n.data.status || 'draft'];
          n.data.displayLabel = `${icon} ${n.data.label}`;
          n.data.displayColor = getTagColor(n.data.tags);
        });
      }

      cy = cytoscape({
        container: document.getElementById('cy'),
        elements: graphData.elements,
        style: getCyStyles(document.documentElement.classList.contains('light')),
        layout: { name: 'cose', animate: false, fit: true, padding: 220, nodeRepulsion: node => 8000 + ((node.data('size') || 46) * 60), edgeElasticity: 200, gravity: 80, numIter: 800 },
        userZoomingEnabled: false, // We will handle zooming manually for momentum
        boxSelectionEnabled: false // Disable the marquee selection box
      });

      updateStats(); // cy hazır olduktan sonra

      let hoverTimeout = null;
      let hoveredNode = null;

      cy.on('mouseover', 'node', e => {
        if (connectingNode) {
          if (e.target !== connectingNode) {
            e.target.addClass('hl');
          }
          return;
        }

        const nd = e.target;
        hoveredNode = nd;

        clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(() => {
          if (hoveredNode !== nd) return;
          const nb = nd.neighborhood();
          cy.batch(() => {
            cy.elements().removeClass('faded hl');
            cy.elements().not(nb).not(nd).addClass('faded');
            nb.addClass('hl');
            nd.addClass('hl');
          });

          nd.animate({ style: { width: nd.data('hl_size'), height: nd.data('hl_size') } }, { duration: 250, queue: false });
          nb.nodes().forEach(n => {
            n.animate({ style: { width: n.data('hl_size'), height: n.data('hl_size') } }, { duration: 250, queue: false });
          });

          showTip(e.originalEvent.clientX, e.originalEvent.clientY, nd.data());
        }, 40);
      });

      cy.on('mouseout', 'node', e => {
        if (connectingNode) {
          if (e.target !== connectingNode) {
            e.target.removeClass('hl');
          }
          return;
        }

        hoveredNode = null;
        clearTimeout(hoverTimeout);

        hoverTimeout = setTimeout(() => {
          if (hoveredNode) return;
          cy.batch(() => {
            cy.elements().removeClass('faded hl');
          });

          cy.nodes().forEach(n => {
            const target = n.hasClass('selected') ? n.data('sel_size') : n.data('size');
            n.animate({ style: { width: target, height: target } }, { duration: 250, queue: false });
          });

          hideTip();
        }, 40);
      });
      cy.on('mousemove', 'node', e => { if (!connectingNode) moveTip(e.originalEvent.clientX, e.originalEvent.clientY); });

      cy.on('tap', 'node', e => {
        document.getElementById('cxt-menu').classList.add('hidden');
        if (connectingNode) {
          if (e.target.id() !== connectingNode.id()) {
            targetConnectingNode = e.target;
            document.getElementById('add-edge-desc').textContent = `Connecting ${connectingNode.data('name')} to ${targetConnectingNode.data('name')}`;
            document.getElementById('add-edge-name').value = '';
            document.getElementById('add-edge-description').value = '';
            document.getElementById('add-edge-modal').classList.add('open');
          } else {
            // Cancel connection mode if they tap the same node
            connectingNode.removeClass('selected');
            connectingNode = null;
            document.getElementById('connection-tip').classList.add('hidden');
          }
          return;
        }

        cy.elements().removeClass('selected active-nb hl faded');
        e.target.addClass('selected');
        e.target.neighborhood().addClass('active-nb');

        cy.nodes().forEach(n => {
          let s = n.data('size');
          if (n.id() === e.target.id()) s = n.data('sel_size');
          else if (e.target.neighborhood('node').has(n)) s = n.data('hl_size');
          n.animate({ style: { width: s, height: s } }, { duration: 250, queue: false });
        });

        showDetail(e.target.data());
      });

      cy.on('tap', 'edge', e => {
        document.getElementById('cxt-menu').classList.add('hidden');
        if (connectingNode) return;
        cy.elements().removeClass('selected active-nb hl faded hover');
        e.target.addClass('selected');
        showEdgeDetail(e.target.data());
      });

      cy.on('mouseover', 'edge', e => {
        cy.userPanningEnabled(false);
        e.target.addClass('hover');
      });

      cy.on('mouseout', 'edge', e => {
        cy.userPanningEnabled(true);
        e.target.removeClass('hover');
      });

      cy.on('cxttap', 'node', e => {
        hideTip();
        const node = e.target;
        currentCxtNode = node;
        currentCxtEdge = null;
        document.getElementById('cxt-add-edge').style.display = 'block';
        document.getElementById('cxt-delete-node').style.display = 'block';
        document.getElementById('cxt-delete-edge').style.display = 'none';

        const cxt = document.getElementById('cxt-menu');
        cxt.style.left = e.originalEvent.clientX + 'px';
        cxt.style.top = e.originalEvent.clientY + 'px';
        cxt.classList.remove('hidden');
      });

      cy.on('cxttap', 'edge', e => {
        hideTip();
        const edge = e.target;
        currentCxtEdge = edge;
        currentCxtNode = null;
        document.getElementById('cxt-add-edge').style.display = 'none';
        document.getElementById('cxt-delete-node').style.display = 'none';
        document.getElementById('cxt-delete-edge').style.display = 'block';

        const cxt = document.getElementById('cxt-menu');
        cxt.style.left = e.originalEvent.clientX + 'px';
        cxt.style.top = e.originalEvent.clientY + 'px';
        cxt.classList.remove('hidden');
      });

      cy.on('tap', e => {
        if (e.target === cy) {
          document.getElementById('cxt-menu').classList.add('hidden');
          if (connectingNode) {
            connectingNode = null;
            document.getElementById('connection-tip').classList.add('hidden');
          }
          cy.elements().removeClass('selected active-nb hl faded');
          cy.nodes().forEach(n => {
            n.animate({ style: { width: n.data('size'), height: n.data('size') } }, { duration: 250, queue: false });
          });
          closeAllPanels();
        }
      });
      cy.on('pan zoom', updateOverlayPositions);
      connectWS();

      /* ── Smooth Spring Zoom ── */
      let targetZoomPos = Math.log(1);
      let zoomPos = Math.log(1);
      let zoomVel = 0;
      let zoomRaf = null;
      let mouseX = window.innerWidth / 2;
      let mouseY = window.innerHeight / 2;

      const cyContainer = document.getElementById('cy');
      cyContainer.addEventListener('wheel', e => {
        e.preventDefault();
        const rect = cyContainer.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;

        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 16;

        let factor = e.ctrlKey ? 0.0015 : 0.003;

        if (!zoomRaf) {
          // Animasyon o an duruyorsa, mevcut zoom'u alıp hedefe ekle
          zoomPos = Math.log(cy.zoom());
          targetZoomPos = zoomPos;
          zoomRaf = requestAnimationFrame(springZoomLoop);
        }

        targetZoomPos -= delta * factor;
        targetZoomPos = Math.max(Math.log(0.1), Math.min(Math.log(5), targetZoomPos));
      }, { passive: false });

      function springZoomLoop() {
        let tension = 0.035; // İvmelenme gücü (yavaş başlar)
        let damping = 0.22;  // Yavaşça durmasını sağlayan sürtünme

        let distance = targetZoomPos - zoomPos;
        zoomVel += distance * tension;
        zoomVel *= (1 - damping);
        zoomPos += zoomVel;

        if (Math.abs(distance) < 0.001 && Math.abs(zoomVel) < 0.0001) {
          zoomRaf = null;
          return;
        }

        cy.zoom({
          level: Math.exp(zoomPos),
          renderedPosition: { x: mouseX, y: mouseY }
        });

        zoomRaf = requestAnimationFrame(springZoomLoop);
      }
    }

    /* ── Save node ── */
    document.getElementById('btn-save').addEventListener('click', async () => {
      const name = document.getElementById('m-name').value.trim();
      const content = addEditor ? addEditor.getHTML() : '';
      const tags = document.getElementById('m-tags').value.split(',').map(s => s.trim()).filter(s => s);
      const status = document.getElementById('m-status').value;

      if (!name || !content || content === '<p></p>') { setStatus('Name and content are required.', false); return; }

      document.getElementById('btn-save').disabled = true;
      setStatus('Computing embedding…', true);

      // Geçici node — görünmez, sadece overlay için yer tutar
      const tempId = `temp_${Date.now()}`;
      const vpExt = cy.extent();
      const vpCenter = { x: (vpExt.x1 + vpExt.x2) / 2, y: (vpExt.y1 + vpExt.y2) / 2 };
      cy.add({ data: { id: tempId, label: name, name, content, has_embedding: false } });
      const tNode = cy.getElementById(tempId);
      tNode.style({ opacity: 0, width: 1, height: 1 });
      tNode.position(vpCenter);
      tNode.addClass('pending');
      addOverlay(tempId, 'embed');

      let node;
      try {
        const r = await fetch('/nodes/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, content, tags, status }) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        node = await r.json();
      } catch (e) {
        setStatus('Error: ' + e.message, false);
        cy.remove(cy.getElementById(tempId));
        removeOverlay(tempId);
        document.getElementById('btn-save').disabled = false;
        return;
      }

      // Geçici node'u gerçeğiyle değiştir
      removeOverlay(tempId);
      cy.remove(cy.getElementById(tempId));

      const realId = String(node.id);
      const icon = STATUS_ICONS[node.status || 'draft'];
      const cyNode = { 
        data: { 
          id: realId, 
          label: node.name, 
          name: node.name, 
          content: node.content, 
          created_at: node.created_at, 
          has_embedding: true,
          tags: node.tags,
          status: node.status,
          displayLabel: `${icon} ${node.name}`,
          displayColor: getTagColor(node.tags)
        } 
      };
      cy.add(cyNode);
      graphData.elements.nodes.push(cyNode);
      updateStats();

      const rNode = cy.getElementById(realId);
      rNode.addClass('pending');

      // Graf merkezinde opacity:0, size:1 olarak doğar
      const ext = cy.extent();
      rNode.style({ opacity: 0, width: 1, height: 1 });
      rNode.position({ x: (ext.x1 + ext.x2) / 2, y: (ext.y1 + ext.y2) / 2 });

      addOverlay(realId, 'embed'); // WS: embedding_done→llm, done→check

      // 600ms ease-out-cubic: opacity:1, size:46
      rNode.animate(
        { style: { opacity: 1, width: 46, height: 46 } },
        { duration: 600, easing: 'ease-out-cubic', complete: () => smoothRelayout() }
      );

      // Kaydet log
      const li = document.createElement('div');
      li.style.cssText = 'font-size:12px;color:var(--dim);padding:6px 0;border-top:1px solid var(--border)';
      li.textContent = `✓ ${node.name} (#${node.id})`;
      document.getElementById('saved-list').prepend(li);

      setStatus('Waiting for edges…', false);
      document.getElementById('btn-save').disabled = false;
      document.getElementById('m-name').value = '';
      document.getElementById('m-tags').value = '';
      document.getElementById('m-status').value = 'draft';
      if (addEditor) addEditor.commands.setContent('');
    });

    /* ── Smooth layout transition ──
       1. Mevcut pozisyonları kaydet
       2. Cose layout'u ANİMASYONSUZ çalıştır (fizik simülasyonunu gizle)
       3. Hedef pozisyonları kaydet, sonra eski pozisyonlara geri dön
       4. Tüm node'ları aynı anda ease-out ile hedefe kaydır                  */
    function smoothRelayout() {
      const saved = {};
      cy.nodes().forEach(n => { saved[n.id()] = { ...n.position() }; });

      const lay = cy.layout({
        name: 'cose', animate: false, fit: false, randomize: false,
        nodeRepulsion: node => 8000 + ((node.data('size') || 46) * 60), edgeElasticity: 200, gravity: 80, numIter: 600,
      });

      lay.on('layoutstop', () => {
        const targets = {};
        cy.nodes().forEach(n => { targets[n.id()] = { ...n.position() }; });

        // Eski konumlara anında geri dön
        cy.nodes().forEach(n => { if (saved[n.id()]) n.position(saved[n.id()]); });

        // Hepsini aynı anda hedef konuma kaydır
        cy.nodes().forEach(n => {
          if (!targets[n.id()]) return;
          n.animate(
            { position: targets[n.id()] },
            { duration: 900, easing: 'ease-out-cubic' }
          );
        });
      });

      lay.run();
    }

    function setStatus(msg, loading) {

      document.getElementById('add-msg').textContent = msg;
      const el = document.getElementById('add-status');
      el.classList.toggle('loading', loading);
    }

    /* ── Overlays ── */
    function makeOverlayInner(phase) {
      if (phase === 'embed') return '<div class="ph-embed"></div>';
      if (phase === 'llm') return '<div class="ph-llm"><div class="ph-llm-dot"></div><div class="ph-llm-dot"></div><div class="ph-llm-dot"></div></div>';
      if (phase === 'check') return `<div class="ph-check"><svg viewBox="0 0 36 36" fill="none" stroke="#34d399" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="14" stroke="rgba(52,211,153,.2)" fill="none"/><polyline points="10,18 15,23 26,12"/></svg></div>`;
      return '';
    }

    function addOverlay(nodeId, phase) {
      const el = document.createElement('div');
      el.className = 'nover';
      el.innerHTML = makeOverlayInner(phase);
      document.getElementById('overlays').appendChild(el);
      pendingNodes.set(nodeId, { el, phase });
      startRaf();
      updateOverlayPositions();
    }

    function setPhase(nodeId, phase) {
      const entry = pendingNodes.get(nodeId);
      if (!entry) return;
      entry.phase = phase;
      entry.el.innerHTML = makeOverlayInner(phase);
    }

    function removeOverlay(nodeId) {
      const entry = pendingNodes.get(nodeId);
      if (!entry) return;
      entry.el.classList.add('fading');
      setTimeout(() => entry.el.remove(), 400);
      pendingNodes.delete(nodeId);
    }

    function startRaf() {
      if (rafId) return;
      function loop() {
        updateOverlayPositions();
        if (pendingNodes.size > 0) rafId = requestAnimationFrame(loop);
        else rafId = null;
      }
      rafId = requestAnimationFrame(loop);
    }

    function updateOverlayPositions() {
      if (!cy) return;
      const rect = document.getElementById('cy').getBoundingClientRect();
      for (const [nodeId, { el }] of pendingNodes) {
        const nd = cy.getElementById(nodeId);
        if (!nd || !nd.length) continue;
        const rp = nd.renderedPosition();
        const sz = nd.renderedWidth();
        el.style.left = (rect.left + rp.x - sz / 2) + 'px';
        el.style.top = (rect.top + rp.y - sz / 2) + 'px';
        el.style.width = sz + 'px';
        el.style.height = sz + 'px';
      }
    }

    /* ── Detail panel ── */
    let currentNodeId = null;

    async function showDetail(data) {
      currentNodeId = String(data.id);
      document.getElementById('dp-title').textContent = data.name;

      // Name
      document.getElementById('dp-name-view').textContent = data.name;
      document.getElementById('dp-name-input').value = data.name;
      cancelEdit('name');
      
      // Tags
      const tagsView = document.getElementById('dp-tags-view');
      const tags = data.tags || [];
      if (tags.length === 0) {
        tagsView.textContent = '—';
      } else {
        tagsView.innerHTML = tags.map(t => `<span style="background:var(--surface);border:1px solid var(--border);padding:2px 6px;border-radius:4px;font-size:11px;">${t}</span>`).join('');
      }
      document.getElementById('dp-tags-input').value = tags.join(', ');
      cancelEdit('tags');
      
      // Status
      const st = data.status || 'draft';
      document.getElementById('dp-status-view').textContent = `${STATUS_ICONS[st]} ${st.charAt(0).toUpperCase() + st.slice(1)}`;
      document.getElementById('dp-status-input').value = st;
      cancelEdit('status');

            // Content (Tiptap)
      if (detailEditor) {
        detailEditor.commands.setContent(data.content || '');
      }
      
      // Fetch Citations and Highlights
      try {
        const [citRes, hlRes] = await Promise.all([
          fetch(`/nodes/${currentNodeId}/citations`),
          fetch(`/nodes/${currentNodeId}/highlights`, { method: 'GET' }).catch(() => ({ ok: false })) // Fallback if no highlights GET route
        ]);
        
        const citations = citRes.ok ? await citRes.json() : (data.citations || []);
        const highlights = (hlRes && hlRes.ok) ? await hlRes.json() : (data.highlights || []);
        
        const citEl = document.getElementById('dp-citations');
        if (!citations || !citations.length) citEl.innerHTML = '<span style="font-size:12px;color:var(--dim)">No citations</span>';
        else citEl.innerHTML = citations.map(c => `<div style="font-size:11px;background:var(--surface);padding:4px;border-radius:4px;"><a href="${c.url||'#'}" target="_blank" style="color:var(--accent)">${c.title||c.url}</a></div>`).join('');
        
        const hlEl = document.getElementById('dp-highlights');
        if (!highlights || !highlights.length) hlEl.innerHTML = '<span style="font-size:12px;color:var(--dim)">No highlights</span>';
        else hlEl.innerHTML = highlights.map(h => `<div style="font-size:11px;background:var(--surface);padding:4px;border-radius:4px;border-left:2px solid var(--accent2)">"${h.text}"<br><span style="color:var(--dim)">${h.comment||''}</span></div>`).join('');
      } catch (e) {
        console.error("Failed to load metadata", e);
      }

      // Connections
      const nodeEdges = graphData.elements.edges.filter(e => e.data.source === data.id || e.data.target === data.id);
      const edEl = document.getElementById('dp-edges');
      if (!nodeEdges.length) {
        edEl.innerHTML = '<p style="font-size:12px;color:var(--dim)">No connections yet.</p>';
      } else {
        edEl.innerHTML = nodeEdges.map(e => {
          const pid = e.data.source === data.id ? e.data.target : e.data.source;
          const pn = (graphData.elements.nodes.find(n => n.data.id === pid) || { data: { name: '#' + pid } }).data.name;
          const dir = e.data.source === data.id ? '→' : '←';
          const pct = Math.round(e.data.similarity * 100);
          return `<div class="edge-card" onclick="openEdgeDetailFromCard('${e.data.id}')" title="Click to edit connection">
        <div class="ec-top"><span class="ec-name">${e.data.name}</span><span class="sim-pill">${pct}%</span></div>
        <p class="ec-desc">${e.data.description}</p>
        <p class="ec-peer">${dir} <span>${pn}</span></p>
      </div>`;
        }).join('');
      }
      openPanel('detail');
    }

    function editField(field) {
      document.getElementById(`dp-${field}-view`).style.display = 'none';
      document.getElementById(`dp-${field}-edit`).classList.remove('hidden');
      document.getElementById(`dp-${field}-input`).focus();
    }

    function openEdgeDetailFromCard(edgeId) {
      const el = cy.getElementById(edgeId);
      if (el && el.length) {
        cy.elements().removeClass('selected active-nb hl faded');
        el.addClass('selected');
        showEdgeDetail(el.data());
      }
    }

    function cancelEdit(field) {
      if (field === 'content' && detailEditor) detailEditor.setEditable(false);
      document.getElementById(`dp-${field}-view`).style.display = '';
      document.getElementById(`dp-${field}-edit`).classList.add('hidden');
    }

    async function saveEdit(field) {
      let value;
      if (field === 'content') {
        value = detailEditor ? detailEditor.getHTML() : '';
      } else if (field === 'tags') {
        value = document.getElementById(`dp-tags-input`).value.split(',').map(s => s.trim()).filter(s => s);
      } else {
        const input = document.getElementById(`dp-${field}-input`);
        value = input.value.trim();
      }
      
      if ((!value || (Array.isArray(value) && value.length === 0)) && field !== 'tags') return;
      if (!currentNodeId) return;
      try {
        const r = await fetch(`/nodes/${currentNodeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value })
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const updated = await r.json();
        
        // Update local data + Cytoscape
        const nd = graphData.elements.nodes.find(n => n.data.id === currentNodeId);
        const cn = cy.getElementById(currentNodeId);
        
        if (nd) nd.data[field] = value; 
        if (cn.length) cn.data(field, value);
        
        if (field === 'name') { 
          if (nd) nd.data.label = value; 
          if (cn.length) cn.data('label', value); 
          document.getElementById('dp-title').textContent = value;
          document.getElementById('dp-name-view').textContent = value;
        } else if (field === 'status' || field === 'tags') {
          const icon = STATUS_ICONS[updated.status || 'draft'];
          const displayLabel = `${icon} ${updated.name}`;
          const displayColor = getTagColor(updated.tags);
          if (nd) { nd.data.displayLabel = displayLabel; nd.data.displayColor = displayColor; }
          if (cn.length) { cn.data('displayLabel', displayLabel); cn.data('displayColor', displayColor); }
          
          if (field === 'tags') {
            const tv = document.getElementById('dp-tags-view');
            tv.innerHTML = updated.tags.length ? updated.tags.map(t => `<span style="background:var(--surface);border:1px solid var(--border);padding:2px 6px;border-radius:4px;font-size:11px;">${t}</span>`).join('') : '—';
          } else if (field === 'status') {
            document.getElementById('dp-status-view').textContent = `${icon} ${updated.status.charAt(0).toUpperCase() + updated.status.slice(1)}`;
          }
        }
        
        cancelEdit(field);
      } catch (e) { alert('Update failed: ' + e.message); }
    }

    function deleteCurrentNode() {
      if (!currentNodeId) return;
      const nd = graphData.elements.nodes.find(n => n.data.id === currentNodeId);
      const name = nd ? nd.data.name : `#${currentNodeId}`;

      document.getElementById('del-node-name').textContent = `"${name}"`;
      document.getElementById('delete-modal').classList.add('open');
    }

    /* ── Edge Add / Edit / Delete ── */
    let currentEdgeId = null;

    function closeAddEdgeModal() {
      document.getElementById('add-edge-modal').classList.remove('open');
      if (connectingNode) connectingNode.removeClass('selected');
      connectingNode = null;
      targetConnectingNode = null;
      document.getElementById('connection-tip').classList.add('hidden');
    }

    async function confirmAddEdge() {
      const name = document.getElementById('add-edge-name').value.trim();
      const desc = document.getElementById('add-edge-description').value.trim();
      if (!name) return;

      const payload = {
        source_id: parseInt(connectingNode.id()),
        target_id: parseInt(targetConnectingNode.id()),
        name: name,
        description: desc
      };
      closeAddEdgeModal();

      try {
        const r = await fetch('/edges/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (r.ok) {
          const edgeData = await r.json();
          const cyEdge = {
            data: {
              id: 'e' + edgeData.id,
              source: String(edgeData.source_id),
              target: String(edgeData.target_id),
              name: edgeData.name,
              description: edgeData.description,
              similarity: edgeData.similarity,
              created_at: edgeData.created_at
            }
          };
          cy.add(cyEdge);
          graphData.elements.edges.push(cyEdge);
          updateStats();
        } else {
          alert('Failed to add connection');
        }
      } catch (err) { console.error(err); }
    }

    function showEdgeDetail(d) {
      openPanel('edge');
      currentEdgeId = parseInt(d.id.replace('e', ''));
      document.getElementById('ep-title').textContent = d.name;
      document.getElementById('ep-name-view').textContent = d.name;
      document.getElementById('ep-desc-view').textContent = d.description || '—';
      cancelEdgeEdit('name');
      cancelEdgeEdit('description');
    }

    function editEdgeField(field) {
      document.getElementById(`ep-${field}-view`).style.display = 'none';
      document.getElementById(`ep-${field}-edit`).classList.remove('hidden');
      document.getElementById(`ep-${field}-input`).value = document.getElementById(`ep-${field}-view`).textContent === '—' ? '' : document.getElementById(`ep-${field}-view`).textContent;
      document.getElementById(`ep-${field}-input`).focus();
    }

    function cancelEdgeEdit(field) {
      document.getElementById(`ep-${field}-view`).style.display = '';
      document.getElementById(`ep-${field}-edit`).classList.add('hidden');
    }

    async function saveEdgeEdit(field) {
      const input = document.getElementById(`ep-${field}-input`);
      const value = input.value.trim();
      if (!value && field === 'name') return;
      if (!currentEdgeId) return;

      const payload = {}; payload[field] = value;
      try {
        const r = await fetch(`/edges/${currentEdgeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const updated = await r.json();

        const ed = graphData.elements.edges.find(e => e.data.id === 'e' + currentEdgeId);
        if (ed) { ed.data[field] = updated[field]; }
        const ce = cy.getElementById('e' + currentEdgeId);
        if (ce.length) { ce.data(field, updated[field]); }

        if (field === 'name') document.getElementById('ep-title').textContent = updated.name;
        document.getElementById(`ep-${field}-view`).textContent = updated[field] || '—';
        cancelEdgeEdit(field);
      } catch (e) { alert('Update failed: ' + e.message); }
    }

    function deleteCurrentEdge() {
      if (!currentEdgeId) return;
      const ed = graphData.elements.edges.find(e => e.data.id === 'e' + currentEdgeId);
      const name = ed ? ed.data.name : `Connection #${currentEdgeId}`;
      document.getElementById('del-edge-name').textContent = `"${name}"`;
      document.getElementById('delete-edge-modal').classList.add('open');
    }

    function closeDeleteEdgeModal() {
      document.getElementById('delete-edge-modal').classList.remove('open');
    }

    async function confirmDeleteEdge() {
      if (!currentEdgeId) return;
      closeDeleteEdgeModal();

      try {
        const r = await fetch(`/edges/${currentEdgeId}`, { method: 'DELETE' });
        if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);

        cy.remove(cy.getElementById('e' + currentEdgeId));
        graphData.elements.edges = graphData.elements.edges.filter(e => e.data.id !== 'e' + currentEdgeId);
        updateStats();
        closeAllPanels();
      } catch (e) { alert('Delete failed: ' + e.message); }
    }

    function closeDeleteModal() {
      document.getElementById('delete-modal').classList.remove('open');
    }

    async function confirmDeleteNode() {
      if (!currentNodeId) return;
      closeDeleteModal();

      try {
        const r = await fetch(`/nodes/${currentNodeId}`, { method: 'DELETE' });
        if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);

        const nd = cy.getElementById(currentNodeId);
        if (nd.length > 0) {
          nd.addClass('dying');
          closeAllPanels();

          const cw = nd.width();
          const ch = nd.height();
          nd.connectedEdges().animate({ style: { opacity: 0 } }, { duration: 250, queue: false });

          nd.animate({
            style: { width: cw * 0.8, height: ch * 0.8, 'border-width': 4 }
          }, {
            duration: 120,
            easing: 'ease-out-cubic',
            queue: true
          }).animate({
            style: {
              width: cw * 1.6,
              height: ch * 1.6,
              'border-width': 40,
              'background-opacity': 0,
              'border-opacity': 0,
              'text-opacity': 0,
              opacity: 0
            }
          }, {
            duration: 200,
            easing: 'ease-out-quint',
            queue: true,
            complete: () => {
              cy.remove(nd);
              graphData.elements.nodes = graphData.elements.nodes.filter(n => n.data.id !== currentNodeId);
              graphData.elements.edges = graphData.elements.edges.filter(e => e.data.source !== currentNodeId && e.data.target !== currentNodeId);
              updateStats();
            }
          });
        } else {
          graphData.elements.nodes = graphData.elements.nodes.filter(n => n.data.id !== currentNodeId);
          graphData.elements.edges = graphData.elements.edges.filter(e => e.data.source !== currentNodeId && e.data.target !== currentNodeId);
          updateStats();
          closeAllPanels();
        }
      } catch (e) { alert('Delete failed: ' + e.message); }
    }

    /* ── Stats ── */
    function updateStats() {
      updateNodeSizes();
      document.getElementById('nc').textContent = (cy ? cy.nodes().length : 0) + ' node';
      document.getElementById('ec').textContent = (cy ? cy.edges().length : 0) + ' edge';
    }

    /* ── Tooltip ── */
    const tip = document.getElementById('tip');
    function showTip(x, y, d) { document.getElementById('tt-n').textContent = d.name; document.getElementById('tt-c').textContent = (d.content || '').slice(0, 80) + ((d.content || '').length > 80 ? '…' : ''); moveTip(x, y); tip.classList.add('v'); }
    function moveTip(x, y) { tip.style.left = (x + 14) + 'px'; tip.style.top = (y + 14) + 'px'; }
    function hideTip() { tip.classList.remove('v'); }

    async function initApp() {
      if (!authToken) {
        const overlay = document.getElementById('auth-overlay');
        overlay.style.display = 'flex';
        // Trigger entrance animation on the card
        const box = document.getElementById('auth-box');
        box.classList.remove('entering');
        void box.offsetWidth; // force reflow
        box.classList.add('entering');
        startAuthCanvas();
        return;
      }
      document.getElementById('auth-overlay').style.display = 'none';
      await init();
    }
    
    window.addEventListener('DOMContentLoaded', initApp);

    async function patchNodeMetadata(updates) {
      if (!currentNodeId) return;
      try {
        const r = await fetch(`/nodes/${currentNodeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        if (!r.ok) throw new Error('Update failed');
        const updated = await r.json();
        
        const nd = cy.getElementById(currentNodeId);
        if (updated.citations !== undefined) nd.data('citations', updated.citations);
        if (updated.highlights !== undefined) nd.data('highlights', updated.highlights);
        
        const gNode = graphData.elements.nodes.find(n => n.data.id === currentNodeId);
        if (gNode) {
          if (updated.citations !== undefined) gNode.data.citations = updated.citations;
          if (updated.highlights !== undefined) gNode.data.highlights = updated.highlights;
        }
        
        if (updates.citations !== undefined || updates.highlights !== undefined) showDetail(nd.data());
      } catch (e) {
        console.error('Patch failed:', e);
      }
    }

    function customPrompt({ title, input1, input2 }, callback) {
      document.getElementById('prompt-title').textContent = title;
      const i1 = document.getElementById('prompt-input-1');
      i1.placeholder = input1 || '';
      i1.value = '';
      i1.style.display = input1 ? 'block' : 'none';
      
      const i2 = document.getElementById('prompt-input-2');
      i2.placeholder = input2 || '';
      i2.value = '';
      i2.style.display = input2 ? 'block' : 'none';
      
      document.getElementById('prompt-modal').classList.add('open');
      if (input1) setTimeout(() => i1.focus(), 100);
      
      document.getElementById('prompt-confirm-btn').onclick = () => {
        const v1 = i1.value.trim();
        const v2 = i2.value.trim();
        if (input1 && !v1) return;
        closePromptModal();
        callback(v1, v2);
      };
    }
    window.closePromptModal = function() {
      document.getElementById('prompt-modal').classList.remove('open');
    };

    let isResizingPanel = false;
    window.startPanelResize = function(e) {
      isResizingPanel = true;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      e.target.classList.add('active');
    };

    document.addEventListener('mousemove', function(e) {
      if (!isResizingPanel) return;
      let newWidth = document.body.clientWidth - e.clientX;
      if (newWidth < 300) newWidth = 300;
      if (newWidth > 1200) newWidth = 1200;
      document.documentElement.style.setProperty('--panel', newWidth + 'px');
      if (cy) cy.resize();
    });

    window.addEventListener('mouseup', function() {
      if (isResizingPanel) {
        isResizingPanel = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = '';
        document.querySelectorAll('.panel-resizer').forEach(el => el.classList.remove('active'));
      }
    });

    window.addSelectionAsHighlight = function() {
      const menu = document.getElementById('selection-menu');
      const text = menu.dataset.text;
      menu.style.opacity = '0';
      menu.style.pointerEvents = 'none';
      if (!text) return;
      
      customPrompt({ title: "Add Margin Note", input1: "Enter note/comment for this highlight..." }, (comment) => {
        const node = graphData.elements.nodes.find(n => n.data.id === currentNodeId);
        const newHighlights = [...(node.data.highlights || []), { text, comment }];
        patchNodeMetadata({ highlights: newHighlights });
      });
    }

    window.addSelectionAsCitation = function() {
      const menu = document.getElementById('selection-menu');
      const text = menu.dataset.text;
      menu.style.opacity = '0';
      menu.style.pointerEvents = 'none';
      if (!text) return;

      customPrompt({ title: "Cite Source", input1: "Enter Source URL (https://...)" }, (url) => {
        const node = graphData.elements.nodes.find(n => n.data.id === currentNodeId);
        const newCitations = [...(node.data.citations || []), { url, title: text, type: 'url' }];
        patchNodeMetadata({ citations: newCitations });
        if (detailEditor) {
          detailEditor.chain().focus().setLink({ href: url }).run();
        }
      });
    }

    window.addManualCitation = function() {
      customPrompt({ title: "Add Citation Manually", input1: "Enter Citation URL", input2: "Enter Citation Title (optional)" }, (url, title) => {
        const node = graphData.elements.nodes.find(n => n.data.id === currentNodeId);
        if(!node) return;
        const newCitations = [...(node.data.citations || []), { url, title: title || url, type: 'url' }];
        patchNodeMetadata({ citations: newCitations });
      });
    };

    window.addManualHighlight = function() {
      customPrompt({ title: "Add Highlight Manually", input1: "Enter Highlighted Text", input2: "Enter Note/Comment" }, (text, comment) => {
        const node = graphData.elements.nodes.find(n => n.data.id === currentNodeId);
        if(!node) return;
        const newHighlights = [...(node.data.highlights || []), { text, comment }];
        patchNodeMetadata({ highlights: newHighlights });
      });
    };

    window.uploadMediaFile = async function(file, view) {
      if (!view) view = detailEditor ? detailEditor.view : null;
      if (!view) return;
      
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const res = await fetch('/nodes/upload', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + authToken },
          body: formData
        });
        if (!res.ok) throw new Error('Upload failed');
        const data = await res.json();
        
        let type = 'image';
        if (file.type.startsWith('video/')) type = 'video';
        else if (file.type.startsWith('audio/')) type = 'audio';
        
        const editor = detailEditor && detailEditor.view === view ? detailEditor : (addEditor && addEditor.view === view ? addEditor : detailEditor);
        if (editor) {
          editor.chain().focus().insertContent({ type: 'media', attrs: { src: data.url, type } }).run();
        }
      } catch (err) {
        console.error('File upload error:', err);
        alert('File upload failed.');
      }
    };

    window.handleMediaUpload = function(files) {
      if (!files || !files.length) return;
      for (let i = 0; i < files.length; i++) {
        window.uploadMediaFile(files[i]);
      }
    };

    // Text selection listener for popup menu
    document.addEventListener('mouseup', (e) => {
      const sel = window.getSelection();
      const menu = document.getElementById('selection-menu');
      if (!menu) return;
      if (!sel || sel.isCollapsed) {
        menu.style.opacity = '0';
        menu.style.pointerEvents = 'none';
        return;
      }
      
      const editBox = document.getElementById('detail-editor-container');
      if (editBox && editBox.contains(sel.anchorNode)) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        menu.style.top = (rect.top + window.scrollY - 40) + 'px';
        menu.style.left = (rect.left + rect.width / 2) + 'px';
        menu.style.opacity = '1';
        menu.style.pointerEvents = 'auto';
        menu.dataset.text = sel.toString();
      } else {
        menu.style.opacity = '0';
        menu.style.pointerEvents = 'none';
      }
    });


    window.clearGraph = async function() {
      if (!confirm("Are you sure you want to delete ALL nodes and edges? This cannot be undone.")) return;
      try {
        const res = await fetch('/nodes/all', { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + authToken } });
        if (res.ok) {
          cy.elements().remove();
          updateCounts();
          closeAllPanels();
        } else {
          alert('Failed to clear graph');
        }
      } catch (err) {
        console.error(err);
        alert('Failed to clear graph');
      }
    };

    window.generateLLMEdge = async function() {
      const btn = document.getElementById('llm-gen-btn');
      const originalText = btn.innerHTML;
      btn.innerHTML = '✨ Generating...';
      btn.disabled = true;

      const sourceNode = cy.getElementById(edgeSource);
      const targetNode = cy.getElementById(edgeTarget);

      try {
        const res = await fetch('/edges/generate-connection', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
          },
          body: JSON.stringify({
            source_id: sourceNode.id(),
            source_name: sourceNode.data('name'),
            source_content: sourceNode.data('content'),
            target_id: targetNode.id(),
            target_name: targetNode.data('name'),
            target_content: targetNode.data('content')
          })
        });

        if (!res.ok) throw new Error('Generation failed');
        const data = await res.json();
        
        document.getElementById('add-edge-name').value = data.name;
        document.getElementById('add-edge-description').value = data.description;
      } catch (err) {
        console.error(err);
        alert('Failed to generate connection using LLM.');
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    };

