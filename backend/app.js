// Punto de entrada para cPanel (Application Manager / Passenger).
// Passenger toma la conexión HTTP; la app se configura con el archivo .env de esta carpeta.
require('./dist/main').bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
