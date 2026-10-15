# Voxora AI

Voxora AI is a responsive AI voice studio focused on Nigerian English styles. The deployment target is **Cloudflare Pages + Pages Functions + Workers KV**. Pages serves the React/Vite build; the Functions API stores administrator data, model and voice configuration, website content, encrypted provider credentials, rate-limit state, and sanitized generation logs in the `VOXORA_KV` namespace. API keys are encrypted with AES-256-GCM before they are written to KV and are only returned as masked metadata.

Audio history remains in browser IndexedDB on the current device. Reference voice cloning remains disabled until a selected model’s endpoint capability has been verified. The speech endpoint used here accepts `input`, optional `instructions`, optional `voice`, and a format, and returns raw audio bytes. Voxora uses style prompts rather than inventing provider voice IDs.

## Cloudflare Pages deployment

1. In Cloudflare Dashboard, open **Workers & Pages → KV**, create one production namespace and one preview namespace. From a supported desktop/CI host, Wrangler can create them with `npx wrangler kv namespace create VOXORA_KV` and `npx wrangler kv namespace create VOXORA_KV_PREVIEW`.
2. Create a Pages project connected to this repository. Set the build command to `npm run build` and build output directory to `dist`.
3. This repository includes `wrangler.toml`, so Cloudflare manages bindings from that file and the dashboard's Bindings editor is read-only. Copy each namespace ID from the KV namespace details, then uncomment and fill the `[[kv_namespaces]]` production block and `[[env.preview.kv_namespaces]]` preview block in `wrangler.toml`. Both bindings must be named exactly `VOXORA_KV`. Commit and push the file; the connected Pages project will redeploy with the configured bindings. Namespace IDs are identifiers, not secrets. Never put API keys or secret values in `wrangler.toml`.
4. Add these in **Pages → Settings → Variables and Secrets** for Production. Use `ADMIN_USERNAME` as a regular variable (3–40 characters), and set `ADMIN_PASSWORD` as a secret (12–200 characters). With both configured, the first admin signs in at `/admin/login`; the password remains managed by Cloudflare and is never copied into KV. Keep the existing first-run setup-secret flow as a fallback only when these two variables are absent. Add `SESSION_SECRET` and `SECRET_ENCRYPTION_KEY` as secrets, and `APP_ORIGIN` as a regular variable. Generate secret values locally; do not paste them in frontend variables:

   ```sh
   openssl rand -hex 32
   openssl rand -base64 32
   ```

   - `ADMIN_SETUP_SECRET`: optional fallback for the browser-based first-run setup when environment-managed admin credentials are not configured.
   - `SESSION_SECRET`: at least 32 random characters; required to create and validate admin sessions.
   - `SECRET_ENCRYPTION_KEY`: base64 encoding of exactly 32 random bytes; used for API-key encryption at rest.
   - `APP_ORIGIN`: the exact HTTPS origin for the Pages site (a regular Pages variable, not a secret).

   To add a secret with Wrangler, run `npx wrangler pages secret put SECRET_NAME --project-name voxora-ai` and enter the value at the prompt. Never use a `VITE_` variable for a secret.
5. Open the Pages URL and visit `/admin/login` to sign in with `ADMIN_USERNAME` and `ADMIN_PASSWORD`. If you did not configure those, visit `/admin/setup` and create the first administrator using `ADMIN_SETUP_SECRET`. Setup is disabled after account creation.
6. Visit `/admin/api-keys` and save an OpenRouter key. It is encrypted before storage; reads return only a masked value. Then visit `/admin/models`, discover models from the speech modality catalog, enable the intended model, and set it as default.
7. Make a short test generation from `/studio`. A real provider key and available model are required; errors are reported instead of showing fabricated audio.

The application requires a KV namespace binding named exactly `VOXORA_KV`. Because `wrangler.toml` is present, it is the source of truth for bindings. Use separate production and preview namespaces as described above; do not try to add them in the dashboard Bindings editor.

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

The Pages Function sends TTS requests to `POST https://openrouter.ai/api/v1/audio/speech`. Reference clips use OpenRouter's documented stateless-cloning format: `input_references: [{type: "input_audio", input_audio: {data: "data:<mime>;base64,..."}}, {type: "text", text: "optional transcript"}]`. This is per-generation audio input; it is not a `voice` identifier and does not create a persistent cloned voice. OpenRouter documents `voice` separately as a provider-dependent voice identifier. See the [OpenRouter TTS and cloning guide](https://openrouter.ai/docs/guides/overview/multimodal/tts).

In Admin → Models, choose **Verify capabilities** for a discovered model. Voxora queries that model's OpenRouter endpoint metadata and stores the result under the provider/model record, including `supports_voice_cloning`; it does not infer cloning support from speech catalog listing. Fish Audio S2.1 Pro Free currently reports cloning support through the OpenRouter endpoints metadata and accepts one reference clip per request. The application caps reference files at 5 MiB, validates the declared MIME type and file signature, and holds the clip in request memory only. It is not written to KV or generation logs. The optional transcript is limited to 10,000 characters. A successful metadata check does not prove every audio file will be accepted; provider decoding and generation must still succeed.

The initial model identifier, `fish-audio/s2.1-pro-free:free`, remains configurable. The model listing does not guarantee availability or a successful generation; OpenRouter describes this free variant for testing and low-volume use without production availability guarantees. No live audio generation was tested in this environment because no usable API key or authorized reference recording was available.
