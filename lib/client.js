window.__ModuleLoader__.load({
	id: "dsh-sidebar-organizer",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		//#region 常量与状态
		/**
		 * 本插件只做一件事：把侧边栏已经渲染出来的 DOM 重新整理一遍。
		 * 不注册工具、不接管模型上下文、不改任何宿主行为。
		 *
		 * 侧栏结构（0.2.1-rc.2，CSS Module 前缀会变，选择器只匹配语义段）：
		 *   root → topStrip / logoRow / newSession
		 *        → nav.panelList             （全局面板：插件 / 插件商店 / 自动化任务 / …）
		 *        → div.regionArea            （slot sidebar.workspaces，会话与工作区）
		 *        → div.footArea
		 *             ├ div.footerActions    （slot sidebar.footer.action：成本卡片 / 记忆任务归档 / 工作台）
		 *             └ div.settingsArea     （slot sidebar.settings：设置、账户 / 登录）
		 * 下方折叠只能动 footerActions，settingsArea 是最底部的登录入口，必须原样保留。
		 */
		var STORE_KEY = "dsh-sidebar-organizer:v3";
		var TOP_LIMIT = 7;
		var BOTTOM_LIMIT = 5;
		var FALLBACK_ROW_H = 34;
		var FLOAT_W = 320;
		/** 折叠条默认名称。留空时用它，填了就用用户的自定义名。 */
		var TOP_LABEL = "\u5bfc\u822a\u9762\u677f";
		var BOTTOM_LABEL = "\u5feb\u6377\u9762\u677f";

		var DEFAULTS = {
			topCollapsed: true,
			topPinned: false,
			bottomCollapsed: true,
			bottomPinned: false,
			topLimit: TOP_LIMIT,
			bottomLimit: BOTTOM_LIMIT,
			/** 折叠条名称（空字符串 = 用默认名） */
			topLabel: "",
			bottomLabel: "",
			/** 「显示」名单：折叠时整条保留（上方只有这一种状态） */
			topExcept: [],
			bottomExcept: [],
			/**
			 * 「摘要」名单：折叠时只保留用户勾选的那些视觉行（可多选）。
			 * 与「显示」互斥（同一个 key 不可能同时出现），且不支持悬浮。
			 */
			summaryKeys: [],
			/** key → [视觉行索引,...]（可多选；顺序无关，渲染时按行号升序） */
			summaryRows: {},
			/** 0.2.1 及更早的单选版本（key → 行索引），读取时迁移进 summaryRows */
			summaryRow: {},
			/**
			 * key → { keep, float }：进入「摘要」之前那一刻的「显示 / 悬浮」状态。
			 * 取消摘要时按原样还原，而不是统一变成"三样全不勾"。
			 */
			summaryPrev: {},
			/** 被拖成悬浮窗的条目 key */
			floatKeys: [],
			/** key → {x, y}：取消悬浮后不删，再次悬浮时按历史位置重现 */
			floatPos: {},
			/** 拖动排序后的自定义顺序（只记非悬浮条目；悬浮条目一律沉到区域最下方） */
			topOrder: [],
			bottomOrder: [],
			/** 0.1.5 的一次性迁移标记，见 readState */
			floatKeepMigrated: false
		};

		function clone(v) {
			if (v === null || typeof v !== "object") return v;
			if (Object.prototype.toString.call(v) === "[object Array]") return v.slice();
			var out = {};
			for (var k in v) out[k] = clone(v[k]);
			return out;
		}

		function readState() {
			var out = clone(DEFAULTS);
			try {
				var raw = window.localStorage.getItem(STORE_KEY);
				if (raw) {
					var parsed = JSON.parse(raw);
					for (var j in DEFAULTS) {
						if (parsed && parsed[j] !== undefined && parsed[j] !== null) out[j] = parsed[j];
					}
				}
			} catch (e) {}
			if (!(out.topExcept instanceof Array)) out.topExcept = [];
			if (!(out.bottomExcept instanceof Array)) out.bottomExcept = [];
			if (!(out.floatKeys instanceof Array)) out.floatKeys = [];
			if (!(out.summaryKeys instanceof Array)) out.summaryKeys = [];
			if (!out.summaryRows || typeof out.summaryRows !== "object") out.summaryRows = {};
			if (!out.summaryRow || typeof out.summaryRow !== "object") out.summaryRow = {};
			if (!out.summaryPrev || typeof out.summaryPrev !== "object") out.summaryPrev = {};
			if (!out.floatPos || typeof out.floatPos !== "object") out.floatPos = {};
			if (!(out.topOrder instanceof Array)) out.topOrder = [];
			if (!(out.bottomOrder instanceof Array)) out.bottomOrder = [];

			// 0.2.2：摘要从「单选一行」改成「复选任意行」。
			// 老配置里 summaryRow[key] 是个数字，搬进 summaryRows[key] 后清空，保证只迁移一次。
			for (var mk in out.summaryRow) {
				if (!out.summaryRows[mk] && isFinite(out.summaryRow[mk])) {
					out.summaryRows[mk] = [Math.max(0, out.summaryRow[mk] | 0)];
				}
			}
			out.summaryRow = {};

			// 0.1.5 语义变更：悬浮条目的“看不看得见”改由「保持显示」控制。
			// 老状态里悬浮过的条目不在例外名单里，直接升级会让浮窗集体消失，
			// 所以补一次例外（只补一次，之后用户自己取消就保持取消）。
			if (!out.floatKeepMigrated) {
				for (var q = 0; q < out.floatKeys.length; q += 1) {
					if (out.bottomExcept.indexOf(out.floatKeys[q]) === -1) out.bottomExcept.push(out.floatKeys[q]);
				}
				out.floatKeepMigrated = true;
			}
			return out;
		}

		var state = readState();

		function saveState() {
			try {
				window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
			} catch (e) {}
		}

		function barLabel(side) {
			var custom = side === "top" ? state.topLabel : state.bottomLabel;
			var text = custom === null || custom === undefined ? "" : String(custom).replace(/\s+/g, " ").trim();
			if (text) return text.slice(0, 16);
			return side === "top" ? TOP_LABEL : BOTTOM_LABEL;
		}

		function inList(list, key) {
			return !!list && list.indexOf(key) !== -1;
		}

		function ensureIn(list, key) {
			if (list.indexOf(key) === -1) list.push(key);
			return list;
		}

		/**
		 * 进入「摘要」前先把「显示 / 悬浮」拍个快照，退出时原样还原。
		 * 已经是摘要态（重复点击、syncChips 回读）时不覆盖，否则快照会被写成"全不勾"。
		 */
		function snapshotBeforeSummary(key) {
			var prev = state.summaryPrev[key];
			if (prev && typeof prev === "object") return;
			state.summaryPrev[key] = {
				keep: inList(state.bottomExcept, key),
				float: inList(state.floatKeys, key)
			};
		}

		/**
		 * 退出「摘要」：还原进入前的状态。
		 *   ✔显示 → 取消摘要后回到 ✔显示；
		 *   ✔显示+✔悬浮 → 取消摘要后浮窗在原坐标重新出现；
		 *   三者全不勾（隐藏）→ 取消摘要后仍然隐藏。
		 * 没有快照（老配置 / 换设备）时按最直觉的「回到显示」处理。
		 */
		function restoreAfterSummary(key) {
			var prev = state.summaryPrev[key];
			delete state.summaryPrev[key];
			var keep = prev && typeof prev === "object" ? prev.keep === true : true;
			var float = prev && typeof prev === "object" ? prev.float === true : false;
			if (keep) ensureIn(state.bottomExcept, key);
			if (float) {
				ensureIn(state.floatKeys, key);
				ensureIn(state.bottomExcept, key);
			}
		}

		/**
		 * 悬浮开关的唯一入口。
		 * 打开：进 floatKeys，同时补进例外名单 —— 即“悬浮”勾上时“保持显示”默认为勾上，
		 *       否则一勾悬浮就因为不在例外名单而立刻不可见。
		 * 关闭：只从 floatKeys 移除，例外名单保留（条目回到侧栏里、并且仍然可见），
		 *       floatPos 也不删，于是再次勾上时会在历史位置重现。
		 */
		function setFloat(key, on) {
			if (!key) return;
			if (on) {
				ensureIn(state.floatKeys, key);
				ensureIn(state.bottomExcept, key);
				// 「摘要」与「显示」互斥，而悬浮必然意味着「显示」
				var s = state.summaryKeys.indexOf(key);
				if (s !== -1) {
					state.summaryKeys.splice(s, 1);
					// 用户手动改了状态，摘要快照作废，避免"幽灵还原"
					delete state.summaryPrev[key];
				}
			} else {
				var i = state.floatKeys.indexOf(key);
				if (i !== -1) state.floatKeys.splice(i, 1);
			}
			saveState();
		}

		/** 「显示」开关：折叠时整条保留。与「摘要」互斥。 */
		function setKeep(side, key, on) {
			if (!key) return;
			var list = side === "top" ? state.topExcept : state.bottomExcept;
			if (on) {
				ensureIn(list, key);
				var s = state.summaryKeys.indexOf(key);
				if (s !== -1) {
					state.summaryKeys.splice(s, 1);
					delete state.summaryPrev[key];
				}
			} else {
				var i = list.indexOf(key);
				if (i !== -1) list.splice(i, 1);
			}
			saveState();
		}

		/**
		 * 「摘要」开关：折叠时只保留用户选定的那一视觉行。
		 * 与「显示」互斥；不支持悬浮 —— 打开摘要时把浮窗收回侧栏，退出摘要时还原
		 * （floatPos 一直保留，所以浮窗会回到原来的位置）。
		 */
		function setSummary(key, on) {
			if (!key) return;
			if (on) {
				snapshotBeforeSummary(key);
				var i = state.bottomExcept.indexOf(key);
				if (i !== -1) state.bottomExcept.splice(i, 1);
				ensureIn(state.summaryKeys, key);
				var f = state.floatKeys.indexOf(key);
				if (f !== -1) state.floatKeys.splice(f, 1);
			} else {
				var j = state.summaryKeys.indexOf(key);
				if (j !== -1) state.summaryKeys.splice(j, 1);
				restoreAfterSummary(key);
			}
			saveState();
		}

		/**
		 * 某个条目被勾选保留的视觉行号（升序去重）。
		 * 顺序永远按原 UI 自上到下，与勾选先后无关。
		 */
		function summaryRowsOf(key) {
			var arr = state.summaryRows[key];
			var out = [];
			if (arr instanceof Array) {
				for (var i = 0; i < arr.length; i += 1) {
					if (!isFinite(arr[i])) continue;
					var v = Math.max(0, arr[i] | 0);
					if (out.indexOf(v) === -1) out.push(v);
				}
			} else if (isFinite(arr)) {
				// 容错：磁盘上写成单个数字也照样能用
				out.push(Math.max(0, arr | 0));
			}
			out.sort(function (a, b) {
				return a - b;
			});
			return out;
		}

		/** 勾选 / 取消某一行；越界行号由 applySummary 夹紧。 */
		function setSummaryRow(key, index, on) {
			if (!key) return;
			var list = summaryRowsOf(key);
			var i = list.indexOf(index | 0);
			if (on && i === -1) list.push(index | 0);
			else if (!on && i !== -1) list.splice(i, 1);
			list.sort(function (a, b) {
				return a - b;
			});
			state.summaryRows[key] = list;
			saveState();
		}
		//#endregion

		//#region 样式
		/**
		 * 颜色只用宿主真实存在的语义 token，且都带 fallback：
		 *   --dsw-alias-bg-primary / border-primary / bg-tertiary / accent  这几个在 0.2.1-rc.2 里**不存在**，
		 *   用了会出现「黑底 + 深色字」= 弹窗看不见字。现存的是 bg-layer-1..4 / border-l1..4 / scrollbar-bg-l2 / brand-primary。
		 */
		/** 排序用的 order 规则表：行上只打 data-dso-ord="N"，不动 DOM、不碰 React 的渲染结果。 */
		var ORDER_CSS = (function () {
			var out = "[data-dso-ord]{order:0}";
			for (var i = 0; i <= 40; i += 1) out += "[data-dso-ord='" + i + "']{order:" + i + "}";
			return out;
		})();

		var CSS = [
			/* ---------- 通用 ---------- */
			"[data-dso-hide='1']{display:none!important}",
			/* 摘要模式：复合条目折叠时只保留选定的那一视觉行。
			   用属性逐节点标记（而不是 :nth-child），因为插件的行结构随时会变。 */
			"[data-dso-vshow='0']{display:none!important}",

			/* ---------- 折叠条 ----------
			   字号/行高/圆角全部跟随侧栏根节点（0.2.1-rc.2 是 font-size:14px），
			   否则 11px 的折叠条放在 panelRow（min-height:36px、font:inherit）旁边会明显小一号。 */
			"[data-dso-bar]{display:flex;align-items:center;gap:6px;box-sizing:border-box;",
			"min-height:34px;padding:0 6px;border-radius:var(--dsw-radius-md,8px);",
			"font-size:inherit;line-height:1.25;letter-spacing:.1px;",
			"user-select:none;cursor:pointer;flex:none;",
			"color:var(--dsw-alias-label-secondary,#8b8f98);background:transparent;",
			"transition:background .14s ease,color .14s ease}",
			"[data-dso-bar]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));",
			"color:var(--dsw-alias-label-primary,#e6e6e6)}",
			"[data-dso-bar]:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary,#4d6bfe));",
			"outline-offset:-2px}",
			"[data-dso-bar='top']{margin:2px 0 6px}",
			"[data-dso-bar='bottom']{margin:2px 0 4px}",
			"[data-dso-bar-label]{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;",
			"white-space:nowrap;font-weight:500}",
			/* 箭头统一用 ▾，靠旋转表达方向：顶部折叠时指右、底部折叠时指上 */
			"[data-dso-chev]{flex:none;width:14px;height:14px;display:inline-flex;",
			"align-items:center;justify-content:center;font-size:10px;opacity:.7;",
			"transition:transform .16s ease,opacity .14s ease}",
			"[data-dso-bar]:hover [data-dso-chev]{opacity:1}",
			"[data-dso-bar='top'][aria-expanded='false'] [data-dso-chev]{transform:rotate(-90deg)}",
			"[data-dso-bar='bottom'][aria-expanded='false'] [data-dso-chev]{transform:rotate(180deg)}",
			/* 条目数小胶囊，比正文小一号是有意的（badge 惯例） */
			"[data-dso-count]{flex:none;min-width:19px;height:19px;padding:0 5px;border-radius:10px;",
			"display:inline-flex;align-items:center;justify-content:center;",
			"font-size:11px;font-variant-numeric:tabular-nums;opacity:.9;",
			"background:var(--dsw-alias-bg-l1,rgba(127,127,127,.16));",
			"color:var(--dsw-alias-label-secondary,#9aa0a6)}",
			"[data-dso-bar]:hover [data-dso-count]{color:inherit;opacity:1}",
			"[data-dso-scrollmark]{flex:none;font-size:10px;opacity:.5;letter-spacing:0}",
			"[data-dso-scrollmark][data-dso-gone='1']{display:none}",

			/* ---------- 折叠条上的小按钮 ---------- */
			"[data-dso-btn]{flex:none;display:inline-flex;align-items:center;justify-content:center;",
			"width:22px;height:22px;padding:0;border:none;border-radius:6px;background:transparent;",
			"color:inherit;font-size:12px;line-height:1;cursor:pointer;opacity:.5;",
			"transition:opacity .14s ease,background .14s ease,color .14s ease}",
			"[data-dso-btn]:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.2))}",
			"[data-dso-btn][data-dso-on='1']{opacity:1;color:var(--dsw-alias-brand-primary,#4d6bfe)}",
			"[data-dso-btn][data-dso-gone='1']{display:none}",
			/* 图标条态（侧栏收起）下让位给原生导航 */
			"[data-dso-bar][data-dso-rail='1']{display:none!important}",

			/* ---------- 顶部：折叠与滑动 ---------- */
			"nav[data-dso-collapsed='1']{display:none!important}",
			"nav[data-dso-scroll='1']{max-height:var(--dso-max-h,196px)!important;",
			"overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;",
			"scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2,rgba(127,127,127,.35)) transparent}",
			"nav[data-dso-scroll='1']::-webkit-scrollbar{width:6px}",
			"nav[data-dso-scroll='1']::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2,rgba(127,127,127,.35));border-radius:3px}",

			/* ---------- 底部：折叠与滑动 ---------- */
			/* 排序用 CSS order，所以容器必须是 flex；同时 flex 列里面纵向滚动条照常生效。
			   footerActions 原生是行向 flex 的 slot 宿主，单靠 order 会出现横向重排，这里统一压成列。 */
			"[data-dso-bottombox]{display:flex!important;flex-direction:column!important;align-items:stretch!important}",
			"[data-dso-bottombox]>*{flex:0 0 auto}",
			/* order 只在 flex 容器里生效：行真正的父容器由 applyOrder 打 data-dso-ordbox，
			   处理插槽锚点把行包深一层、父级不是 flex 的情况 */
			"[data-dso-ordbox]{display:flex!important;flex-direction:column!important;align-items:stretch!important}",
			"[data-dso-ordbox]>*{flex:0 0 auto}",
			"[data-dso-bottombox][data-dso-scroll='1']{",
			"max-height:var(--dso-max-h,160px)!important;",
			"overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;",
			"scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2,rgba(127,127,127,.35)) transparent}",
			"[data-dso-bottombox][data-dso-scroll='1']::-webkit-scrollbar{width:6px}",
			"[data-dso-bottombox][data-dso-scroll='1']::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2,rgba(127,127,127,.35));border-radius:3px}",

			/* ---------- 悬浮窗（工作台与任意被选中的条目共用） ---------- */
			"[data-dso-float='1']{position:fixed!important;z-index:var(--dso-z,60)!important;",
			"width:" + FLOAT_W + "px!important;max-width:calc(100vw - 24px)!important;",
			"max-height:min(72vh,560px)!important;overflow:auto!important;box-sizing:border-box!important;",
			"border-radius:12px!important;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28))!important;",
			"background:color-mix(in srgb,var(--dso-panel-solid,var(--we-panel-color,var(--dsw-alias-bg-layer-2,#26262b))) 94%,transparent)!important;",
			"-webkit-backdrop-filter:blur(var(--dso-panel-blur,16px)) saturate(1.4)!important;",
			"backdrop-filter:blur(var(--dso-panel-blur,16px)) saturate(1.4)!important;",
			"box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 14px 44px rgba(0,0,0,.34),0 2px 8px rgba(0,0,0,.16)!important;",
			"transition:box-shadow .16s ease}",
			/* 顶部一条渐隐高光，暗示这里是抓取带（纯装饰，不占布局） */
			"[data-dso-float='1']::before{content:'';position:absolute;left:0;right:0;top:0;height:3px;",
			"border-radius:12px 12px 0 0;pointer-events:none;opacity:.45;",
			"background:linear-gradient(90deg,transparent,rgba(127,127,127,.45),transparent)}",
			"[data-dso-float='1'][data-dso-dragging='1']::before{opacity:.9}",
			"[data-dso-float='1'][data-dso-pos='1']{left:var(--dso-x,14px)!important;top:var(--dso-y,80px)!important}",
			"[data-dso-float='1'][data-dso-dragging='1']{transition:none!important;cursor:grabbing!important}",
			/* 互相压住时：顶边换成加粗告警边（用 inset 阴影，不引起重排） */
			"[data-dso-float='1'][data-dso-overlap='1']{",
			"box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 14px 44px rgba(0,0,0,.34),",
			"inset 0 4px 0 0 var(--dsw-alias-state-warn-primary,#f0a020)!important;",
			"border-color:var(--dsw-alias-state-warn-primary,#f0a020)!important}",
			"[data-dso-float='1'][data-dso-overlap='1']::before{opacity:0}",

			/* ---------- 悬浮窗下方的 Alt 拖动提示（无框） ---------- */
			"[data-dso-hint]{position:fixed;z-index:10000;margin:0;padding:0;border:0;background:0 0;",
			"font:12px/1.2 inherit;letter-spacing:.2px;pointer-events:none;opacity:0;",
			"color:var(--dsw-alias-label-secondary,#9aa0a6);",
			"text-shadow:0 1px 3px rgba(0,0,0,.5);transition:opacity .12s ease}",
			"[data-dso-hint][data-dso-show='1']{opacity:.85}",

			/* ---------- 设置弹窗 ---------- */
			/* ⚠️ 壁纸 / 玻璃主题会把 --dsw-alias-bg-layer-2 换成**半透明玻璃色**，
			   而本弹窗是二/三级浮层：只继承那个 token 却不自己做 backdrop-filter，
			   结果就是「壁纸直接透上来、文字发飘」。这里补齐两件事：
			     ① 底色 = 实色面板色（壁纸插件的 --we-panel-color）按 94% 混透明；
			     ② 自己的 backdrop-filter，让剩下那 6% 真的变成磨砂而不是透明玻璃片。
			   两个旋钮 --dso-panel-solid / --dso-panel-blur 留给用户覆盖。 */
			"[data-dso-panel]{position:fixed;z-index:9999;width:262px;box-sizing:border-box;",
			"padding:12px 14px;border-radius:12px;font-size:12.5px;line-height:1.5;",
			"color-scheme:light dark;",
			"border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.32));",
			"background:color-mix(in srgb,var(--dso-panel-solid,var(--we-panel-color,var(--dsw-alias-bg-layer-2,#26262b))) 94%,transparent);",
			"-webkit-backdrop-filter:blur(var(--dso-panel-blur,16px)) saturate(1.4);",
			"backdrop-filter:blur(var(--dso-panel-blur,16px)) saturate(1.4);",
			"color:var(--dsw-alias-label-primary,#ededed);",
			"box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 18px 48px rgba(0,0,0,.34),",
			"0 2px 8px rgba(0,0,0,.18)}",
			"[data-dso-panel] *{box-sizing:border-box;color:inherit}",
			"[data-dso-head]{display:flex;align-items:center;gap:8px;margin:0 0 10px}",
			"[data-dso-head] h4{flex:1 1 auto;min-width:0;margin:0;font-size:13px;font-weight:600;",
			"letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			"[data-dso-x]{flex:none;width:22px;height:22px;padding:0;border:none;border-radius:6px;",
			"background:transparent;color:inherit;font-size:13px;line-height:1;cursor:pointer;opacity:.55;",
			"transition:opacity .14s ease,background .14s ease}",
			"[data-dso-x]:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.2))}",
			"[data-dso-row]{display:flex;align-items:center;justify-content:space-between;gap:10px;",
			"min-height:28px;padding:2px 0}",
			"[data-dso-row]>span{flex:0 1 auto;min-width:0;white-space:nowrap;overflow:hidden;",
			"text-overflow:ellipsis;color:var(--dsw-alias-label-secondary,#9aa0a6)}",
			"[data-dso-sep]{height:1px;margin:9px -2px;background:var(--dsw-alias-border-l2,rgba(127,127,127,.2))}",
			"[data-dso-panel] input[type='number']{width:56px;height:26px;padding:0 6px;flex:none;",
			"border-radius:7px;font-size:12px;text-align:center;font-family:inherit;",
			"border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));",
			"background:var(--dsw-alias-bg-l1,rgba(127,127,127,.12));color:inherit}",
			"[data-dso-panel] input[type='text']{width:108px;height:26px;padding:0 8px;flex:none;",
			"border-radius:7px;font-size:12px;font-family:inherit;",
			"border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));",
			"background:var(--dsw-alias-bg-l1,rgba(127,127,127,.12));color:inherit}",
			"[data-dso-panel] input:focus{outline:none;border-color:var(--dsw-alias-brand-primary,#4d6bfe)}",
			"[data-dso-panel] input[type='number']::-webkit-outer-spin-button,",
			"[data-dso-panel] input[type='number']::-webkit-inner-spin-button{appearance:none;margin:0}",
			"[data-dso-note]{margin-top:9px;padding-top:8px;font-size:11px;line-height:1.55;",
			"color:var(--dsw-alias-label-secondary,#9aa0a6);",
			"border-top:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.18))}",
			"[data-dso-panel] [data-dso-row] [data-dso-note]{flex:1 1 auto;margin:0;padding:0;border:none}",
			/* 排序自检行：一眼看出滑动到底是走 CSS order 还是退回 DOM 排序 */
			"[data-dso-diag]{font-size:10.5px;line-height:1.5;word-break:break-word;opacity:.8}",
			"[data-dso-diag] b{font-weight:600;color:var(--dsw-alias-brand-primary,#4d6bfe)}",
			/* 主面板底部的“例外与悬浮名单”入口：真正的整宽按钮，不是一行小字 */
			"[data-dso-entry]{display:flex;align-items:center;gap:8px;width:100%;height:32px;",
			"margin:9px 0 0;padding:0 9px;border-radius:8px;font-size:12.5px;font-family:inherit;",
			"text-align:left;cursor:pointer;",
			"border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.32));",
			"background:var(--dsw-alias-bg-l1,rgba(127,127,127,.1));color:inherit;",
			"transition:background .14s ease,border-color .14s ease}",
			"[data-dso-entry]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.18));",
			"border-color:var(--dsw-alias-border-l3,rgba(127,127,127,.5))}",
			"[data-dso-entry] [data-dso-entry-icon]{flex:none;font-size:12px;opacity:.7}",
			"[data-dso-entry] [data-dso-entry-label]{flex:1 1 auto;min-width:0;overflow:hidden;",
			"text-overflow:ellipsis;white-space:nowrap}",
			"[data-dso-entry] [data-dso-entry-chev]{flex:none;font-size:13px;opacity:.5}",
			"[data-dso-mini]{flex:none;height:24px;padding:0 9px;border-radius:6px;font-size:11.5px;",
			"font-family:inherit;cursor:pointer;",
			"border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3));",
			"background:transparent;color:var(--dsw-alias-label-secondary,#9aa0a6)}",
			"[data-dso-mini]:hover{color:var(--dsw-alias-label-primary,#ededed);",
			"background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16))}",

			/* ---------- 二级弹窗：例外与悬浮名单 ----------
			   宽一点：一行要同时放下 抓手 + 名称 + 复合标记 + 显示/摘要/悬浮 三个胶囊，
			   334px 会挤成两行，再加摘要行下拉就三行。窄窗口下按视口收窄。 */
			"[data-dso-panel='2']{width:min(404px,calc(100vw - 24px));max-height:min(76vh,600px);",
			"overflow:auto;padding:12px 14px 14px}",
			"[data-dso-sect]{display:flex;align-items:center;gap:8px;margin:12px 0 4px;font-size:11px;",
			"font-weight:600;letter-spacing:.4px;color:var(--dsw-alias-label-secondary,#9aa0a6);",
			"text-transform:uppercase}",
			"[data-dso-sect]::after{content:'';flex:1 1 auto;height:1px;",
			"background:var(--dsw-alias-border-l2,rgba(127,127,127,.18))}",
			/* 每条用三栏网格：抓手 | 名称（可压缩） | 状态胶囊（不可压缩）。
			   以前是 flex-wrap，胶囊一多就整行折行；摘要行下拉用 flex-basis:100% + 左边距
			   更是把外框撑出 20px，看起来像"下拉溢出了弹窗"。网格不会有这两个问题。 */
			"[data-dso-item]{display:grid;grid-template-columns:12px minmax(0,1fr) auto;",
			"align-items:center;column-gap:8px;row-gap:3px;min-height:30px;padding:3px 5px;",
			"border-radius:7px;user-select:none;position:relative}",
			"[data-dso-item]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}",
			/* 拖动排序的抓手：只有它可拖，避免和勾选/文本选择打架 */
			"[data-dso-grip]{grid-column:1;flex:none;width:12px;display:inline-flex;",
			"align-items:center;justify-content:center;",
			"font-size:11px;line-height:1;cursor:grab;opacity:.35;letter-spacing:-1px;",
			"transition:opacity .12s ease,color .12s ease}",
			"[data-dso-grip]:hover{opacity:.95;color:var(--dsw-alias-label-primary,#ededed)}",
			"[data-dso-grip][data-dso-off='1']{opacity:.12;cursor:default}",
			"[data-dso-item][data-dso-dragging='1']{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.2));",
			"box-shadow:0 6px 18px rgba(0,0,0,.22);z-index:1}",
			"[data-dso-item][data-dso-dragging='1'] [data-dso-grip]{opacity:.95;cursor:grabbing}",
			"[data-dso-sect-note]{margin:-2px 0 6px 2px;font-size:10.5px;line-height:1.5;opacity:.72}",
			"[data-dso-item-label]{grid-column:2;flex:1 1 auto;min-width:0;overflow:hidden;",
			"text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}",
			/* 状态胶囊与标记统一放在第 3 栏，右对齐、不换行、可整体压缩 */
			"[data-dso-chips]{grid-column:3;display:flex;align-items:center;justify-content:flex-end;",
			"gap:3px;min-width:0}",
			"[data-dso-item-tag]{flex:none;font-size:10px;opacity:.5;white-space:nowrap}",
			"[data-dso-item-tag][data-dso-tag='float']{opacity:.8;padding:0 5px;height:17px;",
			"display:inline-flex;align-items:center;border-radius:5px;",
			"background:rgba(77,107,254,.14);color:var(--dsw-alias-brand-primary,#4d6bfe)}",
			/* 复合条目：单个插件根节点里有多个视觉行（如计费卡片）。整条处理，不拆行。 */
			"[data-dso-item-tag][data-dso-tag='multi']{opacity:.75;padding:0 5px;height:17px;",
			"display:inline-flex;align-items:center;border-radius:5px;",
			"background:var(--dsw-alias-bg-l1,rgba(127,127,127,.14));",
			"color:var(--dsw-alias-label-secondary,#9aa0a6);font-variant-numeric:tabular-nums}",
			/* 摘要内容多选：占满整行（1/-1），左缩进用 padding 而不是 margin ——
			   用 margin 时外框宽度会变成 100% + 20px，会把内容顶出弹窗。 */
			"[data-dso-sumrow]{grid-column:1/-1;display:block;margin:2px 0 5px;padding-left:20px}",
			"[data-dso-sumhead]{display:flex;align-items:baseline;gap:6px;margin-bottom:3px;",
			"font-size:10.5px;color:var(--dsw-alias-label-secondary,#9aa0a6);opacity:.85}",
			"[data-dso-sumtitle]{flex:none}",
			"[data-dso-sumcount]{flex:none;margin-left:auto;opacity:.7;font-variant-numeric:tabular-nums}",
			"[data-dso-sumlist]{display:flex;flex-direction:column;gap:1px;max-height:136px;overflow:auto}",
			"[data-dso-sumopt]{display:flex;align-items:center;gap:6px;min-height:22px;padding:1px 6px;",
			"border-radius:5px;cursor:pointer;font-size:11.5px;",
			"color:var(--dsw-alias-label-secondary,#9aa0a6);transition:background .1s ease,color .1s ease}",
			"[data-dso-sumopt]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));",
			"color:var(--dsw-alias-label-primary,#ededed)}",
			"[data-dso-sumopt][data-dso-on='1']{color:var(--dsw-alias-label-primary,#ededed)}",
			"[data-dso-sumopt][data-dso-on='1'] [data-dso-sumnum]{color:var(--dsw-alias-brand-primary,#4d6bfe);opacity:1}",
			"[data-dso-sumopt]>input{flex:none;width:12px;height:12px;margin:0;accent-color:var(--dsw-alias-brand-primary,#4d6bfe)}",
			"[data-dso-sumopt]>input:disabled{cursor:not-allowed}",
			"[data-dso-sumnum]{flex:none;width:13px;text-align:right;opacity:.45;",
			"font-variant-numeric:tabular-nums;font-size:10.5px}",
			"[data-dso-sumtext]{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;",
			"white-space:nowrap}",
			/* 复选项做成小胶囊：勾上后整块染主题色，一眼能看出状态 */
			"[data-dso-check]{flex:none;display:inline-flex;align-items:center;gap:4px;height:22px;",
			"padding:0 7px;border-radius:6px;border:1px solid transparent;cursor:pointer;",
			"font-size:11px;color:var(--dsw-alias-label-secondary,#9aa0a6);",
			"transition:background .12s ease,color .12s ease,border-color .12s ease}",
			"[data-dso-check]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));",
			"color:var(--dsw-alias-label-primary,#ededed)}",
			"[data-dso-check][data-dso-on='1']{color:var(--dsw-alias-brand-primary,#4d6bfe);",
			"background:rgba(77,107,254,.14);border-color:rgba(77,107,254,.34)}",
			"[data-dso-check][data-dso-off='1']{opacity:.4;cursor:default}",
			"[data-dso-check] input{flex:none;width:13px;height:13px;margin:0;",
			"accent-color:var(--dsw-alias-brand-primary,#4d6bfe)}"
		].join("") + ORDER_CSS;

		function injectCss() {
			var id = "dsh-sidebar-organizer-css";
			var prev = document.querySelector("style[data-dso-css='" + id + "']");
			if (prev) prev.remove();
			var tag = document.createElement("style");
			tag.dataset.dsoCss = id;
			tag.dataset.plugin = "dsh-sidebar-organizer";
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region DOM 工具
		function el(tag, attrs, text) {
			var node = document.createElement(tag);
			if (attrs) {
				for (var k in attrs) node.setAttribute(k, attrs[k]);
			}
			if (text !== undefined && text !== null) node.textContent = text;
			return node;
		}

		/** 全局面板的导航容器（<nav class="XXXX_panelList" aria-label="全局面板">）。 */
		function panelNav() {
			return document.querySelector("nav[class*='panelList']");
		}

		/** 侧栏底部最外层容器：footerActions（记忆任务归档等）+ settingsArea（设置、登录）。 */
		function footArea() {
			return document.querySelector("div[class*='footArea']");
		}

		/** 底部动作区：插件往 slot sidebar.footer.action 里塞的东西都在这。 */
		function footerActions() {
			return document.querySelector("div[class*='footerActions']");
		}

		/** 底部设置区：设置、账户 / 登录。本插件绝不碰它。 */
		function settingsArea() {
			return document.querySelector("div[class*='settingsArea']");
		}

		/**
		 * 侧栏是否处于展开（宽）态。
		 * 收起成图标条时，面板列表本身就是唯一的导航，不能再折叠，否则导航消失。
		 *
		 * 判据用侧栏列的几何宽度而不是 class：nav 的父节点就是侧栏根，
		 * 折叠只是把 nav 自己 display:none，父节点宽度不变，所以不会出现
		 * “折叠→判宽失败→展开→再折叠”的抖动。图标条约 48px，展开态 200px 以上。
		 */
		function isSidebarWide() {
			var nav = panelNav();
			if (nav && nav.parentNode) {
				var w = nav.parentNode.getBoundingClientRect().width;
				if (w > 0) return w > 110;
			}
			var area = settingsArea();
			if (area && area.parentNode) {
				var w2 = area.parentNode.getBoundingClientRect().width;
				if (w2 > 0) return w2 > 110;
			}
			return true;
		}

		function rowHeightOf(container) {
			var first = container && container.firstElementChild;
			if (!first) return FALLBACK_ROW_H;
			var h = first.getBoundingClientRect().height;
			return h > 8 ? Math.round(h) : FALLBACK_ROW_H;
		}

		function readableH(node) {
			if (!node) return 0;
			var r = node.getBoundingClientRect();
			return r.height > 4 ? Math.round(r.height) : 0;
		}

		/**
		 * 中键拖动滚动：按住滚轮上下拖，像设计软件那样。
		 * 只在容器真的溢出时才装，避免无谓监听。
		 *
		 * 监听是挂在**宿主节点**上的，所以必须留一份引用，卸载时逐个摘掉 ——
		 * 只看 __dsoMiddle 标记是摘不掉的（匿名函数没有引用可用）。
		 */
		var MIDDLE_NODES = [];

		function attachMiddleDrag(node) {
			if (node.__dsoMiddle) return;
			node.__dsoMiddle = true;

			var onDown = function (e) {
				if (e.button !== 1) return;
				if (node.scrollHeight <= node.clientHeight + 1) return;
				e.preventDefault();
				var startY = e.clientY;
				var startTop = node.scrollTop;
				function onMove(ev) {
					node.scrollTop = startTop - (ev.clientY - startY);
				}
				function onUp() {
					window.removeEventListener("mousemove", onMove, true);
					window.removeEventListener("mouseup", onUp, true);
				}
				window.addEventListener("mousemove", onMove, true);
				window.addEventListener("mouseup", onUp, true);
			};

			// 吃掉中键抬起引起的自动滚动（Chromium 的 middle-click autoscroll）
			var onAux = function (e) {
				if (e.button === 1) e.preventDefault();
			};

			node.addEventListener("mousedown", onDown, true);
			node.addEventListener("auxclick", onAux);
			MIDDLE_NODES.push({ node: node, down: onDown, aux: onAux });
		}
		//#endregion

		//#region 条目识别：key 与显示名
		/**
		 * 每个可折叠/可悬浮的条目都要有一个跨渲染稳定的 key。
		 *
		 * 优先用 class 里的插件标识（`dsh-cost-meter…` / `dsh-wt_section` / `dsh-session-kit…`）：
		 * 文本会随金额、计数变化，class 不会。没有 class 标识的（例如全局面板按钮，只有
		 * CSS Module 的哈希类名）退回用文本，取前 24 字。
		 */
		function classRootOf(node) {
			var stack = [node];
			var found = "";
			var guard = 0;
			while (stack.length && guard < 400) {
				guard += 1;
				var cur = stack.shift();
				var cls = cur.getAttribute && cur.getAttribute("class");
				if (cls) {
					var m = cls.match(/(?:^|\s)(dsh-[a-z0-9]+(?:-[a-z0-9]+)*)/i);
					if (m) return m[1].toLowerCase();
				}
				if (cur.children) {
					for (var i = 0; i < cur.children.length; i += 1) stack.push(cur.children[i]);
				}
			}
			return found;
		}

		function textSig(node) {
			var t = (node.textContent || "").replace(/\s+/g, " ").trim();
			// 去掉金额、计数这类会变的部分，避免 key 抖动
			t = t.replace(/[¥$€]?\s?\d[\d,.]*/g, "#");
			return t.slice(0, 24);
		}

		function baseKeyOf(row) {
			if (row.__dsoBase) return row.__dsoBase;
			var base = classRootOf(row);
			if (!base) base = "text:" + textSig(row);
			row.__dsoBase = base;
			return base;
		}

		/** 弹窗里给人看的名字：优先 aria-label，其次标题类元素，最后截断正文。 */
		function labelOf(row) {
			if (row.__dsoLabel) return row.__dsoLabel;
			var out = "";
			var aria = row.getAttribute("aria-label");
			if (aria) out = aria;
			if (!out) {
				var titled = row.querySelector("h1,h2,h3,h4,h5,[class*='title'],[class*='Title'],[class*='label']");
				if (titled) out = (titled.getAttribute("aria-label") || titled.textContent || "").trim();
			}
			if (!out) out = (row.textContent || "").replace(/\s+/g, " ").trim();
			out = out.slice(0, 26);
			var root = classRootOf(row);
			if (!out) out = root || "未命名条目";
			row.__dsoLabel = out;
			return out;
		}

		/** 底部行容器里可能还包着插槽锚点，顺着「唯一子节点 + 是锚点」下钻最多两层。 */
		function bottomBox() {
			var box = footerActions();
			if (!box) return null;
			for (var depth = 0; depth < 2; depth += 1) {
				var kids = Array.prototype.slice.call(box.children);
				if (kids.length !== 1) return box;
				var only = kids[0];
				var isAnchor = only.hasAttribute("data-slot") || only.children.length > 1;
				if (!isAnchor || only.children.length === 0) return box;
				box = only;
			}
			return box;
		}

		function rawRows(side) {
			if (side === "top") {
				var nav = panelNav();
				return nav ? Array.prototype.slice.call(nav.children) : [];
			}
			var box = bottomBox();
			return box ? Array.prototype.slice.call(box.children) : [];
		}

		/**
		 * 给一批行分配 key。
		 *
		 * 稳定性优先：每个 base 的**第一次出现沿用裸 base**，和 0.1.8 及以前的存量配置完全兼容。
		 * 重复 base 时不再直接按出现序号编号 —— 行序一变（插件条件渲染、悬浮沉底）
		 * 序号就会漂到另一条上，例外/悬浮/摘要都会跟错人。现在先用「去掉数字后的文本签名」区分：
		 *     bottom:dsh-cost-meter@今日# / bottom:dsh-cost-meter@余额#
		 * 只有签名也撞车（真正的两条同形行）才退回 #2/#3。
		 */
		function withKeys(rows, side) {
			var taken = {};
			var countByBase = {};
			var out = [];
			for (var i = 0; i < rows.length; i += 1) {
				var row = rows[i];
				var base = side + ":" + baseKeyOf(row);
				var key = base;
				if (taken[base]) {
					var sig = textSig(row);
					var cand = sig ? base + "@" + sig : "";
					if (cand && !taken[cand]) {
						key = cand;
					} else {
						var n = (countByBase[base] || 1) + 1;
						while (taken[base + "#" + n]) n += 1;
						key = base + "#" + n;
					}
				}
				countByBase[base] = (countByBase[base] || 0) + 1;
				taken[key] = true;
				out.push({
					row: row,
					side: side,
					key: key,
					label: labelOf(row)
				});
			}
			return out;
		}

		function itemsOf(side) {
			return withKeys(rawRows(side), side);
		}

		/** 安全读矩形：拿不到布局（测试环境、侧栏未展开）时返回 0，由调用方降级。 */
		function rectOf(node) {
			try {
				var r = node.getBoundingClientRect();
				return { top: r.top, bottom: r.bottom, width: r.width || 0, height: r.height || 0 };
			} catch (e) {
				return { top: 0, bottom: 0, width: 0, height: 0 };
			}
		}

		/**
		 * 视觉行探测（摘要用）。
		 *
		 * 目标是拆出「肉眼看到的一行一行」，并给每一行找到**可以安全隐藏的节点集合**。
		 * 不能只看根节点的直接子节点 —— 真实插件卡片常常是多层包装：
		 *   root > 外壳 > body > [行1, 行2, 行3]
		 * 只看第一层会把整张卡当成 1 行，「摘要」就只能抓到首行。
		 *
		 * 规则（自上而下递归）：
		 *   · 同一父节点下垂直区间重叠超过一半的兄弟 = 同一行（图标 + 文字并排算一行）；
		 *   · 该层只有 1 行、且行里只有 1 个节点 → 它是包装层，继续下钻，不算一行；
		 *   · 该层只有 1 行、行里有多个节点 → 这层本身就是一个视觉行，整块作为隐藏单位；
		 *   · 该层有多行 → 每行各自的节点集合成为一行（单节点行继续下钻，找更细的行）。
		 * 隐藏单位永远是节点集合（并排的图标 + 文字必须一起隐藏），所以行对象是 {nodes, text}。
		 *
		 * 行数 ≥ 2 即「复合条目」：侧栏里算一条、整条折叠、整条拖动、整条悬浮，
		 * 只有「摘要」是在行级别生效。
		 */
		var MAX_LINE_DEPTH = 6;

		function hasText(node) {
			return !!(node && node.textContent && node.textContent.replace(/\s+/g, ""));
		}

		/**
		 * 容器下的元素子节点；有布局信息时丢弃量不到尺寸的（display:none 的装饰层）。
		 *
		 * 特例：零尺寸但**里面有东西**的节点多半是 `display:contents` 的插槽外壳 ——
		 * 它自己不产生盒子（量出来 0×0），孩子直接参与爷爷的布局。直接丢掉它会把整棵子树
		 * 一起丢掉（＝又只剩首行），所以把它的孩子提上来参与同一层分行。
		 */
		function kidsOf(node, hasLayout) {
			var out = [];
			if (!node || !node.children) return out;
			for (var i = 0; i < node.children.length; i += 1) {
				var c = node.children[i];
				if (hasLayout) {
					var r = rectOf(c);
					if (r.height <= 0 && r.width <= 0) {
						// 图形即使一时量不到尺寸（懒渲染 / svg 高度未定）也不拆：拆了就会按柱子、扇区
						// 变成好几行，摘要一勾就把图表拦腰截断。
						if (isGraphic(c)) {
							out.push(c);
							continue;
						}
						if (c.children && c.children.length) {
							var inner = kidsOf(c, hasLayout);
							for (var k = 0; k < inner.length; k += 1) out.push(inner[k]);
						}
						continue;
					}
				}
				out.push(c);
			}
			return out;
		}

		/** 这个容器有没有可测的布局信息（侧栏未渲染 / 测试环境时全为 0）。 */
		function layoutKnown(root, depth) {
			var d = depth || 0;
			if (d > MAX_LINE_DEPTH) return false;
			var kids = root && root.children ? root.children : [];
			for (var i = 0; i < kids.length; i += 1) {
				var r = rectOf(kids[i]);
				if (r.height > 0 || r.width > 0) return true;
				// display:contents 外壳自己不占尺寸，但它里面的孩子有
				if (kids[i].children && kids[i].children.length && layoutKnown(kids[i], d + 1)) return true;
			}
			return false;
		}

		/** 兄弟节点按垂直重叠分组：返回 [[node,...], ...]，顺序即视觉顺序。 */
		function bandsOf(kids) {
			var bands = [];
			for (var i = 0; i < kids.length; i += 1) {
				var r = rectOf(kids[i]);
				var hit = null;
				for (var j = 0; j < bands.length; j += 1) {
					var b = bands[j];
					var overlap = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top);
					var minH = Math.min(b.bottom - b.top, r.height);
					if (minH > 0 && overlap > minH * 0.5) {
						hit = b;
						break;
					}
				}
				if (!hit) {
					hit = { top: r.top, bottom: r.bottom, nodes: [] };
					bands.push(hit);
				} else {
					hit.top = Math.min(hit.top, r.top);
					hit.bottom = Math.max(hit.bottom, r.bottom);
				}
				hit.nodes.push(kids[i]);
			}
			return bands;
		}

		function lineText(nodes) {
			var t = "";
			for (var i = 0; i < nodes.length && !t; i += 1) {
				t = (nodes[i].textContent || "").replace(/\s+/g, " ").trim();
			}
			return t;
		}

		/* ---------- 图形 / 图表：整块不可拆 ---------- */
		/**
		 * 图形本身：SVG、canvas、图片、视频、进度条，或带图表语义的 class / role。
		 * 这类节点**永远不下钻** —— 一个饼图的扇区在不同高度上，按"垂直重叠分组"会被拆成
		 * 好几"行"，摘要就能把饼图切掉一半。同理条形图、统计图也必须是原子块。
		 */
		var GRAPHIC_TAGS = { svg: 1, canvas: 1, img: 1, video: 1, iframe: 1, object: 1, progress: 1, meter: 1 };
		var CHART_CLASS = /(?:^|[-_ ])(?:chart|charts|graph|graphs|spark|sparkline|pie|donut|gauge|progress|histogram|bars?)\b/i;

		function isGraphic(node) {
			if (!node || !node.tagName) return false;
			if (GRAPHIC_TAGS[String(node.tagName).toLowerCase()]) return true;
			try {
				if (node.getAttribute && node.getAttribute("role") === "img") return true;
				var cls = node.getAttribute ? node.getAttribute("class") || "" : "";
				if (cls && CHART_CLASS.test(cls)) return true;
			} catch (e) {}
			return false;
		}

		/** 纯图形包装层：自己不是图形，但一路单子节点包下去就是个图形（chart-wrap > svg）。 */
		function graphicOnly(node, depth) {
			var d = depth || 0;
			if (!node || d > 4) return false;
			if (isGraphic(node)) return true;
			if (!node.children || !node.children.length) return false;
			var seen = [];
			for (var i = 0; i < node.children.length; i += 1) {
				var r = rectOf(node.children[i]);
				if (r.height > 0 || r.width > 0) seen.push(node.children[i]);
			}
			// 量不到布局（测试环境 / 尚未渲染）时按结构判断，避免漏掉"外壳 > svg"这种包装
			if (seen.length === 0) seen = Array.prototype.slice.call(node.children);
			if (seen.length !== 1) return false;
			return graphicOnly(seen[0], d + 1);
		}

		/**
		 * 用 div + 宽度百分比画出来的条形图没有 svg，只能靠结构特征认：
		 * ≥3 条、每条都很薄（≤10px）、每条的宽度都明显窄于容器。命中就把整块合成一个原子行，
		 * 否则它会被当成"好几行文字"，摘要一勾就只剩一根柱子。
		 */
		function looksLikeBars(bands, parent) {
			if (bands.length < 3) return false;
			var pw = 0;
			try {
				pw = parent.getBoundingClientRect().width || 0;
			} catch (e) {
				pw = 0;
			}
			if (!(pw > 40)) return false;
			for (var i = 0; i < bands.length; i += 1) {
				if (bands[i].nodes.length !== 1) return false;
				var h = bands[i].bottom - bands[i].top;
				if (!(h > 0) || h > 10) return false;
				var w = rectOf(bands[i].nodes[0]).width;
				if (w < 2 || w > pw * 0.72) return false;
			}
			return true;
		}

		/** 单节点包装层能不能继续下钻：有布局、且本身不是图形。 */
		function canDrill(node, depth) {
			if (depth >= MAX_LINE_DEPTH) return false;
			if (!node || !node.children || !node.children.length) return false;
			if (isGraphic(node)) return false;
			return layoutKnown(node);
		}

		/** 这一带只有 1 个节点、且它本身就是（或只包着）一个图形 → 整块作为原子行。 */
		function graphicBand(nodes) {
			if (nodes.length !== 1) return false;
			return isGraphic(nodes[0]) || graphicOnly(nodes[0], 0);
		}

		function pushLine(out, nodes, fallback) {
			var t = lineText(nodes);
			if (!t) t = fallback || "\uff08\u56fe\u5f62\uff09";
			out.push({ nodes: nodes.slice(), text: t });
		}

		function collectLines(node, out, depth) {
			if (!node || depth > MAX_LINE_DEPTH) return;
			var hasLayout = layoutKnown(node);
			var kids = kidsOf(node, hasLayout);
			if (kids.length === 0) {
				if (hasText(node) || isGraphic(node)) pushLine(out, [node], "\uff08\u56fe\u5f62\uff09");
				return;
			}
			if (!hasLayout) {
				// 量不到布局（测试环境 / 侧栏收成图标条）：每个有文字的兄弟各算一行，不再下钻，
				// 否则会把"图标 + 文字"这类并排节点拆成两行。
				for (var k = 0; k < kids.length; k += 1) {
					if (hasText(kids[k])) out.push({ nodes: [kids[k]], text: lineText([kids[k]]) });
				}
				return;
			}
			var bands = bandsOf(kids);
			if (looksLikeBars(bands, node)) {
				pushLine(out, [node], "\u6761\u5f62\u56fe");
				return;
			}
			if (bands.length === 1) {
				var only = bands[0].nodes;
				if (graphicBand(only)) {
					pushLine(out, only, "\uff08\u56fe\u8868\uff09");
					return;
				}
				if (only.length === 1 && canDrill(only[0], depth)) {
					// 单节点包装层：视觉上还是同一行，继续下钻找更细的行
					collectLines(only[0], out, depth + 1);
					return;
				}
				if (hasText(node)) out.push({ nodes: [node], text: lineText([node]) });
				return;
			}
			for (var i = 0; i < bands.length; i += 1) {
				var b = bands[i].nodes;
				if (graphicBand(b)) {
					// 独立成块的图表：算一行，但整块保留/隐藏，绝不按内部元素拆
					pushLine(out, b, "\uff08\u56fe\u8868\uff09");
				} else if (b.length === 1 && canDrill(b[0], depth)) {
					collectLines(b[0], out, depth + 1);
				} else {
					out.push({ nodes: b.slice(), text: lineText(b) });
				}
			}
		}

		/**
		 * 列出条目的所有视觉行。
		 *
		 * 会先撤掉上一轮的 data-dso-vshow：被上次摘要隐藏的行量出来高 0，会被当成不存在，
		 * 于是切换摘要行时行号整体错位（这是"只抓到首行"的另一个成因）。
		 * 折叠态下条目本身是 display:none，同任务内临时撤掉 hide 读一次再还原，浏览器不会绘制。
		 */
		function linesOf(row) {
			if (!row) return [];
			var hidden = row.getAttribute("data-dso-hide") === "1";
			if (hidden) row.removeAttribute("data-dso-hide");
			// 先撤掉上一轮的标记，否则被隐藏的行量出来高 0，会被当成不存在 → 行号错位。
			// 量完必须原样贴回去：这个函数也被「只是想知道有几行」的调用方（名单、下拉）用着，
			// 它们不该顺手把当下的摘要显示效果清掉。
			var prev = [];
			var stale = row.querySelectorAll("[data-dso-vshow]");
			for (var s = 0; s < stale.length; s += 1) {
				prev.push({ node: stale[s], val: stale[s].getAttribute("data-dso-vshow") });
				stale[s].removeAttribute("data-dso-vshow");
			}
			var out = [];
			try {
				collectLines(row, out, 0);
			} catch (e) {
				out = [];
			}
			for (var p = 0; p < prev.length; p += 1) prev[p].node.setAttribute("data-dso-vshow", prev[p].val);
			if (hidden) row.setAttribute("data-dso-hide", "1");
			return out;
		}

		/** 量一个条目是「单行」还是「复合」。 */
		function rowCountOf(row) {
			var n = 0;
			try {
				n = linesOf(row).length;
			} catch (e) {
				n = 0;
			}
			return n;
		}

		/**
		 * 摘要落地：给复合条目内部的视觉行打 data-dso-vshow（CSS 里 0 = display:none）。
		 * 不拆 DOM、不加包裹层；展开或取消摘要时把标记全部撤掉（linesOf 已清）。
		 */
		function applySummary(row, on, picks) {
			if (!row) return;
			var lines = linesOf(row);
			if (!on || lines.length < 2) {
				// 单行条目没有“摘要”可言，等价于显示
				row.removeAttribute("data-dso-summary");
				clearSummaryMarks(row, null);
				return;
			}
			// 勾选集合 → 有效行号集合。一个都没勾（首次打开、或行数变少导致全部越界）时留第 1 行。
			var want = {};
			var picked = 0;
			if (picks instanceof Array) {
				for (var p = 0; p < picks.length; p += 1) {
					var v = picks[p] | 0;
					if (v >= 0 && v < lines.length) {
						want[v] = 1;
						picked += 1;
					}
				}
			}
			if (!picked) want[0] = 1;
			row.setAttribute("data-dso-summary", "1");
			var keep = [];
			for (var i = 0; i < lines.length; i += 1) {
				for (var j = 0; j < lines[i].nodes.length; j += 1) {
					var node = lines[i].nodes[j];
					node.setAttribute("data-dso-vshow", want[i] ? "1" : "0");
					keep.push(node);
				}
			}
			// 结构变化后可能留下不在本次集合里的旧标记，顺手清掉
			clearSummaryMarks(row, keep);
		}

		/** 清掉 row 内部除了 keep 之外的 data-dso-vshow 标记（keep 为 null 表示全清）。 */
		function clearSummaryMarks(row, keep) {
			var all = row.querySelectorAll("[data-dso-vshow]");
			for (var i = 0; i < all.length; i += 1) {
				var n = all[i];
				var keepIt = false;
				if (keep) {
					for (var k = 0; k < keep.length; k += 1) {
						if (keep[k] === n) {
							keepIt = true;
							break;
						}
					}
				}
				if (!keepIt) n.removeAttribute("data-dso-vshow");
			}
		}

		/** 自定义顺序表（只含非悬浮条目）。 */
		function orderList(side) {
			return side === "top" ? state.topOrder : state.bottomOrder;
		}

		/**
		 * 按「自定义顺序 + 悬浮沉底」重排条目。
		 *
		 * 悬浮条目（无论哪种悬浮）不参与排序管理，永远排在所属区域的最后，彼此之间保持默认顺序；
		 * 取消悬浮后自动回到它在顺序表里的位置（顺序表里没有就接在已排条目之后）。
		 */
		function orderedItems(side, items) {
			var list = items || itemsOf(side);
			var order = orderList(side);
			var idx = {};
			for (var i = 0; i < order.length; i += 1) idx[order[i]] = i;
			var pack = [];
			for (var j = 0; j < list.length; j += 1) {
				var it = list[j];
				var isFloat = side === "bottom" && inList(state.floatKeys, it.key);
				pack.push({
					it: it,
					float: isFloat ? 1 : 0,
					pos: Object.prototype.hasOwnProperty.call(idx, it.key) ? idx[it.key] : 900 + j,
					seq: j
				});
			}
			pack.sort(function (a, b) {
				if (a.float !== b.float) return a.float - b.float;
				if (a.pos !== b.pos) return a.pos - b.pos;
				return a.seq - b.seq;
			});
			var out = [];
			for (var k = 0; k < pack.length; k += 1) out.push(pack[k].it);
			return out;
		}

		/**
		 * 排序落地顺序：
		 *   ① 给行打 data-dso-ord，由注入 CSS 的 order 规则接管（不碰 React 的 DOM，首选）；
		 *   ② 用 getComputedStyle 自检：容器是不是真 flex 列、第 2 行的 order 有没有真的变成 1；
		 *   ③ 自检不过（宿主容器被 `display:contents`/`!important` 之类抢掉，或行被包在非 flex 层里）
		 *      就退回直接按目标顺序 insertBefore —— 兜底，只在 order 确实无效时才动 DOM。
		 *
		 * 之前只有 ①，而底部容器的真实层叠关系和顶部不一样，于是出现「上方能拖、下方拖了没反应」。
		 */
		var ORDER_DIAG = { top: null, bottom: null };

		function computedOf(node) {
			try {
				return node && window.getComputedStyle ? window.getComputedStyle(node) : null;
			} catch (e) {
				return null;
			}
		}

		/** 保证容器是 flex 列：order 只在 flex/grid 容器里对直接子节点生效。 */
		function ensureFlexColumn(box) {
			if (!box) return true;
			var cs = computedOf(box);
			// 拿不到计算样式（测试环境 / 极早时机）时不做判断，信任 CSS
			if (!cs) return true;
			if (cs.display === "flex" && cs.flexDirection === "column") return true;
			try {
				box.style.setProperty("display", "flex", "important");
				box.style.setProperty("flex-direction", "column", "important");
				box.style.setProperty("align-items", "stretch", "important");
			} catch (e) {}
			cs = computedOf(box);
			return !cs || (cs.display === "flex" && cs.flexDirection === "column");
		}

		/** 兜底：按目标顺序把行摆一遍。已经对的位置不碰，避免每帧抖动。 */
		var domMoves = { t: 0, n: 0, blocked: false };

		function reorderDom(seq, box) {
			if (!box || seq.length < 2 || domMoves.blocked) return false;
			var rows = [];
			for (var i = 0; i < seq.length; i += 1) {
				if (seq[i].row.parentNode === box) rows.push(seq[i].row);
			}
			if (rows.length < 2) return false;
			var moved = false;
			var cursor = rows[0];
			for (var j = 1; j < rows.length; j += 1) {
				var want = rows[j];
				var next = cursor.nextSibling;
				if (next !== want) {
					box.insertBefore(want, next);
					moved = true;
				}
				cursor = want;
			}
			if (moved) {
				// 自我节流：万一 React 每次都把顺序改回去，别让两边打架把界面拖卡
				var now = Date.now();
				if (now - domMoves.t > 500) {
					domMoves.t = now;
					domMoves.n = 1;
				} else {
					domMoves.n += 1;
					if (domMoves.n > 4) {
						domMoves.blocked = true;
						window.setTimeout(function () {
							domMoves.blocked = false;
							domMoves.n = 0;
						}, 5000);
					}
				}
			}
			return moved;
		}

		function applyOrder(side, items, box) {
			var seq = orderedItems(side, items);
			if (!box) box = side === "top" ? panelNav() : bottomBox();

			for (var i = 0; i < seq.length; i += 1) {
				var row = seq[i].row;
				var v = String(Math.min(i, 40));
				if (row.getAttribute("data-dso-ord") !== v) row.setAttribute("data-dso-ord", v);
			}

			var flexible = ensureFlexColumn(box);

			// 探针：第 2 行应当拿到 order:1。读不到值（无 getComputedStyle）就不判负。
			var probe = "";
			if (seq.length > 1) {
				var pcs = computedOf(seq[1].row);
				if (pcs && pcs.order !== "" && pcs.order !== undefined) probe = String(pcs.order);
			}
			// auto / 空 都算“读不出有效值”，只有明确读到非 1 的数值才判 CSS 失效
			var cssOk = probe === "" || probe === "1" || probe === "auto";

			if (!cssOk || !flexible) reorderDom(seq, box);

			var bcs = computedOf(box);
			ORDER_DIAG[side] = {
				count: seq.length,
				display: bcs ? bcs.display : "?",
				dir: bcs ? bcs.flexDirection : "?",
				probe: probe || "-",
				css: cssOk,
				flex: flexible
			};
		}

		/** 一行诊断，显示在设置面板底部：用来判断排序到底是走 order 还是走了 DOM 兜底。 */
		function diagText() {
			function one(name, d) {
				if (!d) return name + " \u2014";
				var ok = d.flex && d.css;
				var tail;
				if (ok) tail = "order " + d.probe + " \u2713";
				else if (domMoves.blocked) tail = "\u88ab React \u8fd8\u539f";
				else tail = "DOM \u515c\u5e95";
				return name + " " + d.count + " \u9879 \u00b7 " + d.display + "/" + d.dir + " \u00b7 " + tail;
			}
			return one("\u4e0a\u65b9", ORDER_DIAG.top) + "\u3000" + one("\u4e0b\u65b9", ORDER_DIAG.bottom);
		}
		//#endregion

		//#region 顶部组：全局面板
		function buildTopBar() {
			var bar = el("div", { "data-dso-bar": "top", role: "button", tabindex: "0" });
			bar.appendChild(el("span", { "data-dso-chev": "1" }, "\u25be"));
			bar.appendChild(el("span", { "data-dso-bar-label": "1" }, barLabel("top")));
			bar.appendChild(el("span", { "data-dso-count": "1" }, "0"));
			bar.appendChild(
				el(
					"span",
					{ "data-dso-scrollmark": "1", title: "\u6761\u76ee\u8d85\u51fa\u9608\u503c\uff1a\u53ef\u4e2d\u952e\u62d6\u52a8\u6eda\u52a8" },
					"\u21d5"
				)
			);
			var pin = el("button", { "data-dso-btn": "1", "data-dso-pin": "1", title: "\u56fa\u5b9a\u5c55\u5f00" }, "\u2691");
			var gear = el("button", { "data-dso-btn": "1", "data-dso-gear": "1", title: "\u8bbe\u7f6e" }, "\u2699");

			bar.appendChild(pin);
			bar.appendChild(gear);
			return bar;
		}

		function setText(node, text) {
			// 只在真的变化时写入：textContent 赋值会替换文本节点，
			// 被 MutationObserver 看见就是一次 childList 变更，会形成每帧自触发。
			if (node && node.textContent !== text) node.textContent = text;
		}

		function renderTopBar(bar, count) {
			var collapsed = state.topCollapsed && !state.topPinned;
			var isScroll = !collapsed && count > state.topLimit;
			bar.setAttribute("data-dso-pinned", state.topPinned ? "1" : "0");
			bar.setAttribute("aria-expanded", collapsed ? "false" : "true");

			setText(bar.querySelector("[data-dso-bar-label]"), barLabel("top"));
			setText(bar.querySelector("[data-dso-count]"), String(count));

			var mark = bar.querySelector("[data-dso-scrollmark]");
			if (mark) mark.setAttribute("data-dso-gone", isScroll ? "0" : "1");

			var pin = bar.querySelector("[data-dso-pin]");
			if (pin) pin.setAttribute("data-dso-on", state.topPinned ? "1" : "0");
		}

		function applyTop() {
			var nav = panelNav();
			if (!nav) return;

			var parent = nav.parentNode;
			if (!parent) return;

			var items = itemsOf("top");
			if (items.length === 0) {
				var stale = parent.querySelector("[data-dso-bar='top']");
				if (stale) stale.remove();
				return;
			}
			applyOrder("top", items, nav);

			var bar = parent.querySelector("[data-dso-bar='top']");
			if (!bar) {
				bar = buildTopBar();
				parent.insertBefore(bar, nav);
				bindTopBar(bar, nav);
			} else if (bar.nextElementSibling !== nav) {
				parent.insertBefore(bar, nav);
			}

			var collapsed = state.topCollapsed && !state.topPinned;
			var wide = isSidebarWide();

			// 图标条态：交还给原生，不折叠、不插滚动
			if (!wide) {
				for (var r = 0; r < items.length; r += 1) items[r].row.removeAttribute("data-dso-hide");
				nav.removeAttribute("data-dso-collapsed");
				nav.removeAttribute("data-dso-scroll");
				bar.setAttribute("data-dso-rail", "1");
				renderTopBar(bar, items.length);
				return;
			}
			bar.setAttribute("data-dso-rail", "0");

			// 折叠时逐条隐藏，但例外名单里的保持显示
			var kept = 0;
			for (var i = 0; i < items.length; i += 1) {
				var keep = inList(state.topExcept, items[i].key);
				if (keep) kept += 1;
				if (collapsed && !keep) items[i].row.setAttribute("data-dso-hide", "1");
				else items[i].row.removeAttribute("data-dso-hide");
			}

			var visibleCount = collapsed ? kept : items.length;
			var isScroll = !collapsed && items.length > state.topLimit;
			// nav 上只要还有可见行就正常排；全被隐藏时 nav 自身收缩即可
			nav.setAttribute("data-dso-collapsed", collapsed && visibleCount === 0 ? "1" : "0");
			nav.setAttribute("data-dso-scroll", isScroll ? "1" : "0");
			if (isScroll) {
				var h = rowHeightOf(nav) * state.topLimit + 2;
				nav.style.setProperty("--dso-max-h", h + "px");
				attachMiddleDrag(nav);
			}

			renderTopBar(bar, items.length);
			// 布局变化（另一块浮窗被拖动、宿主重排）后重叠状态可能过期，顺手刷新
			markOverlaps();
		}

		function bindTopBar(bar, nav) {
			bar.addEventListener("click", function (e) {
				var target = e.target;
				if (target.closest("[data-dso-pin]")) {
					state.topPinned = !state.topPinned;
					if (state.topPinned) state.topCollapsed = false;
					saveState();
					applyTop();
					e.stopPropagation();
					return;
				}
				if (target.closest("[data-dso-gear]")) {
					toggleMainPanel(bar);
					e.stopPropagation();
					return;
				}
				var nowCollapsed = state.topCollapsed && !state.topPinned;
				state.topCollapsed = !nowCollapsed;
				saveState();
				applyTop();
			});

			bar.addEventListener("keydown", function (e) {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					state.topCollapsed = !state.topCollapsed;
					saveState();
					applyTop();
				}
			});

			// 未固定时：选中一个面板后自动收起
			nav.addEventListener(
				"click",
				function (e) {
					var btn = e.target.closest("button");
					if (!btn) return;
					if (state.topPinned) return;
					if (!state.topCollapsed) {
						state.topCollapsed = true;
						saveState();
						window.setTimeout(applyTop, 0);
					}
				},
				true
			);
		}
		//#endregion

		//#region 底部组：底栏区块（默认名“记忆与任务”，可自定义）
		function buildBottomBar() {
			var bar = el("div", { "data-dso-bar": "bottom", role: "button", tabindex: "0" });
			bar.appendChild(el("span", { "data-dso-chev": "1" }, "\u25be"));
			bar.appendChild(el("span", { "data-dso-bar-label": "1" }, barLabel("bottom")));
			bar.appendChild(el("span", { "data-dso-count": "1" }, "0"));
			bar.appendChild(
				el(
					"span",
					{ "data-dso-scrollmark": "1", title: "\u6761\u76ee\u8d85\u51fa\u9608\u503c\uff1a\u53ef\u4e2d\u952e\u62d6\u52a8\u6eda\u52a8" },
					"\u21d5"
				)
			);
			var pin = el("button", { "data-dso-btn": "1", "data-dso-pin": "1", title: "\u56fa\u5b9a\u5c55\u5f00" }, "\u2691");
			bar.appendChild(pin);
			return bar;
		}

		function renderBottomBar(bar, total) {
			var collapsed = state.bottomCollapsed && !state.bottomPinned;
			var isScroll = !collapsed && total > state.bottomLimit;
			bar.setAttribute("data-dso-pinned", state.bottomPinned ? "1" : "0");
			bar.setAttribute("aria-expanded", collapsed ? "false" : "true");

			setText(bar.querySelector("[data-dso-bar-label]"), barLabel("bottom"));
			setText(bar.querySelector("[data-dso-count]"), String(total));

			var mark = bar.querySelector("[data-dso-scrollmark]");
			if (mark) mark.setAttribute("data-dso-gone", isScroll ? "0" : "1");

			var pin = bar.querySelector("[data-dso-pin]");
			if (pin) pin.setAttribute("data-dso-on", state.bottomPinned ? "1" : "0");
		}

		function applyBottom() {
			var fa = footerActions();
			var area = footArea();
			if (!fa || !area || fa.parentNode !== area) return;

			var box = bottomBox();
			if (!box) return;
			var items = itemsOf("bottom");

			if (items.length === 0) {
				var staleBar = area.querySelector("[data-dso-bar='bottom']");
				if (staleBar) staleBar.remove();
				return;
			}
			applyOrder("bottom", items, box);

			// 折叠条插在 footArea 里、footerActions 之前：
			// 也就是「记忆任务归档上面、登录按钮上面」，而登录所在的 settingsArea 完全不动。
			var bar = area.querySelector("[data-dso-bar='bottom']");
			if (!bar) {
				bar = buildBottomBar();
				area.insertBefore(bar, fa);
				bindBottomBar(bar);
			} else if (bar.nextElementSibling !== fa || bar.parentNode !== area) {
				area.insertBefore(bar, fa);
			}

			var collapsed = state.bottomCollapsed && !state.bottomPinned;
			var wide = isSidebarWide();

			if (!wide) {
				// 图标条态：宿主本身就不显示这些行，只有在悬浮中的浮窗要继续按「保持显示」决定去留，
				// 否则用户明明把它收起来了，一收侧栏又冒出来。
				for (var q = 0; q < items.length; q += 1) {
					var qFloat = inList(state.floatKeys, items[q].key);
					var qKeep = inList(state.bottomExcept, items[q].key);
					if (qFloat && !qKeep) items[q].row.setAttribute("data-dso-hide", "1");
					else items[q].row.removeAttribute("data-dso-hide");
				}
				box.removeAttribute("data-dso-scroll");
				box.removeAttribute("data-dso-bottombox");
				bar.setAttribute("data-dso-rail", "1");
				renderBottomBar(bar, items.length);
				return;
			}
			bar.setAttribute("data-dso-rail", "0");

			// 折叠时三种状态：
			//   「显示」  —— 整条保留（悬浮条目同样靠它决定看不看得见，取消即把浮窗收起来）；
			//   「摘要」  —— 整条不隐藏，但只保留选定的那一视觉行（与「显示」互斥）；
			//   都没勾    —— 整条隐藏。
			// 展开态下一律恢复原样，摘要标记全部撤掉。
			// 0.1.4 之前悬浮行被强制可见，导致“取消保持显示”对浮窗完全没作用。
			for (var i = 0; i < items.length; i += 1) {
				var key = items[i].key;
				var row = items[i].row;
				var keep = inList(state.bottomExcept, key);
				var summ = !keep && inList(state.summaryKeys, key);
				if (collapsed && !keep && !summ) {
					row.setAttribute("data-dso-hide", "1");
					if (row.hasAttribute("data-dso-summary")) applySummary(row, false, 0);
				} else if (collapsed && summ) {
					row.removeAttribute("data-dso-hide");
					applySummary(row, true, summaryRowsOf(key));
				} else {
					row.removeAttribute("data-dso-hide");
					if (row.hasAttribute("data-dso-summary")) applySummary(row, false, 0);
				}
			}

			var isScroll = !collapsed && items.length > state.bottomLimit;
			box.setAttribute("data-dso-bottombox", "1");
			box.setAttribute("data-dso-scroll", isScroll ? "1" : "0");
			if (isScroll) {
				var limit = Math.max(1, state.bottomLimit);
				var h = 0;
				for (var j = 0; j < items.length && j < limit; j += 1) {
					h += readableH(items[j].row) || FALLBACK_ROW_H;
				}
				h = Math.min(h + 2, Math.round(window.innerHeight * 0.55));
				box.style.setProperty("--dso-max-h", Math.max(96, h) + "px");
				attachMiddleDrag(box);
				// 新条目贴底出现：滚动条停在底部，视觉上是从下往上排的
				window.requestAnimationFrame(function () {
					box.scrollTop = box.scrollHeight;
				});
			}

			renderBottomBar(bar, items.length);
		}

		function bindBottomBar(bar) {
			bar.addEventListener("click", function (e) {
				if (e.target.closest("[data-dso-pin]")) {
					state.bottomPinned = !state.bottomPinned;
					if (state.bottomPinned) state.bottomCollapsed = false;
					saveState();
					applyBottom();
					e.stopPropagation();
					return;
				}
				var nowCollapsed = state.bottomCollapsed && !state.bottomPinned;
				state.bottomCollapsed = !nowCollapsed;
				saveState();
				applyBottom();
			});

			bar.addEventListener("keydown", function (e) {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					state.bottomCollapsed = !state.bottomCollapsed;
					saveState();
					applyBottom();
				}
			});
		}
		//#endregion

		//#region 悬浮窗
		/**
		 * 悬浮机制对所有条目统一：给行打 data-dso-float，position:fixed + CSS 变量接管坐标，
		 * 不碰插件自己的渲染。工作台只是其中一个目标（它自带一套只能上下浮、横向写死 14px 的实现，
		 * 我们用 CSS 变量把 left 一并接管），没有专属按钮 —— 任何底栏条目都在名单里勾。
		 */
		function clampX(x) {
			return Math.min(Math.max(0, x), Math.max(0, window.innerWidth - 120));
		}

		function clampY(y) {
			return Math.min(Math.max(0, y), Math.max(0, window.innerHeight - 44));
		}

		function zFor(idx) {
			return 60 + Math.min(idx, 20);
		}

		function bindFloat(row, key) {
			if (row.__dsoFloatBound !== true) {
				row.__dsoFloatBound = true;

				// 拖动：按住 Alt，或从顶部 22px 的标题带拖
				row.addEventListener(
					"mousedown",
					function (e) {
						if (row.getAttribute("data-dso-float") !== "1") return;
						if (e.button !== 0) return;
						var rect = row.getBoundingClientRect();
						var inHeader = e.clientY - rect.top <= 22;
						if (!e.altKey && !inHeader) return;
						e.preventDefault();
						e.stopPropagation();

						var k = row.__dsoKey || "";
						var startX = e.clientX;
						var startY = e.clientY;
						var originLeft = rect.left;
						var originTop = rect.top;
						// 拖动过程中算出来的目标位置，抬起时直接存它：
						// getBoundingClientRect 在有 transform / 缩放 / 亚像素的情况下会和写进去的值对不上，
						// 存“我算出来的值”才能保证再次悬浮时像素级回到原地。
						var curLeft = originLeft;
						var curTop = originTop;
						var moved = false;
						row.setAttribute("data-dso-dragging", "1");
						row.style.setProperty("--dso-z", "95");

						function onMove(ev) {
							curLeft = clampX(originLeft + (ev.clientX - startX));
							curTop = clampY(originTop + (ev.clientY - startY));
							moved = true;
							row.setAttribute("data-dso-pos", "1");
							row.style.setProperty("--dso-x", curLeft + "px");
							row.style.setProperty("--dso-y", curTop + "px");
							hideHint();
							markOverlaps();
						}
						function onUp() {
							row.removeAttribute("data-dso-dragging");
							row.style.removeProperty("--dso-z");
							window.removeEventListener("mousemove", onMove, true);
							window.removeEventListener("mouseup", onUp, true);
							if (k) {
								var r = row.getBoundingClientRect();
								state.floatPos[k] = moved
									? { x: Math.round(curLeft), y: Math.round(curTop) }
									: { x: Math.round(r.left), y: Math.round(r.top) };
								saveState();
							}
							markOverlaps();
						}
						window.addEventListener("mousemove", onMove, true);
						window.addEventListener("mouseup", onUp, true);
					},
					true
				);

				row.addEventListener("mouseenter", function () {
					if (row.getAttribute("data-dso-float") !== "1") return;
					if (row.getAttribute("data-dso-dragging") === "1") return;
					showHint(row);
				});
				row.addEventListener("mouseleave", function () {
					hideHint();
				});

				// 滚轮在悬浮窗内滚动内容时提示会跟着错位，简单起见直接收起
				row.addEventListener("scroll", hideHint, true);
			}
			row.__dsoKey = key;
		}

		/** 无框的 “Alt 拖动” 提示：挂在 body 上，跟着悬浮窗底边走，不受容器 overflow 裁剪。 */
		function hintNode() {
			var node = document.querySelector("[data-dso-hint]");
			if (node) return node;
			node = el("div", { "data-dso-hint": "1", "aria-hidden": "true" }, "Alt \u62d6\u52a8");
			document.body.appendChild(node);
			return node;
		}

		function showHint(row) {
			var r = row.getBoundingClientRect();
			var node = hintNode();
			node.setAttribute("data-dso-show", "1");
			var top = r.bottom + 5;
			if (top + 16 > window.innerHeight) top = r.bottom - 18;
			node.style.left = Math.round(r.left + 10) + "px";
			node.style.top = Math.round(top) + "px";
		}

		function hideHint() {
			var node = document.querySelector("[data-dso-hint]");
			if (node) node.removeAttribute("data-dso-show");
		}

		function applyFloats() {
			var items = itemsOf("bottom");
			for (var i = 0; i < items.length; i += 1) {
				var row = items[i].row;
				var key = items[i].key;
				bindFloat(row, key);

				if (!inList(state.floatKeys, key)) {
					if (row.getAttribute("data-dso-float") === "1") {
						row.removeAttribute("data-dso-float");
						row.removeAttribute("data-dso-pos");
						row.removeAttribute("data-dso-dragging");
						row.removeAttribute("data-dso-overlap");
						row.style.removeProperty("--dso-x");
						row.style.removeProperty("--dso-y");
						row.style.removeProperty("--dso-z");
					}
					continue;
				}

				row.setAttribute("data-dso-float", "1");
				row.style.setProperty("--dso-z", String(zFor(i)));
				var pos = state.floatPos[key];
				if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
					row.setAttribute("data-dso-pos", "1");
					row.style.setProperty("--dso-x", clampX(pos.x) + "px");
					row.style.setProperty("--dso-y", clampY(pos.y) + "px");
				} else if (row.getAttribute("data-dso-pos") !== "1") {
					// 首次悬浮：从右下往左上错开摆放，避免一开就叠在一起
					row.setAttribute("data-dso-pos", "1");
					var off = 20 * i;
					row.style.setProperty("--dso-x", Math.max(12, window.innerWidth - FLOAT_W - 24 - off) + "px");
					row.style.setProperty("--dso-y", Math.max(56, window.innerHeight - 420 + off) + "px");
				}
			}

			// 清掉已经不在悬浮名单里的残留标记
			var floats = document.querySelectorAll("[data-dso-float='1'][data-dso-overlap]");
			for (var f = 0; f < floats.length; f += 1) {
				var fk = floats[f].__dsoKey;
				if (!inList(state.floatKeys, fk)) floats[f].removeAttribute("data-dso-overlap");
			}

			markOverlaps();
		}

		/** 悬浮窗互相压住时，给两边都打上 data-dso-overlap（顶部换成加粗告警边）。 */
		function markOverlaps() {
			var nodes = document.querySelectorAll("[data-dso-float='1']");
			var rects = [];
			for (var i = 0; i < nodes.length; i += 1) {
				var r = nodes[i].getBoundingClientRect();
				if (r.width < 4 || r.height < 4) continue;
				rects.push({ node: nodes[i], r: r });
			}
			for (var a = 0; a < rects.length; a += 1) {
				var hit = false;
				for (var b = 0; b < rects.length; b += 1) {
					if (a === b) continue;
					var ra = rects[a].r;
					var rb = rects[b].r;
					if (ra.left < rb.right - 1 && rb.left < ra.right - 1 && ra.top < rb.bottom - 1 && rb.top < ra.bottom - 1) {
						hit = true;
						break;
					}
				}
				if (hit) rects[a].node.setAttribute("data-dso-overlap", "1");
				else rects[a].node.removeAttribute("data-dso-overlap");
			}
		}
		//#endregion

		//#region 设置弹窗
		function closePanels() {
			var all = document.querySelectorAll("[data-dso-panel]");
			for (var i = 0; i < all.length; i += 1) all[i].remove();
			hideHint();
		}

		function placePanel(panel, anchorRect, preferLeft) {
			var w = panel.offsetWidth || 240;
			var h = panel.offsetHeight || 200;
			var left = preferLeft ? anchorRect.left - w - 8 : anchorRect.right + 8;
			if (left + w > window.innerWidth - 8) left = Math.max(8, anchorRect.right - w);
			if (left < 8) left = 8;
			var top = Math.max(8, Math.min(anchorRect.top, window.innerHeight - h - 8));
			panel.style.left = Math.round(left) + "px";
			panel.style.top = Math.round(top) + "px";
		}

		function toggleMainPanel(anchor) {
			var exist = document.querySelector("[data-dso-panel='1']");
			if (exist) {
				closePanels();
				return;
			}
			closePanels();

			var panel = el("div", { "data-dso-panel": "1", role: "dialog" });
			var head = el("div", { "data-dso-head": "1" });
			head.appendChild(el("h4", null, "\u4fa7\u680f\u6574\u7406"));
			var closeBtn = el("button", { "data-dso-x": "1", type: "button", title: "\u5173\u95ed" }, "\u2715");
			head.appendChild(closeBtn);
			panel.appendChild(head);
			closeBtn.addEventListener("click", function () {
				closePanels();
			});

			// 名称自定义：底栏内容是各插件往 slot sidebar.footer.action 里塞的，
			// 没有固定语义，所以名字交给用户；留空回落到默认名。
			panel.appendChild(
				textRow("\u4e0a\u65b9\u540d\u79f0", state.topLabel, TOP_LABEL, function (v) {
					state.topLabel = v;
					saveState();
					applyTop();
				})
			);
			panel.appendChild(
				textRow("\u4e0b\u65b9\u540d\u79f0", state.bottomLabel, BOTTOM_LABEL, function (v) {
					state.bottomLabel = v;
					saveState();
					applyBottom();
				})
			);

			panel.appendChild(el("div", { "data-dso-sep": "1" }));

			panel.appendChild(
				numberRow("\u9876\u90e8\u6eda\u52a8\u9608\u503c", state.topLimit, 3, 20, function (v) {
					state.topLimit = v;
					saveState();
					applyTop();
				})
			);
			panel.appendChild(
				numberRow("\u5e95\u90e8\u6eda\u52a8\u9608\u503c", state.bottomLimit, 3, 20, function (v) {
					state.bottomLimit = v;
					saveState();
					applyBottom();
				})
			);
			panel.appendChild(
				checkRow("\u9876\u90e8\u9ed8\u8ba4\u6298\u53e0", state.topCollapsed, function (v) {
					state.topCollapsed = v;
					if (v) state.topPinned = false;
					saveState();
					applyTop();
				})
			);
			panel.appendChild(
				checkRow("\u5e95\u90e8\u9ed8\u8ba4\u6298\u53e0", state.bottomCollapsed, function (v) {
					state.bottomCollapsed = v;
					if (v) state.bottomPinned = false;
					saveState();
					applyBottom();
				})
			);

			// 二级弹窗入口：整宽按钮，带图标与右侧箭头，一眼就是可点的地方
			var entry = el("button", {
				"data-dso-entry": "1",
				type: "button",
				title: "\u9009\u62e9\u54ea\u4e9b\u6761\u76ee\u6298\u53e0\u65f6\u4ecd\u663e\u793a\u3001\u54ea\u4e9b\u53d8\u6210\u60ac\u6d6e\u7a97"
			});
			entry.appendChild(el("span", { "data-dso-entry-icon": "1" }, "\u2630"));
			entry.appendChild(el("span", { "data-dso-entry-label": "1" }, "\u4f8b\u5916\u4e0e\u60ac\u6d6e\u540d\u5355"));
			entry.appendChild(el("span", { "data-dso-entry-chev": "1" }, "\u203a"));
			panel.appendChild(entry);
			entry.addEventListener("click", function (e) {
				e.stopPropagation();
				toggleExceptionPanel(panel);
			});

			var reset = el("button", { "data-dso-mini": "1", "data-dso-reset": "1", type: "button" }, "\u6062\u590d\u9ed8\u8ba4");
			var footer = el("div", { "data-dso-row": "1" });
			footer.appendChild(el("span", { "data-dso-note": "1" }, "\u5bd2\u8f7d\u540e\u4ecd\u751f\u6548"));
			footer.appendChild(reset);
			panel.appendChild(footer);
			reset.addEventListener("click", function () {
				state = clone(DEFAULTS);
				saveState();
				applyAll();
				closePanels();
			});

			panel.appendChild(el("div", { "data-dso-note": "1", "data-dso-diag": "1" }, diagText()));

			panel.appendChild(
				el(
					"div",
					{ "data-dso-note": "1" },
					"\u60ac\u6d6e\u7a97\uff1a\u6309 Alt \u62d6\u52a8\uff0c\u6216\u4ece\u9876\u90e8 3px \u6293\u53d6\u5e26\u62d6\u3002"
				)
			);

			document.body.appendChild(panel);
			placePanel(panel, anchor.getBoundingClientRect(), false);

			window.setTimeout(function () {
				function onDocDown(ev) {
					if (!document.querySelector("[data-dso-panel]")) return;
					var t = ev.target;
					if (!t || typeof t.closest !== "function") return;
					if (t.closest("[data-dso-panel]")) return;
					if (anchor.contains(t)) return;
					if (t.closest("[data-dso-bar]")) return;
					closePanels();
					document.removeEventListener("mousedown", onDocDown, true);
				}
				document.addEventListener("mousedown", onDocDown, true);
			}, 0);
		}

		/**
		 * 二级弹窗：列出顶栏/底栏所有可折叠条目。
		 *   保持显示 —— 折叠时不被隐藏；对悬浮条目来说，取消它就是“把浮窗收起来”。
		 *   悬浮     —— 脱离侧栏变成可拖动浮窗（仅底栏条目有独立内容）。
		 */
		function toggleExceptionPanel(mainPanel) {
			var exist = document.querySelector("[data-dso-panel='2']");
			if (exist) {
				exist.remove();
				return;
			}

			var panel = el("div", { "data-dso-panel": "2", role: "dialog" });
			var head = el("div", { "data-dso-head": "1" });
			head.appendChild(el("h4", null, "\u4f8b\u5916\u4e0e\u60ac\u6d6e\u540d\u5355"));
			var close = el("button", { "data-dso-x": "1", type: "button", title: "\u5173\u95ed" }, "\u2715");
			head.appendChild(close);
			panel.appendChild(head);
			close.addEventListener("click", function () {
				panel.remove();
			});

			var body = el("div", null, null);
			panel.appendChild(body);

			/** 名单里每行按 key 索引，方便只挪节点而不重建（重建会丢焦点与滚动位置）。 */
			var lineByKey = {};
			/** 每块分区最后一个标题/说明节点，行就插在它后面。 */
			var headBySide = {};

			/** kind: "keep" | "summary" | "float"。带上 key 才能在一处状态变更后同步所有胶囊。 */
			function chip(text, key, kind, checked, title, onToggle, disabled) {
				var lab = el("label", { "data-dso-check": "1", title: title, "data-dso-key": key, "data-dso-kind": kind });
				if (checked) lab.setAttribute("data-dso-on", "1");
				if (disabled) lab.setAttribute("data-dso-off", "1");
				var box = el("input", { type: "checkbox" });
				box.checked = !!checked;
				if (disabled) box.disabled = true;
				box.addEventListener("change", function () {
					onToggle(box.checked === true);
					syncChips();
				});
				lab.appendChild(box);
				lab.appendChild(el("span", null, text));
				return lab;
			}

			/**
			 * 状态可能被别处改动（勾「悬浮」会点亮「显示」并清掉「摘要」，反之亦然），
			 * 所以每次操作后统一回读一次，避免胶囊显示与真实状态不一致。
			 */
			function syncChips() {
				var labels = body.querySelectorAll("[data-dso-check]");
				for (var i = 0; i < labels.length; i += 1) {
					var lab = labels[i];
					var key = lab.getAttribute("data-dso-key") || "";
					var kind = lab.getAttribute("data-dso-kind");
					var on;
					if (kind === "float") on = inList(state.floatKeys, key);
					else if (kind === "summary") on = inList(state.summaryKeys, key);
					else on = inList(key.indexOf("top:") === 0 ? state.topExcept : state.bottomExcept, key);
					lab.setAttribute("data-dso-on", on ? "1" : "0");
					var box = lab.querySelector("input");
					if (box && box.checked !== on) box.checked = on;
					// 摘要模式下不支持悬浮：把悬浮胶囊置灰（已有浮窗在 setSummary 里已经收回侧栏）
					if (kind === "float" && box) {
						var blocked = inList(state.summaryKeys, key);
						box.disabled = blocked;
						lab.setAttribute("data-dso-off", blocked ? "1" : "0");
					}
				}
			}

			function setExcept(side, key, on) {
				setKeep(side, key, on);
				applyAll();
				// 「显示」与「摘要」互斥，勾上之后摘要行下拉要立刻消失
				refreshList();
			}

			/** 把列表当前的视觉顺序写回状态（悬浮条目不参与，统一排到最后）。 */
			function commitOrder(side) {
				var lines = body.querySelectorAll("[data-dso-item][data-dso-item-side='" + side + "']");
				var keys = [];
				var floats = [];
				for (var i = 0; i < lines.length; i += 1) {
					var k = lines[i].getAttribute("data-dso-item-key") || "";
					if (!k) continue;
					if (side === "bottom" && inList(state.floatKeys, k)) floats.push(k);
					else keys.push(k);
				}
				if (side === "top") state.topOrder = keys.concat(floats);
				else state.bottomOrder = keys.concat(floats);
				saveState();
				applyAll();
			}

			/** 拖动排序：只从抓手起拖，拖动中直接把行挪到目标位置，松手才落盘。 */
			function bindReorder(line, side) {
				var grip = line.querySelector("[data-dso-grip]");
				if (!grip || grip.getAttribute("data-dso-off") === "1") return;
				grip.addEventListener("mousedown", function (ev) {
					if (ev.button !== 0) return;
					ev.preventDefault();
					ev.stopPropagation();

					var startY = ev.clientY;
					var moved = false;

					function siblings() {
						var all = body.querySelectorAll("[data-dso-item][data-dso-item-side='" + side + "']");
						var out = [];
						for (var i = 0; i < all.length; i += 1) {
							if (all[i] === line) continue;
							var g = all[i].querySelector("[data-dso-grip]");
							if (g && g.getAttribute("data-dso-off") === "1") continue;
							out.push(all[i]);
						}
						return out;
					}

					function onMove(e) {
						if (!moved) {
							if (Math.abs(e.clientY - startY) < 3) return;
							moved = true;
							line.setAttribute("data-dso-dragging", "1");
						}
						var list = siblings();
						var ref = null;
						for (var i = 0; i < list.length; i += 1) {
							var r = list[i].getBoundingClientRect();
							if (e.clientY < r.top + r.height / 2) {
								ref = list[i];
								break;
							}
						}
						if (ref) {
							if (ref !== line.nextElementSibling) body.insertBefore(line, ref);
						} else if (list.length) {
							var last = list[list.length - 1];
							if (last.nextElementSibling !== line) body.insertBefore(line, last.nextElementSibling);
						}
					}

					function onUp() {
						window.removeEventListener("mousemove", onMove, true);
						window.removeEventListener("mouseup", onUp, true);
						line.removeAttribute("data-dso-dragging");
						if (moved) commitOrder(side);
					}

					window.addEventListener("mousemove", onMove, true);
					window.addEventListener("mouseup", onUp, true);
				});
			}

			/**
			 * 摘要内容多选：把该条目内部的视觉行逐个列成复选，勾哪些折叠后就留哪些。
			 *
			 * 列表顺序 = 原 UI 自上到下（linesOf 天然按视觉顺序返回），与用户勾选先后无关；
			 * 少选一行只是少显示一行，不影响其他行的位置。
			 * 只在「复合条目 + 摘要已开启」时出现。
			 */
			function buildSumRow(item) {
				var wrap = el("div", { "data-dso-sumrow": "1" });
				var lines = linesOf(item.row);
				var picks = summaryRowsOf(item.key);
				// 一次都没勾过 → 默认只留第 1 行（与 applySummary 的兜底保持一致）
				var active = picks.length ? picks : [0];

				var head = el("div", { "data-dso-sumhead": "1" });
				head.appendChild(el("span", { "data-dso-sumtitle": "1" }, "\u6298\u53e0\u65f6\u4fdd\u7559"));
				head.appendChild(
					el("span", { "data-dso-sumcount": "1" }, active.length + " / " + lines.length)
				);
				wrap.appendChild(head);

				var list = el("div", { "data-dso-sumlist": "1" });
				for (var i = 0; i < lines.length; i += 1) {
					var on = active.indexOf(i) !== -1;
					var lastOne = on && active.length === 1;
					var opt = el("label", {
						"data-dso-sumopt": "1",
						"data-dso-sumindex": String(i),
						title: lastOne
							? "\u81f3\u5c11\u4fdd\u7559\u4e00\u884c\uff1a\u5148\u52fe\u4e0a\u53e6\u4e00\u884c\u518d\u53d6\u6d88\u8fd9\u4e00\u884c"
							: lines[i].text || ""
					});
					if (on) opt.setAttribute("data-dso-on", "1");
					var box = el("input", { type: "checkbox" });
					box.checked = on;
					if (lastOne) {
						// 至少留一行：先勾上别的行，这一行才允许取消
						box.disabled = true;
						box.setAttribute("disabled", "");
					}
					opt.appendChild(box);
					opt.appendChild(el("span", { "data-dso-sumnum": "1" }, String(i + 1)));
					opt.appendChild(
						el("span", { "data-dso-sumtext": "1" }, (lines[i].text || "").slice(0, 28) || "\uff08\u65e0\u6587\u5b57\uff09")
					);
					(function (idx, input, node) {
						input.addEventListener("change", function () {
							var next = summaryRowsOf(item.key);
							// 列表还没落过盘时，UI 上的默认第 1 行要一起写进去，否则取消它会变成"没勾过"
							if (!next.length) next = [0];
							var at = next.indexOf(idx);
							if (input.checked) {
								if (at === -1) next.push(idx);
							} else if (at !== -1) {
								next.splice(at, 1);
							}
							if (next.length === 0) next = [0];
							next.sort(function (a, b) {
								return a - b;
							});
							state.summaryRows[item.key] = next;
							saveState();
							applyAll();
							// 重建这一块：高亮、计数、以及"最后一行不可取消"的禁用态都要同步
							replaceSumRow(item, node);
						});
					})(i, box, opt);
					list.appendChild(opt);
				}
				wrap.appendChild(list);
				return wrap;
			}

			/** 就地替换某条目下的摘要多选区（不重建整条，保住焦点与滚动位置）。 */
			function replaceSumRow(item, fromNode) {
				var oldRow = fromNode;
				while (oldRow && !(oldRow.getAttribute && oldRow.getAttribute("data-dso-sumrow") === "1")) {
					oldRow = oldRow.parentNode;
				}
				if (!oldRow || !oldRow.parentNode) return null;
				var host = oldRow.parentNode;
				var scroll = 0;
				try {
					scroll = oldRow.querySelector("[data-dso-sumlist]").scrollTop || 0;
				} catch (e) {}
				var next = buildSumRow(item);
				host.replaceChild(next, oldRow);
				try {
					next.querySelector("[data-dso-sumlist]").scrollTop = scroll;
				} catch (e2) {}
				return next;
			}

			function section(side) {
				// 按「自定义顺序 + 悬浮沉底」列出来，和侧栏里的实际顺序一致
				var items = orderedItems(side);
				var head = el("div", { "data-dso-sect": "1" }, (side === "top" ? "\u4e0a\u65b9" : "\u4e0b\u65b9") + " \u00b7 " + barLabel(side));
				body.appendChild(head);
				headBySide[side] = head;
				if (side === "top") {
					var noteNode = el(
						"div",
						{ "data-dso-sect-note": "1" },
						"\u590d\u9009\u300c\u663e\u793a\u300d\u540e\u6298\u53e0\u72b6\u6001\u4e0b\u4e0d\u518d\u9690\u85cf\uff1b\u62d6\u52a8\u5de6\u4fa7\u6293\u624b\u53ef\u8c03\u6574\u6392\u5e8f\u3002"
					);
					body.appendChild(noteNode);
					headBySide[side] = noteNode;
				}
				if (items.length === 0) {
					body.appendChild(el("div", { "data-dso-note": "1" }, "\u5f53\u524d\u6ca1\u6709\u53ef\u5217\u51fa\u7684\u6761\u76ee"));
					return;
				}
				items.forEach(function (item) {
					var isFloat = side === "bottom" && inList(state.floatKeys, item.key);
					var isSum = side === "bottom" && inList(state.summaryKeys, item.key);
					// 复合条目判定要在“看得见”的前提下量：折叠状态下先临时撤掉 data-dso-hide
					// 再读矩形（同一个任务里改回来，浏览器还没绘制，所以不会闪）。
					var vrows = side === "bottom" ? rowCountOf(item.row) : 0;
					var line = el("div", {
						"data-dso-item": "1",
						"data-dso-item-key": item.key,
						"data-dso-item-side": side
					});

					var grip = el(
						"span",
						{
							"data-dso-grip": "1",
							title: isFloat
								? "已悬浮，不参与排序（总在最下方）"
								: "按住拖动调整顺序（复合条目整体移动）"
						},
						"⣿"
					);
					if (isFloat) grip.setAttribute("data-dso-off", "1");
					line.appendChild(grip);
					line.appendChild(el("span", { "data-dso-item-label": "1" }, item.label));

					// 标记与胶囊统一放进第 3 栏，避免逐项折行
					var chips = el("div", { "data-dso-chips": "1" });
					if (vrows >= 2) {
						chips.appendChild(
							el(
								"span",
								{ "data-dso-item-tag": "1", "data-dso-tag": "multi", title: "该条目内部有 " + vrows + " 行，整体视为一条" },
								"复合 · " + vrows + " 行"
							)
						);
					}

					var exceptList = side === "top" ? state.topExcept : state.bottomExcept;
					chips.appendChild(
						chip(
							"\u663e\u793a",
							item.key,
							"keep",
							inList(exceptList, item.key),
							"\u6298\u53e0\u65f6\u6574\u6761\u4fdd\u7559\uff08\u5168\u91cf\u529f\u80fd\uff09",
							function (on) {
								setExcept(side, item.key, on);
							}
						)
					);

					if (side === "bottom" && vrows >= 2) {
						chips.appendChild(
							chip(
								"\u6458\u8981",
								item.key,
								"summary",
								isSum,
								"\u6298\u53e0\u65f6\u53ea\u4fdd\u7559\u52fe\u9009\u7684\u90a3\u51e0\u884c\uff08\u53ef\u591a\u9009\uff09\uff1b\u4e0e\u300c\u663e\u793a\u300d\u4e8c\u9009\u4e00\uff0c\u4e0d\u652f\u6301\u60ac\u6d6e\uff1b\u53d6\u6d88\u65f6\u56de\u5230\u52fe\u9009\u524d\u7684\u72b6\u6001",
								function (on) {
									setSummary(item.key, on);
									applyAll();
									refreshList();
								}
							)
						);
					}

					if (side === "bottom") {
						chips.appendChild(
							chip(
								"\u60ac\u6d6e",
								item.key,
								"float",
								isFloat,
								isSum ? "\u6458\u8981\u6a21\u5f0f\u4e0b\u4e0d\u652f\u6301\u60ac\u6d6e" : "\u53d8\u4e3a\u53ef\u62d6\u52a8\u7684\u60ac\u6d6e\u7a97",
								function (on) {
									setFloat(item.key, on);
									applyAll();
									// 悬浮状态决定抓手可用与排位，只刷新列表本身（不重建弹窗，避免丢焦点）
									refreshList();
								},
								isSum
							)
						);
					}
					if (isFloat) {
						chips.appendChild(
							el("span", { "data-dso-item-tag": "1", "data-dso-tag": "float" }, "\u60ac\u6d6e\u4e2d")
						);
					}
					line.appendChild(chips);
					if (isSum && vrows >= 2) line.appendChild(buildSumRow(item));
					body.appendChild(line);
					lineByKey[item.key] = line;
					bindReorder(line, side);
				});
			}

			/**
			 * 只重排行、不改结构：悬浮状态变化后抓手可用性与「悬浮中」标记要跟着变，
			 * 顺序也要按“悬浮沉底”重排。整块重建会丢焦点/滚动位置，所以按 key 挪现有节点。
			 */
			function refreshList() {
				["top", "bottom"].forEach(function (side) {
					var cursor = headBySide[side];
					if (!cursor || !cursor.parentNode) return;
					var seq = orderedItems(side);
					for (var i = 0; i < seq.length; i += 1) {
						var item = seq[i];
						var line = lineByKey[item.key];
						if (!line) continue;
						var isFloat = side === "bottom" && inList(state.floatKeys, item.key);

						var grip = line.querySelector("[data-dso-grip]");
						if (grip) {
							if (isFloat) grip.setAttribute("data-dso-off", "1");
							else grip.removeAttribute("data-dso-off");
						}
						var tag = line.querySelector("[data-dso-tag='float']");
						if (isFloat && !tag) {
							var chipBox = line.querySelector("[data-dso-chips]") || line;
							chipBox.appendChild(
								el("span", { "data-dso-item-tag": "1", "data-dso-tag": "float" }, "\u60ac\u6d6e\u4e2d")
							);
						} else if (!isFloat && tag) {
							tag.remove();
						}

						// 摘要开关会改变“是否出现摘要行下拉”，按需增删，不重建整行
						var isSum = side === "bottom" && inList(state.summaryKeys, item.key);
						var sumRow = line.querySelector("[data-dso-sumrow]");
						if (isSum && !sumRow) line.appendChild(buildSumRow(item));
						else if (!isSum && sumRow) sumRow.remove();

						cursor.parentNode.insertBefore(line, cursor.nextSibling);
						cursor = line;
					}
				});
				syncChips();
			}

			var note = el(
				"div",
				{ "data-dso-note": "1" },
				"\u300c\u663e\u793a\u300d\uff1a\u6298\u53e0\u65f6\u6574\u6761\u4fdd\u7559\uff08\u5168\u91cf\u529f\u80fd\uff09\u3002\u300c\u6458\u8981\u300d\uff1a\u6298\u53e0\u65f6\u53ea\u4fdd\u7559\u9009\u53d6\u7684\u5185\u5bb9\u3002\u300c\u60ac\u6d6e\u300d\uff1a\u8131\u79bb\u4fa7\u680f\u53d8\u6210\u53ef\u62d6\u52a8\u7a97\u53e3\u3002\u300c\u590d\u5408\u300d\u6761\u76ee\u62d6\u52a8\u3001\u6298\u53e0\u3001\u60ac\u6d6e\u65f6\u6574\u4f53\u751f\u6548\u3002"
			);

			section("top");
			section("bottom");

			body.appendChild(note);

			document.body.appendChild(panel);
			var anchorRect = (mainPanel || document.body).getBoundingClientRect
				? (mainPanel || document.body).getBoundingClientRect()
				: { left: 40, right: 40, top: 40 };
			placePanel(panel, anchorRect, false);
		}

		function numberRow(label, value, min, max, onChange) {
			var row = el("div", { "data-dso-row": "1" });
			row.appendChild(el("span", null, label));
			var input = el("input", { type: "number", min: String(min), max: String(max), value: String(value) });
			input.addEventListener("change", function () {
				var v = parseInt(input.value, 10);
				if (!isFinite(v)) v = min;
				v = Math.min(max, Math.max(min, v));
				input.value = String(v);
				onChange(v);
			});
			row.appendChild(input);
			return row;
		}

		function checkRow(label, checked, onChange) {
			var row = el("div", { "data-dso-row": "1" });
			row.appendChild(el("span", null, label));
			var input = el("input", { type: "checkbox" });
			input.checked = checked === true;
			input.addEventListener("change", function () {
				onChange(input.checked === true);
			});
			row.appendChild(input);
			return row;
		}

		/** 文本输入行（折叠条名称）。留空即回落默认名，所以 placeholder 显示的就是默认名。 */
		function textRow(label, value, placeholder, onChange) {
			var row = el("div", { "data-dso-row": "1" });
			row.appendChild(el("span", null, label));
			var input = el("input", { type: "text", maxlength: "16", placeholder: placeholder });
			input.value = value == null ? "" : String(value);
			input.addEventListener("input", function () {
				onChange(input.value);
			});
			// 回车收起软键盘/取消焦点，避免误触折叠条快捷键
			input.addEventListener("keydown", function (ev) {
				if (ev.key === "Enter") input.blur();
			});
			row.appendChild(input);
			return row;
		}
		//#endregion

		//#region 调度
		var scheduled = false;

		function applyAll() {
			applyTop();
			applyBottom();
			applyFloats();
		}

		function schedule() {
			if (scheduled) return;
			scheduled = true;
			window.requestAnimationFrame(function () {
				scheduled = false;
				try {
					applyAll();
				} catch (e) {
					console.warn("[dsh-sidebar-organizer]", e);
				}
			});
		}

		function observe() {
			var mo = new MutationObserver(schedule);
			mo.observe(document.body, { childList: true, subtree: true });
			return mo;
		}
		//#endregion

		//#region 入口
		/**
		 * 卸载要清的东西分三类，缺一类就会「卸了还在」：
		 *   ① 我们装的调度：MutationObserver / resize 监听 / 首绘定时器；
		 *   ② 我们插进宿主的 DOM：折叠条、弹窗、Alt 提示；
		 *   ③ 我们打在**宿主节点**上的标记与监听：data-dso-* 属性、--dso-max-h 内联变量、
		 *      attachMiddleDrag 挂上去的中键监听（宿主节点活得比插件久，不清就真留下来了）。
		 */
		function dispose(session) {
			try {
				session.mo.disconnect();
			} catch (e) {}
			if (session.timer !== null) window.clearInterval(session.timer);
			session.timer = null;
			window.removeEventListener("resize", session.onResize);
			closePanels();

			// ③ 属性类标记一次性扫掉（这些元素全都属于宿主，只删我们加的属性）
			var marked = document.querySelectorAll(
				"[data-dso-hide],[data-dso-ord],[data-dso-ordbox],[data-dso-bottombox]," +
					"[data-dso-scroll],[data-dso-summary],[data-dso-vshow],[data-dso-collapsed]"
			);
			for (var i = 0; i < marked.length; i += 1) {
				var n = marked[i];
				n.removeAttribute("data-dso-hide");
				n.removeAttribute("data-dso-ord");
				n.removeAttribute("data-dso-ordbox");
				n.removeAttribute("data-dso-bottombox");
				n.removeAttribute("data-dso-scroll");
				n.removeAttribute("data-dso-summary");
				n.removeAttribute("data-dso-vshow");
				n.removeAttribute("data-dso-collapsed");
				if (n.style) n.style.removeProperty("--dso-max-h");
			}

			var floats = document.querySelectorAll("[data-dso-float='1']");
			for (var k = 0; k < floats.length; k += 1) {
				floats[k].removeAttribute("data-dso-float");
				floats[k].removeAttribute("data-dso-pos");
				floats[k].removeAttribute("data-dso-overlap");
				floats[k].style.removeProperty("--dso-x");
				floats[k].style.removeProperty("--dso-y");
				floats[k].style.removeProperty("--dso-z");
			}

			// ② 我们自己创建的节点
			var bars = document.querySelectorAll("[data-dso-bar]");
			for (var b = 0; b < bars.length; b += 1) bars[b].remove();
			var hint = document.querySelector("[data-dso-hint]");
			if (hint) hint.remove();

			// ③ 中键监听：按记录的引用摘，不能只清 __dsoMiddle 标记
			for (var m = 0; m < MIDDLE_NODES.length; m += 1) {
				var rec = MIDDLE_NODES[m];
				try {
					rec.node.removeEventListener("mousedown", rec.down, true);
					rec.node.removeEventListener("auxclick", rec.aux);
					delete rec.node.__dsoMiddle;
				} catch (e) {}
			}
			MIDDLE_NODES.length = 0;

			var css = document.querySelector("style[data-dso-css]");
			if (css) css.remove();
		}

		function apply(ctx) {
			var w = window;
			// 同一页面里被重复 apply（HMR / 重新启用）时，先把上一轮的调度与标记全拆掉
			if (typeof w.__dsoDispose === "function") {
				try {
					w.__dsoDispose();
				} catch (e) {}
			}

			injectCss();

			var session = { mo: observe(), onResize: null, timer: null };
			session.onResize = function () {
				applyFloats();
			};
			window.addEventListener("resize", session.onResize);

			// 首次：等 React 把侧栏画出来
			var tries = 0;
			session.timer = window.setInterval(function () {
				tries += 1;
				applyAll();
				if (tries > 20) {
					window.clearInterval(session.timer);
					session.timer = null;
				}
			}, 120);
			applyAll();

			var runDispose = function () {
				try {
					dispose(session);
				} catch (e) {}
				if (w.__dsoDispose === runDispose) delete w.__dsoDispose;
			};
			w.__dsoDispose = runDispose;

			/**
			 * 关键加固：把清理登记到 cordis 的 effect 上。
			 * 宿主禁用插件 / 热更新时会 dispose 这个 fiber，从而真的调用它；
			 * 以前只在 w.__dsoDispose 上挂了个函数，宿主卸载时没人调 ——
			 * Observer 会继续活着，把折叠条一次次重新塞回侧栏。
			 */
			if (ctx && typeof ctx.effect === "function") {
				try {
					ctx.effect(function () {
						return function () {
							try {
								runDispose();
							} catch (e) {}
						};
					}, "dsh-sidebar-organizer: sidebar dom cleanup");
				} catch (e) {
					console.warn("[dsh-sidebar-organizer] ctx.effect 登记失败，只能退回 w.__dsoDispose", e);
				}
			}
		}

		exports.apply = apply;
		exports.default = apply;
		return module.exports;
	}
});
