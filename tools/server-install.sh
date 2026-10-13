#!/usr/bin/env bash
# ============================================================================
# 幻言站点 · 服务器侧安装器（幂等，可重复执行）
#   - 装成 systemd 系统服务（开机自启、崩溃自动重拉）
#   - 用 CAP_NET_BIND_SERVICE 监听 80（不需要 root 跑 node）
#   - 密钥与端口写在 .env（600），不进 unit 文件
#   - 顺带放下给机器人用的体检/重启脚本（只读体检 + 允许重启）
# 用法（在服务器上）：bash server-install.sh <ADMIN_TOKEN>
# ============================================================================
set -eu

APP_DIR=/home/admin/huanyan
ENV_FILE="$APP_DIR/.env"
UNIT=/etc/systemd/system/huanyan.service
TOKEN="${1:-}"

if [ -z "$TOKEN" ]; then
  echo "错误：必须传入 ADMIN_TOKEN（形如 bash server-install.sh xxxx）" >&2
  exit 1
fi
if [ ! -f "$APP_DIR/server/server.js" ]; then
  echo "错误：$APP_DIR/server/server.js 不存在，先把文件传上来" >&2
  exit 1
fi

echo "=== 1) 写运行环境文件（600，含令牌与端口）==="
cat > "$ENV_FILE" <<EOF
# 幻言站点运行参数（本文件含管理令牌，权限 600，不要提交到任何仓库）
NODE_ENV=production
PORT=80
HOST=0.0.0.0
ADMIN_TOKEN=$TOKEN
EOF
chmod 600 "$ENV_FILE"
ls -l "$ENV_FILE"

echo "=== 2) 写 systemd 系统服务 ==="
sudo tee "$UNIT" >/dev/null <<'EOF'
[Unit]
Description=Huanyan AI roleplay site (node, zero-dependency)
Documentation=file:///home/admin/huanyan/README-部署.md
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=admin
Group=admin
WorkingDirectory=/home/admin/huanyan
EnvironmentFile=/home/admin/huanyan/.env
ExecStart=/usr/bin/node /home/admin/huanyan/server/server.js 80
Restart=always
RestartSec=3
# 允许非 root 绑定 80 端口，其余能力一律不给
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=/home/admin/huanyan/data
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable huanyan.service >/dev/null 2>&1 || true

echo "=== 3) 放下给机器人用的脚本（体检只读、重启单独一个）==="
mkdir -p "$APP_DIR/tools"
cat > "$APP_DIR/tools/health.sh" <<'EOF'
#!/usr/bin/env bash
# 幻言站点体检（只读：不改任何文件、不重启任何服务）
set -u
echo "=== 幻言站点体检 $(date '+%F %T %Z') ==="
printf '服务状态   : '; systemctl is-active huanyan.service 2>/dev/null || echo unknown
printf '开机自启   : '; systemctl is-enabled huanyan.service 2>/dev/null || echo unknown
printf '80 端口    : '; (ss -tln | grep -qE ':80\b' && echo 监听中) || echo 未监听
printf '本机健康   : '; curl -s -m 8 -o /dev/null -w 'HTTP %{http_code}  %{time_total}s\n' http://127.0.0.1/api/health || echo 访问失败
echo '--- 最近日志里的异常（最多 5 条）---'
journalctl -u huanyan.service -n 200 --no-pager 2>/dev/null | grep -iE 'error|uncaught|EADDRINUSE|ENOSPC|refused' | tail -5 || true
echo '--- 今日统计 ---'
TOK=$(grep -m1 '^ADMIN_TOKEN=' /home/admin/huanyan/.env 2>/dev/null | cut -d= -f2-)
curl -s -m 8 -H "x-admin-token: $TOK" 'http://127.0.0.1/api/stats?days=2' | head -c 320; echo
echo '--- 资源占用 ---'
df -h / | tail -1
free -m | sed -n 2p
echo '=== 体检结束 ==='
EOF
chmod +x "$APP_DIR/tools/health.sh"

cat > "$APP_DIR/tools/restart.sh" <<'EOF'
#!/usr/bin/env bash
# 幻言站点重启（只允许这一个动作：重启服务。不改配置、不动数据）
set -u
echo "重启 huanyan.service ..."
sudo systemctl restart huanyan.service
sleep 2
systemctl is-active huanyan.service
curl -s -m 8 -o /dev/null -w '健康检查 HTTP %{http_code}\n' http://127.0.0.1/api/health
EOF
chmod +x "$APP_DIR/tools/restart.sh"

echo "=== 4) 启动服务 ==="
sudo systemctl restart huanyan.service
sleep 3
printf '服务状态: '; systemctl is-active huanyan.service
printf '监听: '; ss -tln | grep -E ':80\b' || echo '（未监听！）'
printf '本机健康: '; curl -s -m 8 -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1/api/health || echo '失败'

echo "=== 5) 复核：后台对访客必须 404 ==="
for p in /admin /admin/admin.js /api/stats /api/export; do
  printf '  %-18s → 本机 %s\n' "$p" "$(curl -s -m 6 -o /dev/null -w '%{http_code}' http://127.0.0.1$p)"
done
echo "  提示：以上是本机（回环）访问，设计上放行；从外网复测应为 404 —— 用 tools/check-exposure.js 在本地跑。"
echo "=== 安装完成 ==="
