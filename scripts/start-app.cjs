// Desktop-only launcher. No Expo/app dependency or user database is modified.
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const expoRequire = createRequire(require.resolve('expo/package.json'));
const cliPackage = expoRequire.resolve('@expo/cli/package.json');
const { printQRCode } = require(path.join(path.dirname(cliPackage), 'build/src/utils/qr.js'));
const { getFreePortAsync } = require(path.join(path.dirname(cliPackage), 'build/src/utils/port.js'));

function lanAddress() {
  const addresses = Object.entries(os.networkInterfaces()).flatMap(([name, entries]) =>
    (entries ?? []).filter(item => item.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.'))
      .map(item => ({ name, address: item.address })));
  const physical = addresses.filter(item => !/clash|tun|tap|vpn|tailscale|zerotier|virtual|vmware|vethernet|docker|loopback/i.test(item.name));
  const candidates = physical.length ? physical : addresses;
  const selected = candidates.find(item => /wi-?fi|wlan|无线/i.test(item.name)) ?? candidates[0];
  if (!selected) throw new Error('没有找到局域网地址。请先连接 Wi-Fi 或有线网络。');
  return selected.address;
}
async function runningProject(port, address) {
  try {
    const response = await fetch('http://127.0.0.1:' + port, {
      headers: { 'expo-platform': 'ios', accept: 'application/expo+json', host: address + ':' + port },
      signal: AbortSignal.timeout(1800),
    });
    if (!response.ok) return false;
    const manifest = await response.json();
    const root = manifest.extra?.expoGo?.developer?.projectRoot ?? manifest.extra?.expoClient?._internal?.projectRoot;
    return typeof root === 'string' && path.resolve(root).toLowerCase() === projectRoot.toLowerCase();
  } catch { return false; }
}
async function main() {
  const address = lanAddress();
  const requested = process.argv.find(arg => arg.startsWith('--port='));
  const firstPort = requested ? Number(requested.slice(7)) : 8081;
  if (!Number.isInteger(firstPort) || firstPort < 1024 || firstPort > 65525) throw new Error('无效的启动端口。');
  let existingPort;
  for (let port = firstPort; port < firstPort + 10; port++) {
    if (await runningProject(port, address)) { existingPort = port; break; }
  }
  // Use Expo's IPv4/IPv6/localhost checks instead of an IPv4-only probe.
  const port = existingPort ?? await getFreePortAsync(firstPort);
  const url = 'exp://' + address + ':' + port;
  if (process.argv.includes('--check')) {
    console.log(JSON.stringify({ node: process.version, projectRoot, mode: existingPort ? 'reuse' : 'start', port, url }, null, 2));
    return;
  }
  console.log('\n法语背单词 · 手机扫码启动\n');
  console.log('1. iPhone 与电脑连接同一个 Wi-Fi。');
  console.log('2. iPhone 打开相机扫描下方二维码，选择用 Expo Go 打开。');
  console.log('3. 学习时保持电脑开机，并保留运行 Expo 的窗口。\n');
  if (existingPort) {
    console.log('项目已在运行，正在复用现有服务：\n');
    printQRCode(url).print();
    console.log(url);
    console.log('\n当前窗口只展示二维码；请保留原来运行 Expo 的窗口。');
    return;
  }
  console.log('正在自动选择空闲端口，请等待二维码出现，无需输入 y……\n');
  // Port 0 selects again at startup without asking, even if the checked port
  // was taken by another process in the meantime.
  const child = spawn(process.execPath, [path.join(projectRoot, 'node_modules/expo/bin/cli'), 'start', '--go', '--lan', '--port', '0'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: address, RCT_METRO_PORT: String(firstPort) },
  });
  child.once('error', error => { console.error('启动失败：' + error.message); process.exitCode = 1; });
  child.once('exit', code => { process.exitCode = code ?? 0; });
  // Ctrl+C is delivered to both processes in a Windows console; let Expo close.
  process.on('SIGINT', () => {});
}
main().catch(error => { console.error('\n启动失败：' + error.message); process.exitCode = 1; });
