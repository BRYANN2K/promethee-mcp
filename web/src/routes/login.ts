import type { SupabaseClient } from '@supabase/supabase-js'

import {
  connectPersonalBridge,
  loadPersonalRetention,
  type PersonalBridgeConfig,
  type PersonalRetentionMode,
} from '../auth/personal-bridge.ts'
import { BROWSER_AUTH_STORAGE_KEY } from '../auth/supabase-client.ts'
import { productLockup, supportFooter, trustBoundaryNote } from '../components/product/auth-shell.ts'
import { buildConsentPath, readAuthorizationId } from '../security/navigation.ts'

const EMAIL_LIMIT = 254
const OTP_LENGTH = 6

type LoginStep = 'email' | 'code'
export type OtpVerificationFailure = 'invalid-or-expired' | 'rate-limited' | 'unavailable'

type PublicOtpMessage = Readonly<{
  field: string
  status: string
}>

export const PERSONAL_CONNECTION_COPY = Object.freeze({
  title: 'Connect to Promethee',
  body: 'Choose how long this server can keep you signed in, then use the code sent to your email.',
  sevenDays: '7 days — Restore after restart',
  never: 'Never — Until this server stops',
  connected: 'Connected',
})

type RenderLoginOptions = Readonly<{
  allowDirectConnection?: boolean
  personalBridge?: PersonalBridgeConfig
}>

type LoginElements = Readonly<{
  email: HTMLInputElement
  code: HTMLInputElement
  codeGroup: HTMLElement
  codeDelivery: HTMLElement
  emailError: HTMLElement
  codeError: HTMLElement
  formStatus: HTMLElement
  submit: HTMLButtonElement
  submitLabel: HTMLElement
  changeEmail: HTMLButtonElement
  resendCode: HTMLButtonElement
}>

type PersonalLoginElements = Readonly<{
  form: HTMLFormElement
  retentionInputs: readonly HTMLInputElement[]
  retry: HTMLButtonElement
}>

function connectionProductMark(): string {
  return `
    <span class="connection-product-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32">
        <path d="M16 26V14"></path>
        <path d="M16 18c-5.5 0-8.5-3.2-8.5-8.5C13 9.5 16 12.7 16 18Z"></path>
        <path d="M16 14c0-4.8 2.8-7.5 7.5-7.5 0 4.8-2.8 7.5-7.5 7.5Z"></path>
      </svg>
    </span>`
}

function selectedRetention(elements: PersonalLoginElements): PersonalRetentionMode {
  return elements.retentionInputs.find((input) => input.checked)?.value === 'memory'
    ? 'memory'
    : 'seven-days'
}

function updateRetentionChoices(elements: PersonalLoginElements): void {
  for (const input of elements.retentionInputs) {
    const label = input.closest<HTMLElement>('.retention-choice')
    const cue = label?.querySelector<HTMLElement>('em')
    label?.classList.toggle('is-selected', input.checked)
    if (cue !== null && cue !== undefined) cue.textContent = input.checked ? 'Selected' : 'Select'
  }
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidOtp(value: string): boolean {
  return new RegExp(`^[0-9]{${OTP_LENGTH}}$`, 'u').test(value)
}

export function classifyOtpVerificationError(error: unknown): OtpVerificationFailure {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? Reflect.get(error, 'code')
      : undefined
  if (code === 'otp_expired' || code === 'invalid_credentials' || code === 'validation_failed') {
    return 'invalid-or-expired'
  }
  if (code === 'over_request_rate_limit') return 'rate-limited'
  return 'unavailable'
}

export function otpVerificationMessage(failure: OtpVerificationFailure): PublicOtpMessage {
  if (failure === 'invalid-or-expired') {
    return {
      field: 'This code is incorrect or has expired.',
      status: 'Enter the latest code or send a new one.',
    }
  }
  if (failure === 'rate-limited') {
    return {
      field: '',
      status: 'Too many attempts. Wait a moment, then send a new code.',
    }
  }
  return {
    field: '',
    status: 'Promethee could not verify this code. Nothing was connected.',
  }
}

function getLoginElements(root: HTMLElement): LoginElements {
  const email = root.querySelector<HTMLInputElement>('#login-email')
  const code = root.querySelector<HTMLInputElement>('#login-code')
  const codeGroup = root.querySelector<HTMLElement>('[data-code-group]')
  const codeDelivery = root.querySelector<HTMLElement>('[data-code-delivery]')
  const emailError = root.querySelector<HTMLElement>('#login-email-error')
  const codeError = root.querySelector<HTMLElement>('#login-code-error')
  const formStatus = root.querySelector<HTMLElement>('#login-status')
  const submit = root.querySelector<HTMLButtonElement>('[data-login-submit]')
  const submitLabel = submit?.querySelector<HTMLElement>('span') ?? null
  const changeEmail = root.querySelector<HTMLButtonElement>('[data-change-email]')
  const resendCode = root.querySelector<HTMLButtonElement>('[data-resend-code]')

  if (
    !email ||
    !code ||
    !codeGroup ||
    !codeDelivery ||
    !emailError ||
    !codeError ||
    !formStatus ||
    !submit ||
    !submitLabel ||
    !changeEmail ||
    !resendCode
  ) {
    throw new Error('Login surface failed to initialize')
  }

  return {
    email,
    code,
    codeGroup,
    codeDelivery,
    emailError,
    codeError,
    formStatus,
    submit,
    submitLabel,
    changeEmail,
    resendCode,
  }
}

function setPending(
  elements: LoginElements,
  pending: boolean,
  step: LoginStep,
  personalMode = false,
): void {
  elements.email.disabled = pending
  elements.code.disabled = pending
  elements.submit.disabled = pending
  elements.changeEmail.disabled = pending
  elements.resendCode.disabled = pending
  elements.submitLabel.textContent = pending
    ? step === 'email'
      ? 'Sending code…'
      : personalMode ? 'Connecting…' : 'Verifying…'
    : step === 'email'
      ? 'Send code'
      : personalMode ? 'Connect' : 'Verify code'
}

function validateEmail(elements: LoginElements): boolean {
  const normalized = normalizeEmail(elements.email.value)
  const invalid =
    normalized.length === 0 || normalized.length > EMAIL_LIMIT || !elements.email.validity.valid

  elements.email.toggleAttribute('aria-invalid', invalid)
  elements.emailError.textContent = invalid ? 'Enter a valid email address.' : ''
  if (invalid) elements.email.focus()
  return !invalid
}

function validateCode(elements: LoginElements): boolean {
  const invalid = !isValidOtp(elements.code.value)
  elements.code.toggleAttribute('aria-invalid', invalid)
  elements.codeError.textContent = invalid ? 'Enter the six-digit code.' : ''
  if (invalid) elements.code.focus()
  return !invalid
}

function setStatus(elements: LoginElements, kind: 'neutral' | 'success' | 'error', text: string): void {
  elements.formStatus.className =
    kind === 'neutral' ? 'form-status' : `form-status form-status--${kind}`
  elements.formStatus.setAttribute('role', kind === 'error' ? 'alert' : 'status')
  elements.formStatus.textContent = text
}

function renderMissingRequest(root: HTMLElement): void {
  root.innerHTML = `
    <main id="main-content" class="auth-page">
      <section class="auth-shell auth-shell--single">
        <article class="auth-panel blocking-panel" aria-labelledby="login-request-title">
          ${productLockup()}
          <div class="step-heading">
            <span class="ember-rail" aria-hidden="true"></span>
            <div><p class="eyebrow">CONNECTION REQUEST</p><h1 id="login-request-title">Start from your MCP client.</h1></div>
          </div>
          <div class="inline-status inline-status--error" role="alert">
            <span aria-hidden="true">!</span><div><strong>Sign-in is disabled</strong><p>A valid connection request is required before this page can ask for your email.</p></div>
          </div>
          ${supportFooter()}
        </article>
      </section>
    </main>`
}

function renderPersonalSignedIn(root: HTMLElement, retention: PersonalRetentionMode): void {
  document.title = 'Promethee MCP — Connected'
  root.innerHTML = `
    <main id="main-content" class="auth-page auth-page--connection">
      <article class="connection-card connection-card--result" aria-labelledby="connected-title">
        <header class="connection-header">
          ${connectionProductMark()}
          <p class="connection-product-name">Promethee <strong>MCP</strong></p>
        </header>
        <section class="connection-result" role="status">
          <span class="confirmed-mark" aria-hidden="true">✓</span>
          <h1 id="connected-title" tabindex="-1">Connected</h1>
          <p>${retention === 'memory'
            ? 'This session ends when the server stops.'
            : 'This server can restore your session for up to 7 days.'}</p>
          <small>You can close this page.</small>
        </section>
        <footer class="connection-footer">
          <p><span aria-hidden="true"></span>Your code goes to Promethee. Tokens are never displayed here.</p>
          ${supportFooter()}
        </footer>
      </article>
    </main>`
  root.querySelector<HTMLElement>('#connected-title')?.focus()
}

export function renderLogin(
  root: HTMLElement,
  client: SupabaseClient,
  options: RenderLoginOptions = {},
): void {
  document.title = 'Promethee MCP — Sign in'
  const authorizationId = readAuthorizationId(new URL(window.location.href))
  if (authorizationId === null && options.allowDirectConnection !== true) {
    renderMissingRequest(root)
    return
  }
  const personalMode = authorizationId === null && options.personalBridge !== undefined
  if (personalMode) {
    document.title = 'Promethee MCP — Connect'
    root.innerHTML = `
      <main id="main-content" class="auth-page auth-page--connection">
        <article class="connection-card" aria-labelledby="login-title">
          <header class="connection-header">
            ${connectionProductMark()}
            <p class="connection-product-name">Promethee <strong>MCP</strong></p>
            <h1 id="login-title">${PERSONAL_CONNECTION_COPY.title}</h1>
            <p>${PERSONAL_CONNECTION_COPY.body}</p>
          </header>

          <form id="login-form" novalidate aria-busy="true">
            <fieldset class="retention-group">
              <legend>Renew this session</legend>
              <div class="retention-grid">
                <label class="retention-choice is-selected">
                  <input type="radio" name="retention" value="seven-days" checked disabled>
                  <span><strong>7 days</strong><small>Restore after restart</small></span>
                  <em>Selected</em>
                </label>
                <label class="retention-choice">
                  <input type="radio" name="retention" value="memory" disabled>
                  <span><strong>Never</strong><small>Until this server stops</small></span>
                  <em>Select</em>
                </label>
              </div>
            </fieldset>

            <div class="field-group">
              <label for="login-email">Email</label>
              <div class="connection-input-shell">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4z"></path><path d="m4 7 8 6 8-6"></path></svg>
                <input id="login-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="${EMAIL_LIMIT}" placeholder="you@example.com" aria-describedby="login-email-help login-email-error" required disabled>
              </div>
              <p class="field-help" id="login-email-help">We’ll send a six-digit code. No account will be created.</p>
              <p class="field-error" id="login-email-error"></p>
            </div>

            <div class="code-delivery" data-code-delivery hidden role="status">
              <span class="code-delivery__mark" aria-hidden="true">✓</span>
              <span><strong>Code sent</strong><small>Enter the latest code from your email.</small></span>
              <button type="button" data-change-email>Change email</button>
            </div>

            <div class="field-group" data-code-group hidden>
              <label for="login-code">6-digit code</label>
              <div class="connection-input-shell">
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>
                <input class="connection-code-input" id="login-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="${OTP_LENGTH}" pattern="[0-9]{${OTP_LENGTH}}" placeholder="000000" aria-describedby="login-code-help login-code-error">
              </div>
              <p class="field-help" id="login-code-help">Use the newest code only.</p>
              <p class="field-error" id="login-code-error"></p>
            </div>

            <p class="form-status" id="login-status" role="status" aria-live="polite">Loading your current choice…</p>
            <button class="action-button action-button--primary action-button--wide connection-primary" type="submit" data-login-submit disabled>
              <span>Send code</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
            </button>
            <button class="action-button action-button--quiet action-button--wide" type="button" data-resend-code hidden>Send a new code</button>
            <button class="action-button action-button--secondary action-button--wide" type="button" data-retry-connection hidden>Try again</button>
          </form>

          <footer class="connection-footer">
            <p><span aria-hidden="true"></span>Your code goes to Promethee. Tokens are never displayed here.</p>
            ${supportFooter()}
          </footer>
        </article>
      </main>`
  } else {
    root.innerHTML = `
      <main id="main-content" class="auth-page">
        <div class="auth-shell auth-shell--split">
          <aside class="context-panel" aria-label="Connection context">
            ${productLockup()}
            <div class="context-copy">
              <p class="eyebrow">EXTERNAL AUTHORIZATION</p>
              <h2>Access starts with a deliberate review.</h2>
              <p>Authenticate first. The requesting client and its permissions appear before you approve anything.</p>
            </div>
            <ol class="journey-list" aria-label="Authorization steps">
              <li class="is-current"><span>1</span><div><strong>Sign in</strong><small>No access granted</small></div></li>
              <li><span>2</span><div><strong>Review request</strong><small>Allow or deny</small></div></li>
              <li><span>3</span><div><strong>Return to client</strong><small>Registered address only</small></div></li>
            </ol>
            ${trustBoundaryNote()}
          </aside>
          <section class="auth-panel auth-panel--login" aria-labelledby="login-title">
            <div class="step-heading"><span class="ember-rail" aria-hidden="true"></span><div><p class="eyebrow">STEP 1 OF 2</p><h1 id="login-title">Continue your connection request.</h1></div></div>
            <p class="lede">Sign in to review the client and its access before anything is shared.</p>
            <form id="login-form" novalidate>
              <div class="field-group"><label for="login-email">Email</label><input id="login-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="${EMAIL_LIMIT}" placeholder="you@example.com" aria-describedby="login-email-help login-email-error" required><p class="field-help" id="login-email-help">We’ll send a six-digit code. No account will be created.</p><p class="field-error" id="login-email-error"></p></div>
              <div class="code-delivery" data-code-delivery hidden role="status"><span class="code-delivery__mark" aria-hidden="true">✓</span><span><strong>Code sent</strong><small>Check your email, then enter the code below.</small></span><button type="button" data-change-email>Change email</button></div>
              <div class="field-group" data-code-group hidden><label for="login-code">6-digit code</label><input id="login-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="${OTP_LENGTH}" pattern="[0-9]{${OTP_LENGTH}}" placeholder="000000" aria-describedby="login-code-help login-code-error"><p class="field-help" id="login-code-help">Enter the code sent to your email.</p><p class="field-error" id="login-code-error"></p></div>
              <p class="form-status" id="login-status" role="status" aria-live="polite"></p>
              <button class="action-button action-button--primary action-button--wide" type="submit" data-login-submit><span>Send code</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg></button>
              <button class="action-button action-button--quiet action-button--wide" type="button" data-resend-code hidden>Resend code</button>
              <button class="action-button action-button--quiet action-button--wide" type="button" data-toggle-disclosure aria-expanded="false">What happens next?</button>
              <div class="disclosure" id="login-disclosure" hidden><strong>Signing in does not approve access.</strong><p>You review the client, identity scopes, and Promethee permissions before deciding.</p></div>
            </form>
            <p class="privacy-line"><span aria-hidden="true"></span>The requesting client never receives your email code.</p>
            ${supportFooter()}
          </section>
        </div>
      </main>`
  }

  const elements = getLoginElements(root)
  const form = root.querySelector<HTMLFormElement>('#login-form')
  const disclosureButton = root.querySelector<HTMLButtonElement>('[data-toggle-disclosure]')
  const disclosure = root.querySelector<HTMLElement>('#login-disclosure')
  if (!form || (!personalMode && (!disclosureButton || !disclosure))) {
    throw new Error('Login surface failed to initialize')
  }
  const retentionInputs = personalMode
    ? [...root.querySelectorAll<HTMLInputElement>('input[name="retention"]')]
    : []
  const retryConnection = personalMode
    ? root.querySelector<HTMLButtonElement>('[data-retry-connection]')
    : null
  if (personalMode && (retentionInputs.length !== 2 || retryConnection === null)) {
    throw new Error('Personal connection surface failed to initialize')
  }
  const personalElements: PersonalLoginElements | undefined = personalMode && retryConnection !== null
    ? { form, retentionInputs, retry: retryConnection }
    : undefined

  let step: LoginStep = 'email'
  let pendingEmail = ''
  let retentionReady = !personalMode
  let retryMode: 'load' | 'connect' = 'load'

  const setLoginPending = (pending: boolean, activeStep: LoginStep): void => {
    setPending(elements, pending, activeStep, personalMode)
    if (personalElements === undefined) return
    personalElements.form.setAttribute('aria-busy', String(pending))
    for (const input of personalElements.retentionInputs) {
      input.disabled = pending || !retentionReady
    }
    personalElements.retry.disabled = pending
    if (!retentionReady) {
      elements.email.disabled = true
      elements.code.disabled = true
      elements.submit.disabled = true
      elements.changeEmail.disabled = true
      elements.resendCode.disabled = true
    }
  }

  const connectVerifiedSession = async (session: NonNullable<Awaited<ReturnType<typeof client.auth.getSession>>['data']['session']>): Promise<boolean> => {
    if (options.personalBridge === undefined || personalElements === undefined) return false
    personalElements.retry.hidden = true
    retryMode = 'connect'
    setStatus(elements, 'neutral', 'Connecting your MCP…')
    const result = await connectPersonalBridge(
      options.personalBridge,
      session,
      selectedRetention(personalElements),
    )
    if (result.ok) {
      renderPersonalSignedIn(root, result.retention)
      return true
    }
    setStatus(
      elements,
      'error',
      result.failure === 'settings'
        ? 'Your renewal choice could not be saved. Nothing was connected.'
        : 'The MCP could not accept this session. Try again.',
    )
    personalElements.retry.hidden = false
    return false
  }

  const resetEmailStep = (): void => {
    step = 'email'
    pendingEmail = ''
    retryMode = 'load'
    if (personalElements !== undefined) personalElements.retry.hidden = true
    elements.email.readOnly = false
    elements.code.value = ''
    elements.code.removeAttribute('aria-invalid')
    elements.codeError.textContent = ''
    elements.codeDelivery.hidden = true
    elements.codeGroup.hidden = true
    elements.resendCode.hidden = true
    setStatus(elements, 'neutral', '')
    setLoginPending(false, step)
  }

  const sendCode = async (isResend = false): Promise<void> => {
    if (personalMode && !retentionReady) {
      setStatus(elements, 'error', 'Session renewal is unavailable. Connection is paused.')
      return
    }
    if (!isResend && !validateEmail(elements)) return

    const normalizedEmail = isResend ? pendingEmail : normalizeEmail(elements.email.value)
    setStatus(elements, 'neutral', isResend ? 'Sending a new code…' : 'Sending code…')
    setLoginPending(true, 'email')

    try {
      const { error } = await client.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: false },
      })
      if (error) throw new Error('OTP delivery failed')

      step = 'code'
      pendingEmail = normalizedEmail
      elements.email.value = normalizedEmail
      elements.email.readOnly = true
      elements.codeDelivery.hidden = false
      elements.codeGroup.hidden = false
      elements.resendCode.hidden = false
      setStatus(elements, 'success', isResend ? 'A new code was sent.' : 'Code sent. Check your email.')
      elements.code.focus()
    } catch {
      setStatus(
        elements,
        'error',
        isResend
          ? 'We could not resend the code. Wait a moment and try again.'
          : 'We could not send the code. Check the email and try again.',
      )
    } finally {
      setLoginPending(false, step)
    }
  }

  const verifyCode = async (): Promise<void> => {
    if (!validateCode(elements)) return

    setStatus(elements, 'neutral', 'Verifying code…')
    setLoginPending(true, 'code')

    try {
      const { data, error } = await client.auth.verifyOtp({
        email: pendingEmail,
        token: elements.code.value,
        type: 'email',
      })
      if (error) throw error
      if (!data.session || !data.user) throw new Error('OTP verification failed')

      const { data: verifiedIdentity, error: verificationError } = await client.auth.getUser()
      if (verificationError || !verifiedIdentity.user) {
        await client.auth.signOut({ scope: 'local' })
        throw verificationError ?? new Error('Identity verification failed')
      }

      elements.code.value = ''
      if (authorizationId !== null) {
        window.location.assign(buildConsentPath(authorizationId))
        return
      }

      await connectVerifiedSession(data.session)
    } catch (error) {
      const message = otpVerificationMessage(classifyOtpVerificationError(error))
      elements.code.value = ''
      elements.code.toggleAttribute('aria-invalid', message.field.length > 0)
      elements.codeError.textContent = message.field
      setStatus(elements, 'error', message.status)
      elements.code.focus()
    } finally {
      setLoginPending(false, step)
    }
  }

  const loadRetention = async (connectCachedSession: boolean): Promise<void> => {
    if (options.personalBridge === undefined || personalElements === undefined) return
    retentionReady = false
    retryMode = 'load'
    personalElements.retry.hidden = true
    setStatus(elements, 'neutral', 'Loading your current choice…')
    setLoginPending(true, step)
    const mode = await loadPersonalRetention(options.personalBridge.baseUrl)
    if (mode === null) {
      setStatus(elements, 'error', 'Session renewal is unavailable. Connection is paused.')
      personalElements.retry.hidden = false
      setLoginPending(false, step)
      return
    }
    for (const input of personalElements.retentionInputs) input.checked = input.value === mode
    updateRetentionChoices(personalElements)
    retentionReady = true
    setStatus(elements, 'neutral', '')
    setLoginPending(false, step)
    if (!connectCachedSession) return
    const { data } = await client.auth.getSession()
    if (data.session !== null) {
      setLoginPending(true, 'code')
      try {
        await connectVerifiedSession(data.session)
      } finally {
        setLoginPending(false, step)
      }
    }
  }

  if (disclosureButton !== null && disclosure !== null) {
    disclosureButton.addEventListener('click', () => {
      disclosure.hidden = !disclosure.hidden
      disclosureButton.setAttribute('aria-expanded', String(!disclosure.hidden))
    })
  }

  elements.code.addEventListener('input', () => {
    elements.code.value = elements.code.value.replaceAll(/[^0-9]/gu, '').slice(0, OTP_LENGTH)
    elements.code.removeAttribute('aria-invalid')
    elements.codeError.textContent = ''
  })

  elements.changeEmail.addEventListener('click', () => {
    setLoginPending(true, step)
    void client.auth.signOut({ scope: 'local' })
      .catch(() => undefined)
      .then(() => {
        window.sessionStorage.removeItem(BROWSER_AUTH_STORAGE_KEY)
        resetEmailStep()
        elements.email.focus()
      })
  })

  elements.resendCode.addEventListener('click', () => {
    void sendCode(true)
  })

  if (personalElements !== undefined) {
    for (const input of personalElements.retentionInputs) {
      input.addEventListener('change', () => updateRetentionChoices(personalElements))
    }
    personalElements.retry.addEventListener('click', () => {
      if (personalElements.retry.disabled) return
      if (retryMode === 'load') {
        void loadRetention(true)
        return
      }
      setLoginPending(true, 'code')
      void client.auth.getSession()
        .then(async ({ data }) => {
          if (data.session === null) {
            resetEmailStep()
            setStatus(elements, 'error', 'Your verified session expired. Request a new code.')
            return
          }
          await connectVerifiedSession(data.session)
        })
        .catch(() => {
          setStatus(elements, 'error', 'Your verified session is unavailable. Request a new code.')
          personalElements.retry.hidden = false
        })
        .finally(() => setLoginPending(false, step))
    })
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    setStatus(elements, 'neutral', '')
    void (step === 'email' ? sendCode() : verifyCode())
  })

  if (personalElements !== undefined) void loadRetention(true)
}
