# RADICAL · red social privada para tu gimnasio

PWA oscura (negro + naranja) inspirada en la estructura de una red social moderna: historias, feed, perfiles, mensajes, retos semanales,
rankings, rachas, puntos, temporadas, insignias y panel de administración. Pensada para ~200 miembros.

**Stack:** Node.js 22+ · Express · SQLite (un solo archivo) · JavaScript vanilla (sin build) · Service Worker + manifest (instalable).

---
## 1. Probarla en tu computador
```bash
npm install
RADICAL_DEMO=1 npm start        # http://localhost:3000  (carga datos de ejemplo la primera vez)
```
Cuentas demo (contraseña `radical123`): `andersson@radical.test` (dueño) · `maria@radical.test` (admin) · `gabriel@radical.test` (coach) · `diego@radical.test`, `carlos@…`, `laura@…`, `mateo@…` (miembros) · `sofia@…` (pendiente de aprobar).
Para empezar de cero: borra la carpeta `data/` y arranca **sin** `RADICAL_DEMO`.

## 2. Publicarla en Hostinger
Hostinger ofrece **Node.js Web Apps** en los planes *Business Web Hosting* y *Cloud* (no en Single/Premium). Elige Node **22.x o 24.x**.

1. **Carpeta de datos (importante).** En *Administrador de archivos*, dentro de tu carpeta personal (`/home/u123456789/`), crea `radical-data` y dentro `uploads`.
   Hostinger reemplaza los archivos de la app en cada despliegue; la base de datos y las fotos/videos **deben** vivir fuera de ella.
2. **Sube la app.** hPanel → *Sitios web* → *Añadir sitio web* → **Node.js Apps** → *Subir archivos* → sube `radical-hostinger.zip`
   (sin `node_modules`; Hostinger instala las dependencias solo). Archivo de entrada (*Entry file*): **`server.js`**.
3. **Variables de entorno** (panel de despliegue → *Environment variables*), como en `.env.example`:
   `NODE_ENV=production`, `DATA_DIR=/home/u123456789/radical-data`, `UPLOADS_DIR=/home/u123456789/radical-data/uploads`
   y, solo si quieres ver la demo primero, `RADICAL_DEMO=1`.
4. **Despliega**, abre tu dominio (HTTPS) y **registra tu cuenta: el primer registro de una instalación vacía es el dueño**.
   (Regístrate tú antes de compartir el enlace.) Después los demás se registran y quedan *pendientes* hasta que los apruebes en Administración → Usuarios.
5. **Instálala como app:** iPhone → Safari → Compartir → *Añadir a pantalla de inicio* · Android → Chrome → *Instalar app* · Escritorio → icono de instalar en la barra de Chrome/Edge.

Para pasar de demo a producción: borra `radical-data`, quita `RADICAL_DEMO` y vuelve a desplegar.

### Opcionales
* **Código de invitación** (Administración → Puntos): solo quien lo tenga puede solicitar cuenta.
* **Recuperar contraseña por correo:** crea una cuenta de correo en Hostinger y define `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS`. Sin SMTP, el administrador genera el enlace desde Administración → Usuarios → Editar.
* **Copias de seguridad:** descarga `radical-data` (contiene `radical.db*` y `uploads/`) de vez en cuando.

## 3. Cómo se usa (resumen)
* **Miembros:** publican fotos/videos, historias (24 h), likes, comentarios, guardados, seguir, mensajes (con post/reto/perfil compartido), registran entrenamientos y PRs, participan en retos y suben video de evidencia.
* **Entrenador:** valida los PRs de sus alumnos. **Admin/Dueño:** aprueban usuarios y resultados, crean retos, temporadas, anuncios/promociones/eventos, configuran puntos, insignias y moderan reportes.
* **Puntos RADICAL** (configurables): asistencia, entrenamiento, PR validado, participar/completar/ganar reto, evento. **Nunca** por likes, seguidores o publicaciones.
* **Temporadas** (4–16 semanas, recomendado 8–12): al cerrar se guardan resultados y premios, el ranking vuelve a cero y se conservan insignias y trofeos.

## 4. Estructura
```
server.js          entrada (Hostinger)         server/    API (auth, social, train, game, admin, seed, init)
public/            PWA: index.html, css/, js/, sw.js, manifest.webmanifest, icons/, fonts/
```

## Tienda (prendas con pedido o reserva)

- Los miembros entran por el icono de bolsa en la barra superior (o "Tienda" en el menú lateral), eligen **modelo** (cada foto es un modelo/color) y **talla**, y envían el pedido o la reserva.
- El pedido llega **como mensaje dentro de la app** a quien definas (por defecto el dueño), con la miniatura del modelo, talla y cantidad. Además aparece en **Administración → Tienda** con estados: Nuevo → Confirmado → Entregado (o Cancelado); el miembro recibe una notificación en cada cambio.
- **WhatsApp (opcional):** en Administración → Tienda → Ajustes escribe el número con código de país (solo dígitos, ej. `593991234567`). Al terminar el pedido, el miembro verá un botón "Enviar también por WhatsApp" con el mensaje ya redactado (prenda, modelo, talla, cantidad, nombre y contacto). Si lo dejas vacío, el botón no aparece.
- Publicar prendas: Administración → Tienda → Prendas → Nueva prenda (nombre, precio, tallas, tipo Pedido/Reserva y varias fotos con el nombre de cada modelo).
- El logo está en `public/img/` (versión horizontal, apilada y solo símbolo, ya en blanco para fondo oscuro) y los iconos de instalación en `public/icons/`.

**Stock:** al crear/editar una prenda puedes poner las unidades disponibles y el límite de "stock bajo". El contador se ve verde por encima del límite y rojo cuando quedan pocas o se agota (no se puede pedir). Cada pedido descuenta unidades y cancelarlo las devuelve; los administradores reciben un aviso cuando una prenda baja del límite. Con el stock vacío, la prenda no tiene control de inventario. En Administración → Tienda → Prendas puedes subir o bajar el stock con los botones − / +.

## Estados de pedido, pago y rutinas

- **Estados del pedido** (Administración → Tienda → Pedidos → "Cambiar estado"): Nuevo → Confirmado → En preparación → **Listo para recoger** → Entregado (o Cancelado). Puedes añadir un mensaje (ej. "Retíralo en recepción de 8 a 20 h"). El miembro recibe una notificación en cada cambio; con "Listo para recoger" además le llega un mensaje en la app que dice "¡Ya puedes recoger tu prenda!". En "Mis pedidos" ve una línea de progreso (Pedido, Pago, Preparando, Listo, Entregado).
- **Pago:** el miembro sube la foto del comprobante desde su pedido (después de pedir o desde "Mis pedidos"). Ve los datos de pago que escribas en Tienda → Ajustes → "Datos de pago". El admin o dueño revisa la foto y pulsa **Confirmar pago** (el pedido pasa a Confirmado) o **Rechazar** con un motivo (el miembro puede subir otro).
- **Rutinas sugeridas** (menú "Rutinas" en escritorio y tarjeta en Inicio): el miembro filtra por objetivo, nivel y días por semana, abre una rutina con sus días, ejercicios, series, repeticiones y descansos, y puede "Seguir esta rutina": en Inicio verá qué le toca hoy. "Registrar este entrenamiento" abre su registro con los ejercicios ya cargados (solo agrega el peso) y, al guardar, pasa al siguiente día. Coaches, administradores y el dueño crean y editan rutinas con el botón "Nueva".
