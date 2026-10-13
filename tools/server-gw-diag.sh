#!/usr/bin/env bash
# 网关收紧后的诊断（只读）
set -u
export XDG_RUNTIME_DIR=/run/user/$(id -u)
echo "=== 1) 服务状态 ==="
systemctl --user is-active openclaw-gateway.service
systemctl --user status openclaw-gateway.service --no-pager 2>&1 | head -14
echo "=== 2) 监听端口（11346 应在 127.0.0.1）==="
ss -tln | grep -E '11346|:80\b' || echo "  11346 未监听"
echo "=== 3) 最近日志（找 bind / listen / error）==="
journalctl --user -u openclaw-gateway.service --since '3 minutes ago' --no-pager 2>&1 | tail -30
echo "=== 4) 机器人状态 ==="
openclaw channels status --probe 2>&1 | grep -i "QQ Bot"
echo "=== 5) 当前 bind 值 ==="
node -e 'const j=require(process.env.HOME+"/.openclaw/openclaw.json");console.log("  bind =",j.gateway.bind," port =",j.gateway.port)'
echo "=== 诊断完成 ==="
