# Zarafshon ZR·42

Scroll-driven 3D landing page for a fictional watch brand. The watch is modelled in code with Three.js; motion runs on GSAP ScrollTrigger and Lenis.

Static site — open `index.html` or serve the folder. Deployed with GitHub Pages.

## Orders

The "Reserve" form posts to a small Node service in `server/` (no dependencies), deployed on Railway as `zarafshon-orders` inside the `dzyn-site` project:
https://zarafshon-orders-production.up.railway.app

It validates the name and phone, blocks spam (honeypot, 5 requests per IP per 10 min, origin allow-list) and forwards each order to Telegram.

Railway variables:

- `TELEGRAM_BOT_TOKEN` — token from @BotFather
- `TELEGRAM_CHAT_ID` — chat to receive orders (comma-separated for several)
- `ALLOWED_ORIGINS` — optional, defaults to `https://pulat-star.github.io`

Deploy the service: `cd server && railway up --service zarafshon-orders`. Tests: `cd server && npm test`.
