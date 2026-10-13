#!/usr/bin/env bash
# ============================================================================
# 幻言站点 · 自动巡检（给机器人 cron 用；只有"重启站点"这一个写操作）
#   - /api/health 不通时，先重启再复检；全过程写进 /home/admin/huanyan/data/autocheck.log
#   - 不动站点内容、不动配置、不碰 OpenClaw
# ============================================================================
set -u
APP=/home/admin/huanyan
LOG=$APP/data/autocheck.log
TS=$(date '+%F %T')

code=$(curl -s -m 8 -o /dev/null -w '%{http_code}' http://127.0.0.1/api/health || echo 000)
if [ "$code" = "200" ]; then
  echo "$TS OK 健康检查 200" >> "$LOG"
  tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  exit 0
fi

echo "$TS FAIL 健康检查返回 $code，尝试重启站点服务" >> "$LOG"
sudo systemctl restart huanyan.service
sleep 4
code2=$(curl -s -m 8 -o /dev/null -w '%{http_code}' http://127.0.0.1/api/health || echo 000)
if [ "$code2" = "200" ]; then
  echo "$TS RECOVERED 重启后恢复 200" >> "$LOG"
else
  echo "$TS STILL-BAD 重启后仍为 $code2（需要人工查看 journalctl -u huanyan.service）" >> "$LOG"
fi
tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
