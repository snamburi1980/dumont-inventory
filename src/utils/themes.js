// Theme definitions for Dumont Inventory App
export const THEMES = {
  warm: {
    name: 'Warm Ivory',
    dark:       '#3D2B1F',
    caramel:    '#D4884A',
    cream:      '#FAF7F2',
    cardBg:     '#FFFFFF',
    border:     '#EAE0D5',
    greenOk:    '#27AE60',
    redAlert:   '#E74C3C',
    amber:      '#E67E22',
    text:       '#3D2B1F',
    textMuted:  '#A08060',
    tabBg:      '#4A3528',
    headerBg:   '#3D2B1F',
    accentText: '#F0C060',
    bodyBg:     '#F5F0EB',
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
  document.body.style.background = t.bodyBg
  localStorage.setItem('dumont_theme', themeKey)
}

export function loadSavedTheme() {
  const saved = localStorage.getItem('dumont_theme') || 'warm'
  applyTheme(saved)
  return saved
}
