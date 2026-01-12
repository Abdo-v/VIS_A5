export function createTooltip() {
  const el = document.createElement('div')
  el.className = 'tooltip'
  el.style.opacity = '0'
  document.body.appendChild(el)

  function show(html, clientX, clientY) {
    el.innerHTML = html
    el.style.opacity = '1'
    move(clientX, clientY)
  }

  function move(clientX, clientY) {
    const pad = 12
    const { innerWidth, innerHeight } = window

    const rect = el.getBoundingClientRect()
    let left = clientX + pad
    let top = clientY + pad

    if (left + rect.width > innerWidth - pad) left = clientX - rect.width - pad
    if (top + rect.height > innerHeight - pad) top = clientY - rect.height - pad

    el.style.left = `${Math.max(pad, left)}px`
    el.style.top = `${Math.max(pad, top)}px`
  }

  function hide() {
    el.style.opacity = '0'
  }

  return { show, move, hide }
}
