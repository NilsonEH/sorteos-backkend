# Backend de Suscripción y Sorteos

Este backend conecta la landing de suscripción y el panel de sorteos a una
base de datos real, y procesa pagos con Culqi.

## 1. Instalar y correr

```bash
cd sorteos-backend
npm install
cp .env.example .env   # y pon tus llaves reales de Culqi
npm start
```

Esto levanta el servidor en `http://localhost:3001` y crea automáticamente
el archivo `sorteos.db` (SQLite) con las tablas necesarias.

## 2. Endpoints principales

| Método | Ruta                     | Uso                                                        |
|--------|--------------------------|-------------------------------------------------------------|
| POST   | `/api/payments/checkout` | La landing lo llama tras generar el token de pago de Culqi  |
| POST   | `/api/payments/webhook`  | Culqi lo llama para avisar reembolsos/eventos               |
| GET    | `/api/subscribers`       | El panel lo usa para listar suscriptores activos            |
| DELETE | `/api/subscribers/:id`   | Da de baja a un suscriptor                                  |
| POST   | `/api/raffles/draw`      | El panel lo usa para sortear un premio                      |
| GET    | `/api/raffles`           | Historial de sorteos y ganadores                             |

## 3. Conectar la landing page

En `landing-suscripcion.html`, el formulario hoy solo guarda en
`localStorage`. Para cobrar de verdad:

1. Agrega el script de Culqi Checkout (`https://checkout.culqi.com/js/v4`) y
   tu `PUBLIC_KEY` en el frontend.
2. Cuando Culqi genere el token de la tarjeta, envíalo junto con
   nombre/correo/plan a `POST /api/payments/checkout` en vez de guardarlo
   localmente.
3. Muestra la pantalla de éxito solo si la respuesta es `201`.

La documentación de Culqi Checkout está en https://docs.culqi.com/.

## 4. Conectar el panel de sorteos

En `panel-sorteos.html`, reemplaza las funciones que leen/escriben en
`localStorage` por llamadas `fetch` a:
- `GET /api/subscribers` para listar
- `POST /api/raffles/draw` con `{ prize }` para sortear
- `GET /api/raffles` para el historial

Así el panel y la landing comparten los mismos datos reales, sin importar
desde qué dispositivo o navegador se usen.

## 5. Cómo funciona el sorteo

Cada suscriptor tiene un número de "tickets" según su plan (1 para
mensual, 3 para anual). El sorteo arma una lista donde cada suscriptor
aparece tantas veces como tickets tenga, y elige un ganador al azar de
esa lista — así el plan anual tiene más probabilidad de ganar, tal como
se promete en la landing.

## 6. Antes de producción

- Cambia SQLite por Postgres o MySQL si esperas mucho tráfico.
- Verifica la firma del webhook de Culqi antes de confiar en su contenido.
- Agrega autenticación al panel de sorteos (hoy cualquiera con el enlace
  puede sortear).
- Revisa la normativa local sobre sorteos con premios (bases legales,
  a veces requieren registro ante la autoridad correspondiente).
