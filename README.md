# Hawaiian Kush storefront

An online menu and checkout for a cannabis store that runs on Sweed. Your catalog, prices and deals come from Sweed
live, so changing them never needs a redeploy.

## Before you start

Have these ready. Setup takes about 20 minutes.

- **A server** running Ubuntu 22.04 or 24.04, with at least 1 GB of memory, and a login that can use `sudo`.
- **A domain or subdomain** for the shop, like `shop.yourstore.com`.
- **From Sweed:** the API address, your store id and your API key. Ask Sweed to allow your shop's address, for example
  `https://shop.yourstore.com`, on that key. The shop can't load products until they do.

In the commands below, replace `shop.yourstore.com` with your own domain every time.

## Deploy in 5 steps

### 1. Prepare the server

At your domain provider, add an **A record** that points `shop.yourstore.com` to your server's IP address. Then log in
to the server and install everything the shop needs:

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo apt-get install -y git nginx certbot python3-certbot-nginx
```

**Check:** `getent hosts shop.yourstore.com` prints your server's IP. A new record can take up to an hour to show up.
Wait until it does before step 5.

### 2. Get the code

```sh
git clone https://github.com/IalvaroI/hawaiiankush.git storefront
cd storefront
cp .env.example .env
```

**Check:** `ls .env` prints `.env`.

### 3. Fill in your settings

Open the settings file:

```sh
nano .env
```

Change these 8 lines and leave everything else as it is:

| Line | Set it to |
|---|---|
| `API_BASE_URL=` | The API address from Sweed |
| `STORE_ID=` | Your store id from Sweed |
| `ECOM_API_KEY=` | Your API key from Sweed |
| `API_ORIGIN=` | `https://shop.yourstore.com` |
| `PUBLIC_ORIGIN=` | `https://shop.yourstore.com` |
| `VITE_SHOP_MODE=` | `live` |
| `VITE_STORE_TIME_ZONE=` | Your store's time zone, like `America/Los_Angeles` (blank means Hawaii) |
| `TRUST_PROXY=` | `true` |

Save with `Ctrl+O`, then `Enter`, and exit with `Ctrl+X`.

Get the two addresses exactly right: `https`, your domain, and **nothing after it**. No slash at the end and no
spaces. Sweed refuses the key if they are off by even one character.

### 4. Start the shop

```sh
sudo docker compose up -d --build
```

The first build takes a few minutes. When it finishes, check that the shop is talking to Sweed:

```sh
curl -s http://127.0.0.1:3000/healthz/deep
```

**Check:** it prints `{"ok":true,"sweed":"ok"}`. If it says `unavailable`, see "If something goes wrong" below before
going on.

### 5. Put it on your domain with HTTPS

Copy in the web server settings, put your domain in them, and turn them on:

```sh
sudo cp deploy/nginx-storefront.conf /etc/nginx/sites-available/storefront
sudo sed -i 's/YOUR_DOMAIN/shop.yourstore.com/' /etc/nginx/sites-available/storefront
sudo ln -sf /etc/nginx/sites-available/storefront /etc/nginx/sites-enabled/storefront
sudo nginx -t && sudo systemctl reload nginx
```

Then get the free HTTPS certificate. Use your own email, so you hear about it before it expires:

```sh
sudo certbot --nginx -d shop.yourstore.com --redirect --agree-tos -m you@yourstore.com
```

**Check:** open `https://shop.yourstore.com` in a browser. The age check appears, and then your products do.

You're live.

## Updating to a new version

```sh
cd storefront
git pull
sudo docker compose up -d --build
```

The shop stays up while the new version builds, then switches over in a few seconds. Run the last line again any time
you change `.env`.

## If something goes wrong

| What you see | What to do |
|---|---|
| `"sweed":"unavailable"` in step 4 | Check `API_BASE_URL`, `STORE_ID` and `ECOM_API_KEY` in `.env` for typos, then run step 4 again. |
| "Origin is not allowed" in the logs | `API_ORIGIN` doesn't match what Sweed allowed on your key. Check for a trailing slash, `http` instead of `https`, or a typo, or ask Sweed to add it. |
| `nginx -t` fails | Something else already uses your domain. Look in `/etc/nginx/sites-enabled/` for another file with the same `server_name`. |
| certbot fails | Your domain doesn't point at this server yet, or ports 80 and 443 are closed. Recheck step 1 and your provider's firewall. |
| The site shows "502 Bad Gateway" | The shop isn't running. Run `sudo docker compose up -d` in the `storefront` folder. |
| Anything else | Read the logs: `sudo docker compose logs --tail 50` |

Never paste your API key into a chat, an email or a support ticket.

## Other ways to run it

- **Without Docker:** with Node 22 installed, run `npm ci`, `npm run build` and `npm start`. `scripts/deploy.sh` does
  zero-downtime deploys with automatic rollback on a server; the notes at the top of it and `deploy/shop.service`
  cover its setup.
- **To try it with sample products:** leave `VITE_SHOP_MODE=demo` in `.env`. No Sweed account is needed.
- **For developers:** `npm run dev` starts a local copy and `npm test` runs every test against a fake store.
  `STRUCTURE_MAP.md` explains the folders.
