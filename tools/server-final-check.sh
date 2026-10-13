#!/usr/bin/env bash
# 交付总验收（只读）
set -u
export XDG_RUNTIME_DIR=/run/user/$(id -u)
echo "=== 1) 站点服务 ==="
printf '  huanyan.service : '; systemctl is-active huanyan.service
printf '  开机自启        : '; systemctl is-enabled huanyan.service 2>/dev/null
printf '  监听            : '; ss -tln | grep -E ':80\b' | awk '{print $4}'
printf '  本机健康        : '; curl -s -m 8 -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1/api/health
echo "=== 2) 全部监听端口（对外只应有 80 与 22）==="
ss -tln | awk 'NR>1{printf "  %-22s %s\n",$4,$1}'
echo "=== 3) 本轮巡检日志 ==="
tail -4 /home/admin/huanyan/data/autocheck.log 2>/dev/null || echo "  （还没有日志）"
echo "=== 4) 机器人 ==="
printf '  openclaw-gateway: '; systemctl --user is-active openclaw-gateway.service
printf '  QQ 机器人       : '; openclaw channels status --probe 2>&1 | grep -i "QQ Bot" | sed 's/^ *//'
echo "  cron 任务："
openclaw cron list 2>&1 | tail -n +2 | awk '{printf "    %-38s %-26s %s\n",$1,$2,$3}' | head -4
echo "=== 5) 站点数据文件 ==="
ls -l /home/admin/huanyan/data/ | awk '{printf "  %-22s %8s  %s\n",$9,$5,$6" "$7" "$8}' | tail -n +2
echo "=== 6) 密钥权限（都应是 600）==="
ls -l /home/admin/huanyan/.env /home/admin/huanyan/data/model.json 2>/dev/null | awk '{print "  "$1" "$9}'
echo "=== 7) 维护规约在不在她的工作区 ==="
ls -l /mnt/btrfs-workspace/ws-398ab6/SITE-HUANYAN.md 2>/dev/null | awk '{print "  "$5" 字节  "$9}'
echo "=== 验收完成 ==="
