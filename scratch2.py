import os

file_path = "static/index.html"
with open(file_path, "r") as f:
    content = f.read()

css_injection = """
    #auth-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(10, 10, 15, 0.95);
      z-index: 99999; display: flex; align-items: center; justify-content: center;
      flex-direction: column;
    }
    .auth-box {
      background: var(--surface); padding: 30px; border-radius: 16px;
      border: 1px solid var(--border); width: 320px;
      display: flex; flex-direction: column; gap: 15px;
    }
    .auth-box h2 { font-size: 20px; font-weight: 600; text-align: center; color: var(--text); }
    .auth-box input { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 10px; border-radius: 8px; outline: none; }
    .auth-box button { background: var(--accent); color: #fff; border: none; padding: 10px; border-radius: 8px; cursor: pointer; font-weight: 500; }
    .auth-box button.secondary { background: transparent; border: 1px solid var(--border); color: var(--text); }
    #auth-error { color: #ff5b5b; font-size: 13px; text-align: center; }
"""
content = content.replace("</style>", css_injection + "\n  </style>")

html_injection = """
  <div id="auth-overlay">
    <div class="auth-box">
      <h2 id="auth-title">Login</h2>
      <input type="text" id="auth-username" placeholder="Username" />
      <input type="password" id="auth-password" placeholder="Password" />
      <div id="auth-error"></div>
      <button id="auth-submit-btn" onclick="submitAuth()">Login</button>
      <button class="secondary" id="auth-toggle-btn" onclick="toggleAuthMode()">Need an account? Register</button>
    </div>
  </div>
"""
content = content.replace("<body>", "<body>\n" + html_injection)

js_injection = """
    let authToken = localStorage.getItem('kg_token') || null;
    let authMode = 'login';

    function toggleAuthMode() {
      authMode = authMode === 'login' ? 'register' : 'login';
      document.getElementById('auth-title').innerText = authMode === 'login' ? 'Login' : 'Register';
      document.getElementById('auth-submit-btn').innerText = authMode === 'login' ? 'Login' : 'Register';
      document.getElementById('auth-toggle-btn').innerText = authMode === 'login' ? 'Need an account? Register' : 'Have an account? Login';
      document.getElementById('auth-error').innerText = '';
    }

    async function submitAuth() {
      const u = document.getElementById('auth-username').value;
      const p = document.getElementById('auth-password').value;
      if (!u || !p) return;
      
      let url = authMode === 'login' ? '/auth/login' : '/auth/register';
      let options = {};
      if (authMode === 'login') {
        const formData = new URLSearchParams();
        formData.append('username', u);
        formData.append('password', p);
        options = { method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: formData };
      } else {
        options = { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: u, password: p}) };
      }

      try {
        const res = await window.originalFetch(url, options);
        if (!res.ok) throw new Error("Invalid credentials or user exists");
        const data = await res.json();
        authToken = data.access_token;
        localStorage.setItem('kg_token', authToken);
        document.getElementById('auth-overlay').style.display = 'none';
        initApp(); // Restart app
      } catch (e) {
        document.getElementById('auth-error').innerText = e.message;
      }
    }

    function logout() {
      authToken = null;
      localStorage.removeItem('kg_token');
      location.reload();
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
      if (response.status === 401 && !resource.startsWith('/auth/')) {
        logout();
      }
      return response;
    };
"""
content = content.replace("<script>", "<script>\n" + js_injection)

# Replace DOMContentLoaded init with our own initApp
content = content.replace("window.addEventListener('DOMContentLoaded', async () => {", "async function initApp() {\n      if (!authToken) { document.getElementById('auth-overlay').style.display = 'flex'; return; }\n      document.getElementById('auth-overlay').style.display = 'none';\n")
content = content.replace("      ws = new WebSocket(WS_URL);", "      ws = new WebSocket(WS_URL + '?token=' + authToken);")
content = content.replace("    });\n  </script>", "    }\n    window.addEventListener('DOMContentLoaded', initApp);\n  </script>")

with open(file_path, "w") as f:
    f.write(content)
