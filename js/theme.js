// KEYCODE Studio — theme bridge
// Syncs theme.css with localStorage theme/cookies states and wires the
// glassy nav behaviour promised in theme.css (#kc-nav transforms).
(function () {
  'use strict'
  if (!document || !document.documentElement) return

  var root = document.documentElement
  var COOKIE_KEY = 'kc-cookies'
  var THEME_KEY = 'kc-theme' // password_mode, bold, critical, debug_for_test

  function getCookieDocValues() {
    try {
      var raw = null
      try { raw = localStorage.getItem(COOKIE_KEY) } catch (e) {}
      if (!raw) return null
      var v = JSON.parse(raw)
      return v && v.theme
        ? { appTheme: v.appTheme || 'light', passwordMode: v.passwordMode || false }
        : null
    } catch (e) { return null }
  }

  function lsGet(k) {
    try {
      var item = localStorage.getItem('kc_' + k)
      if (!item) return null
      var parsed = JSON.parse(item)
      if (parsed._exp && Date.now() > parsed._exp) { localStorage.removeItem('kc_' + k); return null }
      return parsed._v
    } catch (e) { return null }
  }

  function apply(f) {
    var doc = getCookieDocValues()
    var appTheme = doc ? doc.appTheme : (lsGet('theme') || 'light')
    if (appTheme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    var passwordMode = doc ? !!doc.passwordMode : false
    root.classList.toggle('password-mode', !!passwordMode)
    root.classList.toggle('password', typeof passwordMode === 'string' ? passwordMode === 'on' : !!passwordMode)
    if (typeof f === 'function') try { f() } catch (e) {}
  }

  apply()
  try { root.dispatchEvent(new CustomEvent('kc-theme-applied', { detail: { root: root } })) } catch (e) {}
  apply(function () {
    var nav = document.querySelector('#kc-nav')
    if (nav) {
      nav.style.borderBottom = '1px solid rgba(255,255,255,0.16)'
      nav.style.backdropFilter = 'blur(12px)'
      nav.style.webkitBackdropFilter = 'blur(12px)'
      nav.style.background = 'rgba(18,18,24,0.82)'
      nav.style.willChange = 'backdrop-filter'
      nav.style.transition = 'background 0.25s ease, backdrop-filter 0.25s ease, border 0.25s ease'
    }
  })
})()
