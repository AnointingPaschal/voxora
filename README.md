# Voxora AI

Voxora AI is a responsive AI voice studio focused on Nigerian English styles. The deployment target is **Cloudflare Pages + Pages Functions + Workers KV**. Pages serves the React/Vite build; the Functions API stores administrator data, model and voice configuration, website content, encrypted provider credentials, rate-limit state, and sanitized generation logs in the `VOXORA_KV` namespace. API keys are encrypted with AES-256-GCM before they are written to KV and are only returned as masked metadata.

Audio history remains in browser IndexedDB on the current device. Reference voice cloning remains disabled until a selected model’s endpoint capability has been verified. The speech endpoint used here accepts `input`, optional `instructions`, optional `voice`, and a format, and returns raw audio bytes. Voxora uses style prompts rather than inventing provider voice IDs.

## Cloudflare Pages deployment

1. In Cloudflare Dashboard, open **Workers & Pages → KV**, create one production namespace and one preview namespace. From a supported desktop/CI host, Wrangler can create them with `npx wrangler kv namespace create VOXORA_KV` and `npx wrangler kv namespace create VOXORA_KV_PREVIEW`.
2. Create a Pages project connected to this repository. Set the build command to `npm run build` and build output directory to `dist`.
3. In **Workers & Pages → your Pages project → Settings → Bindings**, bind the production namespace as `VOXORA_KV`. Bind the preview namespace with the same binding name in the preview environment. Redeploy after adding bindings.
4. Add these as **Pages secrets**, in both environments as appropriate. Generate the values locally; do not paste them in frontend variables:

   ```sh
   openssl rand -hex 32
   openssl rand -base64 32
   ```

   - `ADMIN_SETUP_SECRET`: at least 24 random characters; required for first-run admin setup.
   - `SESSION_SECRET`: at least 32 random characters; required to create and validate admin sessions.
   - `SECRET_ENCRYPTION_KEY`: base64 encoding of exactly 32 random bytes; used for API-key encryption at rest.
   - `APP_ORIGIN`: the exact HTTPS origin for the Pages site (a regular Pages variable, not a secret).

   To add a secret with Wrangler, run `npx wrangler pages secret put SECRET_NAME --project-name voxora-ai` and enter the value at the prompt. Never use a `VITE_` variable for a secret.
5. Open the Pages URL and visit `/admin/setup`. Create the initial administrator using the configured setup secret. Setup is disabled once the account has been created.
6. Visit `/admin/api-keys` and save an OpenRouter key. It is encrypted before storage; reads return only a masked value. Then visit `/admin/models`, discover models from the speech modality catalog, enable the intended model, and set it as default.
7. Make a short test generation from `/studio`. A real provider key and available model are required; errors are reported instead of showing fabricated audio.

The application requires a KV namespace binding named exactly `VOXORA_KV`. The included `wrangler.toml` configures the Pages output and compatibility date; create and bind the namespace through the Cloudflare dashboard so production and preview use separate KV namespaces.

## Termux development

Run `npm install`, copy `.env.example` to `.env`, and then use `npm run dev`. This keeps the existing Express/SQLite development backend available on Termux while the Pages Functions API is typechecked and deployed with the site. Set up the local encryption/session secrets in `.env` to use the local administrator/provider flow. The deployed Pages version does not use SQLite; it uses KV.

Cloudflare’s local Pages runtime relies on `workerd`, which currently has no Android ARM64 Termux binary. Wrangler is intentionally not a project dependency so a fresh Termux `npm install` does not attempt that unsupported native runtime. Therefore `wrangler pages dev` and the Wrangler upload command cannot be used on this device. Use the local Express development server for UI iteration, and validate Pages Functions with `npm run typecheck:pages`; test/deploy the Functions in Cloudflare Pages preview. On a supported desktop OS, `npx wrangler pages dev dist --kv=VOXORA_KV` starts a local Pages runtime with a local KV namespace.

## URLs and navigation

Each public screen has its own path: `/`, `/studio`, `/voices`, `/voice-lab`, `/audio`, `/settings`, `/privacy`, and `/terms`. Admin sections have `/admin/overview`, `/admin/providers`, `/admin/api-keys`, `/admin/models`, `/admin/voices`, `/admin/voice-cloning`, `/admin/branding`, `/admin/content`, `/admin/settings`, `/admin/usage`, `/admin/security`, `/admin/backup`, and `/admin/profile`. Navigation updates browser history, so Back and Forward work. The user workspace contains no Admin link; administrators open `/admin` directly.

## Data and security notes

- KV stores persistent site configuration and encrypted provider keys. The encryption key is a separate Pages secret. Losing it makes stored provider keys unrecoverable.
- Cloudflare KV is eventually consistent and does not provide transactional compare-and-set. Initial setup is protected by `ADMIN_SETUP_SECRET`, but KV alone cannot provide a strongly atomic “only one simultaneous first admin” guarantee. Perform setup once and remove/rotate the bootstrap secret after setup.
- Login and generation rate limits use expiring per-request KV entries; simultaneous requests can race. KV also throttles writes to the same key, so wait at least one second before repeating a branding/provider setting save. For strict distributed concurrency/rate control, add a Durable Object or Cloudflare rate-limiting product.
- Backups exclude credentials, passwords, and sessions. Back up encrypted secrets separately through Cloudflare’s secret management process. User audio remains local to each browser.
- The studio has no general end-user accounts. A public deployment should add authenticated user access or an abuse-control layer before allowing unrestricted generation.
- Voice cloning is not enabled by default. Nigerian English, Pidgin, Igbo, Yoruba, Hausa and other accent presets are generation instructions; accent and language fidelity depend on the selected model and need real-world testing.
- Branding assets are small images stored as KV values. Keep uploads under 2 MiB.

## Commands

- `npm run dev` — Termux-friendly Express/SQLite API and Vite development client.
- `npm run typecheck` — frontend, local server, and Cloudflare Pages Function type checks.
- `npm run typecheck:pages` — Pages Functions types only.
- `npm test` — admin setup, authorization, and API-key secrecy regression check.
- `npm run build` — type checks plus production Vite build.
- `npm run deploy:pages` — upload `dist` with Wrangler from a supported desktop/CI environment after authenticating/configuring the Pages project and binding. Git-connected Pages deployments do not need Wrangler in this repository.
- `npm run start` — local Express server for the SQLite development backend.

## OpenRouter integration

The deployed Pages Function calls `POST https://openrouter.ai/api/v1/audio/speech`; model discovery uses `GET /api/v1/models?output_modalities=speech`. The current OpenRouter TTS guide documents raw binary audio responses, `instructions`, optional provider-specific `voice`, `response_format`, and `input_references` for compatible cloning models. Voxora does not send reference-audio fields unless it implements and verifies model/endpoint capability first. See the [OpenRouter TTS guide](https://openrouter.ai/docs/guides/overview/multimodal/tts).

The requested initial identifier, `fish-audio/s2.1-pro-free:free`, remains configurable and is not forced on the account if it is absent from the provider’s catalog. Catalog listing alone is not proof a generation succeeds. No live API generation was verified because no OpenRouter key was supplied.
