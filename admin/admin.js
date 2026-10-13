/* ==========================================================================
   幻言 · 后台管理脚本（原生 JS，无框架）
   结构：
     API     —— fetch 封装，统一处理 {ok:false, error}
     toast   —— 右下角轻提示
     arrayEditor —— 可增删 / 可拖动排序的数组编辑器（字符串 / 节拍 / 场景 / 问答 / 安全规则）
     resTab  —— 资源编辑（左列表 + 右表单，字段全覆盖）
     setTab  —— 全局设置（site / assistant / globalPrompt / safety / behaviorLine）
     backupTab —— 数据备份（导出 / 导入 / 数据文件信息）
   ========================================================================== */
'use strict';

(function () {

  /* ------------------------------ 小工具 ------------------------------ */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function getPath(obj, p) {
    return p.split('.').reduce(function (o, k) { return (o == null ? undefined : o[k]); }, obj);
  }
  function setPath(obj, p, v) {
    const ks = p.split('.');
    let cur = obj;
    for (let i = 0; i < ks.length - 1; i++) {
      if (cur[ks[i]] == null || typeof cur[ks[i]] !== 'object') cur[ks[i]] = {};
      cur = cur[ks[i]];
    }
    cur[ks[ks.length - 1]] = v;
  }
  function num(v, dft) {
    const n = Number(String(v == null ? '' : v).trim());
    return isFinite(n) ? n : dft;
  }
  function download(name, text) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function regexOk(src) {
    try { new RegExp(src); return true; } catch (e) { return false; }
  }
  function debounce(fn, ms) {
    let t = 0;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /* ------------------------------ 轻提示 ------------------------------ */
  const toast = (function () {
    const box = $('#toasts');
    return function (msg, kind) {
      const el = document.createElement('div');
      el.className = 'toast ' + (kind || '');
      el.textContent = msg;
      box.appendChild(el);
      setTimeout(function () {
        el.classList.add('out');
        setTimeout(function () { el.remove(); }, 260);
      }, kind === 'err' ? 4600 : 2400);
    };
  })();

  /* ------------------------------ API ------------------------------ */
  /* 管理令牌：优先取 ?token=，其次 sessionStorage；对外部署时所有写接口都要带上它。
     本机未设令牌时服务端会放行，这里带着也无妨。 */
  const TOKEN_KEY = 'rp_admin_token';
  const AdminToken = {
    value: (function () {
      let t = '';
      try {
        const m = /[?&]token=([^&]+)/.exec(location.search);
        if (m) {
          t = decodeURIComponent(m[1]);
          sessionStorage.setItem(TOKEN_KEY, t);
          /* 从地址栏抹掉令牌，避免被历史记录/截图带出去 */
          history.replaceState(null, '', location.pathname + location.hash);
        } else {
          t = sessionStorage.getItem(TOKEN_KEY) || '';
        }
      } catch (e) { t = ''; }
      return t;
    })(),
    set: function (t) {
      this.value = String(t || '').trim();
      try { sessionStorage.setItem(TOKEN_KEY, this.value); } catch (e) { }
    },
    headers: function () { return this.value ? { 'x-admin-token': this.value } : {}; },
    /* 服务端要令牌时弹一个输入框（令牌只留在本次会话的 sessionStorage 里） */
    needToken: function () {
      if (this._asking) return;
      const self = this;
      this._asking = true;
      const mask = document.createElement('div');
      mask.className = 'token-mask';
      mask.innerHTML = '<div class="token-box">' +
        '<h4>需要管理令牌</h4>' +
        '<p>这台服务器设置了 <code>ADMIN_TOKEN</code>，保存与后台入口都需要它。' +
        '令牌只存在本次浏览器会话里，关闭标签页即失效。</p>' +
        '<input class="ipt" id="tokenInput" placeholder="粘贴 ADMIN_TOKEN" value="">' +
        '<div class="token-row"><button class="btn primary" id="tokenOk">确定</button>' +
        '<button class="btn" id="tokenCancel">稍后</button></div></div>';
      document.body.appendChild(mask);
      const input = mask.querySelector('#tokenInput');
      setTimeout(function () { input.focus(); }, 30);
      function close() { mask.remove(); self._asking = false; }
      function submit() {
        const v = input.value.trim();
        if (!v) return;
        self.set(v);
        close();
        location.reload();
      }
      mask.querySelector('#tokenOk').addEventListener('click', submit);
      mask.querySelector('#tokenCancel').addEventListener('click', close);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    }
  };

  const API = {
    get: function (url) { return API.req('GET', url); },
    del: function (url) { return API.req('DELETE', url); },
    post: function (url, body) { return API.req('POST', url, body); },
    put: function (url, body) { return API.req('PUT', url, body); },
    req: function (method, url, body) {
      const opt = { method: method, headers: AdminToken.headers() };
      if (body !== undefined) {
        opt.headers['Content-Type'] = 'application/json; charset=utf-8';
        opt.body = JSON.stringify(body);
      }
      return fetch(url, opt).then(function (res) {
        if (res.status === 403) AdminToken.needToken();
        return res.json()
          .catch(function () { return { ok: false, error: 'HTTP ' + res.status + ' 返回的不是 JSON' }; })
          .then(function (data) {
            if (!res.ok || !data || data.ok !== true) throw new Error((data && data.error) || ('HTTP ' + res.status));
            return data;
          });
      });
    },
    upload: function (file) {
      const fd = new FormData();
      fd.append('file', file, file.name);
      return fetch('/api/upload', { method: 'POST', body: fd, headers: AdminToken.headers() }).then(function (res) {
        if (res.status === 403) AdminToken.needToken();
        return res.json().then(function (data) {
          if (!res.ok || !data || data.ok !== true) throw new Error((data && data.error) || ('HTTP ' + res.status));
          return data;
        });
      });
    }
  };

  /* ==========================================================================
     通用数组编辑器
     spec = {
       addText, empty, template,
       keys   : [字段名...]                    每行一个字段
       labels : {字段: 标签}  ph: {字段: 占位}  rows: {字段: 行数}
       kinds  : {字段: 'text'|'number'|'textarea'|'ratext'|'color'}
       reKey  : 该字段实时校验 new RegExp()
       faq    : true → keys 字段是「正则源码字符串」，额外渲染 a 多行回答；
                若历史数据里 keys 是数组（旧格式），会自动用 | 拼成正则源码
       valuesFn / bindFn   : 由外部适配器接管（场景的三色 palette 需要）
     }
     ========================================================================== */
  function arrayEditor(spec) {
    const root = document.createElement('div');
    root.className = 'arr';
    const hooked = {
      valuesFn: spec.valuesFn || null,
      bindFn: spec.bindFn || null
    };

    /* --------- 生成单行 --------- */
    function fieldHtml(key, val) {
      const kind = (spec.kinds || {})[key] || 'text';
      const label = (spec.labels || {})[key] || key;
      const ph = (spec.ph || {})[key] || '';
      let input;
      if (kind === 'check') {
        /* 复选框：勾选即写入该键（节拍的「关键节点」用） */
        input = '<span class="chk-box"><input type="checkbox" data-k="' + key + '"' +
          (val ? ' checked' : '') + '><em>' + esc(ph || label) + '</em></span>';
      } else if (kind === 'color') {
        const hex = /^#[0-9a-fA-F]{6}$/.test(String(val || '')) ? val : '#000000';
        input = '<div class="color-item">' +
          '<input type="color" data-k="' + key + '" value="' + esc(hex) + '">' +
          '<input class="ipt hex" type="text" data-kh="' + key + '" value="' + esc(hex) + '" placeholder="#000000">' +
          '</div>';
      } else if (kind === 'number') {
        input = '<input class="ipt" type="number" step="1" data-k="' + key + '" value="' +
          esc(val == null ? '' : val) + '" placeholder="' + esc(ph) + '">';
      } else if (kind === 'select') {
        /* 下拉：用于节拍的 A 类/B 类类型等枚举字段 */
        const opts = ((spec.options || {})[key] || []).map(function (o) {
          return '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
        }).join('');
        input = '<select class="ipt" data-k="' + key + '">' + opts + '</select>';
      } else if (kind === 'ratext') {
        input = '<input class="ipt re-ipt" type="text" data-k="' + key + '" value="' +
          esc(val == null ? '' : val) + '" placeholder="' + esc(ph) + '">';
      } else if (kind === 'textarea') {
        input = '<textarea class="ipt ta" rows="' + ((spec.rows || {})[key] || 3) + '" data-k="' + key +
          '" placeholder="' + esc(ph) + '">' + esc(val == null ? '' : val) + '</textarea>';
      } else {
        input = '<input class="ipt" type="text" data-k="' + key + '" value="' +
          esc(val == null ? '' : val) + '" placeholder="' + esc(ph) + '">';
      }
      return '<label class="fld" style="margin:0"><span class="lbl">' + esc(label) + '</span>' + input +
        (spec.reKey === key ? '<span class="err"></span>' : '') + '</label>';
    }

    function makeRow(v, i) {
      const item = (typeof v === 'object' && v) ? v : {};
      const row = document.createElement('div');
      row.className = 'arr-row' + (spec.faq ? ' faq-row' : '') + (spec.reKey ? ' rule-row' : '');
      row.draggable = true;
      row.dataset.idx = String(i);

      let inner = '<span class="arr-grip" title="按住拖动排序">⠿</span>' +
        '<span class="arr-idx">' + (i + 1) + '</span><div class="arr-body">';

      if (spec.keys.length === 1) {
        const k = spec.keys[0];
        let val = (v == null ? '' : (typeof v === 'object' ? v[k] : v));
        /* 兼容旧数据：keys 是数组时用 | 连成正则源码 */
        if (spec.faq && Array.isArray(val)) val = val.join('|');
        inner += fieldHtml(k, val);
      } else {
        inner += '<div class="arr-sub" style="flex-wrap:wrap">' +
          spec.keys.map(function (k) { return fieldHtml(k, item[k]); }).join('') + '</div>';
      }
      if (spec.faq) {
        inner += '<label class="fld" style="margin:0"><span class="lbl">' + esc((spec.labels || {}).a || '回答 a') + '</span>' +
          '<textarea class="ipt ta" rows="' + ((spec.rows || {}).a || 3) + '" data-ka="a" placeholder="' +
          esc((spec.ph || {}).a || '') + '">' + esc(item.a == null ? '' : item.a) + '</textarea></label>';
      }
      inner += '</div><div class="arr-tools">' +
        '<button type="button" class="btn btn-xs" data-act="up" title="上移">↑</button>' +
        '<button type="button" class="btn btn-xs" data-act="down" title="下移">↓</button>' +
        '<button type="button" class="btn btn-xs btn-danger" data-act="del" title="删除">✕</button>' +
        '</div>';
      row.innerHTML = inner;
      return row;
    }

    /* --------- 读 / 渲染 --------- */
    function values() {
      if (hooked.valuesFn) return hooked.valuesFn();
      const rows = $$('.arr-row', root);
      return rows.map(function (row) {
        if (spec.keys.length === 1) {
          const k = spec.keys[0];
          const el = $('[data-k="' + k + '"]', row);
          const raw = el ? el.value : '';
          if (spec.faq) {
            const ta = $('[data-ka="a"]', row);
            /* keys 保持正则源码字符串，直接交给 new RegExp(keys, 'i') */
            return { keys: String(raw).trim(), a: ta ? ta.value : '' };
          }
          return raw;
        }
        const obj = {};
        spec.keys.forEach(function (k) {
          const el = $('[data-k="' + k + '"]', row);
          if (!el) { obj[k] = ''; return; }
          const kind = (spec.kinds || {})[k];
          obj[k] = kind === 'number' ? num(el.value, 0) : (kind === 'check' ? !!el.checked : el.value);
        });
        if (spec.faq) {
          const ta = $('[data-ka="a"]', row);
          obj.a = ta ? ta.value : '';
        }
        return obj;
      });
    }

    function render(list) {
      root.innerHTML = '';
      const arr = Array.isArray(list) ? list : [];
      if (!arr.length) {
        const e = document.createElement('div');
        e.className = 'arr-empty';
        e.textContent = spec.empty || '暂无条目，点下面的按钮添加一条。';
        root.appendChild(e);
      } else {
        arr.forEach(function (v, i) { root.appendChild(makeRow(v, i)); });
      }
      const actions = document.createElement('div');
      actions.className = 'arr-actions';
      actions.innerHTML = '<button type="button" class="btn btn-sm" data-act="add">＋ ' +
        esc(spec.addText || '添加一条') + '</button>';
      root.appendChild(actions);
      refreshRuleStates();
    }

    function apply(list) {
      if (hooked.bindFn) hooked.bindFn(list, render);
      else render(list);
    }

    function refreshRuleStates() {
      if (!spec.reKey) return;
      $$('.arr-row', root).forEach(function (row) {
        const el = $('[data-k="' + spec.reKey + '"]', row);
        if (!el) return;
        const ok = regexOk(el.value);
        el.classList.toggle('is-bad', !ok);
        const err = $('.err', row);
        if (err) err.textContent = ok ? '' : '正则语法错误，无法 new RegExp()';
      });
    }

    /* 增删改移一律走「先读值 → 改结构 → 重渲染」，需要时由外部适配器接管值的读写 */
    function mutate(fn) {
      const list = values();
      const r = fn(list);
      if (r !== false) apply(list);
      root.dispatchEvent(new Event('input', { bubbles: true }));
    }

    root.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      const row = btn.closest('.arr-row');
      if (act === 'add') {
        mutate(function (list) {
          const fresh = spec.template ? clone(spec.template)
            : (spec.keys.length === 1 ? (spec.faq ? { keys: '', a: '' } : '') : {});
          list.push(fresh);
        });
      } else if (row) {
        const i = Number(row.dataset.idx);
        if (act === 'del') mutate(function (list) { list.splice(i, 1); });
        else if (act === 'up') mutate(function (list) {
          if (i <= 0) return false;
          list.splice(i - 1, 0, list.splice(i, 1)[0]);
        });
        else if (act === 'down') mutate(function (list) {
          if (i >= list.length - 1) return false;
          list.splice(i + 1, 0, list.splice(i, 1)[0]);
        });
      }
    });

    /* 拖动排序 */
    let dragFrom = null;
    root.addEventListener('dragstart', function (e) {
      const row = e.target.closest('.arr-row');
      if (!row) return;
      dragFrom = Number(row.dataset.idx);
      row.classList.add('is-drag');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(dragFrom)); } catch (err) { /* 忽略 */ }
    });
    root.addEventListener('dragover', function (e) {
      const row = e.target.closest('.arr-row');
      if (!row) return;
      e.preventDefault();
      $$('.arr-row', root).forEach(function (r) { r.classList.remove('is-over'); });
      row.classList.add('is-over');
    });
    root.addEventListener('drop', function (e) {
      const row = e.target.closest('.arr-row');
      if (!row) return;
      e.preventDefault();
      const to = Number(row.dataset.idx);
      if (dragFrom === null || dragFrom === to) return;
      mutate(function (list) { list.splice(to, 0, list.splice(dragFrom, 1)[0]); });
      dragFrom = null;
    });
    root.addEventListener('dragend', function () {
      $$('.arr-row', root).forEach(function (r) { r.classList.remove('is-drag', 'is-over'); });
    });

    /* 颜色选择器 ↔ 十六进制文本框 双向同步；正则实时校验 */
    root.addEventListener('input', function (e) {
      const el = e.target;
      if (!el.dataset) return;
      const row = el.closest('.arr-row');
      if (row && el.dataset.k && el.type === 'color') {
        const hex = $('[data-kh="' + el.dataset.k + '"]', row);
        if (hex) hex.value = el.value;
      } else if (row && el.dataset.kh) {
        const v = el.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(v)) {
          const picker = $('input[type="color"][data-k="' + el.dataset.kh + '"]', row);
          if (picker) picker.value = v;
          el.classList.remove('is-bad');
        } else if (v) {
          el.classList.add('is-bad');
        }
      }
      if (row && spec.reKey && el.dataset.k === spec.reKey) refreshRuleStates();
    });

    return {
      root: root,
      bind: function (list) { apply(Array.isArray(list) ? list : []); },
      values: values,
      /** 供外部适配器替换读写实现（场景 palette 用） */
      hook: function (valuesFn, bindFn) { hooked.valuesFn = valuesFn; hooked.bindFn = bindFn; }
    };
  }

  /* ==========================================================================
     道具表编辑器（settings.items）
     卡片式列表：icon / name / kind / price / desc / id + effect 按需勾选
       - 数值效果 heal / affinity / progress：勾选「启用」后才写入数字
       - 布尔效果 clearWarn / shield / unseal / gift：勾上即 true
       - counter 下拉：无 / force-answer
       - 未识别的 effect 键与未识别的道具字段一律原样保留（前向兼容）
     支持新增 / 删除 / 上下移动 / 复制，id 唯一性实时校验
     ========================================================================== */
  function itemsEditor(host) {
    const KNOWN_FIELDS = ['id', 'name', 'icon', 'kind', 'price', 'desc', 'effect'];
    const NUM_FX = [
      { k: 'heal', label: 'heal 恢复状态值', ph: '8', dft: 8 },
      { k: 'affinity', label: 'affinity 好感变化', ph: '8', dft: 8 },
      { k: 'progress', label: 'progress 推进度 %', ph: '12', dft: 12 }
    ];
    const BOOL_FX = [
      { k: 'clearWarn', label: 'clearWarn 清除警告记录' },
      { k: 'shield', label: 'shield 挡下一次扣血判定' },
      { k: 'unseal', label: 'unseal 解除禁言与封口' },
      { k: 'gift', label: 'gift 让角色赠你一件剧情道具' }
    ];
    const KNOWN_FX = NUM_FX.map(function (n) { return n.k; })
      .concat(BOOL_FX.map(function (b) { return b.k; })).concat(['counter']);

    let list = [];
    const root = document.createElement('div');
    root.className = 'items';
    if (host) { host.innerHTML = ''; host.appendChild(root); }

    function fxOf(it) {
      const e = (it && it.effect) || {};
      return (e && typeof e === 'object' && !Array.isArray(e)) ? e : {};
    }
    function uniqueId(base) {
      const used = {};
      $$('.item-card [data-f="id"]', root).forEach(function (el) { used[el.value.trim()] = true; });
      list.forEach(function (it) { if (it && it.id) used[String(it.id)] = true; });
      let id = String(base || 'item').replace(/[^A-Za-z0-9._-]/g, '') || 'item';
      if (!used[id]) return id;
      let n = 2;
      while (used[id + '-' + n]) n++;
      return id + '-' + n;
    }

    function cardHtml(it, i) {
      const item = it || {};
      const fx = fxOf(item);
      const counter = typeof fx.counter === 'string' ? fx.counter : '';
      const extraFx = Object.keys(fx).filter(function (k) { return KNOWN_FX.indexOf(k) === -1; });
      const extraFld = Object.keys(item).filter(function (k) { return KNOWN_FIELDS.indexOf(k) === -1; });

      const numRows = NUM_FX.map(function (n) {
        const on = typeof fx[n.k] === 'number';
        return '<div class="fx-row"><label class="chk"><input type="checkbox" data-fx-num="' + n.k + '"' +
          (on ? ' checked' : '') + '><span>' + esc(n.label) + '</span></label>' +
          '<input class="ipt" type="number" step="1" data-fxn="' + n.k + '" value="' +
          (on ? esc(fx[n.k]) : '') + '" placeholder="' + esc(n.ph) + '"></div>';
      }).join('');

      const boolRows = BOOL_FX.map(function (b) {
        return '<label class="chk"><input type="checkbox" data-fx-bool="' + b.k + '"' +
          (fx[b.k] ? ' checked' : '') + '><span>' + esc(b.label) + '</span></label>';
      }).join('');

      const counterSel = '<div class="fx-row"><span class="fx-lbl">counter 反制</span>' +
        '<select class="ipt" data-fx-counter>' +
        [['', '无'], ['force-answer', 'force-answer 逼角色正面回答']].map(function (o) {
          return '<option value="' + esc(o[0]) + '"' + (counter === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
        }).join('') + '</select></div>';

      const kindSel = '<select class="ipt" data-f="kind">' +
        [['support', 'support 支援'], ['counter', 'counter 反制']].map(function (o) {
          return '<option value="' + o[0] + '"' + (item.kind === 'counter' ? (o[0] === 'counter' ? ' selected' : '') : (o[0] === 'support' ? ' selected' : '')) + '>' + esc(o[1]) + '</option>';
        }).join('') + '</select>';

      const keepNote = (extraFx.length || extraFld.length)
        ? '<div class="item-keep">未识别键原样保留：' +
          esc(extraFld.concat(extraFx.map(function (k) { return 'effect.' + k; })).join(' / ')) + '</div>'
        : '';

      return '<div class="item-card" data-idx="' + i + '">' +
        '<div class="item-head">' +
        '<span class="item-icon" data-f="iconShow">' + esc(item.icon || '·') + '</span>' +
        '<span class="item-title" data-f="titleShow">' + esc(item.name || '（未命名）') + '</span>' +
        '<span class="item-id" title="道具 id（唯一）">id: <b data-f="idShow">' + esc(item.id || '（空）') + '</b></span>' +
        '<div class="item-tools">' +
        '<button type="button" class="btn btn-xs" data-act="up" title="上移">↑</button>' +
        '<button type="button" class="btn btn-xs" data-act="down" title="下移">↓</button>' +
        '<button type="button" class="btn btn-xs" data-act="copy" title="复制一份">⧉ 复制</button>' +
        '<button type="button" class="btn btn-xs btn-danger" data-act="del" title="删除">✕ 删除</button>' +
        '</div></div>' +
        '<div class="grid grid-4">' +
        '<label class="fld"><span class="lbl">图标 icon<span class="lbl-note"> · 单字 / emoji</span></span>' +
        '<input class="ipt" maxlength="4" data-f="icon" value="' + esc(item.icon || '') + '"></label>' +
        '<label class="fld"><span class="lbl">名称 name</span>' +
        '<input class="ipt" data-f="name" value="' + esc(item.name || '') + '"></label>' +
        '<label class="fld"><span class="lbl">类型 kind</span>' + kindSel + '</label>' +
        '<label class="fld"><span class="lbl">价格 price（积分）</span>' +
        '<input class="ipt" type="number" step="1" data-f="price" value="' + esc(item.price == null ? '' : item.price) + '"></label>' +
        '</div>' +
        '<div class="grid grid-2">' +
        '<label class="fld"><span class="lbl">道具 id<span class="lbl-note"> · 唯一，字母 / 数字 / 点 / 下划线 / 短横线</span></span>' +
        '<input class="ipt mono" data-f="id" value="' + esc(item.id || '') + '"><span class="err" data-f="idErr"></span></label>' +
        '<label class="fld"><span class="lbl">说明 desc</span>' +
        '<textarea class="ipt ta" rows="2" data-f="desc">' + esc(item.desc || '') + '</textarea></label>' +
        '</div>' +
        '<div class="fld"><span class="lbl">效果 effect<span class="lbl-note"> · 勾上才写入该键</span></span>' +
        '<div class="fx-grid">' + numRows + boolRows + counterSel + '</div></div>' +
        keepNote +
        '</div>';
    }

    function refreshIdState() {
      const cards = $$('.item-card', root);
      const ids = cards.map(function (c) {
        const el = $('[data-f="id"]', c);
        return el ? el.value.trim() : '';
      });
      const seen = {};
      ids.forEach(function (id) { if (id) seen[id] = (seen[id] || 0) + 1; });
      cards.forEach(function (c, i) {
        const el = $('[data-f="id"]', c);
        const err = $('[data-f="idErr"]', c);
        const id = ids[i];
        let msg = '';
        if (!id) msg = 'id 不能为空';
        else if (!/^[A-Za-z0-9._-]+$/.test(id)) msg = 'id 只能用字母、数字、点、下划线、短横线';
        else if (seen[id] > 1) msg = 'id 重复：' + id;
        if (el) el.classList.toggle('is-bad', !!msg);
        if (err) err.textContent = msg;
      });
    }

    function read() {
      return $$('.item-card', root).map(function (card, i) {
        const src = list[i] || {};
        const f = function (k) { const el = $('[data-f="' + k + '"]', card); return el ? el.value : ''; };
        /* 界面上的值 */
        const vals = {
          id: f('id').trim(),
          name: f('name').trim(),
          icon: f('icon').trim(),
          kind: f('kind') === 'counter' ? 'counter' : 'support',
          price: num(f('price'), 0),
          desc: f('desc')
        };
        /* effect：数值项勾选后取数字，布尔项勾上即 true，counter 取下拉值 */
        const fxv = {};
        NUM_FX.forEach(function (n) {
          const box = $('[data-fx-num="' + n.k + '"]', card);
          if (!box || !box.checked) return;
          const inp = $('[data-fxn="' + n.k + '"]', card);
          fxv[n.k] = num(inp ? inp.value : '', n.dft);
        });
        BOOL_FX.forEach(function (b) {
          const box = $('[data-fx-bool="' + b.k + '"]', card);
          if (box && box.checked) fxv[b.k] = true;
        });
        const sel = $('[data-fx-counter]', card);
        if (sel && sel.value) fxv.counter = sel.value;

        /* 键序按原数据回填：未识别字段与未识别 effect 键原样保留，值不变的项保存后逐字节一致 */
        const ofx = fxOf(src);
        const fxOrder = Object.keys(ofx);
        const effect = {};
        fxOrder.forEach(function (k) {
          if (KNOWN_FX.indexOf(k) === -1) effect[k] = ofx[k];
          else if (fxv[k] !== undefined) effect[k] = fxv[k];
        });
        Object.keys(fxv).forEach(function (k) { if (!(k in effect)) effect[k] = fxv[k]; });
        vals.effect = effect;

        const out = {};
        Object.keys(src).forEach(function (k) {
          out[k] = KNOWN_FIELDS.indexOf(k) === -1 ? src[k] : vals[k];
        });
        KNOWN_FIELDS.forEach(function (k) { if (!(k in out)) out[k] = vals[k]; });
        return out;
      });
    }

    function render() {
      root.innerHTML = list.map(cardHtml).join('') +
        '<div class="items-actions">' +
        '<button type="button" class="btn btn-sm" data-act="add">＋ 添加道具</button>' +
        '<span class="items-count">共 ' + list.length + ' 件道具</span>' +
        '</div>';
      refreshIdState();
    }

    root.addEventListener('input', function (e) {
      const card = e.target.closest ? e.target.closest('.item-card') : null;
      if (!card || !e.target.dataset) return;
      if (e.target.dataset.f === 'icon') {
        $('[data-f="iconShow"]', card).textContent = e.target.value || '·';
      } else if (e.target.dataset.f === 'name') {
        $('[data-f="titleShow"]', card).textContent = e.target.value || '（未命名）';
      } else if (e.target.dataset.f === 'id') {
        $('[data-f="idShow"]', card).textContent = e.target.value.trim() || '（空）';
        refreshIdState();
      }
    });

    root.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      const card = btn.closest('.item-card');
      list = read();
      if (act === 'add') {
        const id = uniqueId('item');
        list.push({ id: id, name: '新道具', icon: '🎁', kind: 'support', price: 60, desc: '', effect: {} });
      } else if (!card) {
        return;
      } else {
        const i = Number(card.dataset.idx);
        if (act === 'del') list.splice(i, 1);
        else if (act === 'up') { if (i <= 0) return; list.splice(i - 1, 0, list.splice(i, 1)[0]); }
        else if (act === 'down') { if (i >= list.length - 1) return; list.splice(i + 1, 0, list.splice(i, 1)[0]); }
        else if (act === 'copy') {
          const c = clone(list[i]) || {};
          c.id = uniqueId((c.id || 'item') + '-copy');
          c.name = (c.name || '未命名') + ' 副本';
          list.splice(i + 1, 0, c);
        } else return;
      }
      render();
      root.dispatchEvent(new Event('input', { bubbles: true }));
    });

    return {
      root: root,
      bind: function (arr) { list = clone(Array.isArray(arr) ? arr : []) || []; render(); },
      values: read,
      invalid: function () {
        const bad = [];
        const seen = {};
        read().forEach(function (it, i) {
          const id = String(it.id || '').trim();
          const label = '道具第 ' + (i + 1) + ' 项（' + (it.name || '未命名') + '）';
          if (!id) bad.push(label + ' id 不能为空');
          else if (!/^[A-Za-z0-9._-]+$/.test(id)) bad.push(label + ' id 只能用字母、数字、点、下划线、短横线');
          else if (seen[id]) bad.push('道具 id 重复：' + id);
          else seen[id] = true;
        });
        return bad;
      }
    };
  }

  /* ==========================================================================
     资源编辑
     ========================================================================== */
  const resTab = (function () {
    let resources = [];
    let cur = null;               // 当前编辑的资源（深拷贝）
    let base = null;              // 载入时的快照，用于判断「有未保存的修改」
    let allowIdEdit = false;      // 新建资源时才允许改 id
    let editors = {};
    let search = '';

    const form = $('#resForm');
    const listBox = $('#resList');
    const REPLY_KINDS = ['greeting', 'question', 'action', 'emotion', 'flirt', 'default', 'punish', 'execution'];

    /* ------------------------- 表单骨架 ------------------------- */
    function renderSkeleton() {
      form.innerHTML = [
        /* 基础字段 */
        '<fieldset class="card"><legend>基础字段</legend>',
        '<p class="hint-line" id="f_rulesHint">玩家状态值上限、难度倍率来自「全局设置」。</p>',
        '<div class="grid grid-3">',
        '<label class="fld"><span class="lbl">id（新建时可填；已保存的资源不可改）</span><input class="ipt mono" id="f_id" placeholder="例如 changan-yeweiyang"></label>',
        '<label class="fld"><span class="lbl">名称 name</span><input class="ipt" id="f_name"></label>',
        '<label class="fld"><span class="lbl">副标题 subtitle</span><input class="ipt" id="f_subtitle" placeholder="古风 · 权谋 · 悬疑"></label>',
        '</div>',
        '<div class="grid grid-4">',
        '<label class="fld"><span class="lbl">题材 genres（逗号分隔）</span><input class="ipt" id="f_genres" placeholder="古风,权谋,悬疑"></label>',
        '<label class="fld"><span class="lbl">分级 rating</span><select class="ipt" id="f_rating">',
        '<option value="16+">16+</option><option value="18+">18+</option></select></label>',
        '<label class="fld"><span class="lbl">篇幅 length</span><select class="ipt" id="f_length">',
        '<option value="长线">长线</option><option value="短线">短线</option></select></label>',
        '<label class="fld"><span class="lbl">状态 status</span><select class="ipt" id="f_status">',
        '<option value="playable">可游玩 playable</option><option value="upcoming">预约中 upcoming</option></select></label>',
        '</div>',
        '<div class="grid grid-4">',
        '<label class="fld"><span class="lbl">热度 heat</span><input class="ipt" type="number" step="1" id="f_heat"></label>',
        '<label class="fld"><span class="lbl">游玩人数 players</span><input class="ipt" type="number" step="1" id="f_players"></label>',
        '<label class="fld"><span class="lbl">排序 order（数字，越小越靠前，留空表示不指定）</span><input class="ipt" type="number" step="1" id="f_order"></label>',
        '<label class="fld"><span class="lbl">难度 difficulty<span class="lbl-note"> · 影响积分倍率</span></span><select class="ipt" id="f_difficulty">',
        '<option value="1">1 · 轻松</option><option value="2">2 · 标准</option><option value="3">3 · 严苛</option></select></label>',
        '<label class="fld"><span class="lbl">权力关系 powerBalance<span class="lbl-note"> · 决定角色能不能反击玩家</span></span><select class="ipt" id="f_power">',
        '<option value="player-higher">玩家地位更高 · 角色不能反击（先劝，劝不动就 _〔离去〕_）</option>',
        '<option value="equal">平等 · 可以回怼与惩戒</option>',
        '<option value="ai-higher">角色地位更高 · 可以惩戒与压制</option>',
        '</select></label>',
        '</div>',
        '</fieldset>',

        /* 卡片文案 */
        '<fieldset class="card"><legend>卡片文案</legend>',
        '<label class="fld"><span class="lbl">一句话简介 brief</span><input class="ipt" id="f_brief"></label>',
        '<label class="fld"><span class="lbl">卡片标语 teaser</span><input class="ipt" id="f_teaser"></label>',
        '<div class="grid grid-3">',
        '<label class="fld"><span class="lbl">metaLines 第 1 行</span><input class="ipt" id="f_meta0"></label>',
        '<label class="fld"><span class="lbl">metaLines 第 2 行</span><input class="ipt" id="f_meta1"></label>',
        '<label class="fld"><span class="lbl">metaLines 第 3 行</span><input class="ipt" id="f_meta2"></label>',
        '</div>',
        '<label class="fld"><span class="lbl">长简介 intro（卡片详情里展示）</span><textarea class="ipt ta" rows="7" id="f_intro"></textarea></label>',
        '</fieldset>',

        /* 封面 */
        '<fieldset class="card"><legend>封面 cover</legend>',
        '<div class="grid grid-3">',
        '<label class="fld"><span class="lbl">图形母题 motif</span><select class="ipt" id="f_motif">',
        '<option value="lantern">lantern · 灯笼</option><option value="neon">neon · 霓虹</option>',
        '<option value="mist">mist · 雾</option><option value="rain">rain · 雨</option>',
        '<option value="archive">archive · 卷宗</option><option value="sea">sea · 深海</option>',
        '<option value="fair">fair · 废弃游乐园</option><option value="throne">throne · 宫墙</option>',
        '</select></label>',
        '<div class="fld" style="grid-column:span 2"><span class="lbl">配色 palette（三色，颜色选择器与十六进制同步）</span>',
        '<div class="colors">',
        '<div class="color-item"><input type="color" id="f_col0"><input class="ipt hex" id="f_pal0" placeholder="#1b1020"></div>',
        '<div class="color-item"><input type="color" id="f_col1"><input class="ipt hex" id="f_pal1" placeholder="#8c3b4a"></div>',
        '<div class="color-item"><input type="color" id="f_col2"><input class="ipt hex" id="f_pal2" placeholder="#e8b06a"></div>',
        '</div></div>',
        '</div>',
        '<div class="cover-box">',
        '<div class="cover-preview" id="f_coverPreview">未上传图片</div>',
        '<div class="cover-tools">',
        '<div class="row"><input class="ipt mono" style="min-width:340px;flex:1" id="f_coverImage" placeholder="cover.image · 上传后自动回填 /uploads/xxx.png"></div>',
        '<div class="row">',
        '<input type="file" id="f_coverFile" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden>',
        '<button type="button" class="btn btn-sm" id="btnPickCover">选择图片上传</button>',
        '<button type="button" class="btn btn-sm" id="btnClearCover">清除图片</button>',
        '<span class="upload-state" id="coverState">支持 png / jpg / webp / gif / svg，单张 ≤ 5MB</span>',
        '</div>',
        '</div>',
        '</div>',
        '</fieldset>',

        /* 剧情 */
        '<fieldset class="card"><legend>剧情</legend>',
        '<label class="fld"><span class="lbl">世界观 world</span><textarea class="ipt ta" rows="6" id="f_world"></textarea></label>',
        '<label class="fld"><span class="lbl">玩家身份 userRole</span><textarea class="ipt ta" rows="5" id="f_userRole"></textarea></label>',
        '<label class="fld"><span class="lbl">主线 plot</span><textarea class="ipt ta" rows="8" id="f_plot"></textarea></label>',
        '<div class="fld"><span class="lbl">剧情提醒 plotReminder（进入剧情时弹出的提醒卡）</span><div id="arr_plotReminder"></div></div>',
        '<div class="fld"><span class="lbl">开场提示 openingHints</span><div id="arr_openingHints"></div></div>',
        '<div class="fld" id="fld-beats"><span class="lbl">剧情节拍 beats（at = 第几回合触发 / text = 触发内容 / key = 关键节点 / progress = 推进度增量）<span class="lbl-note"> · 关键节点触发时给大幅推进度（+30~45）</span></span><div id="arr_beats"></div></div>',
        '<div class="fld"><span class="lbl">场景 scenes（id / 名称 / 描述 / 三色配色）</span><div id="arr_scenes"></div></div>',
        '<div class="fld"><span class="lbl">扮演规则 rules</span><div id="arr_rules"></div></div>',
        '<div class="fld"><span class="lbl">状态值规则 hpRules</span><div id="arr_hpRules"></div></div>',
        '<div class="fld"><span class="lbl">本场剧情规则 plotRules<span class="lbl-note"> · 会显示在剧情提醒卡里，并优先于通用规则注入系统提示词</span></span><div id="arr_plotRules"></div></div>',
        '<div class="fld"><span class="lbl">本场行为规则 behaviorRules<span class="lbl-note"> · 这个角色会怎么惩戒、什么算越界</span></span><div id="arr_behaviorRules"></div></div>',
        '</fieldset>',

        /* 角色 */
        '<fieldset class="card"><legend>角色 character</legend>',
        '<div class="grid grid-3">',
        '<label class="fld"><span class="lbl">姓名 name</span><input class="ipt" id="f_c_name"></label>',
        '<label class="fld"><span class="lbl">身份 title</span><input class="ipt" id="f_c_title"></label>',
        '<label class="fld"><span class="lbl">年龄 age</span><input class="ipt" id="f_c_age"></label>',
        '</div>',
        '<label class="fld"><span class="lbl">外貌 appearance</span><textarea class="ipt ta" rows="6" id="f_c_appearance"></textarea></label>',
        '<label class="fld"><span class="lbl">性格 personality</span><textarea class="ipt ta" rows="6" id="f_c_personality"></textarea></label>',
        '<label class="fld"><span class="lbl">说话方式 speech</span><textarea class="ipt ta" rows="5" id="f_c_speech"></textarea></label>',
        '<label class="fld"><span class="lbl">欲望 desire</span><textarea class="ipt ta" rows="4" id="f_c_desire"></textarea></label>',
        '<div class="fld"><span class="lbl">禁忌 taboo（触碰即重罚）</span><div id="arr_taboo"></div></div>',
        '</fieldset>',

        /* 系统提示词 */
        '<fieldset class="card"><legend>系统提示词 prompt<span class="lbl-note"> · 本资源的完整扮演提示词，逐字下发模型</span></legend>',
        '<label class="fld"><span class="lbl">prompt</span>',
        '<textarea class="ipt ta mono" rows="24" id="f_prompt"></textarea></label>',
        '</fieldset>',

        /* 语料库 */
        '<fieldset class="card"><legend>语料库 replies<span class="lbl-note"> · 本地演绎引擎按意图取用，可增删</span></legend>',
        REPLY_KINDS.map(function (k) {
          const label = {
            greeting: '打招呼 greeting', question: '提问 question', action: '动作 action', emotion: '情绪 emotion',
            flirt: '暧昧 flirt', default: '默认 default', punish: '惩戒 punish', execution: '处刑 execution'
          }[k];
          return '<div class="fld"><span class="lbl">' + esc(label) + '（' + k + '）</span><div id="arr_reply_' + k + '"></div></div>';
        }).join(''),
        '</fieldset>',

        '<div class="form-foot"><button type="button" class="btn btn-primary" id="btnSaveRes2">保存资源</button></div>'
      ].join('');

      /* 字符串数组编辑器工厂 */
      function strEd(addText, label, ph, rows) {
        return arrayEditor({
          addText: addText, keys: ['text'], labels: { text: label },
          kinds: { text: rows > 1 ? 'textarea' : 'text' }, rows: { text: rows },
          ph: { text: ph || '' }, empty: '暂无条目。'
        });
      }

      editors = {
        plotReminder: strEd('添加提醒', '提醒内容', '例如：沈明烛已经看穿你查灯是假。', 2),
        openingHints: strEd('添加开场白', '开场白', '例如：在下大理寺评事，奉命来查灯。', 2),
        beats: makeBeatsEditor(),
        scenes: makeSceneEditor(),
        rules: strEd('添加规则', '规则', '例如：始终以角色的第一人称说话。', 2),
        hpRules: strEd('添加扣血规则', '规则', '例如：对角色动手、辱骂：-5', 2),
        plotRules: strEd('添加剧情规则', '剧情规则', '例如：问出卷宗缺页才算推进；关键答案是第十二个名字。', 2),
        behaviorRules: strEd('添加行为规则', '行为规则', '例如：他不能对玩家动手，只会冷言回避，被逼急了就离去。', 2),
        taboo: strEd('添加禁忌', '禁忌', '例如：逼她承认自己就是当年的活口', 2)
      };
      REPLY_KINDS.forEach(function (k) {
        editors['reply_' + k] = strEd('添加一条', k, '可用 %KW% 占位玩家关键词，%NAME% 占位玩家称呼', 3);
      });

      $('#arr_plotReminder').appendChild(editors.plotReminder.root);
      $('#arr_openingHints').appendChild(editors.openingHints.root);
      $('#arr_beats').appendChild(editors.beats.root);
      $('#arr_scenes').appendChild(editors.scenes.root);
      $('#arr_rules').appendChild(editors.rules.root);
      $('#arr_hpRules').appendChild(editors.hpRules.root);
      $('#arr_plotRules').appendChild(editors.plotRules.root);
      $('#arr_behaviorRules').appendChild(editors.behaviorRules.root);
      $('#arr_taboo').appendChild(editors.taboo.root);
      REPLY_KINDS.forEach(function (k) {
        $('#arr_reply_' + k).appendChild(editors['reply_' + k].root);
      });

      /* 封面配色同步 */
      [0, 1, 2].forEach(function (i) {
        const picker = $('#f_col' + i), hex = $('#f_pal' + i);
        picker.addEventListener('input', function () { hex.value = picker.value; markDirty(); });
        hex.addEventListener('input', function () {
          const v = hex.value.trim();
          if (/^#[0-9a-fA-F]{6}$/.test(v)) { picker.value = v; hex.classList.remove('is-bad'); }
          else if (v) hex.classList.add('is-bad');
          markDirty();
        });
      });

      /* 封面上传 */
      $('#btnPickCover').addEventListener('click', function () { $('#f_coverFile').click(); });
      $('#f_coverFile').addEventListener('change', doUploadCover);
      $('#btnClearCover').addEventListener('click', function () {
        $('#f_coverImage').value = '';
        renderCoverPreview();
        markDirty();
        toast('已清除封面图片（保存资源后生效）', 'ok');
      });
      $('#f_coverImage').addEventListener('input', renderCoverPreview);
    }

    /* 场景编辑器：在三字段通用编辑器上接管读写，保证三色 palette 不丢 */
    function makeSceneEditor() {
      const ed = arrayEditor({
        addText: '添加场景', keys: ['id', 'name', 'desc'],
        labels: { id: 'id', name: '场景名', desc: '描述' },
        ph: { id: 'dongge', name: '东阁暖阁', desc: '炭火将熄，一盏灯替你留着' },
        template: { id: '', name: '', desc: '' },
        valuesFn: function () { return read(); }
      });

      /* 从 DOM 读：id/name/desc + 三色 */
      function read() {
        return $$('.arr-row', ed.root).map(function (row) {
          const get = function (k) { const el = $('[data-k="' + k + '"]', row); return el ? el.value : ''; };
          return {
            id: get('id'), name: get('name'), desc: get('desc'),
            palette: [0, 1, 2].map(function (ci) {
              const h = $('[data-kh="' + ci + '"]', row);
              return h ? h.value.trim() : '';
            })
          };
        });
      }

      /* 写：三字段交给通用渲染器，三色额外插一行 */
      ed.hook(read, function (list, render) {
        render(list.map(function (s) {
          const p = (s && s.palette && s.palette.length === 3) ? s.palette : ['#141020', '#3a2436', '#c9873f'];
          return { id: s.id || '', name: s.name || '', desc: s.desc || '', palette: p };
        }));
        $$('.arr-row', ed.root).forEach(function (row, i) {
          const item = list[i] || {};
          const p = (item.palette && item.palette.length === 3) ? item.palette : ['#141020', '#3a2436', '#c9873f'];
          const wrap = document.createElement('div');
          wrap.className = 'fld';
          wrap.style.margin = '0';
          wrap.innerHTML = '<span class="lbl">三色配色 palette</span><div class="colors">' +
            p.map(function (c, ci) {
              const hex = /^#[0-9a-fA-F]{6}$/.test(String(c)) ? c : '#000000';
              return '<div class="color-item"><input type="color" data-k="' + ci + '" value="' + esc(hex) + '">' +
                '<input class="ipt hex" data-kh="' + ci + '" value="' + esc(hex) + '" placeholder="#000000"></div>';
            }).join('') + '</div>';
          $('.arr-body', row).appendChild(wrap);
        });
      });
      return ed;
    }

    /* 节拍编辑器：在通用编辑器上接管读写，保住 key / progress 与未识名字段
       - key     ：复选框，勾上才写入（关键节点触发时给大幅推进度）
       - progress：数字，留空则不写入，前端按默认 8 处理（关键节点至少按 30 计） */
    function makeBeatsEditor() {
      const KNOWN = ['at', 'text', 'key', 'progress', 'kind'];
      const ed = arrayEditor({
        addText: '添加节拍', keys: ['at', 'kind', 'text', 'key', 'progress'],
        labels: { at: '第几回合 at', kind: '类型 kind', text: '触发内容 text', key: '关键节点 key', progress: '推进度 progress' },
        kinds: { at: 'number', kind: 'select', text: 'textarea', key: 'check', progress: 'number' },
        options: { kind: [['guide', 'A 类·固定轮次（只提示与引导，不加推进度）'], ['reveal', 'B 类·剧情揭露（暂未启用）']] },
        rows: { text: 3 },
        ph: {
          at: '5', text: '这一回合会插入的剧情',
          key: '关键节点（B 类启用后给大幅推进度）', progress: '默认 8，留空则不写入'
        },
        template: { at: 5, kind: 'guide', text: '', key: false, progress: '' },
        valuesFn: read
      });

      /* 从 DOM 读：at / text / key / progress + 原样保留的未识名字段 */
      function read() {
        return $$('.arr-row', ed.root).map(function (row) {
          const get = function (k) { const el = $('[data-k="' + k + '"]', row); return el ? el.value : ''; };
          const out = {};
          if (row.dataset.extra) {
            try { Object.assign(out, JSON.parse(row.dataset.extra)); } catch (e) { /* 忽略坏数据 */ }
          }
          out.at = num(get('at'), 0);
          out.text = get('text');
          const box = $('[data-k="key"]', row);
          if (box && box.checked) out.key = true;
          const pv = String(get('progress')).trim();
          if (pv !== '') out.progress = num(pv, 8);
          return out;
        });
      }

      ed.hook(read, function (list, render) {
        render(list.map(function (b) {
          return {
            at: b.at == null ? '' : b.at,
            text: b.text == null ? '' : b.text,
            key: !!b.key,
            progress: b.progress == null ? '' : b.progress
          };
        }));
        /* 未识名字段挂回行上，下一次读值时原样带回 */
        $$('.arr-row', ed.root).forEach(function (row, i) {
          const b = list[i] || {};
          const extra = {};
          Object.keys(b).forEach(function (k) { if (KNOWN.indexOf(k) === -1) extra[k] = b[k]; });
          if (Object.keys(extra).length) row.dataset.extra = JSON.stringify(extra);
        });
      });
      return ed;
    }

    /* ------------------------- 表单绑定 ------------------------- */
    function findIndex(id) {
      for (let i = 0; i < resources.length; i++) if (resources[i] && resources[i].id === id) return i;
      return -1;
    }

    /* 难度只能是 1 / 2 / 3，缺省按 2（标准） */
    function diffOf(r) {
      const n = Number(r && r.difficulty);
      return [1, 2, 3].indexOf(n) === -1 ? 2 : n;
    }

    /* 只读提示：状态值上限与难度倍率都来自「全局设置」 */
    function renderHint() {
      const el = $('#f_rulesHint');
      if (!el) return;
      const s = setTab.getSettings();
      if (!s) {
        el.textContent = '玩家状态值上限、难度倍率来自「全局设置」（正在载入…）';
        return;
      }
      const combat = s.combat || {};
      const score = s.score || {};
      const diff = score.difficulty || {};
      const names = ['1', '2', '3'].map(function (k) {
        const d = diff[k] || {};
        return k + ' ' + (d.name || '未命名') + ' ×' + (d.mult == null ? 1 : d.mult);
      }).join(' / ');
      el.innerHTML = '只读：玩家状态值上限 <b>' + esc(combat.maxHp == null ? 20 : combat.maxHp) + '</b> 点 · 即死扣血 ' +
        esc(combat.instantDeathHp == null ? 20 : combat.instantDeathHp) + ' · 难度倍率来自「全局设置 → 积分与难度」：' +
        esc(names) + ' · 默认难度 ' + esc(score.defaultDifficulty == null ? 2 : score.defaultDifficulty);
    }

    function bindResource(r, canEditId) {
      cur = clone(r);
      base = clone(r);
      allowIdEdit = !!canEditId || findIndex(r.id) === -1;
      form.hidden = false;
      $('#resEmpty').hidden = true;

      const cv = cur.cover || {};
      const pal = (cv.palette && cv.palette.length === 3) ? cv.palette : ['#141020', '#3a2436', '#c9873f'];
      const c = cur.character || {};
      const ml = cur.metaLines || ['', '', ''];

      $('#f_id').value = cur.id || '';
      $('#f_id').readOnly = !allowIdEdit;
      $('#f_id').title = allowIdEdit ? '新建资源可自定义 id' : '已保存的资源，id 不可修改';

      $('#f_name').value = cur.name || '';
      $('#f_subtitle').value = cur.subtitle || '';
      $('#f_genres').value = (cur.genres || []).join(',');
      $('#f_rating').value = cur.rating === '16+' ? '16+' : '18+';
      $('#f_length').value = cur.length === '短线' ? '短线' : '长线';
      $('#f_status').value = cur.status === 'upcoming' ? 'upcoming' : 'playable';
      $('#f_heat').value = cur.heat == null ? '' : cur.heat;
      $('#f_players').value = cur.players == null ? '' : cur.players;
      $('#f_order').value = cur.order == null ? '' : cur.order;
      $('#f_difficulty').value = String(diffOf(cur));
      $('#f_power').value = cur.powerBalance || 'equal';

      $('#f_brief').value = cur.brief || '';
      $('#f_teaser').value = cur.teaser || '';
      $('#f_meta0').value = ml[0] || '';
      $('#f_meta1').value = ml[1] || '';
      $('#f_meta2').value = ml[2] || '';
      $('#f_intro').value = cur.intro || '';

      $('#f_motif').value = ['lantern','neon','mist','rain','archive','sea','fair','throne'].indexOf(cv.motif) === -1 ? 'lantern' : cv.motif;
      [0, 1, 2].forEach(function (i) {
        $('#f_pal' + i).value = pal[i];
        $('#f_col' + i).value = /^#[0-9a-fA-F]{6}$/.test(pal[i]) ? pal[i] : '#000000';
      });
      $('#f_coverImage').value = cv.image || '';
      $('#coverState').textContent = '支持 png / jpg / webp / gif / svg，单张 ≤ 5MB';
      $('#coverState').className = 'upload-state';
      renderCoverPreview();

      $('#f_world').value = cur.world || '';
      $('#f_userRole').value = cur.userRole || '';
      $('#f_plot').value = cur.plot || '';

      editors.plotReminder.bind(cur.plotReminder || []);
      editors.openingHints.bind(cur.openingHints || []);
      editors.beats.bind(cur.beats || []);
      editors.scenes.bind(cur.scenes || []);
      editors.rules.bind(cur.rules || []);
      editors.hpRules.bind(cur.hpRules || []);
      editors.plotRules.bind(cur.plotRules || []);
      editors.behaviorRules.bind(cur.behaviorRules || []);

      $('#f_c_name').value = c.name || '';
      $('#f_c_title').value = c.title || '';
      $('#f_c_age').value = c.age || '';
      $('#f_c_appearance').value = c.appearance || '';
      $('#f_c_personality').value = c.personality || '';
      $('#f_c_speech').value = c.speech || '';
      $('#f_c_desire').value = c.desire || '';
      editors.taboo.bind(c.taboo || []);

      $('#f_prompt').value = cur.prompt || '';

      const rep = cur.replies || {};
      REPLY_KINDS.forEach(function (k) { editors['reply_' + k].bind(rep[k] || []); });

      $('#curResName').textContent = (cur.name || '未命名资源') + (cur.id ? ' · ' + cur.id : ' · 尚未保存');
      renderHint();
      base = readResource();
      markDirty();
    }

    /* ------------------------- 从表单读回资源对象 ------------------------- */
    function strList(ed) {
      return ed.values().map(function (v) { return typeof v === 'string' ? v : String(v.text == null ? '' : v.text); })
        .filter(function (s) { return s !== ''; });
    }

    function readResource() {
      const out = clone(cur) || {};
      const id = $('#f_id').value.trim();
      if (id) out.id = id;
      out.name = $('#f_name').value.trim();
      out.subtitle = $('#f_subtitle').value.trim();
      out.genres = $('#f_genres').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
      out.rating = $('#f_rating').value;
      out.length = $('#f_length').value;
      out.status = $('#f_status').value;
      out.heat = num($('#f_heat').value, 0);
      out.players = num($('#f_players').value, 0);
      const ord = $('#f_order').value.trim();
      if (ord === '') delete out.order; else out.order = num(ord, 0);
      const df = num($('#f_difficulty').value, 2);
      out.difficulty = [1, 2, 3].indexOf(df) === -1 ? 2 : df;
      out.powerBalance = $('#f_power').value || 'equal';

      out.brief = $('#f_brief').value;
      out.teaser = $('#f_teaser').value;
      out.metaLines = [$('#f_meta0').value, $('#f_meta1').value, $('#f_meta2').value];
      out.intro = $('#f_intro').value;

      out.cover = { motif: $('#f_motif').value, palette: [0, 1, 2].map(function (i) { return $('#f_pal' + i).value.trim(); }) };
      const img = $('#f_coverImage').value.trim();
      if (img) out.cover.image = img;

      out.world = $('#f_world').value;
      out.userRole = $('#f_userRole').value;
      out.plot = $('#f_plot').value;
      out.plotReminder = strList(editors.plotReminder);
      out.openingHints = strList(editors.openingHints);
      out.beats = editors.beats.values()
        .filter(function (b) { return String(b.text || '').trim() !== ''; })
        .map(function (b) {
          const o = { at: num(b.at, 0), text: b.text };
          if (b.key) o.key = true;
          const pv = String(b.progress == null ? '' : b.progress).trim();
          if (pv !== '') o.progress = num(pv, 8);
          /* 未识名字段原样保留（前向兼容） */
          Object.keys(b).forEach(function (k) {
            if (['at', 'text', 'key', 'progress'].indexOf(k) === -1) o[k] = b[k];
          });
          return o;
        });
      out.scenes = editors.scenes.values()
        .filter(function (s) { return String(s.id || '').trim() !== '' || String(s.name || '').trim() !== ''; })
        .map(function (s) {
          const p = (s.palette || []).map(function (c) { return String(c || '').trim(); });
          return { id: s.id, name: s.name, desc: s.desc, palette: p.length === 3 ? p : ['#141020', '#3a2436', '#c9873f'] };
        });
      out.rules = strList(editors.rules);
      out.hpRules = strList(editors.hpRules);
      out.plotRules = strList(editors.plotRules);
      out.behaviorRules = strList(editors.behaviorRules);

      out.character = {
        name: $('#f_c_name').value,
        title: $('#f_c_title').value,
        age: $('#f_c_age').value,
        appearance: $('#f_c_appearance').value,
        personality: $('#f_c_personality').value,
        speech: $('#f_c_speech').value,
        desire: $('#f_c_desire').value,
        taboo: strList(editors.taboo)
      };

      out.prompt = $('#f_prompt').value;

      out.replies = {};
      REPLY_KINDS.forEach(function (k) { out.replies[k] = strList(editors['reply_' + k]); });
      return out;
    }

    /* ------------------------- 脏状态 ------------------------- */
    function isDirty() {
      if (!cur) return false;
      return JSON.stringify(readResource()) !== JSON.stringify(base);
    }
    function markDirty() {
      if (!cur) return;
      const d = isDirty();
      $('#dirtyDot').classList.toggle('is-on', d);
      document.title = (d ? '● ' : '') + '幻言 · 后台管理';
    }
    const markDirtySoon = debounce(markDirty, 160);

    /* ------------------------- 封面上传 ------------------------- */
    function renderCoverPreview() {
      const box = $('#f_coverPreview');
      const url = $('#f_coverImage').value.trim();
      if (!url) { box.textContent = '未上传图片'; return; }
      box.innerHTML = '';
      const img = document.createElement('img');
      img.alt = '封面预览';
      img.src = url;
      img.addEventListener('error', function () {
        box.innerHTML = '';
        box.textContent = '图片无法加载：' + url;
      });
      box.appendChild(img);
    }
    function doUploadCover() {
      const input = $('#f_coverFile');
      const file = input.files && input.files[0];
      if (!file) return;
      const st = $('#coverState');
      st.className = 'upload-state';
      st.textContent = '上传中… ' + file.name + '（' + (file.size / 1024).toFixed(1) + ' KB）';
      API.upload(file).then(function (data) {
        $('#f_coverImage').value = data.url;
        renderCoverPreview();
        st.className = 'upload-state';
        st.textContent = '已上传：' + data.url + '（' + (data.size / 1024).toFixed(1) + ' KB）· 保存资源后生效';
        markDirty();
        toast('图片已上传：' + data.url, 'ok');
      }).catch(function (e) {
        st.className = 'upload-state err';
        st.textContent = '上传失败：' + e.message;
        toast('上传失败：' + e.message, 'err');
      }).then(function () { input.value = ''; });
    }

    /* ------------------------- 左侧列表 ------------------------- */
    function sorted() {
      return resources.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) {
        const ao = typeof a.r.order === 'number' ? a.r.order : null;
        const bo = typeof b.r.order === 'number' ? b.r.order : null;
        if (ao !== null && bo !== null && ao !== bo) return ao - bo;
        if (ao !== null && bo === null) return -1;
        if (ao === null && bo !== null) return 1;
        const ah = Number(a.r.heat) || 0, bh = Number(b.r.heat) || 0;
        if (ah !== bh) return bh - ah;
        return a.i - b.i;
      }).map(function (x) { return x.r; });
    }

    function renderList() {
      const q = search.trim().toLowerCase();
      const list = sorted();
      const shown = list.filter(function (r) {
        if (!q) return true;
        const bag = [r.id, r.name, r.subtitle, (r.genres || []).join(' '), (r.character && r.character.name) || '']
          .join(' ').toLowerCase();
        return bag.indexOf(q) !== -1;
      });
      $('#resCount').textContent = shown.length + ' / ' + list.length + ' 条';
      if (!shown.length) {
        listBox.innerHTML = '<div class="list-empty">' +
          (list.length ? '没有匹配的资源' : '还没有资源，点上面「＋ 新建资源」') + '</div>';
        return;
      }
      listBox.innerHTML = shown.map(function (r) {
        const gi = list.indexOf(r);
        const badge = r.status === 'playable'
          ? '<span class="badge badge-playable">可游玩</span>'
          : '<span class="badge badge-upcoming">预约中</span>';
        const who = (r.character && r.character.name) ? r.character.name : '（未设定角色）';
        return '<div class="res-item' + (cur && cur.id === r.id ? ' is-active' : '') + '" data-id="' + esc(r.id) + '">' +
          '<div class="res-item-main">' +
          '<div class="res-item-name">' + esc(r.name || r.id) + '</div>' +
          '<div class="res-item-sub">' + badge + ' <span class="who">' + esc(who) + '</span></div>' +
          '</div>' +
          '<div class="res-move">' +
          '<button class="mv" data-mv="up" data-gi="' + gi + '" title="上移"' + (gi === 0 ? ' disabled' : '') + '>▲</button>' +
          '<button class="mv" data-mv="down" data-gi="' + gi + '" title="下移"' + (gi === list.length - 1 ? ' disabled' : '') + '>▼</button>' +
          '</div>' +
          '</div>';
      }).join('');
    }

    function saveOrder() {
      API.put('/api/resources', { resources: resources }).then(function () {
        renderList();
        toast('顺序已保存（order 已重排为 1..' + resources.length + '）', 'ok');
      }).catch(function (e) { toast('顺序保存失败：' + e.message, 'err'); });
    }

    /* ------------------------- 交互 ------------------------- */
    function confirmLeave() {
      if (!cur || !isDirty()) return true;
      return confirm('「' + (cur.name || cur.id || '未命名资源') + '」有未保存的修改，确定要放弃吗？');
    }

    function select(id) {
      if (!confirmLeave()) { renderList(); return; }
      const i = findIndex(id);
      if (i === -1) return;
      bindResource(resources[i]);
      renderList();
    }

    function newResource() {
      if (!confirmLeave()) return;
      const maxOrder = resources.reduce(function (m, r) { return Math.max(m, Number(r.order) || 0); }, 0);
      bindResource({
        id: '', name: '未命名资源', subtitle: '', genres: [], rating: '18+', length: '长线',
        status: 'upcoming', heat: 0, players: 0, order: maxOrder + 1, difficulty: 2, powerBalance: 'equal',
        brief: '', teaser: '', metaLines: ['', '', ''], intro: '',
        cover: { motif: 'lantern', palette: ['#141020', '#3a2436', '#c9873f'] },
        world: '', userRole: '', plot: '', plotRules: [], behaviorRules: [], plotReminder: [], openingHints: [], beats: [], scenes: [], rules: [], hpRules: [],
        character: { name: '', title: '', age: '', appearance: '', personality: '', speech: '', desire: '', taboo: [] },
        prompt: '',
        replies: { greeting: [], question: [], action: [], emotion: [], flirt: [], default: [], punish: [], execution: [] }
      }, true);
      renderList();
      $('#f_id').focus();
      toast('已新建一张空白角色卡：填好字段后点「保存」', 'ok');
    }

    function save() {
      const body = readResource();
      if (!body.id || !/^[A-Za-z0-9._-]+$/.test(body.id)) {
        toast('id 必填，且只能用字母、数字、点、下划线、短横线', 'err');
        $('#f_id').focus();
        return;
      }
      const exists = findIndex(body.id) !== -1;
      const p = exists
        ? API.put('/api/resources/' + encodeURIComponent(body.id), body)
        : API.post('/api/resources', body);
      p.then(function (data) {
        const saved = data.resource || body;
        if (exists) resources[findIndex(body.id)] = saved;
        else resources.push(saved);
        cur = clone(saved);
        base = clone(saved);
        allowIdEdit = false;
        $('#f_id').readOnly = true;
        $('#curResName').textContent = (saved.name || '未命名资源') + ' · ' + saved.id;
        renderList();
        markDirty();
        toast(exists ? '已保存：' + saved.id : '已新建资源：' + saved.id, 'ok');
      }).catch(function (e) {
        toast('保存失败：' + e.message, 'err');
      });
    }

    function duplicate() {
      if (!cur || findIndex(cur.id) === -1) { toast('请先保存当前资源，再另存为副本', 'err'); return; }
      if (!confirmLeave()) return;
      API.post('/api/resources/' + encodeURIComponent(cur.id) + '/duplicate').then(function (data) {
        resources.push(data.resource);
        bindResource(data.resource);
        renderList();
        toast('已复制为：' + data.resource.id, 'ok');
      }).catch(function (e) { toast('复制失败：' + e.message, 'err'); });
    }

    function remove() {
      if (!cur || findIndex(cur.id) === -1) { toast('当前资源尚未保存，无需删除', 'err'); return; }
      const id = cur.id;
      if (!confirm('确定删除「' + (cur.name || id) + '」（' + id + '）吗？此操作不可撤销。')) return;
      API.del('/api/resources/' + encodeURIComponent(id)).then(function () {
        resources.splice(findIndex(id), 1);
        cur = null; base = null;
        form.hidden = true;
        $('#resEmpty').hidden = false;
        $('#curResName').textContent = '未选择资源';
        $('#dirtyDot').classList.remove('is-on');
        document.title = '幻言 · 后台管理';
        renderList();
        toast('已删除：' + id, 'ok');
      }).catch(function (e) { toast('删除失败：' + e.message, 'err'); });
    }

    function exportOne() {
      if (!cur) { toast('还没有选中资源', 'err'); return; }
      const body = readResource();
      download('resource-' + (body.id || 'draft') + '.json', JSON.stringify(body, null, 2));
      toast('已导出该资源 JSON', 'ok');
    }

    function init() {
      renderSkeleton();
      form.addEventListener('input', markDirtySoon);
      form.addEventListener('change', markDirtySoon);

      $('#resSearch').addEventListener('input', function (e) { search = e.target.value; renderList(); });

      listBox.addEventListener('click', function (e) {
        const mv = e.target.closest('[data-mv]');
        if (mv) {
          e.stopPropagation();
          if (!confirmLeave()) return;
          const list = sorted();
          const gi = Number(mv.dataset.gi);
          const to = mv.dataset.mv === 'up' ? gi - 1 : gi + 1;
          if (to < 0 || to >= list.length) return;
          const t = list[gi];
          list[gi] = list[to];
          list[to] = t;
          list.forEach(function (r, i) { r.order = i + 1; });
          resources = list;
          renderList();
          saveOrder();
          return;
        }
        const item = e.target.closest('.res-item');
        if (item) select(item.dataset.id);
      });

      $('#btnSaveRes').addEventListener('click', save);
      $('#btnSaveRes2').addEventListener('click', save);
      $('#btnDupRes').addEventListener('click', duplicate);
      $('#btnDelRes').addEventListener('click', remove);
      $('#btnExportRes').addEventListener('click', exportOne);
      $('#btnNewRes').addEventListener('click', newResource);

      window.addEventListener('beforeunload', function (e) {
        if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
      });
    }

    function load() {
      return API.get('/api/resources').then(function (data) {
        resources = data.resources || [];
        renderList();
        if (resources.length) {
          bindResource(sorted()[0]);
          renderList();
        }
      });
    }

    return {
      init: init, load: load, isDirty: isDirty, confirmLeave: confirmLeave,
      refreshHint: renderHint,
      count: function () { return resources.length; }
    };
  })();

  /* ==========================================================================
     全局设置
     ========================================================================== */
  const setTab = (function () {
    let settings = null;
    let base = null;
    const editors = {};
    const form = $('#setForm');
    const RULE_GROUPS = ['care', 'severe', 'bannedOutput'];

    function mountArr(host, spec) {
      const ed = arrayEditor(spec);
      host.innerHTML = '';
      host.classList.remove('arr');
      host.appendChild(ed.root);
      return ed;
    }

    function renderSkeleton() {
      $$('[data-arr]', form).forEach(function (host) {
        const p = host.dataset.arr;
        if (p === 'site.footerNotes') {
          editors.site_footerNotes = mountArr(host, {
            addText: '添加一条声明', keys: ['text'], labels: { text: '页脚声明' },
            kinds: { text: 'textarea' }, rows: { text: 2 },
            ph: { text: '例如：不含充值 / 打赏等任何付费入口' }
          });
        } else if (p === 'assistant.guide') {
          editors.assistant_guide = mountArr(host, {
            addText: '添加一条说明', keys: ['text'], labels: { text: '说明条目' },
            kinds: { text: 'textarea' }, rows: { text: 2 }
          });
        } else if (p === 'behaviorLine.effects') {
          editors.behavior_effects = mountArr(host, {
            addText: '添加效果', keys: ['text'], labels: { text: '效果名' }, ph: { text: '例如：警告' }
          });
        }
      });

      editors.assistant_faq = mountArr($('[data-faq]', form), {
        addText: '添加问答', keys: ['keys'], faq: true, reKey: 'keys',
        labels: { keys: '关键词 keys（正则源码）', a: '回答 a' },
        rows: { a: 4 },
        ph: { keys: '例如：状态值|血量|扣血|掉血|hp', a: '回答内容' },
        template: { keys: '', a: '' }
      });

      $$('[data-rules]', form).forEach(function (host) {
        const g = host.dataset.rules.split('.')[1];
        host.innerHTML = '<div class="safety-title">' + esc(host.dataset.title || host.dataset.rules) + '</div>';
        const ed = arrayEditor({
          addText: '添加规则', keys: ['re', 'label'], reKey: 're',
          labels: { re: '正则源码 re', label: '说明 label' }, kinds: { re: 'ratext' },
          ph: { re: '例如：(自杀|自尽|自残)', label: '例如：自伤倾向' },
          template: { re: '', label: '' }
        });
        host.appendChild(ed.root);
        editors['rules_' + g] = ed;
      });

      /* 积分：里程碑与奖励是两个平行的数字数组 */
      editors.score_milestones = mountArr($('#arr_milestones'), {
        addText: '添加里程碑', keys: ['text'], labels: { text: '推进度 %' },
        kinds: { text: 'number' }, ph: { text: '例如：25' }, empty: '暂无里程碑，点下面按钮添加。'
      });
      editors.score_milestoneReward = mountArr($('#arr_milestoneReward'), {
        addText: '添加奖励', keys: ['text'], labels: { text: '奖励积分' },
        kinds: { text: 'number' }, ph: { text: '例如：20' }, empty: '暂无奖励，点下面按钮添加。'
      });

      /* 道具表：卡片式编辑器 */
      editors.items = itemsEditor($('#itemsEditor'));

      form.addEventListener('input', refreshScoreHint);
      form.addEventListener('input', markDirtySoon);
      form.addEventListener('change', markDirtySoon);
    }

    /* 数字数组（里程碑 / 奖励）读写 */
    function numList(ed) {
      return ed.values().map(function (v) { return num(typeof v === 'string' ? v : v.text, 0); });
    }
    function asNumArray(v) { return Array.isArray(v) ? v : []; }

    /* 里程碑与奖励数量不一致时给红字提示 */
    function refreshScoreHint() {
      const el = $('#scoreMismatch');
      if (!el) return;
      const m = numList(editors.score_milestones);
      const r = numList(editors.score_milestoneReward);
      el.textContent = m.length === r.length ? ''
        : '里程碑 ' + m.length + ' 个、奖励 ' + r.length + ' 个，数量不一致：多出的里程碑按 20 分兜底，多出的奖励不会生效。';
    }

    function bindFields() {
      $$('[data-set]', form).forEach(function (el) {
        const v = getPath(settings, el.dataset.set);
        if (el.type === 'checkbox') el.checked = !!v;
        else el.value = v == null ? '' : v;
      });
      editors.site_footerNotes.bind(getPath(settings, 'site.footerNotes') || []);
      editors.assistant_guide.bind(getPath(settings, 'assistant.guide') || []);
      editors.assistant_faq.bind(getPath(settings, 'assistant.faq') || []);
      RULE_GROUPS.forEach(function (g) { editors['rules_' + g].bind(getPath(settings, 'safety.' + g) || []); });
      editors.behavior_effects.bind(getPath(settings, 'behaviorLine.effects') || []);
      editors.score_milestones.bind(asNumArray(getPath(settings, 'score.milestones')));
      editors.score_milestoneReward.bind(asNumArray(getPath(settings, 'score.milestoneReward')));
      editors.items.bind(getPath(settings, 'items') || []);
      refreshScoreHint();
    }

    function strList(ed) {
      return ed.values().map(function (v) { return typeof v === 'string' ? v : String(v.text == null ? '' : v.text); })
        .filter(function (s) { return s !== ''; });
    }

    function readFields() {
      const out = clone(settings) || {};
      $$('[data-set]', form).forEach(function (el) {
        let v;
        if (el.type === 'checkbox') v = el.checked;
        else if (el.type === 'number' || el.dataset.cast === 'number') v = num(el.value, 0);
        else v = el.value;
        setPath(out, el.dataset.set, v);
      });
      setPath(out, 'site.footerNotes', strList(editors.site_footerNotes));
      setPath(out, 'assistant.guide', strList(editors.assistant_guide));
      setPath(out, 'assistant.faq', editors.assistant_faq.values().map(function (f) {
        return { keys: typeof f.keys === 'string' ? f.keys : String(f.keys || ''), a: f.a == null ? '' : f.a };
      }));
      RULE_GROUPS.forEach(function (g) {
        setPath(out, 'safety.' + g, editors['rules_' + g].values().map(function (r) {
          return { re: r.re == null ? '' : r.re, label: r.label == null ? '' : r.label };
        }));
      });
      setPath(out, 'behaviorLine.effects', strList(editors.behavior_effects));
      setPath(out, 'score.milestones', numList(editors.score_milestones));
      setPath(out, 'score.milestoneReward', numList(editors.score_milestoneReward));
      setPath(out, 'items', editors.items.values());
      return out;
    }

    function isDirty() {
      if (!settings) return false;
      return JSON.stringify(readFields()) !== JSON.stringify(base);
    }
    function markDirty() {
      if (!settings) return;
      $('#setDirtyDot').classList.toggle('is-on', isDirty());
    }
    const markDirtySoon = debounce(markDirty, 160);

    function invalidRules() {
      const bad = [];
      const cur = readFields();
      RULE_GROUPS.forEach(function (g) {
        (getPath(cur, 'safety.' + g) || []).forEach(function (r, i) {
          if (!regexOk(r.re)) bad.push('safety.' + g + ' 第 ' + (i + 1) + ' 条（' + (r.label || '无说明') + '）');
        });
      });
      ((getPath(cur, 'assistant.faq') || [])).forEach(function (f, i) {
        const k = typeof f.keys === 'string' ? f.keys : '';
        if (!k.trim()) bad.push('faq 第 ' + (i + 1) + ' 条 keys 为空');
        else if (!regexOk(k)) bad.push('faq 第 ' + (i + 1) + ' 条 keys 不是合法正则');
      });
      return bad;
    }

    function save() {
      const bad = invalidRules();
      if (bad.length) {
        toast('有 ' + bad.length + ' 处正则无法 new RegExp()，已阻止保存：' + bad.slice(0, 2).join('；'), 'err');
        switchTab('settings');
        return;
      }
      const badItems = editors.items.invalid();
      if (badItems.length) {
        toast('道具表有 ' + badItems.length + ' 处问题，已阻止保存：' + badItems.slice(0, 2).join('；'), 'err');
        switchTab('settings');
        return;
      }
      const body = readFields();
      API.put('/api/settings', body).then(function (data) {
        settings = data.settings || body;
        bindFields();
        base = clone(settings);
        markDirty();
        resTab.refreshHint();
        toast('设置已保存（PUT /api/settings）', 'ok');
      }).catch(function (e) { toast('保存失败：' + e.message, 'err'); });
    }

    function load() {
      return API.get('/api/settings').then(function (data) {
        settings = data.settings || {};
        bindFields();
        base = clone(settings);
        markDirty();
        resTab.refreshHint();
      });
    }

    function init() {
      renderSkeleton();
      $('#btnSaveSet').addEventListener('click', save);
      $('#btnSaveSet2').addEventListener('click', save);
      $('#btnReloadSet').addEventListener('click', function () {
        if (!confirm('放弃未保存的修改，重新从服务器载入设置？')) return;
        load().then(function () { toast('已重新载入设置', 'ok'); });
      });
    }

    return { init: init, load: load, isDirty: isDirty, getSettings: function () { return settings; } };
  })();

  /* ==========================================================================
     数据备份
     ========================================================================== */
  const backupTab = (function () {
    function info() {
      API.get('/api/health').then(function (h) {
        const rows = [
          ['资源数量', h.resources + ' 条'],
          ['资源数据文件', 'data/resources.json'],
          ['全局设置文件', 'data/settings.json'],
          ['图片上传目录', 'data/uploads/'],
          ['接口版本', 'v' + h.version]
        ];
        $('#backupKv').innerHTML = rows.map(function (r) {
          return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>';
        }).join('');
      }).catch(function (e) {
        $('#backupKv').innerHTML = '<dt>状态</dt><dd>读取失败：' + esc(e.message) + '</dd>';
      });
    }

    function doExport() {
      fetch('/api/export', { headers: AdminToken.headers() }).then(function (res) {
        if (res.status === 403) AdminToken.needToken();
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        download('huanyan-backup.json', JSON.stringify(data, null, 2));
        toast('已导出备份（' + (data.resources || []).length + ' 条资源 + 全局设置）', 'ok');
      }).catch(function (e) { toast('导出失败：' + e.message, 'err'); });
    }

    function pickFile() { $('#importFile').click(); }

    function doImport(file) {
      const reader = new FileReader();
      reader.onload = function () {
        let data;
        try { data = JSON.parse(String(reader.result)); }
        catch (e) { toast('备份文件不是合法 JSON', 'err'); return; }
        const n = (data && data.resources && data.resources.length) || 0;
        if (!confirm('导入「' + file.name + '」会整体覆盖现有资源与设置。\n备份内资源数量：' + n + ' 条。\n\n确定继续吗？')) return;
        if (!confirm('再确认一次：覆盖后无法撤销，是否导入？')) return;
        API.post('/api/import', data).then(function (r) {
          toast('导入成功：' + r.count + ' 条资源 + 全局设置', 'ok');
          return resTab.load().then(function () { return setTab.load(); });
        }).then(function () {
          info();
        }).catch(function (e) { toast('导入失败：' + e.message, 'err'); });
      };
      reader.onerror = function () { toast('读取文件失败', 'err'); };
      reader.readAsText(file, 'utf-8');
    }

    function init() {
      $('#btnExport').addEventListener('click', doExport);
      $('#btnExport2').addEventListener('click', doExport);
      $('#btnImport').addEventListener('click', pickFile);
      $('#btnImport2').addEventListener('click', pickFile);
      $('#importFile').addEventListener('change', function (e) {
        const f = e.target.files && e.target.files[0];
        if (f) doImport(f);
        e.target.value = '';
      });
    }

    return { init: init, info: info };
  })();

  /* ------------------------------ 标签页 ------------------------------ */
  let activeTab = 'resources';
  function switchTab(name) {
    if (name === activeTab) return;
    if (activeTab === 'resources' && name !== 'resources' && !resTab.confirmLeave()) return;
    if (activeTab === 'settings' && name !== 'settings' && setTab.isDirty()
      && !confirm('全局设置还有未保存的修改，确定要离开吗？')) return;
    activeTab = name;
    $$('.tab').forEach(function (t) { t.classList.toggle('is-active', t.dataset.tab === name); });
    $$('.page').forEach(function (p) { p.classList.toggle('is-active', p.id === 'page-' + name); });
    if (name === 'backup') backupTab.info();
  }

  /* ------------------------------ 启动 ------------------------------ */
  function boot() {
    resTab.init();
    setTab.init();
    backupTab.init();
    $('#tabs').addEventListener('click', function (e) {
      const t = e.target.closest('.tab');
      if (t) switchTab(t.dataset.tab);
    });

    Promise.all([
      API.get('/api/health').then(function (h) {
        $('#healthStat').innerHTML = '资源 <b>' + h.resources + '</b> 条 · API v' + h.version;
      }).catch(function (e) {
        $('#healthStat').textContent = '接口不可用：' + e.message;
      }),
      resTab.load(),
      setTab.load()
    ]).then(function () {
      /* 支持 /admin?tab=settings 这样的直链（也方便自动化截图核对） */
      const qs = new URLSearchParams(location.search);
      const want = qs.get('tab');
      if (want && ['resources', 'settings', 'backup'].indexOf(want) !== -1) switchTab(want);
      /* ?focus=<区块 id / 字段名>：载入后把该区块滚进视野（方便直链与自动化截图） */
      const focus = qs.get('focus');
      if (focus) {
        const byId = document.getElementById(focus);
        const el = byId || document.getElementById('arr_' + focus) ||
          document.querySelector('[data-set="' + focus + '"]') ||
          document.querySelector('[data-set^="' + focus + '."]') ||
          document.querySelector('[data-arr="' + focus + '"]');
        /* 显式给了 id 就对准它，否则退回到它所在的卡片 */
        const box = byId || (el && el.closest('fieldset.card')) || el;
        if (box && box.scrollIntoView) box.scrollIntoView({ block: 'start' });
      }
      resTab.refreshHint();
      toast('后台已就绪 · 资源与设置已载入', 'ok');
    }).catch(function (e) {
      toast('载入失败：' + e.message, 'err');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
