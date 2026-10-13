#!/usr/bin/env bash
# 服务器侧只读侦察：确认部署站点需要的前提条件（不动任何东西）
set -u
echo "=== 1) sudo 能否非交互使用（决定能不能监听 80 端口 / 装系统服务）==="
if sudo -n true 2>/dev/null; then echo "  passwordless sudo: 可以 ✓"; else echo "  passwordless sudo: 不行 ✗（只能跑在 1024 以上端口，或用 systemd user 服务）"; fi
echo "=== 2) 现有 web 服务 / nginx / 占用 80 的进程 ==="
(systemctl list-units --type=service --state=running 2>/dev/null | grep -iE 'nginx|httpd|apache|caddy' || echo "  没有 web 服务器在跑")
(ss -tlnp 2>/dev/null | grep -E ':(80|443|8080)\b' || echo "  80/443/8080 都没被占用")
echo "=== 3) 系统级 systemd 能不能用（站点服务想开机自启+崩溃重拉）==="
systemctl --version | head -1
echo "=== 4) node / npm ==="
node -v; which node
echo "=== 5) 目录与磁盘 ==="
echo "  HOME=$HOME  可用空间: $(df -h /home | tail -1 | awk '{print $4}')"
ls -la /home/admin | head -12
echo "=== 6) 现有 OpenClaw 用户级服务（站点服务要跟它共存，别抢端口）==="
export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user list-units --type=service 2>/dev/null | grep -iE 'openclaw|app-init' || echo "  没读到用户级服务列表"
echo "=== 7) 端口占用全貌 ==="
ss -tln | awk 'NR>1 {print "  " $4}'
echo "=== 8) 出网能力（站点要调智谱接口）==="
curl -s -o /dev/null -w "  open.bigmodel.cn → HTTP %{http_code}  %{time_total}s\n" --max-time 12 https://open.bigmodel.cn/api/paas/v4/chat/completions || echo "  出网失败"
curl -s -o /dev/null -w "  api.github.com    → HTTP %{http_code}\n" --max-time 12 https://api.github.com || echo "  出网失败"
echo "=== 9) 时间与时区（统计按天分桶要用）==="
date; timedatectl 2>/dev/null | head -3
echo "=== 10) 已有的防火墙 / 安全组线索 ==="
(sudo -n iptables -L INPUT -n 2>/dev/null | head -8 || echo "  读不到 iptables（无 sudo 或无权限）")
(command -v firewall-cmd >/dev/null && sudo -n firewall-cmd --list-ports 2>/dev/null || echo "  没有 firewalld 或读不到")
echo "=== 侦察完成 ==="
