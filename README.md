# Hawaiian Kush storefront

An online menu and checkout for a cannabis store that runs on Sweed. Shoppers browse, fill a bag and check out.
Your Sweed catalog, prices and deals show up live, so you never redeploy to change them.

## Set it up

You need a server with Docker, a domain with HTTPS, and three things from Sweed: the API address, your store id
and an API key. Ask Sweed to allow your shop's address (for example `https://shop.example.com`) on that key.

1. **Get the code.**
   ```sh
   git clone <this repository> storefront && cd storefront
   ```

2. **Add your store details.** Copy the example settings and fill them in. Each line has a note saying what it is.
   ```sh
   cp .env.example .env
   ```
   Set `VITE_SHOP_MODE=live` and `TRUST_PROXY=true`, and put in your Sweed values and your shop's address. Write the address exactly as
   `https://your-domain`, with no slash at the end, or Sweed will refuse it.

3. **Start it.**
   ```sh
   docker compose up -d --build
   ```

4. **Point your domain at it.** Add the block from `deploy/nginx-storefront.conf` to your nginx site and reload
   nginx. It forwards your shop's address to the storefront on port 3000.

5. **Check it.** Open `https://your-domain/healthz/deep`. If it says `"sweed":"ok"`, your store is connected.

## Updating

Pull the new code and start it again. The shop stays up while the new version builds, then switches over in a few
seconds.

```sh
git pull && docker compose up -d --build
```

Changed `.env`? Run the same `docker compose` line.

## If something goes wrong

- **"Origin is not allowed"** means the shop address in `.env` doesn't match what Sweed allowed. Check for a
  trailing slash, `http` instead of `https`, or a path.
- **The page loads with no products.** Open `/healthz/deep`. If it doesn't say `ok`, check your Sweed values.
- **Logs:** `docker compose logs -f`

## Without Docker

A server with Node 22 can run it directly: `npm ci`, `npm run build`, then `npm start`. For a production server,
`scripts/deploy.sh` deploys with zero downtime and rolls back on its own if something fails. The notes at the top of
that script and `deploy/shop.service` explain the setup.

## For developers

`npm run dev` starts a local copy, and `npm test` runs every test against a fake store. Set `VITE_SHOP_MODE=demo` to
try it with sample products and no Sweed account. `STRUCTURE_MAP.md` explains the folders.
