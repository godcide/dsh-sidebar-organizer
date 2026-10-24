// 0.1.5 冒烟测试：在 linkedom 里搭一个缩小的侧栏 DOM，跑 client.js 的关键路径。
// 只验证「不抛异常 + 关键属性标记正确 + 状态机符合预期」，不验证像素效果。
import { parseHTML, CustomEvent } from 'file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/linkedom/esm/index.js'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const HTML = `<!doctype html><html><body>
<div id="root">
 <div class="h_root">
  <nav class="h_panelList" aria-label="全局面板">
    <button class="h_panelRow"><span class="h_panelTitle">插件</span></button>
    <button class="h_panelRow"><span class="h_panelTitle">插件商店</span></button>
    <button class="h_panelRow"><span class="h_panelTitle">自动化任务</span></button>
    <button class="h_panelRow"><span class="h_panelTitle">上下文洞察</span></button>
    <button class="h_panelRow"><span class="h_panelTitle">记忆系统</span></button>
  </nav>
  <div class="h_regionArea"><div>workspaces</div></div>
  <div class="h_footArea">
    <div class="h_footerActions">
      <div data-slot="sidebar.footer.action">
        <div class="dsh-cost-meter-card"><span class="dsh-cost-meter-title">费用计量</span><span>¥0.1234</span></div>
        <div class="dsh-session-kit-sidebar-row"><button aria-label="任务管理">任务管理</button></div>
        <div class="dsh-session-kit-sidebar-row"><button aria-label="归档">归档</button></div>
        <div class="dsh-wt_section"><div class="dsh-wt_x">工作台</div></div>
      </div>
    </div>
    <div class="h_settingsArea"><div>设置</div><div>登录</div></div>
  </div>
 </div>
</div>
</body></html>`

const { window, document } = parseHTML(HTML)

// ---- 补齐 linkedom 缺失的宿主 API ----
const rects = new WeakMap()
function setRect(el, x, y, w, h) {
  rects.set(el, { left: x, top: y, width: w, height: h, right: x + w, bottom: y + h })
}
window.Element.prototype.getBoundingClientRect = function () {
  return rects.get(this) || { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }
}
Object.defineProperty(window.Element.prototype, 'offsetHeight', {
  get() { return (rects.get(this) || {}).height || 0 }
})
Object.defineProperty(window.Element.prototype, 'offsetWidth', {
  get() { return (rects.get(this) || {}).width || 0 }
})
window.Element.prototype.contains = window.Element.prototype.contains || function (n) {
  let p = n
  while (p) { if (p === this) return true; p = p.parentNode }
  return false
}
if (!window.Element.prototype.closest) {
  window.Element.prototype.closest = function (sel) {
    let n = this
    while (n && n.nodeType === 1) { if (n.matches(sel)) return n; n = n.parentNode }
    return null
  }
}
// 自定义属性样式：linkedom 的 style 不保证支持 setProperty / 任意属性赋值
const styleMaps = new WeakMap()
const kebab = (p) => (p.startsWith('--') ? p : p.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()))
function styleApi(el) {
  let map = styleMaps.get(el)
  if (map) return map
  const store = new Map()
  const api = {
    setProperty(k, v) { store.set(k, String(v)) },
    removeProperty(k) { store.delete(k) },
    getPropertyValue(k) { return store.get(k) || '' }
  }
  map = new Proxy(api, {
    get(t, p) {
      if (p === 'cssText') return store.get('cssText') || ''
      if (typeof p !== 'string') return t[p]
      if (p in t) return t[p]
      return store.get(kebab(p)) || ''
    },
    set(t, p, v) {
      if (p === 'cssText') { store.set('cssText', String(v)); return true }
      store.set(kebab(String(p)), String(v))
      return true
    }
  })
  styleMaps.set(el, map)
  return map
}
Object.defineProperty(window.Element.prototype, 'style', {
  get() { return styleApi(this) },
  configurable: true
})
window.HTMLElement.prototype.scrollTop = 0
window.HTMLElement.prototype.scrollHeight = 0
window.HTMLElement.prototype.clientHeight = 0
const store = new Map()
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
}
Object.defineProperty(window, 'localStorage', { value: localStorage, configurable: true })
window.innerWidth = 1440
window.innerHeight = 900
window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
window.setTimeout = setTimeout
window.setInterval = setInterval
window.clearInterval = clearInterval
window.MutationObserver = class { observe() {} disconnect() {} }
window.__dsoDispose = undefined

// 宿主尺寸：侧栏 240 宽，nav/settings 的父节点即根
const root = document.querySelector('.h_root')
setRect(root, 0, 0, 240, 900)
const nav = document.querySelector('nav')
setRect(nav, 8, 100, 224, 200)
const rowEls = [...nav.children]
rowEls.forEach((r, i) => setRect(r, 8, 100 + i * 36, 224, 36))
const fa = document.querySelector('.h_footerActions')
const anchor = document.querySelector('[data-slot]')
setRect(fa, 8, 600, 224, 200)
setRect(anchor, 8, 600, 224, 200)
const bottomRows = [...anchor.children]
bottomRows.forEach((r, i) => setRect(r, 8, 600 + i * 40, 224, 40))
const sa = document.querySelector('.h_settingsArea')
setRect(sa, 8, 800, 224, 60)
const footArea = document.querySelector('.h_footArea')
setRect(footArea, 0, 600, 240, 260)

function mkMouse(type, extra) {
  const e = new CustomEvent(type, { bubbles: !!(extra && extra.bubbles), cancelable: !!(extra && extra.cancelable) })
  e.clientX = (extra && extra.clientX) || 0
  e.clientY = (extra && extra.clientY) || 0
  e.button = (extra && extra.button) || 0
  e.altKey = !!(extra && extra.altKey)
  e.preventDefault = () => {}
  e.stopPropagation = () => {}
  return e
}

globalThis.window = window
globalThis.document = document
globalThis.MutationObserver = window.MutationObserver

const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
let applied = null
const sandboxWindow = Object.assign(Object.create(window), {
  __ModuleLoader__: {
    load: ({ factory }) => {
      const mod = factory(() => ({}))
      applied = mod.apply
    }
  }
})
globalThis.window = sandboxWindow
// linkedom 的 window 不能直接赋 addEventListener（setter 会找内部 EVENT_TARGET），
// 所以拖拽/尺寸变化用的小事件总线自己实现一份。
const winListeners = new Map()
Object.defineProperty(sandboxWindow, 'addEventListener', {
  value: (type, fn) => {
    if (!winListeners.has(type)) winListeners.set(type, [])
    winListeners.get(type).push(fn)
  },
  configurable: true
})
Object.defineProperty(sandboxWindow, 'removeEventListener', {
  value: (type, fn) => {
    const arr = winListeners.get(type) || []
    const i = arr.indexOf(fn)
    if (i !== -1) arr.splice(i, 1)
  },
  configurable: true
})
function fireWin(type, ev) {
  for (const fn of [...(winListeners.get(type) || [])]) fn(ev)
}
const ctx = vm.createContext({
  window: sandboxWindow,
  document,
  MutationObserver: window.MutationObserver,
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  require: () => ({})
})
vm.runInContext(code, ctx, { filename: 'client.js' })

const results = []
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra })
}
const text = (n) => (n ? n.textContent : '')
const hideOf = (node) => node.getAttribute('data-dso-hide')
const chipOf = (line, kind) => line.querySelector(`[data-dso-check][data-dso-kind='${kind}']`)
const flip = (box, on) => {
  box.checked = on
  box.dispatchEvent(new CustomEvent('change', { bubbles: true }))
}

applied({})

// ---------- 折叠条基础 ----------
const topBar = document.querySelector("[data-dso-bar='top']")
const bottomBar = document.querySelector("[data-dso-bar='bottom']")
check('顶部折叠条已插入到 nav 之前', topBar && topBar.nextElementSibling === nav)
check('顶部默认折叠：nav 标记 data-dso-collapsed', nav.getAttribute('data-dso-collapsed') === '1')
check('顶部条默认名 = 导航面板', text(topBar.querySelector('[data-dso-bar-label]')) === '导航面板')
check('顶部条计数 = 5', text(topBar.querySelector('[data-dso-count]')) === '5')
check('未超出阈值时不显示滚动标记', topBar.querySelector('[data-dso-scrollmark]').getAttribute('data-dso-gone') === '1')

check('底部折叠条插在 footArea 内、footerActions 之前',
  bottomBar && bottomBar.parentNode === footArea && bottomBar.nextElementSibling === fa)
check('登录所在 settingsArea 未被加任何标记',
  sa.getAttribute('data-dso-hide') === null && sa.getAttribute('data-dso-scroll') === null)
check('底部默认折叠：4 行全隐藏', bottomRows.every((r) => hideOf(r) === '1'))
check('底部条默认名 = 快捷面板', text(bottomBar.querySelector('[data-dso-bar-label]')) === '快捷面板')
check('底部条计数 = 4', text(bottomBar.querySelector('[data-dso-count]')) === '4')

bottomBar.dispatchEvent(mkMouse('click', { bubbles: true }))
check('展开底部后不再隐藏任何行', bottomRows.every((r) => hideOf(r) === null))
bottomBar.dispatchEvent(mkMouse('click', { bubbles: true }))

// ---------- 主设置面板 ----------
const gear = topBar.querySelector('[data-dso-gear]')
gear.dispatchEvent(mkMouse('click', { bubbles: true, cancelable: true }))
const mainPanel = document.querySelector("[data-dso-panel='1']")
check('齿轮打开主设置面板', !!mainPanel)

const nameInputs = mainPanel ? [...mainPanel.querySelectorAll("input[type='text']")] : []
check('主面板有上下两个名称输入框', nameInputs.length === 2, nameInputs.length)
const entry = mainPanel && mainPanel.querySelector('[data-dso-entry]')
check('二级入口是按钮（data-dso-entry），不再是行内小字', !!entry && entry.tagName.toLowerCase() === 'button')

if (nameInputs.length === 2) {
  nameInputs[0].value = '导航区'
  nameInputs[0].dispatchEvent(new CustomEvent('input', { bubbles: true }))
  nameInputs[1].value = '底栏'
  nameInputs[1].dispatchEvent(new CustomEvent('input', { bubbles: true }))
  check('自定义顶部名称生效', text(topBar.querySelector('[data-dso-bar-label]')) === '导航区')
  check('自定义底部名称生效', text(bottomBar.querySelector('[data-dso-bar-label]')) === '底栏')
  nameInputs[0].value = ''
  nameInputs[0].dispatchEvent(new CustomEvent('input', { bubbles: true }))
  check('清空名称回落到默认名', text(topBar.querySelector('[data-dso-bar-label]')) === '导航面板')
}

// ---------- 二级弹窗 ----------
entry.dispatchEvent(mkMouse('click', { bubbles: true, cancelable: true }))
const ex = document.querySelector("[data-dso-panel='2']")
check('二级弹窗打开', !!ex)
const items = ex ? [...ex.querySelectorAll('[data-dso-item]')] : []
check('二级弹窗列出 5 顶部 + 4 底部 = 9 条', items.length === 9, items.length)
const labels = items.map((i) => text(i.querySelector('[data-dso-item-label]')))
check('顶部条目名字正确', labels.slice(0, 5).join(',') === '插件,插件商店,自动化任务,上下文洞察,记忆系统', labels.slice(0, 5).join('|'))
check('底部条目名字取自 aria-label / 标题',
  labels.slice(5).join(',') === '费用计量,任务管理,归档,工作台', labels.slice(5).join('|'))
check('分区标题跟随自定义名', text(ex.querySelector('[data-dso-sect]')).endsWith('导航面板'), text(ex.querySelector('[data-dso-sect]')))

// ---------- 保持显示 = 折叠除外 ----------
const costLine = items[5]
const costKeep = chipOf(costLine, 'keep').querySelector('input')
flip(costKeep, true)
check('例外名单里的费用计量折叠后仍显示', hideOf(bottomRows[0]) === null)
check('其余行照常折叠', hideOf(bottomRows[3]) === '1')

// ---------- 悬浮：自动带上保持显示 ----------
const wtLine = items[8]
const wtFloat = chipOf(wtLine, 'float').querySelector('input')
const wtKeep = chipOf(wtLine, 'keep').querySelector('input')
flip(wtFloat, true)
const wt = bottomRows[3]
check('悬浮标记已打到工作台行', wt.getAttribute('data-dso-float') === '1')
check('悬浮坐标已写入', (wt.style.getPropertyValue('--dso-x') || '').endsWith('px'))
check('勾悬浮后“保持显示”自动点亮', wtKeep.checked === true && chipOf(wtLine, 'keep').getAttribute('data-dso-on') === '1')
check('悬浮行折叠时可见', hideOf(wt) === null)

// ---------- 关键回归：取消保持显示 = 把浮窗收起来 ----------
flip(wtKeep, false)
check('悬浮条目取消保持显示后折叠即隐藏', hideOf(wt) === '1')
check('隐藏时仍留在悬浮名单（data-dso-float 仍在）', wt.getAttribute('data-dso-float') === '1')
flip(wtKeep, true)
check('重新勾保持显示后浮窗立刻回来', hideOf(wt) === null)

// ---------- 拖动，记下坐标 ----------
const beforeDrag = wt.style.getPropertyValue('--dso-x')
const baseRect = wt.getBoundingClientRect()
wt.dispatchEvent(mkMouse('mousedown', { bubbles: true, altKey: true, clientX: 400, clientY: 300 }))
fireWin('mousemove', mkMouse('mousemove', { clientX: 460, clientY: 340 }))
fireWin('mouseup', mkMouse('mouseup', {}))
const afterDrag = wt.style.getPropertyValue('--dso-x')
const afterDragY = wt.style.getPropertyValue('--dso-y')
check('Alt 拖动改变了浮窗横坐标', afterDrag !== beforeDrag, `${beforeDrag} -> ${afterDrag}`)
check('拖动结果符合位移（+60）', afterDrag === `${Math.round(baseRect.left + 60)}px`, afterDrag)

// ---------- 取消悬浮 → 回侧栏 ----------
flip(wtFloat, false)
check('取消悬浮后回到侧栏（无 data-dso-float）', wt.getAttribute('data-dso-float') === null)
check('取消悬浮后仍在侧栏可见（保持显示还在）', hideOf(wt) === null)
check('取消悬浮后清掉了坐标样式', (wt.style.getPropertyValue('--dso-x') || '') === '')

// ---------- 再次悬浮 → 历史位置重现 ----------
flip(wtFloat, true)
check('再次悬浮在历史位置重现', wt.style.getPropertyValue('--dso-x') === afterDrag, `${afterDrag} vs ${wt.style.getPropertyValue('--dso-x')}`)
check('纵坐标同样保持', wt.style.getPropertyValue('--dso-y') === afterDragY, `${afterDragY} vs ${wt.style.getPropertyValue('--dso-y')}`)

// ---------- 重叠告警 ----------
const costFloat = chipOf(costLine, 'float').querySelector('input')
flip(costFloat, true)
check('两块悬浮窗都在', document.querySelectorAll("[data-dso-float='1']").length === 2)
setRect(bottomRows[0], 100, 100, 320, 200)
setRect(bottomRows[3], 300, 200, 320, 200)
topBar.dispatchEvent(mkMouse('click', { bubbles: true })) // 触发 applyAll
topBar.dispatchEvent(mkMouse('click', { bubbles: true }))
const overlaps = [...document.querySelectorAll("[data-dso-float='1']")].filter((n) => n.getAttribute('data-dso-overlap') === '1')
check('两块悬浮窗重叠时双方都标记 data-dso-overlap', overlaps.length === 2, overlaps.length)

// ---------- Alt 提示 ----------
setRect(bottomRows[3], 300, 200, 320, 200)
bottomRows[3].dispatchEvent(mkMouse('mouseenter'))
const hint = document.querySelector('[data-dso-hint]')
check('移入悬浮窗出现 Alt 拖动提示', hint && hint.getAttribute('data-dso-show') === '1')
check('提示文案', hint && text(hint) === 'Alt 拖动', hint && text(hint))
check('提示贴在浮窗下方', hint && hint.style.getPropertyValue('top') === '405px' && hint.style.getPropertyValue('left') === '310px',
  hint && hint.style.getPropertyValue('top') + '/' + hint.style.getPropertyValue('left'))
bottomRows[3].dispatchEvent(mkMouse('mouseleave'))
check('移出后提示收起', hint && hint.getAttribute('data-dso-show') === null)

// ---------- 状态持久化 ----------
const saved = JSON.parse(store.get('dsh-sidebar-organizer:v3') || '{}')
check('名称与例外/悬浮名单已落盘',
  typeof saved.bottomLabel === 'string' &&
    saved.floatKeys.length === 2 &&
    saved.bottomExcept.indexOf('bottom:dsh-wt') !== -1 &&
    saved.bottomExcept.indexOf('bottom:dsh-cost-meter-card') !== -1,
  JSON.stringify({ floats: saved.floatKeys, except: saved.bottomExcept }))
check('保留历史悬浮坐标', !!saved.floatPos['bottom:dsh-wt'], JSON.stringify(saved.floatPos))

// ---------- 0.1.7：顶栏去掉工作台专属悬浮按钮 ----------
check('顶栏没有工作台专属悬浮按钮', topBar.querySelector('[data-dso-float-toggle]') === null)
check('二级弹窗不再用「导航」标签糊住顶部条目',
  [...ex.querySelectorAll('[data-dso-item-tag]')].every((t) => text(t) !== '导航'),
  [...ex.querySelectorAll('[data-dso-item-tag]')].map(text).join('|'))
check('顶部区块有说明文字', !!ex.querySelector('[data-dso-sect-note]'))

// ---------- 0.1.7：拖动排序 ----------
;[...ex.querySelectorAll("[data-dso-check][data-dso-kind='float'] input")].forEach((b) => {
  if (b.checked) flip(b, false)
})
check('全部取消悬浮后没有浮窗', document.querySelectorAll('[data-dso-float="1"]').length === 0)

const bottomLines = () => [...ex.querySelectorAll("[data-dso-item][data-dso-item-side='bottom']")]
const keyOf = (l) => l.getAttribute('data-dso-item-key')
const seqBefore = bottomLines().map(keyOf)
const dragLine = bottomLines()[0]
const grip = dragLine.querySelector('[data-dso-grip]')
check('非悬浮条目有可用抓手', !!grip && grip.getAttribute('data-dso-off') !== '1')
grip.dispatchEvent(mkMouse('mousedown', { bubbles: true, cancelable: true, button: 0 }))
fireWin('mousemove', mkMouse('mousemove', { clientX: 0, clientY: 400 }))
fireWin('mouseup', mkMouse('mouseup', {}))
const seqAfter = bottomLines().map(keyOf)
check('拖动把第一条移到了末尾',
  seqAfter.length === seqBefore.length && seqAfter[seqAfter.length - 1] === seqBefore[0],
  seqBefore.join('|') + ' -> ' + seqAfter.join('|'))

const savedOrder = JSON.parse(store.get('dsh-sidebar-organizer:v3') || '{}').bottomOrder || []
check('新顺序已落盘', savedOrder.join(',') === seqAfter.join(','), savedOrder.join('|'))

const ordOf = (r) => r.getAttribute('data-dso-ord')
check('侧栏行按新顺序打了 order 标记',
  ordOf(bottomRows[1]) === '0' && ordOf(bottomRows[2]) === '1' &&
    ordOf(bottomRows[3]) === '2' && ordOf(bottomRows[0]) === '3',
  bottomRows.map(ordOf).join('|'))

// 重新悬浮工作台：它必须沉到最下方，且抓手不可拖
const wtLine2 = bottomLines().find((l) => l.getAttribute('data-dso-item-key') === 'bottom:dsh-wt')
const wtFloat2 = chipOf(wtLine2, 'float').querySelector('input')
flip(wtFloat2, true)
check('悬浮行抓手被禁用（不参与排序）', wtLine2.querySelector('[data-dso-grip]').getAttribute('data-dso-off') === '1')
check('悬浮行带「悬浮中」标记',
  text(wtLine2.querySelector("[data-dso-tag='float']") || { textContent: '' }) === '悬浮中')
check('悬浮条目排在区域最后',
  bottomLines()[bottomLines().length - 1].getAttribute('data-dso-item-key') === 'bottom:dsh-wt')
check('侧栏里悬浮行的 order 最大', ordOf(bottomRows[3]) === '3', bottomRows.map(ordOf).join('|'))

// ---------- 0.1.8：容器不是 flex 时退回 DOM 排序 ----------
// 此时 order 标记是 [2|0|1|3]（cost=2、kit=0、kit#2=1、wt=3），
// 让 getComputedStyle 谎报「block/row/order 0」，走兜底路径。
sandboxWindow.getComputedStyle = () => ({ display: 'block', flexDirection: 'row', order: '0' })
bottomBar.dispatchEvent(mkMouse('click', { bubbles: true }))
bottomBar.dispatchEvent(mkMouse('click', { bubbles: true }))
const domOrder = [...anchor.children].map((r) => bottomRows.indexOf(r))
check('order 失效时退回 DOM 排序，实际子节点顺序与 order 标记一致',
  domOrder.join(',') === '1,2,0,3',
  domOrder.join('|'))

// ---------- 0.1.9 ----------
// 恢复一个“正常”的 computedStyle（上一段故意谎报 block/row）
sandboxWindow.getComputedStyle = (n) => ({
  display: 'flex',
  flexDirection: 'column',
  order: (n && n.getAttribute && n.getAttribute('data-dso-ord')) || '0'
})
const poke = () => {
  const b = document.querySelector("[data-dso-bar='bottom']")
  if (!b) return
  b.dispatchEvent(mkMouse('click', { bubbles: true }))
  b.dispatchEvent(mkMouse('click', { bubbles: true }))
}
const reopen = () => {
  const e = document.querySelector('[data-dso-entry]')
  if (!e) return document.querySelector("[data-dso-panel='2']")
  if (document.querySelector("[data-dso-panel='2']")) e.dispatchEvent(mkMouse('click', { bubbles: true, cancelable: true }))
  e.dispatchEvent(mkMouse('click', { bubbles: true, cancelable: true }))
  return document.querySelector("[data-dso-panel='2']")
}
poke()

// settingsArea 永不参与排序 / 折叠 / 悬浮
check('settingsArea 永不参与排序与折叠',
  sa.getAttribute('data-dso-ord') === null &&
    sa.getAttribute('data-dso-ordbox') === null &&
    sa.getAttribute('data-dso-bottombox') === null &&
    sa.getAttribute('data-dso-hide') === null &&
    sa.getAttribute('data-dso-float') === null,
  [sa.getAttribute('data-dso-ord'), sa.getAttribute('data-dso-hide')].join('/'))
check('footArea 本身不被当成排序容器', footArea.getAttribute('data-dso-ordbox') === null)

// 复合条目：把费用计量卡片内部两行摆成上下两行
const costCard = bottomRows[0]
const ccKids = [...costCard.children]
setRect(ccKids[0], 8, 600, 200, 20)
setRect(ccKids[1], 8, 620, 200, 20)
let ex2 = reopen()
let costLine2 = [...ex2.querySelectorAll('[data-dso-item]')].find(
  (l) => l.getAttribute('data-dso-item-key') === 'bottom:dsh-cost-meter-card'
)
check('复合条目显示「复合 · 2 行」标签',
  text(costLine2.querySelector("[data-dso-tag='multi']")) === '复合 · 2 行',
  text(costLine2.querySelector("[data-dso-tag='multi']")))
check('单行条目不出现摘要胶囊', !chipOf(items[6], 'summary'))

// 摘要：折叠时只留选定行
const sumBox = chipOf(costLine2, 'summary').querySelector('input')
flip(sumBox, true)
let savedNow = JSON.parse(store.get('dsh-sidebar-organizer:v3') || '{}')
check('摘要状态已落盘', (savedNow.summaryKeys || []).indexOf('bottom:dsh-cost-meter-card') !== -1)
check('摘要条目折叠后不整条隐藏', hideOf(costCard) === null)
check('摘要默认只留第一行',
  ccKids[0].getAttribute('data-dso-vshow') === '1' && ccKids[1].getAttribute('data-dso-vshow') === '0',
  [ccKids[0].getAttribute('data-dso-vshow'), ccKids[1].getAttribute('data-dso-vshow')].join('|'))

const sumOptsOf = () => [...costLine2.querySelectorAll('[data-dso-sumrow] [data-dso-sumopt]')]
let sumOpts = sumOptsOf()
check('摘要内容以复选列出两行', sumOpts.length === 2, sumOpts.length)
check('默认只勾第 1 行',
  sumOpts[0].querySelector('input').checked === true &&
    sumOpts[1].querySelector('input').checked === false,
  sumOpts.map((o) => o.querySelector('input').checked).join('|'))
check('只剩一行被勾时它不可取消',
  sumOpts[0].querySelector('input').getAttribute('disabled') !== null,
  sumOpts[0].querySelector('input').getAttribute('disabled'))
check('摘要头部显示已选/总数',
  text(costLine2.querySelector('[data-dso-sumcount]')) === '1 / 2',
  text(costLine2.querySelector('[data-dso-sumcount]')))

// 勾上第 2 行 → 两行都留着
flip(sumOpts[1].querySelector('input'), true)
check('勾选第 2 行后两行都显示',
  ccKids[0].getAttribute('data-dso-vshow') === '1' && ccKids[1].getAttribute('data-dso-vshow') === '1',
  [ccKids[0].getAttribute('data-dso-vshow'), ccKids[1].getAttribute('data-dso-vshow')].join('|'))
check('两行都勾时都可取消',
  sumOptsOf()[0].querySelector('input').getAttribute('disabled') === null)

// 再取消第 1 行 → 只剩第 2 行
flip(sumOptsOf()[0].querySelector('input'), false)
check('取消第 1 行后只留第 2 行',
  ccKids[0].getAttribute('data-dso-vshow') === '0' && ccKids[1].getAttribute('data-dso-vshow') === '1',
  [ccKids[0].getAttribute('data-dso-vshow'), ccKids[1].getAttribute('data-dso-vshow')].join('|'))
check('取消第 1 行后它让出「唯一勾选」的禁用态',
  sumOptsOf()[1].querySelector('input').getAttribute('disabled') !== null &&
    sumOptsOf()[0].querySelector('input').getAttribute('disabled') === null)
savedNow = JSON.parse(store.get('dsh-sidebar-organizer:v3') || '{}')
check('多选结果按行号升序落盘',
  JSON.stringify((savedNow.summaryRows || {})['bottom:dsh-cost-meter-card']) === '[1]',
  JSON.stringify((savedNow.summaryRows || {})['bottom:dsh-cost-meter-card']))

// 「显示」与「摘要」互斥
const costKeep2 = chipOf(costLine2, 'keep').querySelector('input')
flip(costKeep2, true)
savedNow = JSON.parse(store.get('dsh-sidebar-organizer:v3') || '{}')
check('勾「显示」自动取消摘要',
  (savedNow.summaryKeys || []).indexOf('bottom:dsh-cost-meter-card') === -1 &&
    (savedNow.bottomExcept || []).indexOf('bottom:dsh-cost-meter-card') !== -1)
check('取消摘要后行内标记清空',
  ccKids[0].getAttribute('data-dso-vshow') === null && ccKids[1].getAttribute('data-dso-vshow') === null)
check('取消摘要后摘要行下拉消失', !costLine2.querySelector('[data-dso-sumrow]'))

// 摘要不支持悬浮：先悬浮再切摘要 → 浮窗被收回（坐标保留）
const costFloat2 = chipOf(costLine2, 'float').querySelector('input')
flip(costFloat2, true)
poke()
check('悬浮后该行带 data-dso-float', costCard.getAttribute('data-dso-float') === '1')
flip(chipOf(costLine2, 'summary').querySelector('input'), true)
savedNow = JSON.parse(store.get('dsh-sidebar-organizer:v3') || '{}')
check('切到摘要自动取消悬浮',
  (savedNow.floatKeys || []).indexOf('bottom:dsh-cost-meter-card') === -1 &&
    (savedNow.summaryKeys || []).indexOf('bottom:dsh-cost-meter-card') !== -1 &&
    costCard.getAttribute('data-dso-float') === null)
check('取消悬浮后摘要按上次选的行动作',
  ccKids[0].getAttribute('data-dso-vshow') === '0' && ccKids[1].getAttribute('data-dso-vshow') === '1',
  [ccKids[0].getAttribute('data-dso-vshow'), ccKids[1].getAttribute('data-dso-vshow')].join('|'))
check('摘要模式下悬浮胶囊置灰',
  chipOf(costLine2, 'float').getAttribute('data-dso-off') === '1' &&
    chipOf(costLine2, 'float').querySelector('input').disabled === true)

// ---------- 0.2.0：取消摘要回到「勾选摘要之前」的状态 ----------
const savedState = () => JSON.parse(store.get('dsh-sidebar-organizer:v3') || '{}')
const has = (arr, k) => (arr || []).indexOf(k) !== -1
const costKey = 'bottom:dsh-cost-meter-card'

// 场景 B：进来前是 ✔显示 + ✔悬浮（上面正是这个路径：先悬浮、再切摘要）
flip(chipOf(costLine2, 'summary').querySelector('input'), false)
poke()
let sB = savedState()
check('取消摘要还原「悬浮」状态（浮窗回来）',
  has(sB.floatKeys, costKey) && has(sB.bottomExcept, costKey) && !has(sB.summaryKeys, costKey),
  JSON.stringify({ f: sB.floatKeys, k: sB.bottomExcept, s: sB.summaryKeys }))
check('取消摘要后浮窗真的回到侧栏渲染层', costCard.getAttribute('data-dso-float') === '1',
  costCard.getAttribute('data-dso-float'))
check('取消摘要后行内丢弃摘要标记',
  costCard.getAttribute('data-dso-summary') === null &&
    ccKids.every((k) => k.getAttribute('data-dso-vshow') === null))

// 场景 A：进来前是 ✔显示、不悬浮
flip(chipOf(costLine2, 'float').querySelector('input'), false)
poke()
flip(chipOf(costLine2, 'summary').querySelector('input'), true)
poke()
check('进入摘要时「显示」让位给「摘要」', !has(savedState().bottomExcept, costKey) && has(savedState().summaryKeys, costKey))
flip(chipOf(costLine2, 'summary').querySelector('input'), false)
poke()
const sA = savedState()
check('取消摘要还原「显示」状态（不是三样全不勾）',
  has(sA.bottomExcept, costKey) && !has(sA.summaryKeys, costKey) && !has(sA.floatKeys, costKey),
  JSON.stringify({ k: sA.bottomExcept, s: sA.summaryKeys, f: sA.floatKeys }))
check('还原后侧栏里这条不再被隐藏', hideOf(costCard) === null)

// 场景 C：三者全不勾（隐藏态）→ 取消摘要后仍然隐藏
flip(chipOf(costLine2, 'keep').querySelector('input'), false)
poke()
flip(chipOf(costLine2, 'summary').querySelector('input'), true)
poke()
flip(chipOf(costLine2, 'summary').querySelector('input'), false)
poke()
const sC = savedState()
check('隐藏态进来的，取消摘要后仍然隐藏',
  !has(sC.bottomExcept, costKey) && !has(sC.summaryKeys, costKey) && !has(sC.floatKeys, costKey),
  JSON.stringify({ k: sC.bottomExcept, s: sC.summaryKeys }))

// ---------- 0.2.0：多层包装的复合条目也能拆出每一行 ----------
// root > 外壳 > body > [行1, 行2, 行3]：只看第一层会永远只有 1 行（＝只抓到首行）
const nest = document.createElement('div')
nest.className = 'dsh-plugin-nested'
nest.innerHTML =
  '<div class="nest-wrap"><div class="nest-body">' +
  '<div class="nest-r1">今日 ¥1.00</div><div class="nest-r2">余额 ¥2.00</div><div class="nest-r3">重置 10:00</div>' +
  '</div></div>'
anchor.appendChild(nest)
setRect(nest, 8, 840, 200, 60)
const nestWrap = nest.children[0]
const nestBody = nestWrap.children[0]
const nestRows = [...nestBody.children]
setRect(nestWrap, 8, 840, 200, 60)
setRect(nestBody, 8, 840, 200, 60)
nestRows.forEach((n, i) => setRect(n, 8, 840 + i * 20, 200, 20))
poke()

const ex4 = reopen()
const nestLine = [...ex4.querySelectorAll('[data-dso-item]')].find(
  (l) => (l.getAttribute('data-dso-item-key') || '').indexOf('dsh-plugin-nested') >= 0
)
check('多层包装的条目被识别为复合条目', !!nestLine && text(nestLine.querySelector("[data-dso-tag='multi']")) === '复合 · 3 行',
  nestLine && text(nestLine.querySelector("[data-dso-tag='multi']")))
check('胶囊装在 [data-dso-chips] 容器里（三栏网格第 3 栏）',
  !!nestLine && !!nestLine.querySelector('[data-dso-chips]') &&
    nestLine.querySelector('[data-dso-chips]').querySelectorAll('[data-dso-check]').length >= 2)

const nestSumChip = nestLine && chipOf(nestLine, 'summary')
check('多层包装条目也有「摘要」胶囊', !!nestSumChip)
if (nestSumChip) {
  flip(nestSumChip.querySelector('input'), true)
  poke()
  check('嵌套条目摘要默认留第 1 行',
    nestRows[0].getAttribute('data-dso-vshow') === '1' &&
      nestRows[1].getAttribute('data-dso-vshow') === '0' &&
      nestRows[2].getAttribute('data-dso-vshow') === '0',
    nestRows.map((n) => n.getAttribute('data-dso-vshow')).join('|'))

  const nestOptsOf = () => [...nestLine.querySelectorAll('[data-dso-sumrow] [data-dso-sumopt]')]
  const nestOpts = nestOptsOf()
  check('摘要内容列出 3 行（不再只有首行）', nestOpts.length === 3, nestOpts.length)
  check('三个选项的文字各不相同',
    new Set(nestOpts.map((o) => text(o.querySelector('[data-dso-sumtext]')))).size === nestOpts.length,
    nestOpts.map((o) => text(o.querySelector('[data-dso-sumtext]'))).join(' / '))

  // 多选：勾第 3 行 + 第 1 行，只留这两行
  flip(nestOptsOf()[2].querySelector('input'), true)
  check('勾第 1 行与第 3 行后只留这两行',
    nestRows[0].getAttribute('data-dso-vshow') === '1' &&
      nestRows[1].getAttribute('data-dso-vshow') === '0' &&
      nestRows[2].getAttribute('data-dso-vshow') === '1',
    nestRows.map((n) => n.getAttribute('data-dso-vshow')).join('|'))

  // 取消第 1 行 → 只剩第 3 行（此时第 3 行是唯一勾选，被禁用）
  flip(nestOptsOf()[0].querySelector('input'), false)
  check('取消第 1 行后只剩第 3 行',
    nestRows[0].getAttribute('data-dso-vshow') === '0' &&
      nestRows[1].getAttribute('data-dso-vshow') === '0' &&
      nestRows[2].getAttribute('data-dso-vshow') === '1',
    nestRows.map((n) => n.getAttribute('data-dso-vshow')).join('|'))
  check('唯一勾选的行被禁用（不能取消到一行都不留）',
    nestOptsOf()[2].querySelector('input').getAttribute('disabled') !== null)

  // 勾第 2 行，再取消第 3 行 → 只留中间一行
  flip(nestOptsOf()[1].querySelector('input'), true)
  check('勾第 2 行后第 2、3 行都在',
    nestRows[0].getAttribute('data-dso-vshow') === '0' &&
      nestRows[1].getAttribute('data-dso-vshow') === '1' &&
      nestRows[2].getAttribute('data-dso-vshow') === '1',
    nestRows.map((n) => n.getAttribute('data-dso-vshow')).join('|'))
  flip(nestOptsOf()[2].querySelector('input'), false)
  check('只勾第 2 行时只显示第 2 行',
    nestRows[0].getAttribute('data-dso-vshow') === '0' &&
      nestRows[1].getAttribute('data-dso-vshow') === '1' &&
      nestRows[2].getAttribute('data-dso-vshow') === '0',
    nestRows.map((n) => n.getAttribute('data-dso-vshow')).join('|'))
  flip(nestSumChip.querySelector('input'), false)
  poke()
}

// display:contents 的插槽外壳：自身 0×0（没有盒子），行都在它里面
const cont = document.createElement('div')
cont.className = 'dsh-plugin-contents'
cont.innerHTML =
  '<div class="c-slot"><div class="c-r1">配额 ¥1.00</div><div class="c-r2">到期 10:00</div></div>'
anchor.appendChild(cont)
const cSlot = cont.children[0]
const cRows = [...cSlot.children]
setRect(cont, 8, 880, 0, 0)
setRect(cSlot, 8, 880, 0, 0)
cRows.forEach((n, i) => setRect(n, 8, 880 + i * 20, 200, 20))
poke()

const ex5 = reopen()
const contLine = [...ex5.querySelectorAll('[data-dso-item]')].find(
  (l) => (l.getAttribute('data-dso-item-key') || '').indexOf('dsh-plugin-contents') >= 0
)
check('display:contents 外壳里的行能提上来（2 行）',
  !!contLine && text(contLine.querySelector("[data-dso-tag='multi']")) === '复合 · 2 行',
  contLine && text(contLine.querySelector("[data-dso-tag='multi']")))
const contChip = contLine && chipOf(contLine, 'summary')
if (contChip) {
  flip(contChip.querySelector('input'), true)
  poke()
  check('contents 条目里摘要落在正确的那一行',
    cRows[0].getAttribute('data-dso-vshow') === '1' && cRows[1].getAttribute('data-dso-vshow') === '0',
    cRows.map((n) => n.getAttribute('data-dso-vshow')).join('|'))
  flip(contChip.querySelector('input'), false)
  poke()
}
anchor.removeChild(cont)
poke()

anchor.removeChild(nest)
poke()

// ---------- 0.2.2：条形图 / 饼图 / 统计图必须整块保留 ----------
// A. SVG 画的条形图：独立成块，算 1 行，扇区/柱子绝不被拆
const svgBar = document.createElement('div')
svgBar.className = 'dsh-plugin-svgbar'
svgBar.innerHTML =
  '<div class="sb-text">今日 ¥3.20</div>' +
  '<div class="sb-chart"><svg class="sb-svg"><rect class="sb1"></rect><rect class="sb2"></rect>' +
  '<rect class="sb3"></rect><rect class="sb4"></rect></svg></div>'
anchor.appendChild(svgBar)
const sbText = svgBar.children[0]
const sbChart = svgBar.children[1]
const sbSvg = sbChart.children[0]
const sbRect = [...sbSvg.children]
setRect(svgBar, 8, 900, 200, 80)
setRect(sbText, 8, 900, 200, 20)
setRect(sbChart, 8, 920, 200, 56)
setRect(sbSvg, 8, 920, 200, 56)
sbRect.forEach((n, i) => setRect(n, 8 + i * 40, 930 + i * 4, 20, 30 - i * 6))
poke()

const exA = reopen()
const sbLine = [...exA.querySelectorAll('[data-dso-item]')].find(
  (l) => (l.getAttribute('data-dso-item-key') || '').indexOf('dsh-plugin-svgbar') >= 0
)
check('SVG 条形图整块算 1 行（文字 1 + 图表 1 = 2 行）',
  !!sbLine && text(sbLine.querySelector("[data-dso-tag='multi']")) === '复合 · 2 行',
  sbLine && text(sbLine.querySelector("[data-dso-tag='multi']")))

const sbChip = sbLine && chipOf(sbLine, 'summary')
if (sbChip) {
  flip(sbChip.querySelector('input'), true)
  poke()
  const sbOpts = [...sbLine.querySelectorAll('[data-dso-sumrow] [data-dso-sumopt]')]
  check('图表那行在下拉里只有一个选项（没按柱子拆开）', sbOpts.length === 2, sbOpts.length)
  check('图表选项的文字带占位名', /图表|图形/.test(text(sbOpts[1])), text(sbOpts[1]))
  // 只留图表：整块 svg 容器保留，内部 rect 不带任何标记
  flip(sbOpts[1].querySelector('input'), true)
  flip([...sbLine.querySelectorAll('[data-dso-sumrow] [data-dso-sumopt]')][0].querySelector('input'), false)
  check('只留图表时整块保留',
    sbText.getAttribute('data-dso-vshow') === '0' && sbChart.getAttribute('data-dso-vshow') === '1',
    [sbText.getAttribute('data-dso-vshow'), sbChart.getAttribute('data-dso-vshow')].join('|'))
  check('图表内部元素不被单独标记（不会拦腰截断）',
    sbRect.every((n) => n.getAttribute('data-dso-vshow') === null),
    sbRect.map((n) => n.getAttribute('data-dso-vshow')).join(','))
  flip(sbChip.querySelector('input'), false)
  poke()
}
anchor.removeChild(svgBar)
poke()

// B. div + 宽度百分比画的条形图：靠"薄 + 窄"结构特征识别成一整块
const divBar = document.createElement('div')
divBar.className = 'dsh-plugin-divbar'
divBar.innerHTML =
  '<div class="db-text">本周调用 128</div>' +
  '<div class="db-bars"><div class="db1"></div><div class="db2"></div>' +
  '<div class="db3"></div><div class="db4"></div></div>'
anchor.appendChild(divBar)
const dbText = divBar.children[0]
const dbBars = divBar.children[1]
const dbItems = [...dbBars.children]
setRect(divBar, 8, 1000, 200, 60)
setRect(dbText, 8, 1000, 200, 20)
setRect(dbBars, 8, 1020, 200, 36)
dbItems.forEach((n, i) => setRect(n, 8, 1020 + i * 9, 80 + i * 20, 6))
poke()

const exB = reopen()
const dbLine = [...exB.querySelectorAll('[data-dso-item]')].find(
  (l) => (l.getAttribute('data-dso-item-key') || '').indexOf('dsh-plugin-divbar') >= 0
)
check('div 画的条形图被合并成 1 行（不是 4 行）',
  !!dbLine && text(dbLine.querySelector("[data-dso-tag='multi']")) === '复合 · 2 行',
  dbLine && text(dbLine.querySelector("[data-dso-tag='multi']")))
anchor.removeChild(divBar)
poke()

// C. 饼图：单个 svg 内多扇区高度不同，也不能被拆
const pie = document.createElement('div')
pie.className = 'dsh-plugin-pie'
pie.innerHTML =
  '<div class="p-text">用量 42%</div>' +
  '<div class="p-wrap"><svg class="pie-svg"><path class="p1"></path><path class="p2"></path>' +
  '<path class="p3"></path></svg></div>'
anchor.appendChild(pie)
const pText = pie.children[0]
const pWrap = pie.children[1]
const pSvg = pWrap.children[0]
const pPaths = [...pSvg.children]
setRect(pie, 8, 1100, 200, 60)
setRect(pText, 8, 1100, 200, 20)
setRect(pWrap, 8, 1120, 200, 40)
setRect(pSvg, 8, 1120, 200, 40)
pPaths.forEach((n, i) => setRect(n, 8 + i * 60, 1120 + i * 8, 60, 24))
poke()

const exC = reopen()
const pieLine = [...exC.querySelectorAll('[data-dso-item]')].find(
  (l) => (l.getAttribute('data-dso-item-key') || '').indexOf('dsh-plugin-pie') >= 0
)
check('饼图整体算 1 行（扇区不按行拆）',
  !!pieLine && text(pieLine.querySelector("[data-dso-tag='multi']")) === '复合 · 2 行',
  pieLine && text(pieLine.querySelector("[data-dso-tag='multi']")))
anchor.removeChild(pie)
poke()

// D. 每行各带一个迷你趋势图：图随所在行整体显示/隐藏
const rows = document.createElement('div')
rows.className = 'dsh-plugin-rows'
rows.innerHTML =
  '<div class="r1"><span class="r1t">输入 1.2k</span><svg class="s1"><rect></rect></svg></div>' +
  '<div class="r2"><span class="r2t">输出 3.4k</span><svg class="s2"><rect></rect></svg></div>'
anchor.appendChild(rows)
const row1 = rows.children[0]
const row2 = rows.children[1]
const r1t = row1.children[0]
const s1 = row1.children[1]
const r2t = row2.children[0]
const s2 = row2.children[1]
setRect(rows, 8, 1200, 200, 40)
setRect(row1, 8, 1200, 200, 20)
setRect(r1t, 8, 1200, 110, 20)
setRect(s1, 140, 1202, 55, 16)
setRect(row2, 8, 1220, 200, 20)
setRect(r2t, 8, 1220, 110, 20)
setRect(s2, 140, 1222, 55, 16)
poke()

const exD = reopen()
const rowsLine = [...exD.querySelectorAll('[data-dso-item]')].find(
  (l) => (l.getAttribute('data-dso-item-key') || '').indexOf('dsh-plugin-rows') >= 0
)
check('并排的「文字 + 趋势图」仍算一行（2 行）',
  !!rowsLine && text(rowsLine.querySelector("[data-dso-tag='multi']")) === '复合 · 2 行',
  rowsLine && text(rowsLine.querySelector("[data-dso-tag='multi']")))
const rowsChip = rowsLine && chipOf(rowsLine, 'summary')
if (rowsChip) {
  flip(rowsChip.querySelector('input'), true)
  poke()
  check('摘要留第 1 行时趋势图跟着第 1 行一起留下',
    row1.getAttribute('data-dso-vshow') === '1' && row2.getAttribute('data-dso-vshow') === '0' &&
      s1.getAttribute('data-dso-vshow') === null,
    [row1.getAttribute('data-dso-vshow'), row2.getAttribute('data-dso-vshow')].join('|'))
  flip(rowsChip.querySelector('input'), false)
  poke()
}
anchor.removeChild(rows)
poke()

// ---------- 0.2.2：设置面板文案 ----------
const exText = reopen()
const sectNote = exText.querySelector('[data-dso-sect-note]')
check('顶部区域说明改成「复选显示 + 拖动抓手」两句',
  !!sectNote && /显示/.test(text(sectNote)) && /拖动左侧抓手/.test(text(sectNote)) && text(sectNote).length < 60,
  text(sectNote))
check('分区标题用新默认名', /导航面板/.test(text(exText.querySelector('[data-dso-sect]'))),
  text(exText.querySelector('[data-dso-sect]')))
const footNote = [...exText.querySelectorAll('[data-dso-note]')]
  .map((n) => text(n))
  .find((t) => t.indexOf('「显示」') === 0)
check('底部说明用规定文案',
  !!footNote && /整条保留/.test(footNote) && /只保留选取的内容/.test(footNote) &&
    /可拖动窗口/.test(footNote) && /整体生效/.test(footNote),
  footNote)

// ---------- 0.2.0：名单面板的排版约束 ----------
const cssText = (document.querySelector('style[data-dso-css]') || {}).textContent || ''
check('名单面板已加宽（>360px）', /\[data-dso-panel='2'\]\{width:min\(40[0-9]px,calc\(100vw - 24px\)\)/.test(cssText))
check('条目改成三栏网格（不再 flex-wrap 折行）',
  /\[data-dso-item\]\{display:grid;grid-template-columns:12px minmax\(0,1fr\) auto/.test(cssText))
check('摘要行下拉用 grid 整行布局，不再用 flex-basis:100% + 左边距撑出弹窗',
  /\[data-dso-sumrow\]\{grid-column:1\/-1/.test(cssText) && cssText.indexOf('[data-dso-sumrow]{flex:1 0 100%') === -1)

// key 稳定性：同 base、不同文本 → 用文本签名，不用出现序号
const extraA = document.createElement('div')
extraA.className = 'dsh-cost-meter-card'
extraA.textContent = '今日 ¥1.00'
const extraB = document.createElement('div')
extraB.className = 'dsh-cost-meter-card'
extraB.textContent = '余额 ¥9.00'
anchor.appendChild(extraA)
anchor.appendChild(extraB)
setRect(extraA, 8, 760, 200, 20)
setRect(extraB, 8, 780, 200, 20)
poke()
const ex3 = reopen()
const keysNow = [...ex3.querySelectorAll("[data-dso-item][data-dso-item-side='bottom']")].map((l) =>
  l.getAttribute('data-dso-item-key')
)
check('同 base 不同文本用签名区分（不再 #2）',
  keysNow.some((k) => k.indexOf('bottom:dsh-cost-meter-card@') === 0),
  keysNow.join('|'))
anchor.removeChild(extraA)
anchor.removeChild(extraB)
poke()

// ---------- 0.1.9：卸载清理 ----------
const disposers = []
applied({
  effect(fn) {
    const d = fn()
    disposers.push(d)
    return d
  }
})
check('ctx.effect 已登记卸载清理', disposers.length === 1, disposers.length)
const freshBar = document.querySelector("[data-dso-bar='bottom']")
check('重新 apply 后折叠条只有一份', document.querySelectorAll('[data-dso-bar]').length === 2)
check('卸载前确实存在折叠标记', document.querySelectorAll("[data-dso-hide='1']").length > 0)

disposers[0]()

check('卸载后折叠条全部移除', document.querySelectorAll('[data-dso-bar]').length === 0)
check('卸载后样式表移除', document.querySelector('style[data-dso-css]') === null)
check('卸载后宿主行上的标记清零',
  document.querySelectorAll('[data-dso-hide],[data-dso-ord],[data-dso-ordbox],[data-dso-bottombox],[data-dso-scroll],[data-dso-summary],[data-dso-vshow],[data-dso-collapsed]').length === 0,
  document.querySelectorAll('[data-dso-hide],[data-dso-ord]').length)
check('卸载后 settingsArea 依旧干净', sa.attributes.length === 1, sa.attributes.length)
// 卸载后再次 apply 不能叠加任何东西（旧调度必须已被拆掉）
applied({})
check('卸载后可再次 apply，折叠条不叠加', document.querySelectorAll('[data-dso-bar]').length === 2,
  document.querySelectorAll('[data-dso-bar]').length)
check('再次 apply 后只留一份样式表', document.querySelectorAll('style[data-dso-css]').length === 1,
  document.querySelectorAll('style[data-dso-css]').length)

let pass = 0
for (const r of results) {
  if (r.ok) pass += 1
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.extra !== undefined ? '  [' + r.extra + ']' : ''}`)
}
console.log(`\n${pass}/${results.length} passed`)
process.exit(pass === results.length ? 0 : 1)
