import test from 'node:test'
import assert from 'node:assert/strict'
import { onRequest } from '../functions/api/[[path]].ts'

class MemoryKV {
  values = new Map<string, unknown>()
  async get<T = unknown>(key: string, type?: 'json' | 'text' | 'arrayBuffer'): Promise<T | null> {
    const value = this.values.get(key)
    if (value === undefined) return null
    if (type === 'json' && typeof value === 'string') return JSON.parse(value) as T
    if (type === 'arrayBuffer' && value instanceof Uint8Array) return value.slice().buffer as T
    return value as T
  }
  async put(key: string, value: string | ArrayBuffer | Uint8Array, options?: { metadata?: unknown }): Promise<void> {
    this.values.set(key, value instanceof ArrayBuffer ? new Uint8Array(value) : value)
    if (options?.metadata) this.values.set(`${key}:metadata`, options.metadata)
  }
  async delete(key: string): Promise<void> { this.values.delete(key) }
  async list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }> {
    return { keys: [...this.values.keys()].filter(k => !k.endsWith(':metadata') && k.startsWith(options?.prefix || '')).map(name => ({ name })) }
  }
  async getWithMetadata<T = unknown>(key: string, type?: 'arrayBuffer'): Promise<{ value: T | null; metadata: unknown }> {
    return { value: await this.get<T>(key, type), metadata: this.values.get(`${key}:metadata`) }
  }
}

test('Pages API gates admin setup and never returns a saved API key', async () => {
  const kv = new MemoryKV()
  const env = {
    VOXORA_KV: kv,
    APP_ORIGIN: 'https://voxora.test',
    SESSION_SECRET: 's'.repeat(64),
    ADMIN_SETUP_SECRET: 'a'.repeat(32),
    SECRET_ENCRYPTION_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
  }
  const request = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) => new Request(`https://voxora.test${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const call = (req: Request) => onRequest({ request: req, env, params: {}, waitUntil() {} } as never)

  let response = await call(request('/api/admin/setup', 'POST', { username: 'owner', password: 'A sufficiently long test password 72!', setupSecret: env.ADMIN_SETUP_SECRET }))
  assert.equal(response.status, 201)
  response = await call(request('/api/admin/setup', 'POST', { username: 'intruder', password: 'A sufficiently long test password 72!', setupSecret: env.ADMIN_SETUP_SECRET }))
  assert.equal(response.status, 409)
  response = await call(request('/api/admin/api-keys'))
  assert.equal(response.status, 401)

  response = await call(request('/api/admin/login', 'POST', { username: 'owner', password: 'A sufficiently long test password 72!' }))
  assert.equal(response.status, 200)
  const login = await response.json() as { csrf: string }
  const cookie = response.headers.get('Set-Cookie')!.split(';')[0]
  const writeHeaders = { Cookie: cookie, Origin: 'https://voxora.test', 'X-CSRF-Token': login.csrf }
  const secret = 'sk-or-v1-test-only-never-return-this-value'
  response = await call(request('/api/admin/api-keys', 'POST', { providerId: 'openrouter', key: secret }, writeHeaders))
  assert.equal(response.status, 200)
  response = await call(request('/api/admin/api-keys', 'GET', undefined, { Cookie: cookie }))
  const metadata = await response.text()
  assert.equal(response.status, 200)
  assert.equal(metadata.includes(secret), false)
  assert.match(metadata, /sk-or-…alue/)
  const provider = JSON.parse(String(kv.values.get('provider:openrouter')))
  assert.notEqual(provider.key_cipher, secret)
  assert.ok(provider.key_cipher)
  response = await call(request('/api/public/config'))
  const publicConfig = await response.text()
  assert.equal(publicConfig.includes(secret), false)
})
