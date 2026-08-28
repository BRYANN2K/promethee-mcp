export function productMark(): string {
  return '<span class="product-mark" aria-hidden="true"><i></i><i></i></span>'
}

export function productLockup(): string {
  return `<div class="product-lockup">${productMark()}<span>Promethee <strong>MCP</strong></span></div>`
}

export function trustBoundaryNote(): string {
  return `
    <div class="boundary-note">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 5 6v5c0 4.5 2.8 8.1 7 10 4.2-1.9 7-5.5 7-10V6l-7-3Z"></path>
        <path d="m9.2 12 1.8 1.8 3.9-4"></path>
      </svg>
      <span>
        <strong>Desktop session stays untouched.</strong>
        <small>This page never asks you to copy a Promethee token.</small>
      </span>
    </div>`
}

export function supportFooter(): string {
  return `
    <p class="support-line">
      Like my work? Follow
      <a href="https://x.com/bryann2k_dev" target="_blank" rel="noreferrer">@bryann2k_dev</a> on X.
    </p>`
}
