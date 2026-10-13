#!/usr/bin/env bash
# ============================================================================
# 把 OpenClaw 网关从"对全网开放"收紧为"只听本机"（控制台改走 SSH 隧道）
#   - 先备份 → 校验 → 重启 → 探测机器人是否仍在线；任一步失败自动回滚
#   - 只改 gateway.bind 这一个字段，不动 QQ 渠道与其它任何配置
# 用法：bash gateway-loopback.sh
# ============================================================================
set -u
export XDG_RUNTIME_DIR=/run/user/$(id -u)
CFG="$HOME/.openclaw/openclaw.json"
STAMP=$(date +%Y%m%d-%H%M%S)
BAK="$HOME/.openclaw/openclaw.json.bak-loopback-$STAMP"
PATCH=/tmp/gw-patch.json5

echo "=== 1) 备份 ==="
cp "$CFG" "$BAK" && echo "  已备份到 $BAK"

echo "=== 2) 看看现在监听在哪 ==="
ss -tln | grep 11346 || echo "  （11346 未监听）"

echo "=== 3) 写补丁（只改 gateway.bind）==="
cat > "$PATCH" <<'EOF'
{
  gateway: { bind: "loopback" }
}
EOF
echo "  补丁内容："; sed 's/^/    /' "$PATCH"

echo "=== 4) 干跑校验 ==="
openclaw config patch --file "$PATCH" --dry-run 2>&1 | tail -8

echo "=== 5) 应用补丁 ==="
openclaw config patch --file "$PATCH" 2>&1 | tail -5

echo "=== 6) 配置校验 ==="
if ! openclaw config validate 2>&1 | tail -3; then
  echo "  !! 校验失败，回滚"
  cp "$BAK" "$CFG"; exit 1
fi

echo "=== 7) 重启网关 ==="
systemctl --user restart openclaw-gateway.service
sleep 10

echo "=== 8) 复核 ==="
printf '  服务状态 : '; systemctl --user is-active openclaw-gateway.service
printf '  11346 监听: '; ss -tln | grep 11346 || echo '（没有监听！）'
printf '  QQ 机器人 : '; openclaw channels status --probe 2>&1 | grep -i "QQ Bot" || echo '读不到状态'

echo "=== 9) 判定：机器人必须仍在线，否则自动回滚 ==="
PROBE=$(openclaw channels status --probe 2>&1 | grep -i "QQ Bot" || true)
if echo "$PROBE" | grep -q "connected"; then
  echo "  ✓ 机器人仍在线，收紧成功（控制台改为仅本机，可用 SSH 隧道访问）"
  echo "    回滚命令（万一以后需要）：cp $BAK $CFG && systemctl --user restart openclaw-gateway.service"
else
  echo "  !! 机器人不在线，自动回滚到修改前"
  cp "$BAK" "$CFG"
  systemctl --user restart openclaw-gateway.service
  sleep 10
  printf '  回滚后状态: '; systemctl --user is-active openclaw-gateway.service
  printf '  回滚后机器人: '; openclaw channels status --probe 2>&1 | grep -i "QQ Bot" || echo '仍读不到（请手工检查）'
  exit 1
fi
echo "=== 完成 ==="
