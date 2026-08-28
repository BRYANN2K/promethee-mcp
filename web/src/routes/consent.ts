import type { SupabaseClient } from '@supabase/supabase-js'

import { productLockup, supportFooter } from '../components/product/auth-shell.ts'
import {
  buildLoginPath,
  readAuthorizationId,
  safeAuthorizationRedirect,
  safeProviderRedirect,
} from '../security/navigation.ts'

const KNOWN_SCOPES = new Set([
  'openid',
  'email',
  'profile',
  'phone',
  'tasks:read',
  'projects:read',
  'tasks:write',
  'projects:write',
])

type AuthorizationDetails = Readonly<{
  authorizationId: string
  clientName: string
  redirectUri: string
  scopes: readonly string[]
}>

export function parseRequestedScopes(value: string): readonly string[] | null {
  if (value.length === 0 || value.length > 512) return null
  const scopes = value.split(' ')
  if (
    scopes.length > 16 ||
    new Set(scopes).size !== scopes.length ||
    scopes.some((scope) => !KNOWN_SCOPES.has(scope))
  ) {
    return null
  }
  return scopes
}

function displayDestination(value: string): string {
  const url = new URL(value)
  if (url.protocol === 'https:' || url.protocol === 'http:') return url.host
  return `${url.protocol}//${url.host}${url.pathname}`
}

function renderFailure(root: HTMLElement, message: string): void {
  root.innerHTML = `
    <main id="main-content" class="auth-page">
      <section class="auth-shell auth-shell--single">
        <article class="auth-panel blocking-panel" aria-labelledby="consent-error-title">
          ${productLockup()}
          <div class="step-heading">
            <span class="ember-rail" aria-hidden="true"></span>
            <div><p class="eyebrow">CONNECTION REQUEST</p><h1 id="consent-error-title">This request cannot be reviewed.</h1></div>
          </div>
          <div class="inline-status inline-status--error" role="alert">
            <span aria-hidden="true">!</span><div><strong>No access was granted</strong><p data-consent-error></p></div>
          </div>
          <a class="action-button action-button--secondary action-link" href="/login">Return to sign in</a>
          ${supportFooter()}
        </article>
      </section>
    </main>`
  const error = root.querySelector<HTMLElement>('[data-consent-error]')
  if (error) error.textContent = message
}

function renderConsentSurface(root: HTMLElement): void {
  root.innerHTML = `
    <main id="main-content" class="auth-page">
      <section class="auth-shell auth-shell--single">
        <article class="auth-panel consent-panel" aria-labelledby="consent-title">
          <header class="panel-header">
            ${productLockup()}
            <span class="connection-badge">Verified request</span>
          </header>

          <div class="step-heading">
            <span class="ember-rail" aria-hidden="true"></span>
            <div><p class="eyebrow">CONNECTION REQUEST · STEP 2 OF 2</p><h1 id="consent-title"><span data-client-name>Client</span> wants to connect.</h1></div>
          </div>
          <p class="lede">Review the identity and data boundaries before you decide.</p>

          <dl class="identity-list">
            <div><dt>Requesting client</dt><dd><span class="client-mark" data-client-mark aria-hidden="true">C</span><strong data-client-value>Client</strong></dd></div>
            <div><dt>MCP resource</dt><dd class="mono">Promethee MCP</dd></div>
            <div><dt>Returns to</dt><dd data-return-value>Registered client address</dd></div>
          </dl>

          <section class="access-group" aria-labelledby="identity-access-title">
            <div class="section-label"><h2 id="identity-access-title">Identity shared</h2><span class="mono" data-identity-scopes></span></div>
            <div class="access-row">
              <span class="access-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"></circle><path d="M5.5 19c.8-3.7 3-5.5 6.5-5.5s5.7 1.8 6.5 5.5"></path></svg></span>
              <div><strong>Basic account identity</strong><p>Used to bind this request to your account.</p></div>
            </div>
          </section>

          <section class="access-group" aria-labelledby="data-access-title">
            <div class="section-label"><h2 id="data-access-title">Promethee data access</h2><span class="capability-badge" data-capability-badge></span></div>
            <div class="access-row" data-read-row hidden>
              <span class="access-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h10M5 17h7"></path></svg></span>
              <div><strong>Read tasks and projects</strong><p>Titles, status, dates, and project association.</p><small class="scope-line" data-read-scopes></small></div>
            </div>
            <div class="access-row access-row--stacked" data-project-write-row hidden>
              <span class="access-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg></span>
              <div><strong>Create projects</strong><p>Add one named project. No archive, update, or delete access.</p><small class="scope-line">projects:write</small></div>
            </div>
            <div class="access-row access-row--stacked" data-task-write-row hidden>
              <span class="access-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 7h9M6 12h7M6 17h5M18 13v6M15 16h6"></path></svg></span>
              <div><strong>Create tasks</strong><p>Add one task inside an accessible project. No completion, update, or delete access.</p><small class="scope-line">tasks:write</small></div>
            </div>
            <p class="policy-note" data-write-note hidden><strong>Create actions change Promethee data.</strong> Availability is also enforced by MCP client policy and Promethee-owned RLS.</p>
          </section>

          <div class="boundary-note boundary-note--panel">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 2.8 8.1 7 10 4.2-1.9 7-5.5 7-10V6l-7-3Z"></path><path d="m9.2 12 1.8 1.8 3.9-4"></path></svg>
            <span><strong>Your email code stays with the identity provider.</strong><small>The client receives only the result of this resource-bound OAuth decision.</small></span>
          </div>

          <div class="decision-actions">
            <button class="action-button action-button--secondary" type="button" data-consent-deny>Deny</button>
            <button class="action-button action-button--primary" type="button" data-consent-allow>Allow requested access</button>
          </div>
          <p class="form-status consent-result" data-consent-result role="status" aria-live="polite"></p>
          ${supportFooter()}
        </article>
      </section>
    </main>`
}

function bindDetails(root: HTMLElement, details: AuthorizationDetails): void {
  const clientName = root.querySelector<HTMLElement>('[data-client-name]')
  const clientValue = root.querySelector<HTMLElement>('[data-client-value]')
  const clientMark = root.querySelector<HTMLElement>('[data-client-mark]')
  const returnValue = root.querySelector<HTMLElement>('[data-return-value]')
  const identityScopes = root.querySelector<HTMLElement>('[data-identity-scopes]')
  const badge = root.querySelector<HTMLElement>('[data-capability-badge]')
  const readRow = root.querySelector<HTMLElement>('[data-read-row]')
  const readScopes = root.querySelector<HTMLElement>('[data-read-scopes]')
  const projectWriteRow = root.querySelector<HTMLElement>('[data-project-write-row]')
  const taskWriteRow = root.querySelector<HTMLElement>('[data-task-write-row]')
  const writeNote = root.querySelector<HTMLElement>('[data-write-note]')
  if (
    !clientName || !clientValue || !clientMark || !returnValue || !identityScopes || !badge ||
    !readRow || !readScopes || !projectWriteRow || !taskWriteRow || !writeNote
  ) {
    throw new Error('Consent surface failed to initialize')
  }

  const identity = details.scopes.filter((scope) => ['openid', 'email', 'profile', 'phone'].includes(scope))
  const reads = details.scopes.filter((scope) => scope === 'tasks:read' || scope === 'projects:read')
  const projectWrite = details.scopes.includes('projects:write')
  const taskWrite = details.scopes.includes('tasks:write')
  const writes = Number(projectWrite) + Number(taskWrite)

  clientName.textContent = details.clientName
  clientValue.textContent = details.clientName
  clientMark.textContent = details.clientName.slice(0, 1).toUpperCase()
  returnValue.textContent = displayDestination(details.redirectUri)
  identityScopes.textContent = identity.join(' · ')
  readRow.hidden = reads.length === 0
  readScopes.textContent = reads.join(' · ')
  projectWriteRow.hidden = !projectWrite
  taskWriteRow.hidden = !taskWrite
  writeNote.hidden = writes === 0
  badge.textContent = writes > 0 ? 'Read + create' : 'Read only'
}

export function renderConsent(root: HTMLElement, client: SupabaseClient): void {
  document.title = 'Promethee MCP — Review connection'
  const authorizationId = readAuthorizationId(new URL(window.location.href))
  if (authorizationId === null) {
    renderFailure(root, 'The authorization identifier is missing or invalid. Start again from your MCP client.')
    return
  }

  root.innerHTML = `
    <main id="main-content" class="auth-page"><section class="auth-shell auth-shell--single">
      <article class="auth-panel blocking-panel" aria-busy="true">${productLockup()}<div class="inline-status"><span aria-hidden="true">…</span><div><strong>Checking the connection request…</strong><p>Keep this page open.</p></div></div></article>
    </section></main>`

  void (async () => {
    const { data: sessionData, error: sessionError } = await client.auth.getSession()
    if (sessionError || !sessionData.session) {
      window.location.replace(buildLoginPath(authorizationId))
      return
    }

    const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId)
    if (error || !data) {
      renderFailure(root, 'The connection request is invalid, expired, or unavailable. Start again from your MCP client.')
      return
    }
    if ('redirect_url' in data) {
      const redirect = safeProviderRedirect(data.redirect_url)
      if (redirect === null) {
        renderFailure(root, 'The registered client return address is not safe.')
        return
      }
      window.location.replace(redirect)
      return
    }

    const scopes = parseRequestedScopes(data.scope)
    const safeRedirect = safeProviderRedirect(data.redirect_uri)
    if (
      data.authorization_id !== authorizationId ||
      data.client.name.length === 0 ||
      data.client.name.length > 160 ||
      scopes === null ||
      safeRedirect === null
    ) {
      renderFailure(root, 'The connection request contains unsupported details. No access was granted.')
      return
    }

    const details: AuthorizationDetails = {
      authorizationId,
      clientName: data.client.name,
      redirectUri: safeRedirect,
      scopes,
    }
    renderConsentSurface(root)
    bindDetails(root, details)

    const allow = root.querySelector<HTMLButtonElement>('[data-consent-allow]')
    const deny = root.querySelector<HTMLButtonElement>('[data-consent-deny]')
    const result = root.querySelector<HTMLElement>('[data-consent-result]')
    if (!allow || !deny || !result) throw new Error('Consent actions failed to initialize')

    const decide = async (decision: 'allow' | 'deny'): Promise<void> => {
      allow.disabled = true
      deny.disabled = true
      result.className = 'form-status consent-result'
      result.textContent = decision === 'allow' ? 'Allowing…' : 'Denying…'
      const response = decision === 'allow'
        ? await client.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await client.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
      const redirect = response.data?.redirect_url === undefined
        ? null
        : safeAuthorizationRedirect(response.data.redirect_url, details.redirectUri)
      if (response.error || redirect === null) {
        allow.disabled = false
        deny.disabled = false
        result.className = 'form-status form-status--error consent-result'
        result.textContent = 'The decision could not be completed. The request may have expired.'
        return
      }
      result.className = 'form-status form-status--success consent-result'
      result.textContent = decision === 'allow'
        ? 'Access approved. Returning to the client…'
        : 'Access denied. Returning to the client…'
      window.location.replace(redirect)
    }

    allow.addEventListener('click', () => { void decide('allow') })
    deny.addEventListener('click', () => { void decide('deny') })
  })().catch(() => {
    renderFailure(root, 'The connection request could not be loaded. No access was granted.')
  })
}
