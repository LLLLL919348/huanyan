#!/usr/bin/env bash
# 只读侦察：OpenClaw 网关的 bind 字段合法值 + cron 任务怎么看（不动任何配置）
set -u
export XDG_RUNTIME_DIR=/run/user/$(id -u)
CFG="$HOME/.openclaw/openclaw.json"

echo "=== 1) 当前 gateway 配置（脱敏）==="
node -e '
const fs=require("fs");
const p=process.env.HOME+"/.openclaw/openclaw.json";
const j=JSON.parse(fs.readFileSync(p,"utf8"));
console.log("  gateway =", JSON.stringify(j.gateway||{}));
console.log("  controlUi =", JSON.stringify(j.controlUi||{}));
console.log("  顶级字段 =", Object.keys(j).join(", "));
'

echo "=== 2) 内核里 gateway.bind 的合法取值 ==="
grep -rhoE '"?(bind|gateway)"?\s*:\s*\{[^}]{0,200}' /usr/local/lib/node_modules/openclaw/dist/*.js 2>/dev/null | head -5
grep -rhoE "'(lan|loopback|localhost|all|0\.0\.0\.0)'" /usr/local/lib/node_modules/openclaw/dist/*.js 2>/dev/null | sort | uniq -c | sort -rn | head -8

echo "=== 3) 内核里出现 bind 的枚举定义（找 schema）==="
grep -rhoE 'bind[^,;]{0,120}' /usr/local/lib/node_modules/openclaw/dist/index.js 2>/dev/null | grep -iE 'enum|lan|loop|local' | head -8

echo "=== 4) cron 相关 CLI ==="
openclaw cron --help 2>&1 | head -20
echo "--- 现有任务 ---"
openclaw cron list 2>&1 | head -20

echo "=== 5) QQ 机器人当前状态（改配置前先留个基线）==="
openclaw channels status --probe 2>&1 | grep -iE "QQ Bot" || echo "  读不到 QQ Bot 状态"

echo "=== 6) 备份文件情况 ==="
ls -la "$HOME/.openclaw/" | grep -E 'openclaw.json' | head -6
echo "=== 侦察完成 ==="
