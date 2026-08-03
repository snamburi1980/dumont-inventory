// Theme definitions for Dumont Inventory App
export const THEMES = {
  warm: {
    name: 'Dumont Brand',
    dark:       '#1A4C48',
    caramel:    '#C1683C',
    cream:      '#F6F4ED',
    cardBg:     '#FFFFFF',
    border:     '#E3DDD0',
    greenOk:    '#27AE60',
    redAlert:   '#C53D18',
    amber:      '#E67E22',
    text:       '#1A4C48',
    textMuted:  '#6B7F78',
    tabBg:      '#163F3C',
    headerBg:   '#1A4C48',
    accentText: '#E39C74',
    bodyBg:     '#F1EFE8',
  },
  slate: {
    name: 'Slate Pro',
    dark:       '#1E2A3A',
    caramel:    '#E8C97A',
    cream:      '#F7F8FA',
    cardBg:     '#FFFFFF',
    border:     '#E2E6EC',
    greenOk:    '#1A8A4A',
    redAlert:   '#E74C3C',
    amber:      '#E67E22',
    text:       '#1E2A3A',
    textMuted:  '#8A9AB0',
    tabBg:      '#243040',
    headerBg:   '#1E2A3A',
    accentText: '#E8C97A',
    bodyBg:     '#F0F2F5',
  },
  mint: {
    name: 'Clean Mint',
    dark:       '#1A3D35',
    caramel:    '#7DD4B8',
    cream:      '#F4F9F7',
    cardBg:     '#FFFFFF',
    border:     '#D8EDE7',
    greenOk:    '#1A8060',
    redAlert:   '#E74C3C',
    amber:      '#E67E22',
    text:       '#1A3D35',
    textMuted:  '#6A9E90',
    tabBg:      '#204840',
    headerBg:   '#1A3D35',
    accentText: '#7DD4B8',
    bodyBg:     '#EEF6F3',
  },
}

export function applyTheme(themeKey) {
  const t = THEMES[themeKey] || THEMES.warm
  const root = document.documentElement
  root.style.setProperty('--dark',       t.dark)
  root.style.setProperty('--caramel',    t.caramel)
  root.style.setProperty('--cream',      t.cream)
  root.style.setProperty('--card-bg',    t.cardBg)
  root.style.setProperty('--border',     t.border)
  root.style.setProperty('--green-ok',   t.greenOk)
  root.style.setProperty('--red-alert',  t.redAlert)
  root.style.setProperty('--amber',      t.amber)
  root.style.setProperty('--text',       t.text)
  root.style.setProperty('--text-muted', t.textMuted)
  root.style.setProperty('--tab-bg',     t.tabBg)
  root.style.setProperty('--header-bg',  t.headerBg)
  root.style.setProperty('--accent-text',t.accentText)
  root.style.setProperty('--body-bg',    t.bodyBg)
  document.body.style.background = t.bodyBg
  // Force update header and tab bar background directly
  const headers = document.querySelectorAll('[data-theme-header]')
  headers.forEach(el => el.style.background = t.headerBg)
  const tabbars = document.querySelectorAll('[data-theme-tabbar]')
  tabbars.forEach(el => el.style.background = t.tabBg)
  localStorage.setItem('dumont_theme', themeKey)
}

export function loadSavedTheme() {
  const saved = localStorage.getItem('dumont_theme') || 'warm'
  applyTheme(saved)
  return saved
}
