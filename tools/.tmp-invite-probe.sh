#!/bin/bash
# 外部复测用的临时操作：生成一个码 + 开启邀请制（跑完由调用方再关掉）
TOK="$(grep -m1 '^ADMIN_TOKEN=' /home/admin/huanyan/.env | cut -d= -f2-)"
API=http://127.0.0.1/api/invite-admin
if [ "$1" = "on" ]; then
  curl -s -X POST -H "x-admin-token: $TOK" -H 'Content-Type: application/json' \
    -d '{"action":"create","count":1,"days":2,"note":"外部复测"}' "$API"
  echo
  curl -s -X POST -H "x-admin-token: $TOK" -H 'Content-Type: application/json' \
    -d '{"action":"toggle","enabled":true}' "$API" | head -c 100
  echo
elif [ "$1" = "off" ]; then
  curl -s -X POST -H "x-admin-token: $TOK" -H 'Content-Type: application/json' \
    -d '{"action":"toggle","enabled":false}' "$API" | head -c 100
  echo
  # 删掉本脚本生成的测试码
  curl -s -X POST -H "x-admin-token: $TOK" -H 'Content-Type: application/json' \
    -d '{"action":"delete","id":"'"$2"'"}' "$API" | head -c 100
  echo
fi
