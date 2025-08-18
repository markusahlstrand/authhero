import {
  computed,
  getCurrentInstance,
  getCurrentScope,
  hasInjectionContext,
  inject,
  onMounted,
  onScopeDispose,
  ref,
  shallowRef,
  toValue,
  unref,
  watch,
  watchEffect
} from "./chunk-CORZWTRE.js";

// ../../../.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/index.js
import "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/styles/fonts.css";

// ../../../.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/without-fonts.js
import "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/styles/vars.css";
import "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/styles/base.css";
import "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/styles/icons.css";
import "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/styles/utils.css";
import "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/styles/components/custom-block.css";
import "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/styles/components/vp-code.css";
import "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/styles/components/vp-code-group.css";
import "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/styles/components/vp-doc.css";
import "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/styles/components/vp-sponsor.css";
import VPBadge from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPBadge.vue";
import Layout from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/Layout.vue";
import { default as default2 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPBadge.vue";
import { default as default3 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPButton.vue";
import { default as default4 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPDocAsideSponsors.vue";
import { default as default5 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPFeatures.vue";
import { default as default6 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPHomeContent.vue";
import { default as default7 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPHomeFeatures.vue";
import { default as default8 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPHomeHero.vue";
import { default as default9 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPHomeSponsors.vue";
import { default as default10 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPImage.vue";
import { default as default11 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPLink.vue";
import { default as default12 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPNavBarSearch.vue";
import { default as default13 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPSocialLink.vue";
import { default as default14 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPSocialLinks.vue";
import { default as default15 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPSponsors.vue";
import { default as default16 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPTeamMembers.vue";
import { default as default17 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPTeamPage.vue";
import { default as default18 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPTeamPageSection.vue";
import { default as default19 } from "/Users/markus/.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/components/VPTeamPageTitle.vue";

// ../../../.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/composables/local-nav.js
import { onContentUpdated } from "vitepress";

// ../../../.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/composables/outline.js
import { getScrollOffset } from "vitepress";

// ../../../.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/support/utils.js
import { withBase } from "vitepress";

// ../../../.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/composables/data.js
import { useData as useData$ } from "vitepress";
var useData = useData$;

// ../../../.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/support/utils.js
function ensureStartingSlash(path) {
  return path.startsWith("/") ? path : `/${path}`;
}

// ../../../.npm/_npx/a3af1b0fdbe56d97/node_modules/@vueuse/shared/index.mjs
function tryOnScopeDispose(fn) {
  if (getCurrentScope()) {
    onScopeDispose(fn);
    return true;
  }
  return false;
}
var localProvidedStateMap = /* @__PURE__ */ new WeakMap();
var injectLocal = (...args) => {
  var _a;
  const key = args[0];
  const instance = (_a = getCurrentInstance()) == null ? void 0 : _a.proxy;
  if (instance == null && !hasInjectionContext())
    throw new Error("injectLocal must be called in setup");
  if (instance && localProvidedStateMap.has(instance) && key in localProvidedStateMap.get(instance))
    return localProvidedStateMap.get(instance)[key];
  return inject(...args);
};
var isClient = typeof window !== "undefined" && typeof document !== "undefined";
var isWorker = typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope;
var toString = Object.prototype.toString;
var isObject = (val) => toString.call(val) === "[object Object]";
var isIOS = getIsIOS();
function getIsIOS() {
  var _a, _b;
  return isClient && ((_a = window == null ? void 0 : window.navigator) == null ? void 0 : _a.userAgent) && (/iP(?:ad|hone|od)/.test(window.navigator.userAgent) || ((_b = window == null ? void 0 : window.navigator) == null ? void 0 : _b.maxTouchPoints) > 2 && /iPad|Macintosh/.test(window == null ? void 0 : window.navigator.userAgent));
}
function cacheStringFunction(fn) {
  const cache = /* @__PURE__ */ Object.create(null);
  return (str) => {
    const hit = cache[str];
    return hit || (cache[str] = fn(str));
  };
}
var hyphenateRE = /\B([A-Z])/g;
var hyphenate = cacheStringFunction((str) => str.replace(hyphenateRE, "-$1").toLowerCase());
var camelizeRE = /-(\w)/g;
var camelize = cacheStringFunction((str) => {
  return str.replace(camelizeRE, (_, c) => c ? c.toUpperCase() : "");
});
function identity(arg) {
  return arg;
}
function pxValue(px) {
  return px.endsWith("rem") ? Number.parseFloat(px) * 16 : Number.parseFloat(px);
}
function toArray(value) {
  return Array.isArray(value) ? value : [value];
}
function watchImmediate(source, cb, options) {
  return watch(
    source,
    cb,
    {
      ...options,
      immediate: true
    }
  );
}

// ../../../.npm/_npx/a3af1b0fdbe56d97/node_modules/@vueuse/core/index.mjs
var defaultWindow = isClient ? window : void 0;
var defaultDocument = isClient ? window.document : void 0;
var defaultNavigator = isClient ? window.navigator : void 0;
var defaultLocation = isClient ? window.location : void 0;
function unrefElement(elRef) {
  var _a;
  const plain = toValue(elRef);
  return (_a = plain == null ? void 0 : plain.$el) != null ? _a : plain;
}
function useEventListener(...args) {
  const cleanups = [];
  const cleanup = () => {
    cleanups.forEach((fn) => fn());
    cleanups.length = 0;
  };
  const register = (el, event, listener, options) => {
    el.addEventListener(event, listener, options);
    return () => el.removeEventListener(event, listener, options);
  };
  const firstParamTargets = computed(() => {
    const test = toArray(toValue(args[0])).filter((e) => e != null);
    return test.every((e) => typeof e !== "string") ? test : void 0;
  });
  const stopWatch = watchImmediate(
    () => {
      var _a, _b;
      return [
        (_b = (_a = firstParamTargets.value) == null ? void 0 : _a.map((e) => unrefElement(e))) != null ? _b : [defaultWindow].filter((e) => e != null),
        toArray(toValue(firstParamTargets.value ? args[1] : args[0])),
        toArray(unref(firstParamTargets.value ? args[2] : args[1])),
        // @ts-expect-error - TypeScript gets the correct types, but somehow still complains
        toValue(firstParamTargets.value ? args[3] : args[2])
      ];
    },
    ([raw_targets, raw_events, raw_listeners, raw_options]) => {
      cleanup();
      if (!(raw_targets == null ? void 0 : raw_targets.length) || !(raw_events == null ? void 0 : raw_events.length) || !(raw_listeners == null ? void 0 : raw_listeners.length))
        return;
      const optionsClone = isObject(raw_options) ? { ...raw_options } : raw_options;
      cleanups.push(
        ...raw_targets.flatMap(
          (el) => raw_events.flatMap(
            (event) => raw_listeners.map((listener) => register(el, event, listener, optionsClone))
          )
        )
      );
    },
    { flush: "post" }
  );
  const stop = () => {
    stopWatch();
    cleanup();
  };
  tryOnScopeDispose(cleanup);
  return stop;
}
function useMounted() {
  const isMounted = shallowRef(false);
  const instance = getCurrentInstance();
  if (instance) {
    onMounted(() => {
      isMounted.value = true;
    }, instance);
  }
  return isMounted;
}
function useSupported(callback) {
  const isMounted = useMounted();
  return computed(() => {
    isMounted.value;
    return Boolean(callback());
  });
}
var ssrWidthSymbol = Symbol("vueuse-ssr-width");
function useSSRWidth() {
  const ssrWidth = hasInjectionContext() ? injectLocal(ssrWidthSymbol, null) : null;
  return typeof ssrWidth === "number" ? ssrWidth : void 0;
}
function useMediaQuery(query, options = {}) {
  const { window: window2 = defaultWindow, ssrWidth = useSSRWidth() } = options;
  const isSupported = useSupported(() => window2 && "matchMedia" in window2 && typeof window2.matchMedia === "function");
  const ssrSupport = shallowRef(typeof ssrWidth === "number");
  const mediaQuery = shallowRef();
  const matches = shallowRef(false);
  const handler = (event) => {
    matches.value = event.matches;
  };
  watchEffect(() => {
    if (ssrSupport.value) {
      ssrSupport.value = !isSupported.value;
      const queryStrings = toValue(query).split(",");
      matches.value = queryStrings.some((queryString) => {
        const not = queryString.includes("not all");
        const minWidth = queryString.match(/\(\s*min-width:\s*(-?\d+(?:\.\d*)?[a-z]+\s*)\)/);
        const maxWidth = queryString.match(/\(\s*max-width:\s*(-?\d+(?:\.\d*)?[a-z]+\s*)\)/);
        let res = Boolean(minWidth || maxWidth);
        if (minWidth && res) {
          res = ssrWidth >= pxValue(minWidth[1]);
        }
        if (maxWidth && res) {
          res = ssrWidth <= pxValue(maxWidth[1]);
        }
        return not ? !res : res;
      });
      return;
    }
    if (!isSupported.value)
      return;
    mediaQuery.value = window2.matchMedia(toValue(query));
    matches.value = mediaQuery.value.matches;
  });
  useEventListener(mediaQuery, "change", handler, { passive: true });
  return computed(() => matches.value);
}
var _global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
var globalKey = "__vueuse_ssr_handlers__";
var handlers = getHandlers();
function getHandlers() {
  if (!(globalKey in _global))
    _global[globalKey] = _global[globalKey] || {};
  return _global[globalKey];
}
var defaultState = {
  x: 0,
  y: 0,
  pointerId: 0,
  pressure: 0,
  tiltX: 0,
  tiltY: 0,
  width: 0,
  height: 0,
  twist: 0,
  pointerType: null
};
var keys = Object.keys(defaultState);
var DEFAULT_UNITS = [
  { max: 6e4, value: 1e3, name: "second" },
  { max: 276e4, value: 6e4, name: "minute" },
  { max: 72e6, value: 36e5, name: "hour" },
  { max: 5184e5, value: 864e5, name: "day" },
  { max: 24192e5, value: 6048e5, name: "week" },
  { max: 28512e6, value: 2592e6, name: "month" },
  { max: Number.POSITIVE_INFINITY, value: 31536e6, name: "year" }
];
var _TransitionPresets = {
  easeInSine: [0.12, 0, 0.39, 0],
  easeOutSine: [0.61, 1, 0.88, 1],
  easeInOutSine: [0.37, 0, 0.63, 1],
  easeInQuad: [0.11, 0, 0.5, 0],
  easeOutQuad: [0.5, 1, 0.89, 1],
  easeInOutQuad: [0.45, 0, 0.55, 1],
  easeInCubic: [0.32, 0, 0.67, 0],
  easeOutCubic: [0.33, 1, 0.68, 1],
  easeInOutCubic: [0.65, 0, 0.35, 1],
  easeInQuart: [0.5, 0, 0.75, 0],
  easeOutQuart: [0.25, 1, 0.5, 1],
  easeInOutQuart: [0.76, 0, 0.24, 1],
  easeInQuint: [0.64, 0, 0.78, 0],
  easeOutQuint: [0.22, 1, 0.36, 1],
  easeInOutQuint: [0.83, 0, 0.17, 1],
  easeInExpo: [0.7, 0, 0.84, 0],
  easeOutExpo: [0.16, 1, 0.3, 1],
  easeInOutExpo: [0.87, 0, 0.13, 1],
  easeInCirc: [0.55, 0, 1, 0.45],
  easeOutCirc: [0, 0.55, 0.45, 1],
  easeInOutCirc: [0.85, 0, 0.15, 1],
  easeInBack: [0.36, 0, 0.66, -0.56],
  easeOutBack: [0.34, 1.56, 0.64, 1],
  easeInOutBack: [0.68, -0.6, 0.32, 1.6]
};
var TransitionPresets = Object.assign({}, { linear: identity }, _TransitionPresets);

// ../../../.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/support/sidebar.js
function getSidebar(_sidebar, path) {
  if (Array.isArray(_sidebar))
    return addBase(_sidebar);
  if (_sidebar == null)
    return [];
  path = ensureStartingSlash(path);
  const dir = Object.keys(_sidebar).sort((a, b) => {
    return b.split("/").length - a.split("/").length;
  }).find((dir2) => {
    return path.startsWith(ensureStartingSlash(dir2));
  });
  const sidebar = dir ? _sidebar[dir] : [];
  return Array.isArray(sidebar) ? addBase(sidebar) : addBase(sidebar.items, sidebar.base);
}
function getSidebarGroups(sidebar) {
  const groups = [];
  let lastGroupIndex = 0;
  for (const index in sidebar) {
    const item = sidebar[index];
    if (item.items) {
      lastGroupIndex = groups.push(item);
      continue;
    }
    if (!groups[lastGroupIndex]) {
      groups.push({ items: [] });
    }
    groups[lastGroupIndex].items.push(item);
  }
  return groups;
}
function addBase(items, _base) {
  return [...items].map((_item) => {
    const item = { ..._item };
    const base = item.base || _base;
    if (base && item.link)
      item.link = base + item.link;
    if (item.items)
      item.items = addBase(item.items, base);
    return item;
  });
}

// ../../../.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/composables/sidebar.js
function useSidebar() {
  const { frontmatter, page, theme: theme2 } = useData();
  const is960 = useMediaQuery("(min-width: 960px)");
  const isOpen = ref(false);
  const _sidebar = computed(() => {
    const sidebarConfig = theme2.value.sidebar;
    const relativePath = page.value.relativePath;
    return sidebarConfig ? getSidebar(sidebarConfig, relativePath) : [];
  });
  const sidebar = ref(_sidebar.value);
  watch(_sidebar, (next, prev) => {
    if (JSON.stringify(next) !== JSON.stringify(prev))
      sidebar.value = _sidebar.value;
  });
  const hasSidebar = computed(() => {
    return frontmatter.value.sidebar !== false && sidebar.value.length > 0 && frontmatter.value.layout !== "home";
  });
  const leftAside = computed(() => {
    if (hasAside)
      return frontmatter.value.aside == null ? theme2.value.aside === "left" : frontmatter.value.aside === "left";
    return false;
  });
  const hasAside = computed(() => {
    if (frontmatter.value.layout === "home")
      return false;
    if (frontmatter.value.aside != null)
      return !!frontmatter.value.aside;
    return theme2.value.aside !== false;
  });
  const isSidebarEnabled = computed(() => hasSidebar.value && is960.value);
  const sidebarGroups = computed(() => {
    return hasSidebar.value ? getSidebarGroups(sidebar.value) : [];
  });
  function open() {
    isOpen.value = true;
  }
  function close() {
    isOpen.value = false;
  }
  function toggle() {
    isOpen.value ? close() : open();
  }
  return {
    isOpen,
    sidebar,
    sidebarGroups,
    hasSidebar,
    hasAside,
    leftAside,
    isSidebarEnabled,
    open,
    close,
    toggle
  };
}

// ../../../.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/composables/outline.js
var ignoreRE = /\b(?:VPBadge|header-anchor|footnote-ref|ignore-header)\b/;
var resolvedHeaders = [];
function getHeaders(range) {
  const headers = [
    ...document.querySelectorAll(".VPDoc :where(h1,h2,h3,h4,h5,h6)")
  ].filter((el) => el.id && el.hasChildNodes()).map((el) => {
    const level = Number(el.tagName[1]);
    return {
      element: el,
      title: serializeHeader(el),
      link: "#" + el.id,
      level
    };
  });
  return resolveHeaders(headers, range);
}
function serializeHeader(h2) {
  let ret = "";
  for (const node of h2.childNodes) {
    if (node.nodeType === 1) {
      if (ignoreRE.test(node.className))
        continue;
      ret += node.textContent;
    } else if (node.nodeType === 3) {
      ret += node.textContent;
    }
  }
  return ret.trim();
}
function resolveHeaders(headers, range) {
  if (range === false) {
    return [];
  }
  const levelsRange = (typeof range === "object" && !Array.isArray(range) ? range.level : range) || 2;
  const [high, low] = typeof levelsRange === "number" ? [levelsRange, levelsRange] : levelsRange === "deep" ? [2, 6] : levelsRange;
  return buildTree(headers, high, low);
}
function buildTree(data, min, max) {
  resolvedHeaders.length = 0;
  const result = [];
  const stack = [];
  data.forEach((item) => {
    const node = { ...item, children: [] };
    let parent = stack[stack.length - 1];
    while (parent && parent.level >= node.level) {
      stack.pop();
      parent = stack[stack.length - 1];
    }
    if (node.element.classList.contains("ignore-header") || parent && "shouldIgnore" in parent) {
      stack.push({ level: node.level, shouldIgnore: true });
      return;
    }
    if (node.level > max || node.level < min)
      return;
    resolvedHeaders.push({ element: node.element, link: node.link });
    if (parent)
      parent.children.push(node);
    else
      result.push(node);
    stack.push(node);
  });
  return result;
}

// ../../../.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/composables/local-nav.js
function useLocalNav() {
  const { theme: theme2, frontmatter } = useData();
  const headers = shallowRef([]);
  const hasLocalNav = computed(() => {
    return headers.value.length > 0;
  });
  onContentUpdated(() => {
    headers.value = getHeaders(frontmatter.value.outline ?? theme2.value.outline);
  });
  return {
    headers,
    hasLocalNav
  };
}

// ../../../.npm/_npx/a3af1b0fdbe56d97/node_modules/vitepress/dist/client/theme-default/without-fonts.js
var theme = {
  Layout,
  enhanceApp: ({ app }) => {
    app.component("Badge", VPBadge);
  }
};
var without_fonts_default = theme;
export {
  default2 as VPBadge,
  default3 as VPButton,
  default4 as VPDocAsideSponsors,
  default5 as VPFeatures,
  default6 as VPHomeContent,
  default7 as VPHomeFeatures,
  default8 as VPHomeHero,
  default9 as VPHomeSponsors,
  default10 as VPImage,
  default11 as VPLink,
  default12 as VPNavBarSearch,
  default13 as VPSocialLink,
  default14 as VPSocialLinks,
  default15 as VPSponsors,
  default16 as VPTeamMembers,
  default17 as VPTeamPage,
  default18 as VPTeamPageSection,
  default19 as VPTeamPageTitle,
  without_fonts_default as default,
  useLocalNav,
  useSidebar
};
//# sourceMappingURL=@theme_index.js.map
