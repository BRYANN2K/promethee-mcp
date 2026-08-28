import { productLockup } from '../components/product/auth-shell.ts'

export function renderConfigurationBlocked(root: HTMLElement): void {
  document.title = 'Promethee MCP — Configuration required'
  root.innerHTML = `
    <main id="main-content" class="auth-page">
      <section class="auth-shell auth-shell--single">
        <article class="auth-panel blocking-panel" aria-labelledby="blocked-title">
          ${productLockup()}
          <div class="step-heading">
            <span class="ember-rail" aria-hidden="true"></span>
            <div>
              <p class="eyebrow">CONFIGURATION REQUIRED</p>
              <h1 id="blocked-title">This authorization host is not configured.</h1>
            </div>
          </div>
          <div class="inline-status inline-status--error" role="alert">
            <span aria-hidden="true">!</span>
            <div>
              <strong>Sign-in is disabled</strong>
              <p>Add the public Supabase URL, publishable key, and exact HTTPS MCP bridge origin to the deployment environment, then rebuild. Secret or service-role keys are rejected.</p>
            </div>
          </div>
        </article>
      </section>
    </main>`
}

export function renderConsentBlocked(root: HTMLElement): void {
  document.title = 'Promethee MCP — Review connection'
  root.innerHTML = `
    <main id="main-content" class="auth-page">
      <section class="auth-shell auth-shell--single">
        <article class="auth-panel blocking-panel" aria-labelledby="blocked-title">
          ${productLockup()}
          <div class="step-heading">
            <span class="ember-rail" aria-hidden="true"></span>
            <div>
              <p class="eyebrow">CONNECTION REQUEST</p>
              <h1 id="blocked-title">This request cannot be reviewed.</h1>
            </div>
          </div>
          <div class="inline-status inline-status--error" role="alert">
            <span aria-hidden="true">!</span>
            <div>
              <strong>No access was granted</strong>
              <p>Return to your MCP client and start a new connection request.</p>
            </div>
          </div>
          <a class="action-button action-button--secondary action-link" href="/login">Return to sign in</a>
        </article>
      </section>
    </main>`
}
