const $ = id => document.getElementById(id);
let initialized = false;
let busy = false;
let lastSnapshot = null;
const labels = { connected: 'Đã kết nối TikTok', connecting: 'Đang kết nối…', idle: 'Chưa kết nối', disconnected: 'Mất kết nối', offline: 'Kênh chưa live / đã kết thúc', error: 'Lỗi kết nối' };
function notice(message, error = false) {
  $('feedback').textContent = message;
  $('feedback').className = error ? 'error' : '';
}
function syncForm(data) {
  $('playerCount').value = data.settings.simulatedPlayers;
  $('countLabel').value = data.settings.simulatedPlayers;
  $('intensity').value = data.settings.intensity;
  $('muted').checked = data.settings.muted;
  $('music').checked = data.settings.music;
}
function render(data) {
  lastSnapshot = data;
  $('viewers').textContent = data.viewers;
  $('clients').textContent = data.clients;
  $('bots').textContent = data.settings.simulatedPlayers;
  $('status').textContent = labels[data.status.state] || data.status.state;
  $('status').className = `badge ${data.status.state}`;
  $('statusDetail').textContent = [data.username ? `@${data.username}` : '', data.status.detail || ''].filter(Boolean).join(' · ');
  $('lastEvent').textContent = data.lastEventAt ? `Tương tác gần nhất: ${new Date(data.lastEventAt).toLocaleTimeString('vi-VN')}` : 'Chưa nhận tương tác thật.';
  const names = { join: 'Vào phòng', like: 'Gói tim', chat: 'Bình luận', gift: 'Gói quà', follow: 'Follow', share: 'Chia sẻ', envelope: 'Rương' };
  $('events').textContent = Object.entries(data.events).map(([key, value]) => `${names[key] || key}: ${value}`).join(' · ') || '—';
  if (!initialized) {
    $('username').value = data.username || '';
    syncForm(data);
    initialized = true;
  }
}
async function command(body) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button, input, select').forEach(b => b.disabled = true);
  try {
    const response = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Không thể áp dụng');
    render(data);
    syncForm(data);
    notice(body.action === 'connect' ? 'Đã gửi yêu cầu kết nối. Theo dõi trạng thái bên trên.' : 'Đã áp dụng.');
  } catch (err) {
    notice(err.message, true);
    if (lastSnapshot) syncForm(lastSnapshot);
  } finally {
    busy = false;
    document.querySelectorAll('button, input, select').forEach(b => b.disabled = false);
  }
}
$('channelForm').onsubmit = e => { e.preventDefault(); command({ action: 'connect', username: $('username').value }); };
$('disconnect').onclick = () => command({ action: 'disconnect' });
$('playerCount').oninput = () => $('countLabel').value = $('playerCount').value;
$('simulationForm').onsubmit = e => { e.preventDefault(); command({ action: 'settings', settings: { simulatedPlayers: +$('playerCount').value, intensity: +$('intensity').value } }); };
$('stopBots').onclick = () => command({ action: 'settings', settings: { simulatedPlayers: 0 } });
for (const id of ['muted', 'music']) $(id).onchange = () => command({ action: 'settings', settings: { [id]: $(id).checked } });
async function poll() {
  try {
    if (!busy) {
      const response = await fetch('/api/control', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Không đọc được trạng thái bridge');
      render(await response.json());
    }
  } catch { notice('Không liên lạc được bridge. Kiểm tra npm run bridge đang chạy.', true); }
  setTimeout(poll, 1500);
}
poll();
