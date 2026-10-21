// Simula familiares se movendo em Franca-SP para demos/screenshots.
// Uso: node test/simulate.js [http://localhost:3000]
const base = process.argv[2] ?? 'http://localhost:3000';
const center = { lat: -20.5386, lng: -47.4009 };

const people = [
  { name: 'Maria', emoji: '👩', color: '#ec4899', r: 0.012, period: 240, speedKmh: 34, battery: 0.82 },
  { name: 'Pedro', emoji: '🧒', color: '#06b6d4', r: 0.006, period: 400, speedKmh: 0, battery: 0.45 },
  { name: 'Vovó Lúcia', emoji: '👵', color: '#f59e0b', r: 0.003, period: 900, speedKmh: 4, battery: 0.19 },
];

const api = async (who, method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(who && { 'x-device-id': who.id, 'x-device-secret': who.secret }) },
    body: body && JSON.stringify(body),
  });
  return res.status === 204 ? null : res.json();
};

const sims = [];
for (const p of people) {
  const d = await api(null, 'POST', '/api/register', { name: p.name, emoji: p.emoji, color: p.color });
  sims.push({ ...p, ...d });
  console.log(`${p.emoji} ${p.name.padEnd(12)} código: ${d.code}`);
}

const t0 = Date.now();
const tick = () => {
  const t = (Date.now() - t0) / 1000;
  for (const [i, s] of sims.entries()) {
    const a = (t / s.period) * Math.PI * 2 + i * 2;
    const lat = center.lat + s.r * Math.sin(a) + (i === 1 ? 0.004 : 0);
    const lng = center.lng + s.r * 1.1 * Math.cos(a) + (i === 1 ? -0.006 : 0);
    const heading = ((Math.atan2(Math.cos(a), -Math.sin(a)) * 180) / Math.PI + 360) % 360;
    api(s, 'POST', '/api/location', {
      lat, lng, acc: 6 + i * 4, speed: s.speedKmh / 3.6, heading, alt: 1020 + i * 3,
      battery: Math.max(0.05, s.battery - t / 20000), charging: i === 1,
    }).catch(() => {});
  }
};
tick();
setInterval(tick, 2000);
console.log('Simulando… (Ctrl+C para sair)');
