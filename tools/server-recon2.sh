#!/usr/bin/env bash
# 只读侦察 2：config 子命令能否安全地改单个字段 + cron add 的语法（不修改任何东西）
set -u
export XDG_RUNTIME_DIR=/run/user/$(id -u)

echo "=== 1) openclaw config 子命令 ==="
openclaw config --help 2>&1 | head -25

echo "=== 2) 内核里 gateway 的 bind 取值（在包里找 schema 定义）==="
PKG=/usr/local/lib/node_modules/openclaw
grep -rl 'dangerouslyDisableDeviceAuth' "$PKG" 2>/dev/null | head -3
for f in $(grep -rl 'dangerouslyDisableDeviceAuth' "$PKG" 2>/dev/null | head -2); do
  echo "--- $f ---"
  grep -ohE 'bind[^,;{}]{0,80}' "$f" | head -6
  grep -ohE '"(loopback|lan|all|local|tailscale)"' "$f" | sort | uniq -c | sort -rn | head -8
done

echo "=== 3) cron add 的用法 ==="
openclaw cron add --help 2>&1 | head -30

echo "=== 4) 站点服务当前状态（机器人巡检要用）==="
systemctl is-active huanyan.service
ls -l /home/admin/huanyan/tools/
echo "=== 侦察完成 ==="
