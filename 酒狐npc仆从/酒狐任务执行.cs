using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>
/// 酒狐任务执行引擎：驱动任务状态机（确认需求中→酒狐缺少xx→重试→执行中/屏蔽），
/// 并执行每种任务的具体行为（钓鱼/采种/搭平台/主动防御/造房纸/清理门户/恋还是练）。
/// 同时维护几个影响酒狐攻击/目标选择的模式开关（按酒狐 whoAmI 隔离）。
/// </summary>
public static class 酒狐任务执行
{
    private static 酒狐任务配置 Cfg => ModContent.GetInstance<酒狐任务配置>();

    //===== 模式开关（按酒狐 whoAmI）=====
    private static readonly HashSet<int> 主动防御集 = new();
    private static readonly HashSet<int> 清理门户集 = new();
    private static readonly HashSet<int> 恋还是练集 = new();
    //挑衅：恋还是练任务中，酒狐是否已把玩家视为敌人
    private static readonly HashSet<int> 挑衅集 = new();
    //短暂无敌（致命伤害后短暂免疫所有伤害）
    private static readonly Dictionary<int, int> 无敌计时 = new();

    //非悠闲暂停提示：记录是否已提示过（回到悠闲后重置）
    private static readonly HashSet<int> 暂停集 = new();

    //清理门户：被临时改为「非友方」以便被酒狐弹幕命中的 NPC（任务结束需恢复）
    private static readonly HashSet<int> 清理门户压制集 = new();

    //建造确认：正在等待玩家在聊天框确认/拒绝（按玩家 whoAmI）
    private static readonly HashSet<int> awaitingConfirm = new();
    private static readonly Dictionary<int, 任务类型> 待确认类型 = new();
    private static readonly Dictionary<int, int> 拒绝冷却 = new();   //拒绝后一段时间不再重复弹出

    private static bool 是建造任务(任务类型 t) => t == 任务类型.造房纸 || t == 任务类型.搭平台;

    private static void 发送建造请求(NPC fox, 任务记录 r, Player owner)
    {
        待确认类型[owner.whoAmI] = r.类型;
        if (Main.dedServ) return;
        string name = 任务定义.名称(r.类型);
        Main.NewText($"酒狐：主人，要开始[{name}]吗？在聊天框输入 /酒狐 确认 或 /酒狐 拒绝", new Color(140, 200, 255));
    }

    //玩家在聊天框回复确认 → 允许执行当前待确认的建造任务
    public static void 确认建造(Player player)
    {
        int who = player.whoAmI;
        if (!awaitingConfirm.Contains(who)) { 玩家回复(player, "现在没有待确认的建造任务哦"); return; }
        awaitingConfirm.Remove(who);
        拒绝冷却.Remove(who);
        List<任务记录> list = 酒狐任务系统.获取列表(player);
        if (待确认类型.TryGetValue(who, out 任务类型 t) && 是建造任务(t))
        {
            foreach (任务记录 r in list)
                if (r.类型 == t && !r.屏蔽) r.已确认 = true;
        }
        待确认类型.Remove(who);
        玩家回复(player, "酒狐：好嘞，这就开工！");
    }

    //玩家拒绝 → 冷却一段时间（不再反复弹出），之后仍可再次询问
    public static void 拒绝建造(Player player)
    {
        int who = player.whoAmI;
        if (!awaitingConfirm.Contains(who)) { 玩家回复(player, "现在没有待确认的建造任务哦"); return; }
        awaitingConfirm.Remove(who);
        待确认类型.Remove(who);
        拒绝冷却[who] = 10 * 60;   //10秒后再询问
        玩家回复(player, "酒狐：好吧，那先不造啦~");
    }

    private static void 玩家回复(Player player, string text)
    {
        if (!Main.dedServ)
            Main.NewText(text, new Color(160, 200, 240));
    }

    //任务引擎抛异常时的兜底提示（防止酒狐被销毁而“消失”）
    public static void 状态异常白(Exception e)
    {
        if (Main.dedServ || e == null) return;
        //显示异常类型 + 消息 + 触发位置，便于定位
        string msg = e.Message;
        if (e.InnerException != null) msg += " |内| " + e.InnerException.Message;
        string loc = e.StackTrace != null ? e.StackTrace.Split('\n')[0].Trim() : "";
        Main.NewText($"酒狐：干活时被绊了一下…[{e.GetType().Name}]{msg}   @{loc}", new Color(220, 180, 120));
    }

    //===== 头顶任务状态文本（按酒狐 whoAmI）=====
    private static readonly Dictionary<int, string> 状态文本 = new();
    private static readonly Dictionary<int, int> 状态文本计时 = new();
    private static readonly Dictionary<int, string> 上次状态 = new();
    private const int 状态文本时长 = 90;   //约1.5秒

    /// <summary>状态变化时调用：仅当状态文本真的改变才在头顶显示；否则忽略。</summary>
    private static void 设状态文本(NPC fox, string 标题, string 内容)
    {
        if (fox == null) return;
        string key = $"{标题}|{内容}";
        if (上次状态.TryGetValue(fox.whoAmI, out string last) && last == key)
            return;   //未变化，不重复显示
        上次状态[fox.whoAmI] = key;
        状态文本[fox.whoAmI] = 内容;
        状态文本计时[fox.whoAmI] = 状态文本时长;
    }

    /// <summary>让酒狐在头顶“说一句话”（台词/喂食等），强制刷新，时长可指定。</summary>
    public static void 说头顶话(NPC fox, string 内容, int ticks = 180)
    {
        if (fox == null) return;
        上次状态[fox.whoAmI] = "speak|" + 内容 + "|" + Main.GameUpdateCount;   //不参与去重
        状态文本[fox.whoAmI] = 内容;
        状态文本计时[fox.whoAmI] = ticks;
    }

    public static bool 头顶有状态文本(NPC fox, out string 内容, out float alpha)
    {
        内容 = "";
        alpha = 0f;
        if (!状态文本.TryGetValue(fox.whoAmI, out string txt)) return false;
        if (!状态文本计时.TryGetValue(fox.whoAmI, out int t) || t <= 0) return false;
        内容 = txt;
        alpha = MathHelper.Clamp(t / 25f, 0f, 1f);   //快结束时淡出
        return true;
    }

    //由 酒狐.PreDraw 每tick调用：衰减计时
    public static void UpdateStatusText(NPC fox)
    {
        if (状态文本计时.TryGetValue(fox.whoAmI, out int t) && t > 0)
        {
            状态文本计时[fox.whoAmI] = t - 1;
            if (t - 1 <= 0)
            {
                状态文本.Remove(fox.whoAmI);
                上次状态.Remove(fox.whoAmI);
            }
        }
    }

    public static bool 主动防御激活(NPC fox) => 主动防御集.Contains(fox.whoAmI);
    public static bool 主动防御激活(Player owner)
    {
        NPC fox = 酒狐饰品.找酒狐(owner);
        return fox != null && 主动防御集.Contains(fox.whoAmI);
    }
    public static bool 清理门户激活(NPC fox) => 清理门户集.Contains(fox.whoAmI);
    public static bool 恋还是练激活(NPC fox) => 恋还是练集.Contains(fox.whoAmI);
    public static bool 恋还是练激活(Player owner)
    {
        NPC fox = 酒狐饰品.找酒狐(owner);
        return fox != null && 恋还是练集.Contains(fox.whoAmI);
    }
    public static bool 挑衅激活(NPC fox) => 挑衅集.Contains(fox.whoAmI);
    public static bool 挑衅激活(Player owner)
    {
        NPC fox = 酒狐饰品.找酒狐(owner);
        return fox != null && 挑衅集.Contains(fox.whoAmI);
    }
    public static bool 无敌中(NPC fox) => 无敌计时.TryGetValue(fox.whoAmI, out int t) && t > 0;

    private const int 重试间隔 = 5 * 60;      //每5秒重试需求检测
    private const int 一分钟 = 60 * 60;       //1分钟=3600tick

    //==================== 每tick：由 酒狐.AI 调用 ====================
    public static void Update(NPC fox, Player owner)
    {
        if (fox == null || owner == null) return;
        if (Main.netMode == NetmodeID.MultiplayerClient) return;   //SP 聚焦，服务端执行

        //无敌计时衰减
        if (无敌计时.TryGetValue(fox.whoAmI, out int t0) && t0 > 0)
            无敌计时[fox.whoAmI] = t0 - 1;

        List<任务记录> list = 酒狐任务系统.获取列表(owner);
        任务记录 executing = 酒狐任务系统.当前执行(owner);

        //若当前执行的任务已被移除，清理
        if (executing != null && !list.Contains(executing))
            酒狐任务系统.清除执行(owner, executing);

        //1) 有任务在执行 → 跑行为
        if (executing != null && executing.执行中)
        {
            //先打怪再继续执行任务：若附近有敌人则暂停本tick的任务行为，交给攻击系统处理
            if (!酒狐任务执行.挑衅激活(fox) && 有战斗目标(fox, owner))
                return;
            执行行为(fox, owner, executing);
            return;
        }

        //2) 无执行 → 找第一个未屏蔽的任务推进其状态机
        任务记录 candidate = null;
        foreach (任务记录 r in list)
        {
            if (!r.屏蔽)
            {
                candidate = r;
                break;
            }
        }
        if (candidate == null) return;

        //需求检测（重试计时到点才真正检测）
        if (candidate.重试计时 > 0)
        {
            candidate.重试计时--;
            return;
        }
        if (candidate.状态 == "执行中") return;

        bool ok = 检查需求(fox, owner, candidate, out string missing);
        if (ok)
        {
            //=====【建造确认】造房纸/搭平台：需玩家在聊天框确认或拒绝后才开始执行=====
            if (是建造任务(candidate.类型) && !candidate.已确认)
            {
                //拒绝冷却中：等待，不重复弹出
                if (拒绝冷却.TryGetValue(owner.whoAmI, out int cd) && cd > 0)
                {
                    拒绝冷却[owner.whoAmI] = cd - 1;
                    return;
                }
                if (!awaitingConfirm.Contains(owner.whoAmI))
                {
                    awaitingConfirm.Add(owner.whoAmI);
                    candidate.状态 = "待确认";
                    candidate.累计等待 = 0;
                    设状态文本(fox, "待确认", $"等待确认：{任务定义.名称(candidate.类型)}");
                    发送建造请求(fox, candidate, owner);
                    //确认前就显示建筑预览残影（预告）
                    if (candidate.类型 == 任务类型.搭平台 && 找到起始点(fox, out int px0, out int py0))
                        显示建筑预览(fox, px0, 1, py0);
                    else if (candidate.类型 == 任务类型.造房纸)
                    {
                        int g = 找到地面(owner.Bottom.Y, (int)(owner.Center.X / 16f));
                        if (g >= 0) 显示建筑预览(fox, (int)(owner.Center.X / 16f), 0, g);
                    }
                }
                return;
            }

            candidate.执行中 = true;
            candidate.状态 = "执行中";
            candidate.累计等待 = 0;
            candidate.动作计时 = 0;
            酒狐任务系统.设置执行(owner, candidate);
            开始任务(fox, owner, candidate);
            设状态文本(fox, "执行中", $"执行中：{任务定义.名称(candidate.类型)}");
            //建造任务：确认后重置提示，便于再次确认下一次建造
            if (是建造任务(candidate.类型)) { candidate.已确认 = true; awaitingConfirm.Remove(owner.whoAmI); }
            执行行为(fox, owner, candidate);
        }
        else
        {
            candidate.状态 = $"酒狐缺少{missing}";
            candidate.重试计时 = 重试间隔;
            candidate.累计等待 += 重试间隔;
            设状态文本(fox, "缺少", $"缺少：{missing}");
            if (candidate.累计等待 >= 一分钟)
            {
                candidate.屏蔽 = true;
                candidate.状态 = "已屏蔽";
                candidate.执行中 = false;
                酒狐任务系统.清除执行(owner, candidate);
                停止任务(owner, candidate);
                设状态文本(fox, "屏蔽", $"已屏蔽：{任务定义.名称(candidate.类型)}");
            }
        }
    }

    //==================== 需求检测：物品（背包/武器槽/玩家背包）+ 环境 ====================
    private static bool 检查需求(NPC fox, Player owner, 任务记录 r, out string missing)
    {
        switch (r.类型)
        {
            case 任务类型.钓鱼:
                if (!有钓鱼竿(owner)) { missing = "钓鱼竿"; return false; }
                if (!有鱼饵(owner)) { missing = "鱼饵"; return false; }
                if (!近处有水(fox)) { missing = "水域"; return false; }
                break;
            case 任务类型.采种:
                if (!有种子(owner)) { missing = "种子"; return false; }
                if (!近处有可采作物(fox)) { missing = "作物"; return false; }
                break;
            case 任务类型.搭平台:
                if (!有平台(owner)) { missing = "平台"; return false; }
                if (!找到起始点(fox, out _, out _)) { missing = "起始点"; return false; }
                break;
            case 任务类型.造房纸:
                if (!有木头(owner)) { missing = "木头"; return false; }
                break;
            case 任务类型.主动防御:
            case 任务类型.清理门户:
            case 任务类型.恋还是练:
            default:
                break;
        }
        missing = "";
        return true;
    }

    //==================== 开始/停止任务：处理模式开关与恢复 ====================
    private static void 开始任务(NPC fox, Player owner, 任务记录 r)
    {
        switch (r.类型)
        {
            case 任务类型.清理门户:
            case 任务类型.主动防御:
            case 任务类型.恋还是练:
                启用模式开关(fox, r);
                if (r.类型 == 任务类型.恋还是练)
                {
                    挑衅集.Remove(fox.whoAmI);
                    恋还是练开场白();
                }
                break;
        }
    }

    public static void 停止任务(Player owner, 任务记录 r)
    {
        NPC fox = 酒狐饰品.找酒狐(owner);
        if (fox != null)
        {
            关闭建筑预览(fox);
            switch (r.类型)
            {
                case 任务类型.清理门户:
                case 任务类型.主动防御:
                case 任务类型.恋还是练:
                    停用模式开关(fox, r);
                    break;
            }
        }
    }

    //启用某任务的模式开关（在 开始/恢复执行 时）
    private static void 启用模式开关(NPC fox, 任务记录 r)
    {
        switch (r.类型)
        {
            case 任务类型.清理门户:
                清理门户集.Add(fox.whoAmI);
                break;
            case 任务类型.主动防御:
                主动防御集.Add(fox.whoAmI);
                break;
            case 任务类型.恋还是练:
                恋还是练集.Add(fox.whoAmI);
                break;
        }
    }

    //停用某任务的模式开关（在 停止/暂停 时）
    private static void 停用模式开关(NPC fox, 任务记录 r)
    {
        switch (r.类型)
        {
            case 任务类型.清理门户:
                清理门户集.Remove(fox.whoAmI);
                恢复清理门户友好();
                break;
            case 任务类型.主动防御:
                主动防御集.Remove(fox.whoAmI);
                break;
            case 任务类型.恋还是练:
                恋还是练集.Remove(fox.whoAmI);
                挑衅集.Remove(fox.whoAmI);
                无敌计时.Remove(fox.whoAmI);
                break;
        }
    }

    //恢复被清理门户临时设为「非友方」的NPC
    private static void 恢复清理门户友好()
    {
        foreach (int n in 清理门户压制集)
            if (n >= 0 && n < Main.maxNPCs && Main.npc[n].active && !Main.npc[n].townNPC)
                Main.npc[n].friendly = true;
        清理门户压制集.Clear();
    }

    //==================== 行为执行：每种任务一帧 ====================
    private static void 执行行为(NPC fox, Player owner, 任务记录 r)
    {
        switch (r.类型)
        {
            case 任务类型.钓鱼: 行为钓鱼(fox, owner, r); break;
            case 任务类型.采种: 行为采种(fox, owner, r); break;
            case 任务类型.搭平台: 行为搭平台(fox, owner, r); break;
            case 任务类型.主动防御: 行为主动防御(fox, owner, r); break;
            case 任务类型.造房纸: 行为造房纸(fox, owner, r); break;
            case 任务类型.清理门户: 行为清理门户(fox, owner, r); break;
            case 任务类型.恋还是练: 行为恋还是练(fox, owner, r); break;
        }
    }

    //==================== 建筑预览：搭建房屋/平台前显示残影 ====================
    private static void 显示建筑预览(NPC fox, int anchorX, int type, int gy)
    {
        if (Main.dedServ || fox == null) return;
        try
        {
            Player owner = 酒狐NPC状态.GetTargetPlayer(fox);
            if (owner == null) return;
            int target = ModContent.ProjectileType<建筑预览>();
            int foxWho = fox.whoAmI;
            //找已存在的预览（按酒狐 whoAmI 存在 ai[3]）
            for (int i = 0; i < Main.maxProjectiles; i++)
            {
                Projectile p = Main.projectile[i];
                if (p != null && p.active && p.type == target && (int)p.ai[3] == foxWho)
                {
                    p.ai[0] = anchorX; p.ai[1] = type; p.ai[2] = gy;
                    p.timeLeft = 5;
                    return;
                }
            }
            //不存在 → 生成
            int proj = Projectile.NewProjectile(fox.GetSource_FromAI(), fox.Center, Vector2.Zero, target, 0, 0f, owner.whoAmI);
            if (proj >= 0 && proj < Main.maxProjectiles && Main.projectile[proj] != null)
            {
                Projectile np = Main.projectile[proj];
                np.ai[0] = anchorX;
                np.ai[1] = type;
                np.ai[2] = gy;
                np.ai[3] = foxWho;
                np.timeLeft = 5;
            }
        }
        catch { }
    }

    private static void 关闭建筑预览(NPC fox)
    {
        if (fox == null) return;   //酒狐已不在（被收集/消失）时直接返回，避免空引用崩溃
        try
        {
            int target = ModContent.ProjectileType<建筑预览>();
            int foxWho = fox.whoAmI;
            for (int i = 0; i < Main.maxProjectiles && i < Main.projectile.Length; i++)
            {
                Projectile p = Main.projectile[i];
                if (p == null) continue;
                if (p.active && p.type == target && (int)p.ai[3] == foxWho)
                    p.Kill();
            }
        }
        catch { }
    }

    //==================== 清理门户：把友方NPC当敌人 ====================
    private static void 行为清理门户(NPC fox, Player owner, 任务记录 r)
    {
        //把附近的友好NPC临时设为「非友方」，让酒狐的魔法飞弹/近战能命中它们（任务结束由 停用模式开关 恢复）
        foreach (int n in 清理门户目标NPC(fox, owner))
        {
            if (n >= 0 && n < Main.maxNPCs && Main.npc[n].active)
            {
                if (Main.npc[n].friendly)
                {
                    Main.npc[n].friendly = false;
                    清理门户压制集.Add(n);
                }
            }
        }
    }

    //清点酒狐范围内可作为清理门户目标的友好NPC（城镇/中立/小动物/友方怪，非酒狐自己/假人）
    private static IEnumerable<int> 清理门户目标NPC(NPC fox, Player owner)
    {
        int cx = (int)(fox.Center.X / 16f), cy = (int)(fox.Center.Y / 16f);
        int scan = 60;   //约3.75格范围内
        for (int i = 0; i < Main.maxNPCs; i++)
        {
            NPC c = Main.npc[i];
            if (!c.active || c.dontTakeDamage || c.life <= 0 || c.type == ModContent.NPCType<酒狐>() || c.type == NPCID.TargetDummy)
                continue;
            float d = Vector2.Distance(fox.Center, c.Center);
            if (d > scan * 16f) continue;
            //只要是友方/城镇/小动物都纳入
            if (c.friendly || c.townNPC || NPCID.Sets.CountsAsCritter[c.type])
                yield return i;
        }
    }

    //==================== 主动防御 ====================
    private static void 行为主动防御(NPC fox, Player owner, 任务记录 r)
    {
        //索敌范围与穿墙寻敌在 酒狐攻击.FindTarget 读取开关处理；弹幕穿墙在 酒狐弹幕修正 处理。
    }

    //==================== 恋还是练 ====================
    private static void 行为恋还是练(NPC fox, Player owner, 任务记录 r)
    {
        //未挑衅：中立，走到玩家附近但不攻击（不打断），仅演示待机
        if (!挑衅集.Contains(fox.whoAmI))
        {
            if (Vector2.Distance(fox.Center, owner.Center) > 220f)
            {
                fox.velocity.X = MathHelper.Clamp(fox.velocity.X + Math.Sign(owner.Center.X - fox.Center.X) * 0.14f, -2.2f, 2.2f);
                酒狐NPC状态.TryJumpOverObstacle(fox);
            }
            else
            {
                fox.velocity.X *= 0.9f;
            }
            酒狐NPC状态.面向目标X(fox, owner.Center.X);
            return;
        }

        //挑衅：追打玩家（本体靠近 + 梦云水晶弹幕打玩家）。酒狐速度保持任务内追赶。
        酒狐NPC状态.面向目标X(fox, owner.Center.X);
        float dist = Vector2.Distance(fox.Center, owner.Center);
        if (dist > 50f)
        {
            fox.velocity.X = MathHelper.Clamp(fox.velocity.X + Math.Sign(owner.Center.X - fox.Center.X) * 0.2f, -3.2f, 3.2f);
            if (owner.Center.Y > fox.Center.Y + fox.height)
                fox.velocity.Y = MathHelper.Clamp(fox.velocity.Y + 0.15f, -3f, 3.4f);   //只向下，向上交给起跳/重力
            酒狐NPC状态.TryJumpOverObstacle(fox);
        }
        else
        {
            fox.velocity.X *= 0.5f;
            //贴身：揉一下（光效）
            if (Main.rand.NextBool(5))
                Dust.NewDustPerfect(owner.Center + Main.rand.NextVector2Circular(24f, 24f), DustID.Crimson, Main.rand.NextVector2Circular(-2f, -2f), 0, new Color(255, 140, 160), 1.2f);
        }

        //梦云水晶变身：打玩家（若敌人是玩家，梦云水晶攻击也转向玩家）
        if (owner.GetModPlayer<酒狐玩家>().HasDreamCrystalEquipped())
            梦水晶攻击.Update打玩家(fox, owner);
    }

    //==================== 钓鱼（参考幻影伙伴）：到水边 → 甩杆 → 等待 → 收鱼 ====================
    private static readonly int[] 钓获池 = { ItemID.Bass, ItemID.Salmon, ItemID.Trout, ItemID.Goldfish, ItemID.SpecularFish, ItemID.Shrimp, ItemID.Flounder };
    private static void 行为钓鱼(NPC fox, Player owner, 任务记录 r)
    {
        //先走到水边
        if (!在鱼竿范围(fox, out int wx, out int wy))
        {
            走向鱼点(fox, owner);
            return;
        }
        //到位后：甩杆动画+等待+收鱼
        r.动作计时++;
        if (r.动作计时 % (9 * 60) == 0)   //每9秒收一次
        {
            //约70%钓到，否则空杆
            if (Main.rand.NextFloat() < 0.7f)
            {
                int item = 钓获池[Main.rand.Next(钓获池.Length)];
                int stack = Main.rand.Next(1, 3);
                放入玩家先(owner, item, stack);
            }
            溅水粒子(wx, wy);
        }
        面向点(fox, wx * 16f, wy * 16f);
        //等待时轻微晃动杆（视觉）
        if (Main.rand.NextBool(6))
            Dust.NewDust(fox.Center, 2, 2, DustID.Silver, 0, -1f, 60, default, 0.6f);
    }

    private static bool 在鱼竿范围(NPC fox, out int wx, out int wy)
    {
        int cx = (int)(fox.Center.X / 16f);
        int cy = (int)(fox.Center.Y / 16f);
        int scan = 40;   //约2.5格宽范围找水面
        for (int x = cx - scan; x <= cx + scan; x++)
        {
            for (int y = cy - 24; y <= cy + 8; y++)
            {
                if (x < 1 || y < 1 || x >= Main.maxTilesX - 1 || y >= Main.maxTilesY - 1) continue;
                Tile t = Main.tile[x, y];
                if (t.LiquidAmount > 0 && t.LiquidType == LiquidID.Water)
                {
                    //水面上方是空气（可下杆）
                    if (!Main.tile[x, y - 1].HasTile)
                    { wx = x; wy = y; return true; }
                }
            }
        }
        wx = wy = -1;
        return false;
    }

    private static void 走向鱼点(NPC fox, Player owner)
    {
        酒狐NPC状态.面向目标X(fox, owner.Center.X);
        fox.velocity.X = MathHelper.Clamp(fox.velocity.X + fox.direction * 0.18f, -2.6f, 2.6f);
        酒狐NPC状态.TryJumpOverObstacle(fox);
    }

    private static void 溅水粒子(int wx, int wy)
    {
        if (Main.dedServ) return;
        for (int i = 0; i < 10; i++)
        {
            Dust d = Dust.NewDustPerfect(new Vector2(wx * 16f, wy * 16f), DustID.Lava, //Lava会发蓝? 用水挂颜色
                new Vector2(Main.rand.NextFloat(-2f, 2f), Main.rand.NextFloat(-4f, -1f)), 0, new Color(80, 140, 255), 1.1f);
            d.noGravity = true;
        }
    }

    //==================== 采种：采集附近作物/药材 与 种植种子 交替进行 ====================
    private static void 行为采种(NPC fox, Player owner, 任务记录 r)
    {
        //交替：r.层数 0=采，1=种；每次成功动作后切换
        if (r.层数 == 0)
        {
            //A) 找可采作物/药材 → 走向并收割
            if (找到可采作物(fox, out int hx, out int hy))
            {
                float dist = Math.Max(Math.Abs(hx * 16f - fox.Center.X), Math.Abs(hy * 16f - fox.Center.Y));
                if (dist > 24f)
                {
                    fox.velocity.X = MathHelper.Clamp(fox.velocity.X + Math.Sign(hx * 16f - fox.Center.X) * 0.18f, -2.6f, 2.6f);
                    酒狐NPC状态.TryJumpOverObstacle(fox);
                    面向点(fox, hx * 16f, hy * 16f);
                    return;
                }
                //收割
                WorldGen.KillTile(hx, hy, false, false, false);
                酒狐NPC状态.面向目标X(fox, hx * 16f);
                r.层数 = 1;   //下一轮去种
                return;
            }
            //这一轮没采到 → 转去种
            r.层数 = 1;
            return;
        }

        //B) 种植：找背包里的种子种下（草种子→土/泥块，作物种子→草地）
        r.动作计时++;
        if (r.动作计时 < 30) return;   //种植间隔
        r.动作计时 = 0;
        if (尝试种植(fox, owner, out int px, out int py))
        {
            Dust.NewDustPerfect(new Vector2(px * 16f + 8f, py * 16f), DustID.Clentaminator_Green, new Vector2(0f, -1f), 0, default, 1.0f);
            r.层数 = 0;   //种完再回去采
        }
        else if (!有种子(owner))
        {
            r.层数 = 0;   //没种子了，回去继续采
        }
    }

    private static bool 近处有可采作物(NPC fox)
    {
        return 找到可采作物(fox, out _, out _);
    }

    //在酒狐附近找成熟药材/作物/植物
    private static bool 找到可采作物(NPC fox, out int hx, out int hy)
    {
        int cx = (int)(fox.Center.X / 16f);
        int cy = (int)(fox.Center.Y / 16f);
        int scan = 30;
        for (int r = 1; r <= scan; r++)
        {
            for (int dx = -r; dx <= r; dx++)
            {
                for (int dy = -r; dy <= r; dy++)
                {
                    if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != r) continue;
                    int x = cx + dx, y = cy + dy;
                    if (x < 1 || y < 1 || x >= Main.maxTilesX - 1 || y >= Main.maxTilesY - 1) continue;
                    Tile t = Main.tile[x, y];
                    if (!t.HasTile) continue;
                    int type = t.TileType;
                    if (type == TileID.MatureHerbs || type == TileID.BloomingHerbs || type == TileID.Plants || type == TileID.Plants2 || type == TileID.JunglePlants || type == TileID.JunglePlants2 || type == TileID.HallowedPlants)
                    { hx = x; hy = y; return true; }
                }
            }
        }
        hx = hy = -1;
        return false;
    }

    //尝试把背包（酒狐背包/玩家背包）里一种种子种到合适的位置：
    // 草种子→土块/泥块；作物种子（药材等）→草地上
    private static bool 尝试种植(NPC fox, Player owner, out int px, out int py)
    {
        px = py = -1;
        Item seed = 找种子(owner);
        if (seed == null || seed.createTile <= 0) return false;

        bool 是草种子 = 是草种子类型(seed.type);   //true=草种子(种土/泥)，false=作物种子(种草地)

        int cx = (int)(fox.Center.X / 16f);
        int cy = (int)(fox.Center.Y / 16f);
        int scan = 14;
        for (int dx = -scan; dx <= scan; dx++)
        {
            for (int dy = -scan; dy <= scan; dy++)
            {
                int x = cx + dx, y = cy + dy;
                if (x < 1 || y < 1 || x >= Main.maxTilesX - 1 || y >= Main.maxTilesY - 1) continue;
                Tile below = Main.tile[x, y];
                if (!below.HasTile) continue;
                int bt = below.TileType;
                bool 适合;
                if (是草种子)
                {
                    //草种子 → 土块/泥块
                    适合 = bt == TileID.Dirt || bt == TileID.Mud || bt == TileID.ClayBlock;
                }
                else
                {
                    //作物种子 → 草地 / 各色草地
                    适合 = bt == TileID.Grass || bt == TileID.JungleGrass || bt == TileID.HallowedGrass
                        || bt == TileID.CorruptGrass || bt == TileID.CrimsonGrass || bt == TileID.MushroomGrass;
                }
                if (!适合) continue;
                Tile above = Main.tile[x, y - 1];
                if (above.HasTile || above.LiquidAmount > 0) continue;   //上面要空
                if (Collision.SolidTiles(x, y - 1, x, y - 1)) continue;
                //放置
                if (WorldGen.PlaceTile(x, y - 1, seed.createTile, true, true, -1, 0))
                {
                    seed.stack--;
                    if (seed.stack <= 0) seed.TurnToAir();
                    px = x; py = y - 1;
                    return true;
                }
            }
        }
        return false;
    }

    //是否为"家具/装饰"类物体（火把、桌子、椅子、门、随机装饰等）——这类占用建筑位，生成时要清掉
    private static bool 是家具装饰(int tileType)
    {
        try { return Terraria.ObjectData.TileObjectData.GetTileData(tileType, 0, 0) != null; }
        catch { return false; }
    }

    //在生成的屋内摆放家具/装饰：火把（墙）、桌子、椅子、随机装饰
    private static void 放屋内家具(Player owner, int ax, int x1, int x2, int floorY, int wallTop)
    {
        if (owner == null) return;
        try
        {
            //桌子（门旁，放在地板上）
            int tableX = ax + (ax - x1 >= 2 ? -2 : 2);
            if (在界内(tableX, floorY - 1))
                WorldGen.PlaceObject(tableX, floorY - 1, TileID.Tables, true, 0, 0, 0, 1);
            //椅子（桌子两侧）
            if (在界内(tableX - 1, floorY - 1)) WorldGen.PlaceObject(tableX - 1, floorY - 1, TileID.Chairs, true, 0, 0, 0, 1);
            if (在界内(tableX + 1, floorY - 1)) WorldGen.PlaceObject(tableX + 1, floorY - 1, TileID.Chairs, true, 0, 0, 0, 1);
            //火把：左右墙中段各一支（在墙上）
            int torchY = wallTop + 2;
            if (在界内(x1 + 1, torchY)) WorldGen.PlaceTile(x1 + 1, torchY, TileID.Torches, true, true, owner.whoAmI, 0);
            if (在界内(x2 - 1, torchY)) WorldGen.PlaceTile(x2 - 1, torchY, TileID.Torches, true, true, owner.whoAmI, 0);
            //随机装饰：小概率再摆一张小桌作装饰
            if (Main.rand.NextBool(2) && 在界内(ax + (Main.rand.NextBool(2) ? -3 : 3), floorY - 1))
                WorldGen.PlaceObject(ax + (Main.rand.NextBool(2) ? -3 : 3), floorY - 1, TileID.Tables, true, 0, 0, 0, 1);
        }
        catch { }
    }

    private static bool 是草种子类型(int type)
    {
        switch (type)
        {
            case ItemID.GrassSeeds:
            case ItemID.JungleGrassSeeds:
            case ItemID.HallowedSeeds:
            case ItemID.CorruptSeeds:
            case ItemID.CrimsonSeeds:
            case ItemID.MushroomGrassSeeds:
            case ItemID.AshGrassSeeds:
                return true;
            default:
                return false;
        }
    }

    //==================== 搭平台（参考幻影伙伴）：一次铺出多层平台栈 ====================
    // 层数写法：r.层数 = 已铺好的层数（0 = 尚未开始）。每层为一整条水平平台，长度=配置最大长度，
    // 层与层之间垂直间隔=配置垂直间距，共铺 配置堆叠次数 层（默认5层）。
    private static void 行为搭平台(NPC fox, Player owner, 任务记录 r)
    {
        //起点以【玩家】位置为准：X = 玩家中心格，Y = 玩家脚底所在行（最底端与玩家同水平）
        int sx = (int)(owner.Center.X / 16f);
        int sy = (int)((owner.position.Y + owner.height) / 16f);
        if (sy < 1) sy = 2;
        if (r.层数 == 0)
        {
            r.目标X = sx; r.目标Y = sy; r.方向 = 1; r.层数 = 1;
        }

        int cfgLen = Math.Max(2, Cfg.搭平台最大长度);    //x：单层平台长度（默认100）
        int cfgStep = Math.Max(2, Cfg.搭平台垂直间距);   //y：层间垂直间隔（默认6）
        int cfgStack = Math.Max(1, Cfg.搭平台堆叠次数);  //堆叠层数（默认5）
        int 平台tile = TileID.Platforms;

        int centerX = r.目标X;
        int baseY = r.目标Y;
        int 朝向 = owner.direction == 0 ? 1 : owner.direction;   //面向左→平台向左延伸
        int placed = 0;
        try
        {
            // 从下往上铺：第 i 层地面 = baseY - i * cfgStep
            for (int i = 0; i < cfgStack; i++)
            {
                int y = baseY - i * cfgStep;
                if (y < 1 || y >= Main.maxTilesY - 1) break;
                // 先清掉这一决定行上的「家具/装饰」（火把/桌椅/门等），保留普通方块/平台
                for (int k = 0; k < cfgLen; k++)
                {
                    int x = 朝向 > 0 ? centerX + k : centerX - k;
                    if (x < 1 || x >= Main.maxTilesX - 1) continue;
                    Tile tt = Main.tile[x, y];
                    if (tt.HasTile && !IsPlatform(tt.TileType) && 是家具装饰(tt.TileType))
                        安全破坏(x, y);
                }
                // 再铺平台：只碰空格子（参考幻影伙伴“只排空目标格”），放完压平
                for (int k = 0; k < cfgLen; k++)
                {
                    int x = 朝向 > 0 ? centerX + k : centerX - k;
                    if (x < 1 || x >= Main.maxTilesX - 1) continue;
                    Tile t = Main.tile[x, y];
                    if (t.HasTile && IsPlatform(t.TileType)) continue;   //已是平台
                    if (t.HasTile) continue;                              //非空 → 不覆盖
                    if (WorldGen.PlaceTile(x, y, 平台tile, true, true, owner.whoAmI, 0))
                    {
                        placed++;
                        try { Tile tt2 = Main.tile[x, y]; tt2.Slope = SlopeType.Solid; tt2.IsHalfBlock = false; } catch { }
                    }
                }
            }
        }
        catch (Exception e) { 状态异常白(e); }

        // 按生成格数消耗背包里的平台（只在真正用得上的数量内扣）
        Item plat = 找平台(owner);
        if (plat != null && placed > 0)
        {
            int need = Math.Max(1, placed);
            消耗原材料(plat, need);
            if (!Main.dedServ)
                Main.NewText($"酒狐：搭好{cfgStack}层平台啦（用掉 {need} 个平台）", new Color(150, 200, 255));
        }
        任务完成(fox, owner, r);
    }

    private static bool IsPlatform(int tileType)
    {
        if (tileType < 0 || tileType >= Main.tileSolidTop.Length) return false;
        return Main.tileSolidTop[tileType] && !Main.tileSolid[tileType];
    }

    //读取从 x 朝两边连续平台数量（用 SafeTile 防越界）
    private static int 连续平台数(NPC fox, int x, int y)
    {
        if (y <= 0 || y >= Main.maxTilesY) return 0;
        int count = 0;
        for (int dx = -1; dx <= 1; dx += 2)
        {
            int i = x + dx;
            while (i > 1 && i < Main.maxTilesX - 1)
            {
                Tile t = SafeTile(i, y);
                if (t.HasTile && IsPlatform(t.TileType)) { count++; i += dx; }
                else break;
            }
        }
        return count;
    }

    //找酒狐附近一段连续平台作为起始点；若找不到，回退到酒狐当前脚底的平台层作为起点（先铺第一块）
    private static bool 找到起始点(NPC fox, out int sx, out int sy)
    {
        int cx = (int)(fox.Center.X / 16f);
        int cy = (int)(fox.Center.Y / 16f);
        int scan = 24;
        //1) 附近已有连续平台 → 采用
        for (int r = 2; r <= scan; r++)
        {
            for (int dx = -r; dx <= r; dx++)
            {
                for (int dy = -r; dy <= r; dy++)
                {
                    if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != r) continue;
                    int x = cx + dx, y = cy + dy;
                    if (x < 2 || y < 1 || x >= Main.maxTilesX - 2 || y >= Main.maxTilesY - 1) continue;
                    Tile t = SafeTile(x, y);
                    if (!t.HasTile || !IsPlatform(t.TileType)) continue;
                    //至少一格即可，无需"非房屋"限制
                    sx = x; sy = y; return true;
                }
            }
        }
        //2) 回退：起始层默认与酒狐脚底同一高度（酒狐所在的水平行）
        int foxFootY = (int)(fox.Bottom.Y / 16f);
        int fallbackY = foxFootY;
        if (fallbackY < 2) fallbackY = 2;
        if (fallbackY >= Main.maxTilesY - 2) fallbackY = Main.maxTilesY - 3;
        sx = (int)MathHelper.Clamp(cx, 2, Main.maxTilesX - 2);
        sy = fallbackY;
        return true;
    }

    private static bool 有围墙环绕(int x, int y)
    {
        //近似：平台上方几格内有背景墙，且左右也连片 → 视为房屋一部分
        bool wallAbove = false, wallL = false, wallR = false;
        for (int dy = -1; dy >= -6 && !wallAbove; dy--)
        {
            if (SafeTile(x, y + dy).WallType > 0) wallAbove = true;
        }
        for (int dx = 1; dx <= 5 && !wallL; dx++)
        {
            if (SafeTile(x - dx, y).WallType > 0) wallL = true;
        }
        for (int dx = 1; dx <= 5 && !wallR; dx++)
        {
            if (SafeTile(x + dx, y).WallType > 0) wallR = true;
        }
        return wallAbove;
    }

    //==================== 造房纸（参考幻影伙伴）：一次性生成一个木头小屋 ====================
    private static void 行为造房纸(NPC fox, Player owner, 任务记录 r)
    {
        if (!有木头(owner)) return;   //没木头则先等待/重试（需求已把关，这里兜底）

        //以【玩家】位置为锚：X = 玩家中心格，Y = 玩家脚底所在行（房屋地板与玩家同水平）
        int cx = (int)(owner.Center.X / 16f);
        int groundY = 找到地面(owner.Bottom.Y, cx);   //找玩家脚下的实心地面
        if (r.目标X == 0) { r.目标X = cx; r.目标Y = groundY > 0 ? groundY : (int)(owner.Center.Y / 16f); }
        int ax = r.目标X, gy = r.目标Y;

        //房屋尺寸：长度翻倍(9→17格)，高度+1(5→6格)，带门与桌椅
        //朝向：面向左→房体向左侧延伸；面向右→向右侧延伸（以玩家位置为锚）
        int dir = owner.direction == 0 ? 1 : owner.direction;   //0 视为朝右
        int x1 = dir > 0 ? ax : ax - 16;
        int x2 = dir > 0 ? ax + 16 : ax;
        int floorY = gy - 1, wallTop = floorY - 5, roofY = floorY - 6;

        //一键生成整间小屋（强硬：先清空整个建筑区 → 生成房屋骨架 → 放家具/装饰）
        int woodUsed = 0;
        try
        {
            //① 清空整个建筑区：破坏所有方块 + 背景墙（含火把/桌椅/装饰等一切）
            for (int x = x1 - 1; x <= x2 + 1; x++)
            {
                for (int y = roofY - 1; y <= gy; y++)
                {
                    if (!在界内(x, y)) continue;
                    if (y == gy) continue;   //地基行保留（下方地面）
                    Tile tt = Main.tile[x, y];
                    if (tt.HasTile) 安全破坏(x, y);
                    if (tt.WallType > 0) try { WorldGen.KillWall(x, y, false); } catch { }
                }
            }

            //② 房屋骨架：地板（用木头方块）+ 屋顶 + 两柱 + 背景墙
            for (int x = x1; x <= x2; x++)
            {
                if (在界内(x, floorY)) { if (WorldGen.PlaceTile(x, floorY, TileID.WoodBlock, true, true, owner.whoAmI, 0)) woodUsed++; }
                if (在界内(x, roofY)) { if (WorldGen.PlaceTile(x, roofY, TileID.WoodBlock, true, true, owner.whoAmI, 0)) woodUsed++; }
            }
            int doorX = (x1 + x2) / 2;   //门在房间正中
            for (int x = x1; x <= x2; x++)
            {
                for (int y = wallTop; y <= floorY - 1; y++)
                {
                    if (!在界内(x, y)) continue;
                    if (x == doorX && y >= floorY - 3) continue;   //门洞（底部3格留空，放门）
                    WorldGen.PlaceWall(x, y, WallID.Wood, true);
                    if (x == x1 || x == x2)
                        if (WorldGen.PlaceTile(x, y, TileID.WoodBlock, true, true, owner.whoAmI, 0)) woodUsed++;
                }
            }
            //门（中央一列，底部一格；门上方两格需留空以便开放门动画）
            if (在界内(doorX, floorY - 1)) { if (WorldGen.PlaceTile(doorX, floorY - 1, TileID.ClosedDoor, true, true, owner.whoAmI, 0)) woodUsed++; }

            //③ 家具/装饰：火把（墙两侧）、桌子、椅子、随机装饰
            放屋内家具(owner, doorX, x1, x2, floorY, wallTop);
        }
        catch (Exception e) { 状态异常白(e); }

        //按生成格数消耗背包里的木头
        Item wood = 找木头(owner);
        if (wood != null && woodUsed > 0)
        {
            消耗原材料(wood, Math.Max(1, woodUsed));
            if (!Main.dedServ)
                Main.NewText($"酒狐：小房子盖好啦（用掉 {woodUsed} 个木头）", new Color(150, 200, 255));
        }
        任务完成(fox, owner, r);
    }

    //找到指定脚底Y（或下方）的实心地面，返回其 y；找不到返回 -1
    private static int 找到地面(float bottomY, int x)
    {
        int y = (int)(bottomY / 16f);
        int start = y;
        //先向下找实心
        for (int i = 0; i < 40; i++)
        {
            int yy = start + i;
            if (yy < 1 || yy >= Main.maxTilesY - 1) break;
            if (SafeTile(x, yy).HasTile && SafeTile(x, yy).LiquidAmount == 0) return yy;
        }
        //水平小范围找
        for (int dx = -3; dx <= 3; dx++)
        {
            for (int i = 0; i < 30; i++)
            {
                int yy = start + i;
                if (yy < 1 || yy >= Main.maxTilesY - 1) break;
                if (SafeTile(x + dx, yy).HasTile && SafeTile(x + dx, yy).LiquidAmount == 0) return yy;
            }
        }
        return -1;
    }

    private static void MoveToward(NPC fox, float targetX)
    {
        fox.velocity.X = MathHelper.Clamp(fox.velocity.X + Math.Sign(targetX - fox.Center.X) * 0.22f, -3.0f, 3.0f);
        酒狐NPC状态.TryJumpOverObstacle(fox);
    }

    //清理建筑区：破坏实心方块（含地板区域内/墙内），让房屋能落成。返回是否完成清理
    private static bool 清理建筑区(NPC fox, Player owner, int cx, int gy, int x1, int x2, int floorY, int wallTop, int roofY)
    {
        //需要破坏的格子：建筑轮廓内(含墙柱/墙内空间)非空或非可破坏
        for (int y = roofY; y <= gy; y++)
        {
            for (int x = x1; x <= x2; x++)
            {
                Tile t = SafeTile(x, y);
                if (!t.HasTile) continue;
                int type = t.TileType;
                //保留地板行下方（地基），但格子在轮廓内的实心则破坏
                bool isAnchorGround = y == gy;   //地基行跳过，只清轮廓内
                if (isAnchorGround) continue;
                //破坏方块（木头以外的任意挡路方块）
                if (x < 0 || y < 0 || x >= Main.maxTilesX || y >= Main.maxTilesY) continue;
                if (Math.Abs(x * 16f - fox.Center.X) > 36f) { MoveToward(fox, x * 16f); return false; }
                安全破坏(x, y);
                //用音效/粒子体现“在工作”
                if (Main.rand.NextBool(3))
                    Dust.NewDust(new Vector2(x * 16f, y * 16f), 16, 16, DustID.Dirt, 0, -1f, 0, default, 0.8f);
            }
        }
        return true;
    }

    private static bool 在界内(int x, int y) => x >= 1 && y >= 1 && x < Main.maxTilesX - 1 && y < Main.maxTilesY - 1;

    private static bool 铺地板(NPC fox, Player owner, int x1, int x2, int y)
    {
        for (int x = x1; x <= x2; x++)
        {
            if (!在界内(x, y)) continue;
            if (SafeTile(x, y).HasTile) continue;
            if (Math.Abs(x * 16f - fox.Center.X) > 36f) { MoveToward(fox, x * 16f); return false; }
            安全放置Tile(x, y, TileID.WoodBlock, owner);
            WorkDust(x, y);
        }
        return true;
    }

    private static bool 造墙和门(NPC fox, Player owner, int x1, int x2, int yTop, int yFloor, int doorX)
    {
        for (int y = yTop; y <= yFloor; y++)
        {
            for (int x = x1; x <= x2; x++)
            {
                if (!在界内(x, y)) continue;
                if (x == doorX) continue;   //留门洞
                if (SafeTile(x, y).HasTile) continue;
                if (Math.Abs(x * 16f - fox.Center.X) > 36f) { MoveToward(fox, x * 16f); return false; }
                安全放置Wall(x, y, WallID.Wood);
                if (x == x1 || x == x2)
                    安全放置Tile(x, y, TileID.WoodBlock, owner);
                WorkDust(x, y);
            }
        }
        //放门（门要放在门洞：从墙顶往下到地板的中央一列）
        if (在界内(doorX, yFloor - 1) && !SafeTile(doorX, yFloor - 1).HasTile && SafeTile(doorX, yFloor - 1).WallType == 0)
        {
            if (Math.Abs(doorX * 16f - fox.Center.X) > 36f) { MoveToward(fox, doorX * 16f); return false; }
            安全放置Tile(doorX, yFloor - 1, TileID.ClosedDoor, owner);
            for (int y = yTop; y < yFloor - 1; y++)
                if (在界内(doorX, y)) 安全放置Wall(doorX, y, WallID.Wood);
        }
        return true;
    }

    private static bool 造屋顶(NPC fox, Player owner, int x1, int x2, int y)
    {
        for (int x = x1; x <= x2; x++)
        {
            if (!在界内(x, y)) continue;
            if (SafeTile(x, y).HasTile) continue;
            if (Math.Abs(x * 16f - fox.Center.X) > 36f) { MoveToward(fox, x * 16f); return false; }
            安全放置Tile(x, y, TileID.WoodBlock, owner);
            WorkDust(x, y);
        }
        return true;
    }

    private static void WorkDust(int x, int y)
    {
        if (Main.dedServ || !Main.rand.NextBool(4)) return;
        Dust.NewDust(new Vector2(x * 16f, y * 16f), 16, 16, DustID.WoodFurniture, Main.rand.NextFloat(-1f, 1f), -1.2f, 0, default, 0.7f);
    }

    private static void 任务完成(NPC fox, Player owner, 任务记录 r)
    {
        关闭建筑预览(fox);
        酒狐任务系统.移除任务(owner, r);
        设状态文本(fox, "完成", $"完成：{任务定义.名称(r.类型)}");
        if (!Main.dedServ)
            Main.NewText($"酒狐：{任务定义.名称(r.类型)}完成啦！", new Color(150, 220, 140));
    }

    //==================== 对话文本 ====================
    private static readonly string[] 恋还是练开场 = {
        "酒狐：狗修金sama，我准备好了",
        "酒狐：主人放马过来吧",
        "酒狐：说好喽，点到为止哦~",
        "酒狐：我可不会手下留情哦！",
        "酒狐：来吧，我不会跑滴~"
    };
    private static readonly string[] 恋还是练中招 = {
        "酒狐：啊啊啊好痛，我不打了~",
        "酒狐：呜哇！这下真疼！",
        "酒狐：停停停！我认输啦~",
        "酒狐：别打了别打了！"
    };
    private static readonly string[] 恋还是练救主人 = {
        "酒狐：主人别倒下！",
        "酒狐：我不会让主人受伤的！",
        "酒狐：到此为止吧，主人！",
        "酒狐：快醒醒！"
    };

    public static void 恋还是练开场白() { if (!Main.dedServ) Main.NewText(恋还是练开场[Main.rand.Next(恋还是练开场.Length)], new Color(200, 120, 220)); }    public static void 恋还是练中招白() { if (!Main.dedServ) Main.NewText(恋还是练中招[Main.rand.Next(恋还是练中招.Length)], new Color(200, 120, 220)); }
    public static void 恋还是练救主白() { if (!Main.dedServ) Main.NewText(恋还是练救主人[Main.rand.Next(恋还是练救主人.Length)], new Color(200, 120, 220)); }

    //==================== 物品检测 / 找物品 ====================
    private static bool 有钓鱼竿(Player owner) => 找钓鱼竿(owner) != null;
    private static Item 找钓鱼竿(Player owner)
    {
        foreach (Item it in 遍历物品(owner))
            if (it != null && !it.IsAir && it.fishingPole > 0) return it;
        return null;
    }
    private static bool 有鱼饵(Player owner) => 找鱼饵(owner) != null;
    private static Item 找鱼饵(Player owner)
    {
        foreach (Item it in 遍历物品(owner))
            if (it != null && !it.IsAir && it.bait > 0) return it;
        return null;
    }
    private static bool 有种子(Player owner) => 找种子(owner) != null;
    private static Item 找种子(Player owner)
    {
        foreach (Item it in 遍历物品(owner))
            if (it != null && !it.IsAir && 是种子(it.type)) return it;
        return null;
    }
    private static bool 是种子(int type)
    {
        switch (type)
        {
            case ItemID.GrassSeeds:
            case ItemID.JungleGrassSeeds:
            case ItemID.HallowedSeeds:
            case ItemID.MushroomGrassSeeds:
            case ItemID.CorruptSeeds:
            case ItemID.CrimsonSeeds:
            case ItemID.AshGrassSeeds:
            case ItemID.DaybloomSeeds:
            case ItemID.MoonglowSeeds:
            case ItemID.BlinkrootSeeds:
            case ItemID.DeathweedSeeds:
            case ItemID.WaterleafSeeds:
            case ItemID.FireblossomSeeds:
            case ItemID.ShiverthornSeeds:
                return true;
            default:
                return false;
        }
    }
    private static bool 有平台(Player owner) => 找平台(owner) != null;
    private static Item 找平台(Player owner)
    {
        foreach (Item it in 遍历物品(owner))
        {
            if (it == null || it.IsAir) continue;
            //平台物品：createTile 是平台 tile，或本身就是平台类物品
            if (IsPlatformItem(it.type)) return it;
            if (it.createTile > 0 && it.createTile < Main.tileSolidTop.Length && IsPlatform(it.createTile)) return it;
        }
        return null;
    }
    private static bool IsPlatformItem(int type)
    {
        switch (type)
        {
            case ItemID.WoodPlatform:
            case ItemID.EbonwoodPlatform:
            case ItemID.RichMahoganyPlatform:
            case ItemID.PearlwoodPlatform:
            case ItemID.ShadewoodPlatform:
            case ItemID.BonePlatform:
            case ItemID.BlueBrickPlatform:
            case ItemID.PinkBrickPlatform:
            case ItemID.GreenBrickPlatform:
            case ItemID.GlassPlatform:
            case ItemID.ObsidianPlatform:
            case ItemID.PumpkinPlatform:
            case ItemID.SpookyPlatform:
            case ItemID.MushroomPlatform:
            case ItemID.HoneyPlatform:
            case ItemID.SolarPlatform:
            case ItemID.VortexPlatform:
            case ItemID.NebulaPlatform:
            case ItemID.StardustPlatform:
                return true;
            default:
                return false;
        }
    }
    private static bool 有木头(Player owner) => 找木头(owner) != null;
    private static Item 找木头(Player owner)
    {
        foreach (Item it in 遍历物品(owner))
            if (it != null && !it.IsAir && (it.type == ItemID.Wood || it.type == ItemID.Ebonwood || it.type == ItemID.Shadewood || it.type == ItemID.Pearlwood || it.type == ItemID.RichMahogany || it.type == ItemID.DynastyWood || it.type == ItemID.SpookyWood)) return it;
        return null;
    }

    //== 按生成面积消耗原材料（木头/平台）：从找到的 item 里扣 stack ==
    private static void 消耗原材料(Item it, int amount)
    {
        if (it == null || it.IsAir || amount <= 0) return;
        it.stack -= amount;
        if (it.stack <= 0) it.TurnToAir();
    }

    //酒狐背包(Storage) + 武器槽1/2 + 玩家背包
    private static IEnumerable<Item> 遍历物品(Player owner)
    {
        酒狐玩家 data = owner.GetModPlayer<酒狐玩家>();
        if (data.Weapon != null && !data.Weapon.IsAir) yield return data.Weapon;
        if (data.Weapon2 != null && !data.Weapon2.IsAir) yield return data.Weapon2;
        if (data.Storage != null)
            foreach (Item it in data.Storage)
                if (it != null && !it.IsAir) yield return it;
        if (owner.inventory != null)
            foreach (Item it in owner.inventory)
                if (it != null && !it.IsAir) yield return it;
    }

    private static bool 放入玩家先(Player owner, int itemType, int stack)
    {
        //先在玩家背包找同类型叠加，再找空槽；否则放酒狐背包
        if (owner.inventory != null)
        {
            for (int i = 0; i < owner.inventory.Length; i++)
            {
                Item it = owner.inventory[i];
                if (it != null && !it.IsAir && it.type == itemType && it.stack < it.maxStack)
                { it.stack += stack; return true; }
            }
            for (int i = 0; i < owner.inventory.Length; i++)
            {
                Item it = owner.inventory[i];
                if (it == null || it.IsAir)
                {
                    if (it == null) owner.inventory[i] = new Item();
                    owner.inventory[i].SetDefaults(itemType);
                    owner.inventory[i].stack = stack;
                    return true;
                }
            }
        }
        酒狐玩家 data = owner.GetModPlayer<酒狐玩家>();
        for (int i = 0; i < data.Storage.Length; i++)
        {
            Item it = data.Storage[i];
            if (it == null || it.IsAir)
            {
                if (it == null) data.Storage[i] = new Item();
                data.Storage[i].SetDefaults(itemType);
                data.Storage[i].stack = stack;
                return true;
            }
        }
        return false;
    }

    //==================== 小工具 ====================
    private static Tile SafeTile(int x, int y)
    {
        if (x < 0 || y < 0 || x >= Main.maxTilesX || y >= Main.maxTilesY) return default;
        return Main.tile[x, y];
    }
    private static bool 有Tile(Tile t) => t.HasTile || t.WallType > 0 || t.LiquidAmount > 0;
    private static void 面向点(NPC fox, float x, float y) => 酒狐NPC状态.面向目标X(fox, x);
    private static void 朝X(NPC fox, int x) => 酒狐NPC状态.面向目标X(fox, x * 16f);

    //安全放置/破坏：把 WorldGen 调用包起来，任何异常都不向上抛（避免让酒狐被销毁）
    private static void 安全放置Tile(int x, int y, int tileType, Player owner, int style = 0)
    {
        if (!在界内(x, y)) return;
        try { WorldGen.PlaceTile(x, y, tileType, true, true, owner.whoAmI, style); } catch { }
    }
    private static void 安全放置Wall(int x, int y, int wallType)
    {
        if (!在界内(x, y)) return;
        try { WorldGen.PlaceWall(x, y, wallType, true); } catch { }
    }
    private static void 安全破坏(int x, int y)
    {
        if (!在界内(x, y)) return;
        try { WorldGen.KillTile(x, y, false, false, false); } catch { }
    }

    public static void 玩家伤了酒狐(NPC fox)
    {
        if (恋还是练集.Contains(fox.whoAmI))
        {
            挑衅集.Add(fox.whoAmI);
        }
    }
    //致命保护入口（酒狐侧返回 true 表示已挡下并结束任务）
    public static bool 酒狐致命保护(NPC fox)
    {
        if (!恋还是练集.Contains(fox.whoAmI)) return false;
        恋还是练中招白();
        //保住酒狐：回满血
        fox.life = fox.lifeMax;
        fox.HealEffect(5);
        fox.netUpdate = true;
        结束恋还是练(fox);   //结束任务，恢复友方，短暂无敌
        return true;
    }
    //练功保命（酒狐被致命时）：进入长时间无敌 + 回满血，不结束任务
    public static bool 酒狐练功保命(NPC fox)
    {
        if (!恋还是练集.Contains(fox.whoAmI)) return false;
        恋还是练中招白();
        无敌计时[fox.whoAmI] = 60 * 20;   //20秒长时间无敌
        fox.life = fox.lifeMax;            //回满血
        fox.HealEffect(5);
        fox.netUpdate = true;
        return true;
    }
    //致命保护入口（玩家侧返回 true 表示已挡下并结束任务）
    public static bool 玩家致命保护(Player player)
    {
        NPC fox = 酒狐饰品.找酒狐(player);
        if (fox == null || !恋还是练集.Contains(fox.whoAmI)) return false;
        恋还是练救主白();
        结束恋还是练(fox);
        player.statLife = Math.Max(player.statLife, 1);
        return true;
    }

    //结束“恋还是练”任务：移除任务、清空执行、停用开关、短暂无敌、恢复友方
    private static void 结束恋还是练(NPC fox)
    {
        Player owner = 酒狐NPC状态.GetTargetPlayer(fox);
        List<任务记录> list = owner != null ? 酒狐任务系统.获取列表(owner) : new List<任务记录>();
        任务记录 r = null;
        foreach (任务记录 rec in list)
            if (rec.类型 == 任务类型.恋还是练) { r = rec; break; }
        if (r != null)
        {
            酒狐任务执行.停止任务(owner, r);   //停用开关
            酒狐任务系统.清除执行(owner, r);
            酒狐任务系统.移除任务(owner, r);
        }
        无敌计时[fox.whoAmI] = 60 * 6;   //6秒短暂无敌
        //收回在途的敌对弹幕：任务结束，酒狐弹幕不再打主人（避免后续伤害继续打死玩家）
        foreach (int pi in new List<int>(酒狐攻击.FoxProjectiles))
        {
            if (pi < 0 || pi >= Main.maxProjectiles || !Main.projectile[pi].active) continue;
            Main.projectile[pi].friendly = true;
            Main.projectile[pi].hostile = false;
        }
        if (!Main.dedServ)
            Main.NewText("酒狐：到了结束的时候啦~", new Color(200, 120, 220));
    }

    //酒狐被收入魂符（不在世界）时调用：暂停所有执行中的任务
    public static void 酒狐被收集(Player owner)
    {
        List<任务记录> list = 酒狐任务系统.获取列表(owner);
        foreach (任务记录 r in list)
        {
            if (r.执行中)
            {
                停止任务(owner, r);
                r.执行中 = false;
                r.状态 = "暂停";
                酒狐任务系统.清除执行(owner, r);
            }
        }
    }

    public static bool 近处有水(NPC fox)
    {
        return 在鱼竿范围(fox, out _, out _);
    }

    //酒狐当前是否有战斗目标（用于“先打怪再继续执行任务”）：复用索敌，避免打断战斗
    private static bool 有战斗目标(NPC fox, Player owner)
    {
        return 酒狐攻击.FindTarget(fox, owner) != null || 酒狐攻击.IsInCombat();
    }
}
