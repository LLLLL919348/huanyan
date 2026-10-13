#!/usr/bin/env bash
# 修 cron 任务的投递设置 + 加"机器人巡检报告"任务（后者先禁用，等机主 openid）
set -u
export XDG_RUNTIME_DIR=/run/user/$(id -u)

echo "=== 1) 删掉带投递的巡检任务，重建为「不投递」 ==="
ID=$(openclaw cron list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const a=Array.isArray(j)?j:(j.jobs||[]);const hit=a.find(x=>x.name==="huanyan-autocheck");console.log(hit?hit.id:"")}catch(e){console.log("")}})')
if [ -n "$ID" ]; then echo "  找到旧任务 $ID，移除"; openclaw cron rm "$ID" >/dev/null 2>&1 || true; fi
openclaw cron add --name huanyan-autocheck --cron "*/10 * * * *" \
  --command "/home/admin/huanyan/tools/autocheck.sh" \
  --no-deliver --timeout-seconds 60 \
  --description "幻言站点健康巡检；不通则重启站点服务（结果写 data/autocheck.log）" 2>&1 | grep -E '"id"|"name"' | head -3

echo "=== 2) 立刻跑一次，确认能执行 ==="
NEWID=$(openclaw cron list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const a=Array.isArray(j)?j:(j.jobs||[]);const hit=a.find(x=>x.name==="huanyan-autocheck");console.log(hit?hit.id:"")}catch(e){console.log("")}})')
echo "  任务 id: $NEWID"
openclaw cron run "$NEWID" 2>&1 | tail -6
sleep 4
echo "--- 巡检日志 ---"; tail -3 /home/admin/huanyan/data/autocheck.log
echo "--- 运行历史 ---"; openclaw cron runs "$NEWID" 2>&1 | head -6

echo "=== 3) 准备"机器人巡检报告"任务（先禁用，等机主 openid 再启用）==="
openclaw cron add --name huanyan-report --cron "0 9 * * *" \
  --message "巡检幻言站点：运行 /home/admin/huanyan/tools/health.sh，用两三句话把结论报给机主（在线/离线、今日浏览量、有没有异常日志）；如果站点不通，先运行 /home/admin/huanyan/tools/restart.sh 再报。不要改站点内容或配置。" \
  --announce --channel last --disabled --timeout-seconds 180 --light-context \
  --description "每天早上 9 点巡检幻言站点并向机主报告（需先私聊机器人一次以确定投递路由）" 2>&1 | grep -E '"id"|"name"|"enabled"' | head -4

echo "=== 4) 任务清单 ==="
openclaw cron list 2>&1 | head -8
echo "=== 完成 ==="
