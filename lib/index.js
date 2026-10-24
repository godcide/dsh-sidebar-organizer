/**
 * dsh-sidebar-organizer — 宿主半侧。
 *
 * 本插件的全部工作都发生在浏览器半侧（lib/client.js）：它只调整侧边栏已经
 * 渲染出来的 DOM，不注册工具、不读写会话、不碰模型上下文。宿主这边保持
 * 空实现，是为了让 bundle 能在 profile 的插件 roster 里有一行可插拔的实体。
 *
 * 之所以不做成“纯 client 包”，是因为 cordis 的加载器按 roster 行装载插件，
 * 没有宿主半侧就无处挂载 client 清单（dsh.client）。
 */

export const name = 'dsh-sidebar-organizer'

export function apply() {
  // 客户端半侧见 package.json 的 dsh.client 声明。
}
