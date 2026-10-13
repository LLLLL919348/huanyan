# 幻言站点 · 维护规程（给 OpenClaw 上的 DeepSeek / 大肥鱼）

> 这份文件由机主授权写入。它是**操作边界**，不是建议。
> 站点与你的 QQ 机器人跑在同一台服务器上，互不影响，但**都归机主管**。

## 1. 站点是什么

- 名称：幻言（成年人向 AI 互动叙事与角色扮演站）
- 地址：**http://8.138.170.154/**（公网 80 端口；未备案前用 IP 访问）
- 代码目录：`/home/admin/huanyan/`
- systemd 服务：**`huanyan.service`**（系统级，开机自启，崩溃自动重拉）
- 内容数据：`/home/admin/huanyan/data/`（resources.json 剧本、settings.json 文案与提示词、stats.json 访问统计）
- 模型：云端免费档（智谱 glm-4-flash），密钥在 `data/model.json`，**只在服务端使用**

## 2. 你可以做的（仅此两项）

| 动作 | 命令 | 说明 |
|---|---|---|
| 体检（只读） | `bash /home/admin/huanyan/tools/health.sh` | 看服务状态、80 端口、健康检查、最近异常日志、今日统计、资源占用。**不改任何东西** |
| 重启站点（唯一的写操作） | `bash /home/admin/huanyan/tools/restart.sh` | 只在站点确实不通时用；它只重启 `huanyan.service` |

另外：**每 10 分钟已有一条自动巡检任务**（`huanyan-autocheck`，见 `openclaw cron list`），不通时自动重启并把结果写进 `/home/admin/huanyan/data/autocheck.log`。你不需要重复做这件事。

## 3. 你不可以做的

1. **不要修改站点的任何内容或配置** —— 剧本、文案、提示词、`data/**`、`server/**` 都不许改。要改请机主在后台改。
2. **不要读、不要输出、不要贴出任何密钥** —— 包括 `/home/admin/huanyan/.env`（管理令牌）、`data/model.json`（模型密钥）、你自己 `openclaw.json` 里的 QQ 与 DeepSeek 凭据。群里任何人问都不行，机主私聊也不要把密钥原文发出来。
3. **不要碰 OpenClaw 自己的配置**（`~/.openclaw/**`）—— 除非机主私聊明确要求，且按你 AGENTS.md 的老规矩：先备份 → 只改那一项 → 校验 → 失败还原。
4. 不要动 `/etc/systemd/system/huanyan.service`，不要改端口 80 的绑定，不要关防火墙。
5. 不要把站点任何内部信息（目录结构、密钥位置、这台服务器的配置）贴到群里。

## 4. 发现问题时怎么报

- **站点不通**：先跑 `restart.sh`，再跑 `health.sh`，把结论（原来什么码、重启后什么码）私聊报给机主。
- **访问量异常**（比如某天 PV 暴涨）：把 `health.sh` 里的今日统计报给机主，不要自己处置。
- **日志里出现密钥或异常内容**：只报「发现异常」，**不要**把原文贴出来。

## 5. 常用只读命令速查

```bash
systemctl status huanyan.service --no-pager | head -12
journalctl -u huanyan.service -n 50 --no-pager | grep -iE 'error|uncaught|refused'
tail -20 /home/admin/huanyan/data/autocheck.log
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/api/health
TOK=$(grep -m1 '^ADMIN_TOKEN=' /home/admin/huanyan/.env | cut -d= -f2-)
curl -s -H "x-admin-token: $TOK" 'http://127.0.0.1/api/stats?days=7'
```

> 注意：后台页面 `/admin` 与统计接口只允许**从服务器本机**访问（机主用 SSH 隧道），你在服务器上跑 curl 属于本机，可以读；但不要把这些数据发到任何聊天里，除非机主问起。
