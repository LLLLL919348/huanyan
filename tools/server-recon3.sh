#!/usr/bin/env bash
# 只读侦察 3：bind 合法枚举 + cron 完整参数 + 机主 openid 从哪来
set -u
export XDG_RUNTIME_DIR=/run/user/$(id -u)

echo "=== 1) gateway.bind 的合法取值（从 schema 里取枚举）==="
openclaw config schema 2>/dev/null | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  try{
    const j=JSON.parse(s);
    const g=j.properties&&j.properties.gateway;
    if(!g){console.log("  取不到 gateway 段");return}
    console.log("  gateway.bind =", JSON.stringify(g.properties&&g.properties.bind));
    console.log("  gateway.bindHost =", JSON.stringify(g.properties&&g.properties.bindHost));
    console.log("  gateway.port =", JSON.stringify(g.properties&&g.properties.port));
  }catch(e){console.log("  schema 解析失败:",e.message)}
});'

echo "=== 2) cron add 的全部参数 ==="
openclaw cron add --help 2>&1 | sed -n '20,70p'

echo "=== 3) 机主私聊的 openid（从日志里找 senderId）==="
journalctl --user -u openclaw-gateway.service --since '7 days ago' --no-pager 2>/dev/null | grep -oE 'senderId=[A-Za-z0-9_-]{8,}' | sort | uniq -c | sort -rn | head -5
echo "（上面是最近 7 天出现过的发送者 id 计数；机主那条通常出现频率最高）"

echo "=== 4) 网关日志里私聊与群聊的区分线索 ==="
journalctl --user -u openclaw-gateway.service --since '7 days ago' --no-pager 2>/dev/null | grep -oE '(groupOpenid|groupId|channelId)=[A-Za-z0-9_-]{6,}' | sort | uniq -c | sort -rn | head -5

echo "=== 5) 现有 cron 与 gateway 重启后的自检方式 ==="
openclaw cron list 2>&1 | head -5
echo "  重启命令: systemctl --user restart openclaw-gateway.service"
echo "=== 侦察完成 ==="
