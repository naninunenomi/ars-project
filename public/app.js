// ARS Portal Logic

document.addEventListener('DOMContentLoaded', () => {
    const navBtns = document.querySelectorAll('.nav-btn');
    const panels = document.querySelectorAll('.panel');
    const refreshBtn = document.getElementById('refresh-btn');
    const sysStatus = document.getElementById('sys-status');
    const modal = document.getElementById('manual-modal');
    const modalClose = document.getElementById('modal-close');

    // Navigation
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            panels.forEach(p => p.classList.add('hidden'));
            p.classList.remove('active');
            
            btn.classList.add('active');
            const target = document.getElementById(btn.dataset.target);
            target.classList.remove('hidden');
            target.classList.add('active');
        });
    });

    // Modal Close
    modalClose.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Data Fetching
    const fetchData = async () => {
        sysStatus.textContent = "SYS: FETCHING...";
        sysStatus.className = "system-status";
        
        try {
            // Fetch Status
            const statusRes = await fetch('/api/portal/status.js');
            const statusData = await statusRes.json();
            
            document.getElementById('stat-manuals').textContent = statusData.stats.totalManuals;
            document.getElementById('stat-checklists').textContent = statusData.stats.totalChecklists;
            document.getElementById('stat-studying').textContent = statusData.stats.studyingCount;
            document.getElementById('stat-savings').textContent = "¥" + statusData.stats.estimatedSavings.toLocaleString();

            // Render Queue
            const queueList = document.getElementById('queue-list');
            queueList.innerHTML = '';
            if (statusData.queue.length === 0) {
                queueList.innerHTML = '<div class="queue-item">NO PENDING TASKS</div>';
            } else {
                statusData.queue.forEach(item => {
                    queueList.innerHTML += `
                        <div class="queue-item">
                            <span class="theme-title">${item.theme}</span>
                            <span style="float:right">Score: ${item.score}</span>
                        </div>
                    `;
                });
            }

            // Fetch Library
            const libRes = await fetch('/api/portal/library.js');
            const libData = await libRes.json();
            
            const vaultList = document.getElementById('vault-list');
            vaultList.innerHTML = '';
            
            if (libData.library.length === 0) {
                vaultList.innerHTML = '<div class="vault-item">VAULT IS EMPTY</div>';
            } else {
                libData.library.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'vault-item';
                    div.innerHTML = `
                        <div class="vault-header">
                            <span class="theme-title">${item.theme}</span>
                            <button class="action-btn read-btn" data-theme="${item.theme}">[READ_FULL_MANUAL]</button>
                        </div>
                        <div class="checklist-preview">> CHECKLIST:\n${item.checklist}</div>
                    `;
                    vaultList.appendChild(div);
                });

                // Attach event listeners to read buttons
                document.querySelectorAll('.read-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const theme = e.target.dataset.theme;
                        document.getElementById('modal-title').textContent = theme;
                        document.getElementById('modal-body').textContent = "Loading supreme manual from vault...";
                        modal.classList.remove('hidden');
                        
                        try {
                            const res = await fetch(`/api/portal/library.js?theme=${encodeURIComponent(theme)}`);
                            const data = await res.json();
                            document.getElementById('modal-body').textContent = data.manual || "ERROR: MANUAL NOT FOUND";
                        } catch (err) {
                            document.getElementById('modal-body').textContent = "FETCH ERROR: " + err.message;
                        }
                    });
                });
            }

            sysStatus.textContent = "SYS: ONLINE";
            sysStatus.className = "system-status online";
        } catch (e) {
            console.error(e);
            sysStatus.textContent = "SYS: ERROR";
            alert("Failed to fetch data from ARS Fortress.");
        }
    };

    // Simulator Logic
    document.getElementById('sim-submit').addEventListener('click', async () => {
        const theme = document.getElementById('sim-theme').value;
        const text = document.getElementById('sim-text').value;
        const output = document.getElementById('sim-output');
        
        if (!theme || !text) {
            output.textContent = "ERROR: Missing THEME or TARGET_TEXT.";
            return;
        }

        output.textContent = "> EXECUTING VALUATION...\n> AWAITING GATEKEEPER RESPONSE...";
        
        try {
            const res = await fetch('/api/check.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme, text })
            });
            const data = await res.json();
            output.textContent = JSON.stringify(data, null, 2);
        } catch (e) {
            output.textContent = "ERROR: " + e.message;
        }
    });

    // Initial load
    refreshBtn.addEventListener('click', fetchData);
    fetchData(); // Fetch on boot
});
