// Arma deploy/vales-app.zip para subir a cPanel: API compilada + web + package.json + app.js.
// Uso (desde la carpeta backend):  npm run paquete
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const salida = path.join(raiz, 'deploy', 'vales-app');
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });

run('npm run build', path.join(raiz, 'frontend'));
run('npm run build', path.join(raiz, 'backend'));

fs.rmSync(salida, { recursive: true, force: true });
fs.mkdirSync(salida, { recursive: true });
fs.cpSync(path.join(raiz, 'backend', 'dist'), path.join(salida, 'dist'), { recursive: true });
fs.cpSync(path.join(raiz, 'frontend', 'dist'), path.join(salida, 'web'), { recursive: true });
for (const f of ['package.json', 'package-lock.json', 'app.js', 'cpanel.env.example']) {
  fs.copyFileSync(path.join(raiz, 'backend', f), path.join(salida, f));
}
// Los .map y el build incremental no hacen falta en el servidor
const limpiar = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) limpiar(p);
    else if (/\.(map|tsbuildinfo)$/.test(e.name)) fs.rmSync(p);
  }
};
limpiar(salida);

const zip = path.join(raiz, 'deploy', 'vales-app.zip');
fs.rmSync(zip, { force: true });
try {
  // Windows 10+ trae bsdtar, que arma .zip con -a
  run(`tar -a -c -f "${zip}" -C "${salida}" .`, raiz);
  console.log(`\nListo: ${zip}`);
} catch {
  console.log(`\nNo se pudo comprimir automáticamente. Comprimí la carpeta ${salida} en un .zip.`);
}
