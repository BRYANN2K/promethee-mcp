const tabs = [...document.querySelectorAll('[data-view]')];
const screens = [...document.querySelectorAll('[data-screen]')];

function showView(name, focusHeading = true) {
  tabs.forEach((tab) => {
    const selected = tab.dataset.view === name;
    tab.classList.toggle('is-active', selected);
    tab.setAttribute('aria-pressed', String(selected));
  });
  screens.forEach((screen) => screen.classList.toggle('is-visible', screen.dataset.screen === name));
  if (!focusHeading) return;
  const heading = document.querySelector(`[data-screen="${name}"] h1`);
  if (heading instanceof HTMLElement) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

tabs.forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));

const form = document.querySelector('#connection-form');
const email = document.querySelector('#login-email');
const emailError = document.querySelector('#login-email-error');
const code = document.querySelector('#login-code');
const codeError = document.querySelector('#login-code-error');
const codeGroup = document.querySelector('[data-code-group]');
const codeDelivery = document.querySelector('[data-code-delivery]');
const submit = document.querySelector('[data-login-submit]');
const status = document.querySelector('#login-status');
const changeEmail = document.querySelector('[data-change-email]');
const resend = document.querySelector('[data-resend-code]');
const result = document.querySelector('[data-connection-result]');
const connectedCopy = document.querySelector('[data-connected-copy]');
let awaitingCode = false;

function updateRetentionChoices() {
  document.querySelectorAll('.retention-choice').forEach((choice) => {
    const input = choice.querySelector('input');
    const cue = choice.querySelector('em');
    if (!(input instanceof HTMLInputElement) || !(cue instanceof HTMLElement)) return;
    choice.classList.toggle('is-selected', input.checked);
    cue.textContent = input.checked ? 'Selected' : 'Select';
  });
}

function resetEmailStep() {
  awaitingCode = false;
  email.readOnly = false;
  code.value = '';
  codeGroup.hidden = true;
  codeDelivery.hidden = true;
  codeError.textContent = '';
  status.textContent = '';
  submit.disabled = false;
  submit.querySelector('span').textContent = 'Send code';
}

if (
  form instanceof HTMLFormElement && email instanceof HTMLInputElement &&
  emailError instanceof HTMLElement && code instanceof HTMLInputElement &&
  codeError instanceof HTMLElement && codeGroup instanceof HTMLElement &&
  codeDelivery instanceof HTMLElement && submit instanceof HTMLButtonElement &&
  status instanceof HTMLElement && changeEmail instanceof HTMLButtonElement &&
  resend instanceof HTMLButtonElement && result instanceof HTMLElement &&
  connectedCopy instanceof HTMLElement
) {
  form.addEventListener('change', updateRetentionChoices);
  changeEmail.addEventListener('click', () => { resetEmailStep(); email.focus(); });
  resend.addEventListener('click', () => {
    resend.disabled = true;
    status.textContent = 'Design preview · a new code would be sent.';
    window.setTimeout(() => { resend.disabled = false; }, 650);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const emailInvalid = email.value.trim() === '' || !email.validity.valid;
    const codeInvalid = awaitingCode && !/^[0-9]{6}$/.test(code.value);
    email.toggleAttribute('aria-invalid', emailInvalid);
    code.toggleAttribute('aria-invalid', codeInvalid);
    emailError.textContent = emailInvalid ? 'Enter a valid email address.' : '';
    codeError.textContent = codeInvalid ? 'Enter the six-digit code.' : '';
    status.textContent = '';
    if (emailInvalid) { email.focus(); return; }
    if (codeInvalid) { code.focus(); return; }

    submit.disabled = true;
    submit.querySelector('span').textContent = awaitingCode ? 'Connecting…' : 'Sending code…';
    window.setTimeout(() => {
      if (!awaitingCode) {
        awaitingCode = true;
        email.readOnly = true;
        codeDelivery.hidden = false;
        codeGroup.hidden = false;
        submit.disabled = false;
        submit.querySelector('span').textContent = 'Connect';
        status.textContent = 'Design preview · enter any six digits.';
        code.focus();
        return;
      }
      const retention = form.querySelector('input[name="retention"]:checked');
      connectedCopy.textContent = retention?.value === 'memory'
        ? 'This session ends when the server stops.'
        : 'This server can restore your session for up to 7 days.';
      form.hidden = true;
      result.hidden = false;
      result.querySelector('h2')?.focus({ preventScroll: true });
    }, 650);
  });
}

const allow = document.querySelector('[data-consent-allow]');
const deny = document.querySelector('[data-consent-deny]');
const consentResult = document.querySelector('#consent-result');
if (allow instanceof HTMLButtonElement && deny instanceof HTMLButtonElement && consentResult instanceof HTMLElement) {
  allow.addEventListener('click', () => {
    allow.disabled = true;
    deny.disabled = true;
    allow.textContent = 'Allowing…';
    consentResult.textContent = 'Preview only — no authorization request was sent.';
    window.setTimeout(() => { allow.disabled = false; deny.disabled = false; allow.textContent = 'Allow requested access'; }, 800);
  });
  deny.addEventListener('click', () => { consentResult.textContent = 'Request denied. Nothing was shared.'; });
}

showView('connection', false);
resetEmailStep();
updateRetentionChoices();
