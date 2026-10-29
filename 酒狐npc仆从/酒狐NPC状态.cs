using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

public enum 酒狐状态
{
    跟随,
    悠闲,
    坐下
}

public static class 酒狐NPC状态
{
    private const int ModeIndex = 0;
    private const int TargetIndex = 1;
    private const int FollowTimerIndex = 2;
    // localAI[3] 留给酒狐攻击作为AttackCooldownIndex
    // !!! localAI只有0‑3，不能使用4及以上下标！！
    // ai[2] 与回血计时器共用（回血0~180，跳跃次数0~2，用*1000错位存储）

    //距离阈值
    public const float ReturnTriggerDist = 450f;  //超过该距离触发【返回逻辑】
    public const float ReturnExitDist = 200f;     //小于该距离退出返回逻辑
    private const float IdleDistance = 256f;      //悠闲模式活动范围
    private const float FollowStopDist = 120f;    //跟随模式停止距离（更贴近玩家）
    private const float ChaseDistance = 320f;
    private const float TeleportMaxDist = 800f;  //离玩家较远(超出屏幕感) → 立即瞬移（已恢复原数值800）

    //跳跃相关：ai[2] 打包存储（回血计时 + 跳跃次数）
    private const int HealJumpPackIndex = 2;
    private const float JumpPackScale = 1000f;
    public const int MaxConsecutiveJumps = 3;    //最多连跳三次（跳跃能力增强）

    public static 酒狐状态 GetMode(NPC npc)
    {
        return (酒狐状态)(int)npc.localAI[ModeIndex];
    }

    public static string GetName(NPC npc)
    {
        return GetMode(npc) switch
        {
            酒狐状态.跟随 => "跟随",
            酒狐状态.悠闲 => "悠闲",
            _ => "坐下"
        };
    }

    public static Player GetTargetPlayer(NPC npc)
    {
        int targetIndex = (int)npc.localAI[TargetIndex];
        if (targetIndex >= 0 && targetIndex < Main.maxPlayers && Main.player[targetIndex].active)
            return Main.player[targetIndex];
        return Main.LocalPlayer;
    }

    //记录酒狐连续处于“悠闲”模式的 tick 数（用于任务需进入悠闲3秒后才执行）
    private static readonly Dictionary<int, int> laidBackTicks = new();

    //===== 骑扫帚贴身：记录酒狐是否处于“贴到玩家身后”状态 =====
    private static readonly HashSet<int> 扫帚贴身后 = new();
    public static bool 骑扫帚贴身(NPC npc) => 扫帚贴身后.Contains(npc.whoAmI);

    public static bool 玩家骑扫帚(Player p)
    {
        return p != null && p.mount != null && p.mount.Active && p.mount.Type == Terraria.ID.MountID.WitchBroom;
    }

    //酒狐贴到骑扫帚玩家身后：不移动，仅可远程攻击。返回 true 表示本帧在处理。
    private static bool 贴到身后(NPC npc, Player p)
    {
        扫帚贴身后.Add(npc.whoAmI);
        //面向玩家、站稳
        npc.spriteDirection = p.direction;
        面向目标X(npc, p.Center.X);
        npc.velocity = Vector2.Zero;
        return true;
    }

    public static void 清除骑扫帚(NPC npc) => 扫帚贴身后.Remove(npc.whoAmI);
    public static void UpdateLaidBackTicks(NPC npc)
    {
        if (GetMode(npc) == 酒狐状态.悠闲)
        {
            laidBackTicks.TryGetValue(npc.whoAmI, out int t);
            laidBackTicks[npc.whoAmI] = t + 1;
        }
        else
        {
            laidBackTicks.Remove(npc.whoAmI);   //离开悠闲即清零
        }
    }
    //酒狐已连续悠闲满 ticks 帧？进入悠闲3秒(180tick)后才执行任务
    public static bool 已悠闲(NPC npc, int ticks)
    {
        return laidBackTicks.TryGetValue(npc.whoAmI, out int t) && t >= ticks;
    }
    public static void ClearLaidBackTicks(NPC npc) => laidBackTicks.Remove(npc.whoAmI);

    //梦云水晶变身：酒狐目标移动速度+20%（只加成水平目标速度，不缩放velocity本身，避免放大Y/重力导致“飞起来”）
    public static float 跑速(NPC npc, float baseSpeed)
    {
        Player owner = GetTargetPlayer(npc);
        if (owner != null && owner.GetModPlayer<酒狐玩家>().HasDreamCrystalEquipped())
            return baseSpeed * 1.2f;
        return baseSpeed;
    }

    public static void AdvanceMode(NPC npc)
    {
        npc.localAI[ModeIndex] = ((int)GetMode(npc) + 1) % 3;
        npc.localAI[FollowTimerIndex] = 0f;
        if (GetMode(npc) == 酒狐状态.跟随)
            npc.localAI[TargetIndex] = Main.myPlayer;
        npc.netUpdate = true;
    }

    public static void SetFollowTarget(NPC npc, int playerIndex)
    {
        npc.localAI[ModeIndex] = (int)酒狐状态.跟随;
        npc.localAI[TargetIndex] = playerIndex;
        npc.localAI[FollowTimerIndex] = 0f;
        npc.netUpdate = true;
    }

    //==================== 重力兜底 ====================
    //★ 规则：除了“主动起跳/冲刺”的短宽限窗外，酒狐不允许保持【向上】的Y速度。
    //  任何路径只要给出向上的速度而不开宽限窗，下一tick就会被强制改成向下 —— 因此不可能浮空。
    private static readonly Dictionary<int, uint> 上升宽限到 = new();
    private const int 上升宽限帧 = 35;   //一次起跳约24~35tick内上升，够用

    public static void 标记上升宽限(NPC npc, int ticks = 上升宽限帧)
    {
        if (npc == null) return;
        上升宽限到[npc.whoAmI] = Main.GameUpdateCount + (uint)Math.Max(1, ticks);
    }

    public static void 重力兜底(NPC npc)
    {
        if (npc == null) return;
        if (Main.netMode == Terraria.ID.NetmodeID.MultiplayerClient) return;
        if (npc.noGravity) return;
        if (GetMode(npc) == 酒狐状态.坐下) return;          //坐下原地休息
        if (骑扫帚贴身(npc)) return;                        //骑扫帚贴身时由玩家带着走
        if (酒狐攻击.IsDashing(npc)) return;                //冲刺期间由冲刺逻辑接管

        bool 可上升 = 上升宽限到.TryGetValue(npc.whoAmI, out uint until) && Main.GameUpdateCount < until;
        if (!可上升 && npc.velocity.Y < 0.5f)
            npc.velocity.Y = 0.5f;   //至少保持下落
    }

    //==================== 平台穿透 ====================
    //原版平台(Platforms)是“只有上表面实心”的单向方块，玩家可以按↓穿下去，
    //但 NPC 没有按键，默认站在上面下不来。这里做同样的效果：
    //当玩家在酒狐下方超过 玩家在下方格数 格、且酒狐正站在平台上时，
    //把酒狐整体往下挪一格多一点，让它落到平台下面继续下落。
    private const float 玩家在下方格数 = 3f;   //玩家中心比酒狐脚底低这么多格以上才下沉
    private static readonly Dictionary<int, int> 穿平台冷却 = new();   //每格平台的连续下沉间隔（防止一帧下太多）

    public static void 尝试穿过平台(NPC npc, Player player)
    {
        int who = npc.whoAmI;
        if (穿平台冷却.TryGetValue(who, out int cd) && cd > 0)
        {
            穿平台冷却[who] = cd - 1;
            return;
        }
        if (player == null || !player.active) return;
        //必须贴地（站着的状态）
        if (!(npc.collideY && npc.velocity.Y >= 0f)) return;

        float 脚下Y = npc.position.Y + npc.height;
        //玩家要在酒狐下方足够远
        if (player.Center.Y < 脚下Y + 玩家在下方格数 * 16f) return;

        //脚下那一格必须是平台
        int 格X = (int)(npc.Center.X / 16f);
        int 格Y = (int)((脚下Y + 4f) / 16f);
        if (格X < 1 || 格Y < 1 || 格X >= Main.maxTilesX - 1 || 格Y >= Main.maxTilesY - 1) return;
        Tile t = Main.tile[格X, 格Y];
        if (!t.HasTile || !Terraria.ID.TileID.Sets.Platforms[t.TileType]) return;

        //下沉一格多一点点：平台只有上表面实心，脚一旦越过它就不会再被挡住
        npc.position.Y += 18f;
        npc.velocity.Y = 1.2f;
        npc.collideY = false;
        npc.netUpdate = true;
        穿平台冷却[who] = 4;   //每4tick最多沉一格，避免瞬间穿过多层

        if (!Main.dedServ)
        {
            for (int i = 0; i < 4; i++)
            {
                Dust d = Dust.NewDustDirect(npc.position + new Vector2(0f, npc.height - 6f), npc.width, 6,
                    Terraria.ID.DustID.Silver, 0f, 0.6f, 0, default, 0.9f);
                d.noGravity = true;
            }
        }
    }

    // 设定面向目标：仅当横向偏移明显（超过hysteresis像素）才换向。    // 目标/玩家在酒狐正上/正下方时，npc.direction 每tick会在±1间抖动，导致“高频转向/原地乱转”。
    // 用迟滞：横向差不超过阈值就保持当前朝向，消除这种抖动。
    public static void 面向目标X(NPC npc, float targetCenterX, float hysteresis = 10f)
    {
        float delta = targetCenterX - npc.Center.X;
        if (Math.Abs(delta) > hysteresis)
            npc.direction = delta > 0f ? 1 : -1;
    }

    //★【收纳标记】被“魂符/收起”主动收纳的酒狐，不能再被保活逻辑拉回激活。
    //  否则 酒狐玩家.PostUpdate 里那条“血>0却未激活→拉回激活”的保底会立刻把它复活，
    //  表现为“魂符无法回收酒狐”。
    private static readonly HashSet<int> 已收纳 = new();
    public static bool 是已收纳(NPC npc) => npc != null && 已收纳.Contains(npc.whoAmI);
    public static void 清除收纳标记(NPC npc) { if (npc != null) 已收纳.Remove(npc.whoAmI); }

    public static void Store(int npcIndex, int playerIndex)
    {
        if (npcIndex < 0 || npcIndex >= Main.maxNPCs)
            return;
        已收纳.Add(npcIndex);   //记住：这只是“收起来”，不是死亡
        Main.npc[npcIndex].active = false;
        Main.npc[npcIndex].netUpdate = true;
    }

    // 判断：当前是否应该执行返回逻辑（战斗时距离放宽）
    public static bool IsNeedReturnToPlayer(NPC npc)
    {
        Player owner = GetTargetPlayer(npc);
        float distToPlayer = Vector2.Distance(npc.Center, owner.Center);
        return distToPlayer > 酒狐攻击.GetReturnTrigger();
    }

    //========== ai[2] 打包：回血计时器 与 连跳次数 ==========
    public static int GetJumpCount(NPC npc)
    {
        return (int)(npc.ai[HealJumpPackIndex] / JumpPackScale);
    }

    public static void SetJumpCount(NPC npc, int count)
    {
        npc.ai[HealJumpPackIndex] = npc.ai[HealJumpPackIndex] % JumpPackScale + count * JumpPackScale;
    }

    public static float GetHealTimer(NPC npc)
    {
        return npc.ai[HealJumpPackIndex] % JumpPackScale;
    }

    public static void SetHealTimer(NPC npc, float timer)
    {
        npc.ai[HealJumpPackIndex] = (int)(npc.ai[HealJumpPackIndex] / JumpPackScale) * JumpPackScale + timer;
    }

    //========== 通用跳障碍逻辑（跟随/返回/闲逛/战斗通用） ==========
    // 碰到墙或前方有台阶时起跳；最多连跳 MaxConsecutiveJumps 次；
    // 落地后不再被挡就重置连跳次数。
    public static void TryJumpOverObstacle(NPC npc, float jumpSpeed = -7.0f)
    {
        bool onGround = Math.Abs(npc.velocity.Y) < 0.1f || (npc.collideY && npc.velocity.Y >= 0f);
        bool blockedAhead = npc.collideX || IsStepAhead(npc);   //collideX 或 前方台阶检测
        if (blockedAhead && onGround)
        {
            //1格高台阶：直接迈上一格（不跳），两格及以上才跳
            if (TryStepUp(npc))
            {
                SetJumpCount(npc, 0);
                return;
            }
            int jumps = GetJumpCount(npc);
            if (jumps < MaxConsecutiveJumps)
            {
                npc.velocity.Y = jumpSpeed;
                标记上升宽限(npc);   //本次跳跃允许上升
                // 朝当前朝向给一个向上前方强冲量，助其跃上两格高地形
                if (npc.direction != 0)
                    npc.velocity.X = MathHelper.Clamp(npc.velocity.X + npc.direction * 2.5f, -5.5f, 5.5f);
                SetJumpCount(npc, jumps + 1);
            }
        }
        else if (onGround)
        {
            // 落地且前方没有障碍 → 重置连跳计数
            SetJumpCount(npc, 0);
        }
    }

    // 崎岖地形原地踏步：有朝向、已落地、但速度极低且持续片刻（不是在切换模式/刚起步）→ 尝试跳跃越过小凸起
    private static readonly Dictionary<int, int> stepInPlace = new();
    private static void TryJumpIfStuck(NPC npc, float jumpSpeed = -7.2f)
    {
        bool onGround = Math.Abs(npc.velocity.Y) < 0.1f || (npc.collideY && npc.velocity.Y >= 0f);
        bool slow = npc.direction != 0 && onGround && Math.Abs(npc.velocity.X) < 0.25f;
        int cur = stepInPlace.TryGetValue(npc.whoAmI, out int v) ? v : 0;
        if (slow) cur++; else cur = 0;
        stepInPlace[npc.whoAmI] = cur;
        if (cur < 14) return;   //约0.23s才判定原地踏步，避免刚进跟随/切换模式时误跳

        int jumps = GetJumpCount(npc);
        if (jumps < MaxConsecutiveJumps)
        {
            npc.velocity.Y = jumpSpeed;
            标记上升宽限(npc);   //本次跳跃允许上升
            npc.velocity.X = npc.direction * 2.6f;
            SetJumpCount(npc, jumps + 1);
            stepInPlace[npc.whoAmI] = 0;
        }
    }

    //========== 闪避来袭弹幕/威胁（参考幻影伙伴）：预测弹道+风险评分+粘滞 ==========
    // 弹幕预测窗口：用未来位置判定是否会命中，而非只看当前距离。
    private const float 闪避视野 = 1050f;    //敌方弹幕视野
    private const float 威胁视野 = 700f;     //敌方NPC视野
    private const int 预测tick数 = 42;       //预测42帧
    private const int 预测步长 = 3;          //每3帧采样
    private const float 闪避风险阈值 = 70f;  //低于此视为“无可避”
    private static readonly Dictionary<int, Vector2> 闪避方向 = new();       //粘滞：当前采用的闪避方向
    private static readonly Dictionary<int, int> 闪避计划tick = new();       //闪避计划已执行的帧数
    private static readonly Dictionary<int, int> 闪避反跳 = new();           //防抖：换向惩罚
    private static readonly Dictionary<int, int> 闪避传送冷却 = new();       //短距传送冷却（防连闪）
    private const int 闪避传送冷却帧 = 25;   //每次闪避传送后冷却

    // 找一条“即将命中”酒狐的敌对弹幕：距离足够近且弹道朝向酒狐。
    private static Projectile 即将命中弹幕(NPC npc)
    {
        Vector2 me = npc.Center;
        Projectile best = null;
        float bestDist = 70f;   //只处理贴脸即将命中的
        for (int i = 0; i < Main.maxProjectiles; i++)
        {
            Projectile p = Main.projectile[i];
            if (!p.active || p.friendly || p.damage <= 0 || p.hostile != true) continue;
            float d = Vector2.Distance(me, p.Center);
            if (d > 90f) continue;   //太远不必瞬移
            //弹幕朝酒狐方向飞（即将撞上），或其中心已非常贴近
            Vector2 toMe = me - p.Center;
            bool headingIn = p.velocity != Vector2.Zero && Vector2.Dot(p.velocity, toMe) > 0f;
            if (headingIn || d < bestDist)
            {
                if (d < bestDist) { bestDist = d; best = p; }
            }
        }
        return best;
    }

    private static bool CanTeleportDodge(NPC npc)
    {
        //只有跟随/悠闲且非坐下战斗时才允许瞬移躲避；恋还是练/任务期间不瞬移（避免打断对练）
        if (酒狐任务执行.恋还是练激活(npc)) return false;
        return true;
    }

    // 短距闪避传送：朝弹幕垂直方向小段位移，落地站稳。
    private static void 闪避传送(NPC npc, Projectile incoming)
    {
        if (incoming == null) return;
        Vector2 away = npc.Center - incoming.Center;
        if (away == Vector2.Zero) away = new Vector2(npc.direction * 1f, 0f);
        away.Normalize();
        //水平方向尽量小段位移（避开主线），上下微调
        float dist = 90f;
        Vector2 target = npc.Center + new Vector2(away.X * dist, away.Y * 40f);
        //落到安全的实心表面附近：向下找一格可站立处
        int tx = (int)(target.X / 16f);
        int ty = (int)(target.Y / 16f);
        for (int dy = 0; dy < 6; dy++)
        {
            int yy = ty + dy;
            if (yy < 1 || yy >= Main.maxTilesY - 1) break;
            if (SafeTileCompat(tx, yy + 1).HasTile || SafeTileCompat(tx, yy + 1).WallType > 0)
            { target = new Vector2(tx * 16f + 8f, yy * 16f); break; }
        }
        npc.Center = target;
        npc.velocity = Vector2.Zero;
        npc.netUpdate = true;
        闪避传送冷却[npc.whoAmI] = 闪避传送冷却帧;
        //闪烁粒子
        if (!Main.dedServ)
            for (int i = 0; i < 8; i++)
            {
                Dust d = Dust.NewDustPerfect(npc.Center, DustID.Silver, Main.rand.NextVector2Circular(-2f, -2f), 0, new Color(160, 200, 255), 0.8f);
                d.noGravity = true;
            }
    }

    private static Tile SafeTileCompat(int x, int y)
    {
        if (x < 0 || y < 0 || x >= Main.maxTilesX || y >= Main.maxTilesY) return default;
        return Main.tile[x, y];
    }

    public static void 尝试闪避(NPC npc)
    {
        int who = npc.whoAmI;
        //坐下不闪避
        if (GetMode(npc) == 酒狐状态.坐下) return;

        //====闪避短距传送：有敌对弹幕即将命中时，小段位移瞬移躲开（带冷却防连闪）====
        if (闪避传送冷却.TryGetValue(who, out int tc) && tc > 0)
            闪避传送冷却[who] = tc - 1;
        else
            闪避传送冷却.Remove(who);

        if (!闪避传送冷却.ContainsKey(who))
        {
            //找一条即将命中酒狐的敌对弹幕（距其路径很近）
            Projectile incoming = 即将命中弹幕(npc);
            if (incoming != null && CanTeleportDodge(npc))
            {
                闪避传送(npc, incoming);
                return;
            }
        }

        //1) 收集附近敌对弹幕（远离且正远离的忽略）
        Vector2 me = npc.Center;
        var hostiles = new List<Projectile>();
        for (int i = 0; i < Main.maxProjectiles; i++)
        {
            Projectile p = Main.projectile[i];
            if (!p.active || p.friendly || p.damage <= 0 || p.hostile != true) continue;
            if (Vector2.DistanceSquared(me, p.Center) > 闪避视野 * 闪避视野) continue;
            //远离且正远离 → 对我不构成威胁
            Vector2 toMe = me - p.Center;
            if (toMe.LengthSquared() > 320f * 320f && Vector2.Dot(p.velocity, toMe) <= 0f) continue;
            hostiles.Add(p);
        }

        //2) 评估当前方向的风险（0=无威胁）
        float currentRisk = 评估风险(npc, me, hostiles, Vector2.Zero, 预测tick数);

        //3) 没有足够风险 → 清理粘滞并返回
        if (hostiles.Count == 0 || currentRisk < 闪避风险阈值)
        {
            闪避方向.Remove(who);
            闪避计划tick.Remove(who);
            return;
        }

        //4) 为几个候选方向打分（左/右，必要时上跳），选风险最低者
        Vector2 bestDir = Vector2.Zero;
        float bestRisk = float.MaxValue;
        Vector2[] candidates = { new Vector2(-1f, 0f), new Vector2(1f, 0f), new Vector2(0f, -1f) };
        foreach (var c in candidates)
        {
            float r = 评估风险(npc, me, hostiles, c, 预测tick数);
            //反向突变惩罚（防左右抽风）
            if (闪避方向.TryGetValue(who, out Vector2 prev) && prev != Vector2.Zero && Vector2.Dot(normalize(c), normalize(prev)) < -0.2f)
                r += 34f;
            if (r < bestRisk) { bestRisk = r; bestDir = c; }
        }

        //5) 只有当“明显更安全”或“当前计划超时/风险过高”时才换向（粘滞）
        int planTick = 闪避计划tick.TryGetValue(who, out int pt) ? pt : 0;
        bool mustReplace = planTick <= 0 || currentRisk >= 700f;
        bool worthwhile = bestRisk + 22f < currentRisk;
        if (bestDir != Vector2.Zero && (mustReplace || worthwhile))
        {
            闪避方向[who] = Normalize2(bestDir);
            闪避计划tick[who] = Math.Max(16, Math.Min(28, (int)(16 + Main.rand.NextFloat() * 12f)));
        }
        if (!闪避方向.TryGetValue(who, out Vector2 run))
            return;
        闪避计划tick[who] = planTick - 1;

        //★ 冲刺穿刺期间不要用闪避覆盖位移（否则刚启动的突刺会被冲掉，等于“闪避时不能攻击”）
        if (酒狐攻击.IsDashing(npc)) return;

        //★【边躲边打】有攻击目标时，把闪避方向偏转成“绕开弹幕但对目标保持接敌”，
        //  避免一路直线后退到射程外/近战够不着（原来后退=打不到人）。
        int 目标 = 酒狐攻击.CurrentTargetIndex;
        if (目标 >= 0 && 目标 < Main.maxNPCs && Main.npc[目标].active && Main.npc[目标].life > 0)
        {
            Vector2 指向目标 = Main.npc[目标].Center - npc.Center;
            if (指向目标 != Vector2.Zero)
            {
                指向目标.Normalize();
                //把闪避方向里“背离目标”的分量去掉（只保留侧向/纵向绕行）
                float 背向 = -Vector2.Dot(normalize(run), 指向目标);
                if (背向 > 0f)
                    run = Normalize2(run + 指向目标 * (背向 * 1.15f) + new Vector2(打侧向(run, 指向目标), 0f));
                if (run == Vector2.Zero) return;
            }
        }

        //6) 施加闪避移动：朝闪避方向强推；若需向上则起跳
        if (run.X != 0f)
        {
            float max = 4.4f;
            npc.velocity.X = MathHelper.Clamp(npc.velocity.X + run.X * 0.7f, -max, max);
            npc.direction = run.X > 0f ? 1 : -1;
        }
        if (run.Y < 0f && Math.Abs(npc.velocity.Y) < 0.1f)
        {
            npc.velocity.Y = -7.5f;   //威胁在上方 → 起跳闪开（跳得更高）
            标记上升宽限(npc);
        }
    }

    //取与“指向目标”垂直的侧向分量（保证绕行而不是原地不动）
    private static float 打侧向(Vector2 run, Vector2 指向目标)
    {
        float 侧 = run.X >= 0f ? 1f : -1f;
        //目标在正上方/正下方时给一个固定侧移，避免卡住
        if (Math.Abs(指向目标.X) < 0.2f) return 侧 * 0.8f;
        return 侧 * Math.Abs(指向目标.Y) * 0.8f;
    }

    //是否正在闪避（供攻击逻辑放宽射击距离）
    public static bool 正在闪避(NPC npc) => npc != null && 闪避方向.ContainsKey(npc.whoAmI);

    private static Vector2 normalize(Vector2 v) => v == Vector2.Zero ? Vector2.Zero : Vector2.Normalize(v);
    private static Vector2 Normalize2(Vector2 v) => v == Vector2.Zero ? Vector2.Zero : Vector2.Normalize(v);

    // 用候选移动方向评估“未来是否会被击中”的风险
    private static float 评估风险(NPC npc, Vector2 me, List<Projectile> hostiles, Vector2 moveDir, int ticks)
    {
        float risk = 0f;
        //预测未来位置（每 tick 按方向推进，加一点重力衰减以贴近实际）
        for (int t = 3; t <= ticks; t += 预测步长)
        {
            Vector2 future = me;
            if (moveDir != Vector2.Zero)
            {
                //跑：朝方向以最大速度推进
                float runSpeed = Math.Abs(npc.velocity.X) > 2.5f ? 4.4f : 3.2f;
                future += new Vector2(moveDir.X * runSpeed * t, 0f);
                if (moveDir.Y < 0f) future.Y -= 6.2f * t - 0.24f * 0.5f * t * t;  //跳跃抛物线
            }
            else
            {
                future += npc.velocity * t;
            }

            //敌方弹幕
            foreach (Projectile p in hostiles)
            {
                int updates = Math.Max(1, p.extraUpdates + 1);
                float radius = Math.Max(p.width, p.height) * 0.5f + Math.Max(npc.width, npc.height) * 0.45f + 8f;
                Vector2 pc = p.Center + p.velocity * t * updates;
                float dist = Vector2.Distance(future, pc);
                Vector2 pPrev = p.Center + p.velocity * Math.Max(0, t - 预测步长) * updates;
                dist = Math.Min(dist, 点到线段距离(future, pPrev, pc));
                if (dist <= radius) risk += 920f + Math.Min(p.damage, 500) * 1.5f;
                else if (dist < radius + 150f) risk += (radius + 150f - dist) * 0.7f;
            }
        }
        return risk;
    }

    private static float 点到线段距离(Vector2 p, Vector2 a, Vector2 b)
    {
        Vector2 ab = b - a;
        float len = ab.LengthSquared();
        if (len <= 0.0001f) return Vector2.Distance(p, a);
        float t = MathHelper.Clamp(Vector2.Dot(p - a, ab) / len, 0f, 1f);
        return Vector2.Distance(p, a + ab * t);
    }

    // 直接迈上一格高台阶：把酒狐上移1格到台阶上方（前上方1格实心、上面有容身空间即可）
    //★ 修复“无视重力浮空”：原判定只看“前方1格高是实心”，遇到2格以上的墙/悬崖时
    //  每tick都会满足条件 → 每tick上移16px，看起来就是浮空爬墙。
    //  现在要求前方“脚底那一格必须是空的”（即真的是1格高台阶，而不是墙），并且加上迈步间隔。
    private static readonly Dictionary<int, int> 迈步冷却 = new();
    private static bool TryStepUp(NPC npc)
    {
        int dir = npc.direction;
        if (dir == 0) return false;
        if (迈步冷却.TryGetValue(npc.whoAmI, out int cd) && cd > 0) return false;
        int tx = (int)((npc.Center.X + dir * (npc.width / 2f + 4f)) / 16f);
        int groundY = (int)((npc.position.Y + npc.height) / 16f);
        if (tx < 0 || tx >= Main.maxTilesX || groundY < 0 || groundY >= Main.maxTilesY) return false;
        bool stepBlock = Collision.SolidTiles(tx, groundY - 1, tx, groundY - 1);              //前方1格高台阶
        bool wallAtFeet = Collision.SolidTiles(tx, groundY, tx, groundY);                      //前方脚底那格也实心 → 是墙不是台阶
        bool headroom = !Collision.SolidTiles(tx, groundY - 3, tx, groundY - 2);               //上面有容身空间
        if (!stepBlock || wallAtFeet || !headroom) return false;
        npc.position.Y -= 16f;   //迈上一格
        npc.velocity.Y = 0f;
        迈步冷却[npc.whoAmI] = 8;   //每次迈步后至少间隔8tick
        return true;
    }

    // 前瞻检测：酒狐朝向前方、脚底上方1~2格是否有"实心阻挡块"
    // 用 Collision.SolidTiles（游戏真实碰撞判定），排除树木/灌木/背景装饰等不挡路的前景块
    private static bool IsStepAhead(NPC npc)
    {
        int dir = npc.direction;
        if (dir == 0) return false;
        int tx = (int)((npc.Center.X + dir * (npc.width / 2f + 4f)) / 16f);
        int groundY = (int)((npc.position.Y + npc.height) / 16f);
        if (tx < 0 || tx >= Main.maxTilesX || groundY < 0 || groundY >= Main.maxTilesY) return false;
        return Collision.SolidTiles(tx, groundY - 2, tx, groundY - 1);
    }

    // 判断是否被高处障碍彻底卡住（连跳次数用尽仍卡墙）
    public static bool IsStuckOnObstacle(NPC npc)
    {
        return GetJumpCount(npc) >= MaxConsecutiveJumps && npc.collideX && Math.Abs(npc.velocity.Y) < 0.1f;
    }

    //==== 拾取：悠闲主动找钱币/星星，其余模式路过即捡 ====
    private static bool IsCoin(int type)
    {
        return type == Terraria.ID.ItemID.CopperCoin || type == Terraria.ID.ItemID.SilverCoin
            || type == Terraria.ID.ItemID.GoldCoin || type == Terraria.ID.ItemID.PlatinumCoin;
    }
    private static bool IsStar(int type) => type == Terraria.ID.ItemID.FallenStar;

    //找视野内（约260px、无遮挡）最近的可拾取物（钱币或星星），返回 Main.item 索引
    public static int FindPickupInView(NPC npc)
    {
        int best = -1; float closest = 260f;
        for (int i = 0; i < Main.item.Length; i++)
        {
            Item p = Main.item[i];
            if (!p.active || p.IsAir || !(IsCoin(p.type) || IsStar(p.type))) continue;
            float d = Vector2.Distance(npc.Center, p.Center);
            if (d < closest && Collision.CanHit(npc.position, npc.width, npc.height, p.position, p.width, p.height))
            {
                closest = d; best = i;
            }
        }
        return best;
    }

    //被动拾取：路过的钱币/星星直接捡起（所有模式调用；可由配置关闭）
    public static void CollectNearbyPickups(NPC npc, Player player)
    {
        if (!酒狐任务配置.拾取开关()) return;   //配置关闭则不拾取
        for (int i = 0; i < Main.item.Length; i++)
        {
            Item p = Main.item[i];
            if (!p.active || p.IsAir) continue;
            if (Vector2.Distance(npc.Center, p.Center) > 60f) continue;
            if (IsCoin(p.type)) PickUpCoin(player, i, p);
            else if (IsStar(p.type)) PickUpStar(player, i, p);
        }
    }

    private static void PickUpCoin(Player player, int itemIndex, Item coin)
    {
        //优先进入玩家的钱币槽（inventory[50..53]：铜/银/金/铂金）参与堆叠
        if (TryAddToCoinSlot(player, coin))
        {
            Main.item[itemIndex].active = false;
            return;
        }
        //可靠路径：优先进玩家背包（可见不消失）→ 存钱罐 → 酒狐背包
        if (!TryAddToPlayerInventory(player, coin))
        {
            if (!TryAddToBank(player, coin))
                TryAddToStorage(player, coin);
        }
        Main.item[itemIndex].active = false;
    }

    //把一枚钱币尝试放进玩家的钱币槽（inventory[50..53]），按类型堆叠。
    private static bool TryAddToCoinSlot(Player player, Item coin)
    {
        if (player.inventory == null || player.inventory.Length < 54) return false;
        int slot = coin.type switch
        {
            Terraria.ID.ItemID.CopperCoin => 50,
            Terraria.ID.ItemID.SilverCoin => 51,
            Terraria.ID.ItemID.GoldCoin => 52,
            Terraria.ID.ItemID.PlatinumCoin => 53,
            _ => -1
        };
        if (slot < 0) return false;
        Item coinSlot = player.inventory[slot];
        if (coinSlot == null || coinSlot.IsAir)
        {
            if (coinSlot == null) player.inventory[slot] = new Item();
            player.inventory[slot].SetDefaults(coin.type);
            player.inventory[slot].stack = coin.stack;
            return true;
        }
        if (coinSlot.type == coin.type && coinSlot.stack < coinSlot.maxStack)
        {
            coinSlot.stack += coin.stack;
            if (coinSlot.stack > coinSlot.maxStack) coinSlot.stack = coinSlot.maxStack;
            return true;
        }
        return false;
    }

    private static void PickUpStar(Player player, int itemIndex, Item star)
    {
        //优先级：玩家背包 → 酒狐背包
        if (!TryAddToPlayerInventory(player, star))
            TryAddToStorage(player, star);
        Main.item[itemIndex].active = false;
    }

    private static bool TryAddToBank(Player player, Item coin)
    {
        for (int i = 0; i < player.bank.item.Length; i++)
        {
            Item slot = player.bank.item[i];
            if (slot == null || slot.IsAir) { player.bank.item[i] = coin.Clone(); return true; }
            if (slot.type == coin.type && slot.stack < slot.maxStack) { slot.stack += coin.stack; return true; }
        }
        return false;
    }

    private static bool TryAddToPlayerInventory(Player player, Item item)
    {
        for (int i = 0; i < player.inventory.Length; i++)
        {
            Item slot = player.inventory[i];
            if (slot == null || slot.IsAir) { player.inventory[i] = item.Clone(); return true; }
            if (slot.type == item.type && slot.stack < slot.maxStack) { slot.stack += item.stack; return true; }
        }
        return false;
    }

    private static void TryAddToStorage(Player player, Item item)
    {
        Item[] storage = player.GetModPlayer<酒狐玩家>().Storage;
        for (int i = 0; i < storage.Length; i++)
        {
            if (storage[i] == null || storage[i].IsAir) { storage[i] = item.Clone(); return; }
            if (storage[i].type == item.type && storage[i].stack < storage[i].maxStack) { storage[i].stack += item.stack; return; }
        }
    }

    //===== 投蛋糕：玩家未满血时，每隔一段时间朝玩家扔一块治愈蛋糕 =====
    private static readonly Dictionary<int, int> cakeTimer = new();
    private static readonly string[] 蛋糕台词 = {
        "酒狐：给你块蛋糕，快补补身子~",
        "酒狐：吃块蛋糕回回血吧！",
        "酒狐：饿坏了吧？来块蛋糕~",
        "酒狐：甜的东西最治愈啦~",
        "酒狐：给你带了一块小蛋糕哦~"
    };

    // 每tick调用：玩家未满血则累计计时，到 1680tick(28秒) 扔一块蛋糕；满血则清空计时。
    public static void 更新投蛋糕(NPC npc, Player player)
    {
        if (npc == null || player == null) return;
        int who = npc.whoAmI;

        //玩家满血 → 不扔，清零（下次受损重新计时）
        if (player.statLife >= player.statLifeMax2)
        {
            cakeTimer.Remove(who);
            return;
        }
        //受伤；服务端执行（SP 即服务端）
        if (Main.netMode == Terraria.ID.NetmodeID.MultiplayerClient) return;

        int t = cakeTimer.TryGetValue(who, out int v) ? v + 1 : 1;
        cakeTimer[who] = t;
        if (t >= 1680)   //约28秒
        {
            cakeTimer[who] = 0;
            扔蛋糕(npc, player);
        }
    }

    private static void 扔蛋糕(NPC npc, Player player)
    {
        if (npc == null || player == null) return;
        //从酒狐手中抛向玩家，可穿墙，旋转
        Vector2 from = npc.Center + new Vector2(npc.direction * 16f, -6f);
        Vector2 to = player.Center - from;
        if (to == Vector2.Zero) return;
        to.Normalize();
        to *= 13f;   //飞行速度
        int proj = Terraria.Projectile.NewProjectile(npc.GetSource_FromAI(), from, to,
            ModContent.ProjectileType<蛋糕弹>(), 0, 0f, player.whoAmI);
        if (proj >= 0 && proj < Main.maxProjectiles && Main.projectile[proj] != null)
        {
            Main.projectile[proj].timeLeft = 180;
            Main.projectile[proj].netUpdate = true;
        }
        if (!Main.dedServ)
            酒狐头顶文本.直接说话(npc, 蛋糕台词[Main.rand.Next(蛋糕台词.Length)]);
    }

    public static void 重置投蛋糕(NPC npc)
    {
        if (npc != null) cakeTimer.Remove(npc.whoAmI);
    }

    //===== 酒狐闲聊：boss夸奖 + 讨要食物 =====
    private static readonly Dictionary<int, int> 夸奖冷却 = new();    //按酒狐 whoAmI
    private static readonly Dictionary<int, int> 讨食冷却 = new();    //按酒狐 whoAmI
    private static readonly string[] 夸奖台词 = {
        "酒狐：主人好厉害！BOSS就这么被你打败啦~",
        "酒狐：哇！主人太强了，帅呆了！",
        "酒狐：不愧是主人，三两下就解决啦！",
        "酒狐：主人刚刚那几下好酷啊！",
        "酒狐：哼哼，这种BOSS根本不是主人的对手！"
    };
    private static readonly string[] 讨食台词 = {
        "酒狐：主人身上是不是有好吃的呀？",
        "酒狐：好想也分一口吃的呀~",
        "酒狐：闻到了香香的味道……可以分我一点吗？"
    };

    //每tick调用：夸奖/讨食冷却计时。
    //战斗中（含脱战后5s等待期）统一暂停：由 酒狐头顶文本 的“计时门”决定，计时值保持不变。
    public static void 更新闲聊冷却(NPC npc)
    {
        if (npc == null) return;
        if (!酒狐头顶文本.台词计时器可走(npc)) return;

        if (夸奖冷却.TryGetValue(npc.whoAmI, out int k) && k > 0) 夸奖冷却[npc.whoAmI] = k - 1;
        if (讨食冷却.TryGetValue(npc.whoAmI, out int b) && b > 0) 讨食冷却[npc.whoAmI] = b - 1;
    }

    //玩家打死boss → 酒狐夸奖（间隔≥100s=6000tick；台词改在【头顶】显示）
    public static void 酒狐夸奖Boss(NPC fox)
    {
        if (fox == null || !fox.active) return;
        if (Main.netMode == Terraria.ID.NetmodeID.MultiplayerClient) return;
        if (夸奖冷却.TryGetValue(fox.whoAmI, out int k) && k > 0) return;   //仍冷却中
        夸奖冷却[fox.whoAmI] = 100 * 60;   //100s
        if (!Main.dedServ)
            酒狐头顶文本.直接说话(fox, 夸奖台词[Main.rand.Next(夸奖台词.Length)]);
    }

    //玩家背包有食物 → 酒狐委婉讨要（间隔≥80s=4800tick；被喂食后重置倒计时）
    //台词改成在【头顶】显示（走排队系统，遵守≥20s间隔）
    public static void 讨要食物(NPC fox, Player player)
    {
        if (fox == null || player == null || !fox.active) return;
        if (Main.netMode == Terraria.ID.NetmodeID.MultiplayerClient) return;
        if (讨食冷却.TryGetValue(fox.whoAmI, out int b) && b > 0) return;   //仍冷却中
        if (!玩家背包有食物(player)) return;
        讨食冷却[fox.whoAmI] = 80 * 60;   //80s
        酒狐头顶文本.排队说话(fox, 讨食台词[Main.rand.Next(讨食台词.Length)]);
    }

    //被喂食后：把讨食倒计时重置为满 80s（重新计时，而不是立即再讨要）
    public static void 重置讨食(NPC fox)
    {
        if (fox != null) 讨食冷却[fox.whoAmI] = 80 * 60;
    }

    private static bool 玩家背包有食物(Player player)
    {
        foreach (Item it in player.inventory)
            if (it != null && !it.IsAir && it.buffType > 0) return true;
        return false;
    }

    //===== 寻宝提醒：玩家附近出现自然宝箱/生命水晶/生命果 → 提醒（间隔见 寻宝提醒间隔），概率赐予寻宝buff30s =====
    private static readonly Dictionary<int, int> 寻宝提醒冷却 = new();
    //寻宝提醒间隔：原来300s(5分钟)，现加长为600s(10分钟)
    private const int 寻宝提醒间隔 = 600 * 60;
    //玩家放置/开启过的箱子位置（视作“熟悉”的，不再当自然宝箱提醒）
    private static readonly HashSet<long> 已知箱子 = new();
    private static readonly string[] 寻宝台词 = {
        "酒狐：主人，那边好像有宝箱！",
        "酒狐：我闻到宝藏的味道了，就在附近！",
        "酒狐：闪闪发光的好东西在那边哦~",
        "酒狐：这里有宝箱的气息！"
    };

    //记录玩家开启过的箱子（避免把玩家自己放的箱子当自然宝箱）
    public static void 记录已开箱子(int x, int y)
        => 已知箱子.Add((long)x * 100000 + y);

    private static bool 是已知箱子(int x, int y)
        => 已知箱子.Contains((long)x * 100000 + y);

    //每tick调用：冷却衰减 + 检测
    //冷却计时受“计时门”约束：战斗中 / 脱战后5s内暂停（计时值保持不变）
    public static void 更新寻宝提醒(NPC fox, Player player)
    {
        if (fox == null || player == null) return;
        if (Main.netMode == Terraria.ID.NetmodeID.MultiplayerClient) return;
        if (寻宝提醒冷却.TryGetValue(fox.whoAmI, out int cd) && cd > 0)
        {
            if (酒狐头顶文本.台词计时器可走(fox))
                寻宝提醒冷却[fox.whoAmI] = cd - 1;
            return;
        }
        if (!扫描到宝藏(fox, player)) return;

        寻宝提醒冷却[fox.whoAmI] = 寻宝提醒间隔;
        if (!Main.dedServ)
        {
            //台词改在【头顶】显示
            酒狐头顶文本.直接说话(fox, 寻宝台词[Main.rand.Next(寻宝台词.Length)]);
            //概率(60%)赐予寻宝buff 30s（Spelunker：显示宝藏/矿石）
            if (Main.rand.NextFloat() < 0.60f)
                player.AddBuff(Terraria.ID.BuffID.Spelunker, 30 * 60);
        }
    }

    private static bool 扫描到宝藏(NPC fox, Player player)
    {
        int cx = (int)(player.Center.X / 16f);
        int cy = (int)(player.Center.Y / 16f);
        int radius = (int)(MathHelper.Max(Main.screenWidth, Main.screenHeight) / 2f / 16f);   //屏幕大小范围
        for (int dx = -radius; dx <= radius; dx++)
        {
            for (int dy = -radius; dy <= radius; dy++)
            {
                int x = cx + dx, y = cy + dy;
                if (x < 1 || y < 1 || x >= Main.maxTilesX - 1 || y >= Main.maxTilesY - 1) continue;
                Tile t = Main.tile[x, y];
                if (!t.HasTile) continue;
                int type = t.TileType;
                //自然宝箱（含生命水晶/生命果所在的地上容器与矿石）；玩家放置/开过的不算自然宝箱
                if ((type == Terraria.ID.TileID.Containers || type == Terraria.ID.TileID.FakeContainers) && !是已知箱子(x, y))
                    return true;
                if (type == Terraria.ID.TileID.Heart || type == Terraria.ID.TileID.LifeFruit)
                    return true;
            }
        }
        return false;
    }

    // 瞬移到玩家身边（用于卡墙脱困 + 距离过远瞬移）
    public static void TeleportToPlayer(NPC npc, Player player)
    {
        npc.Center = player.Center + new Vector2(player.direction * 40f, -30f);
        npc.velocity = Vector2.Zero;
        SetJumpCount(npc, 0);
        npc.netUpdate = true;
    }

    // 卡住检测：有移动意图但位置长时间不变 → 瞬移脱困（覆盖非 collideX 类型的卡住）
    private static readonly Dictionary<int, Vector2> stuckPos = new();
    private static readonly Dictionary<int, int> stuckTimer = new();
    private static void TryUnstick(NPC npc, Player player)
    {
        Vector2 cur = npc.position;
        // 有移动意图：速度略大，或确实想回玩家身边（即使原地抖动也应视为“想走”）
        bool wantsToMove = Math.Abs(npc.velocity.X) > 0.15f || IsNeedReturnToPlayer(npc);
        if (stuckPos.TryGetValue(npc.whoAmI, out Vector2 last))
        {
            float moved = Vector2.Distance(cur, last);
            if (moved > 0.5f)
            {
                stuckTimer[npc.whoAmI] = 0;     //有进展
            }
            else if (wantsToMove)
            {
                int t = stuckTimer.TryGetValue(npc.whoAmI, out int v) ? v + 1 : 1;
                stuckTimer[npc.whoAmI] = t;
                if (t > 120)                    //约2秒没进展 → 瞬移脱困
                {
                    TeleportToPlayer(npc, player);
                    stuckTimer[npc.whoAmI] = 0;
                }
            }
            else
            {
                stuckTimer[npc.whoAmI] = 0;     //站着不动（非卡住）
            }
        }
        stuckPos[npc.whoAmI] = cur;
    }

    public static void Update(NPC npc)
    {
        if (Main.netMode == Terraria.ID.NetmodeID.MultiplayerClient)
            return;

        if (迈步冷却.TryGetValue(npc.whoAmI, out int stepCd) && stepCd > 0) 迈步冷却[npc.whoAmI] = stepCd - 1;

        //【坐下：与玩家彻底无关】不拾取、不瞬移、不跟随，原地休息
        if (GetMode(npc) == 酒狐状态.坐下)
        {
            npc.velocity = Vector2.Zero;
            return;
        }

        //==== 平台穿透：玩家在酒狐下方一定距离时，让酒狐从平台上“沉”下去 ====
        //（原版平台是单向实心，NPC 没有“按下键”，默认只会站在上面下不来）
        尝试穿过平台(npc, GetTargetPlayer(npc));

        //【悠闲：与玩家彻底无关】不瞬移、不跟随、不返回，只在自己的活动范围附近走动/拾取
        //（高超优先级拦截：无论酒狐跑到多远离玩家，悠闲模式都不被拉回/传送）
        if (GetMode(npc) == 酒狐状态.悠闲)
        {
            Player leisurePlayer = GetTargetPlayer(npc);
            //路过捡钱/星星
            CollectNearbyPickups(npc, leisurePlayer);
            LeisureWander(npc, leisurePlayer);
            return;
        }

        //【跟随 + 玩家骑女巫扫帚】酒狐立刻贴到玩家身后，不移动；仅可远程攻击
        Player followOwner = GetTargetPlayer(npc);
        if (GetMode(npc) == 酒狐状态.跟随 && followOwner != null && 玩家骑扫帚(followOwner))
        {
            贴到身后(npc, followOwner);
            return;
        }

        //【超出屏幕外/离玩家太远 → 立即瞬移到玩家身边】（跟随适用）
        Player farOwner = GetTargetPlayer(npc);
        bool offScreen = false;
        if (!Main.dedServ)
        {
            //★ 出屏瞬移：余量已恢复原数值 0（刚出屏幕就瞬移回来）
            Vector2 sp = npc.Center - Main.screenPosition;
            const float margin = 0f;
            offScreen = sp.X < -margin || sp.X > Main.screenWidth + margin
                     || sp.Y < -margin || sp.Y > Main.screenHeight + margin;
        }
        if (offScreen || Vector2.Distance(npc.Center, farOwner.Center) > TeleportMaxDist)
        {
            TeleportToPlayer(npc, farOwner);
            return;
        }

        //路过捡钱/星星（跟随/悠闲模式拾取）
        CollectNearbyPickups(npc, farOwner);

        酒狐状态 outerMode = GetMode(npc);
        // ============ 统一优先级：返回 > 战斗 > 拾取 > 悠闲（悠闲/跟随都适用） ============
        Player owner = GetTargetPlayer(npc);
        if (!owner.active)
        {
            npc.localAI[ModeIndex] = (int)酒狐状态.悠闲;
            npc.netUpdate = true;
            return;
        }
        float distToPlayer = Vector2.Distance(npc.Center, owner.Center);

        //【1 返回：最高优先级，距离超限立即返回，无视战斗/悠闲】（战斗时距离放宽）
        if (distToPlayer > 酒狐攻击.GetReturnTrigger())
        {
            float speedReturn = 跑速(npc, 5.8f);
            面向目标X(npc, owner.Center.X);
            float desiredVelX = npc.direction * speedReturn;
            npc.velocity.X = MathHelper.Clamp(npc.velocity.X + Math.Sign(desiredVelX - npc.velocity.X) * 0.22f, -speedReturn, speedReturn);

            if (owner.Center.Y > npc.Center.Y + npc.height)
            {
                //★ 只给向下的加速；向上的位移一律交给起跳与重力，避免“无视重力浮空”
                npc.velocity.Y = MathHelper.Clamp(npc.velocity.Y + 0.13f, -2.2f, 3.2f);
            }
            TryJumpOverObstacle(npc, -7.2f);
            if (IsStuckOnObstacle(npc))
            {
                TeleportToPlayer(npc, owner);
                return;
            }
            TryUnstick(npc, owner);
            return;   //返回优先，跳过战斗/悠闲
        }

        //【2 战斗：存在有效敌人 → 交给酒狐攻击.Update（不执行悠闲，避免朝向冲突）】
        NPC combatTarget = 酒狐攻击.FindTarget(npc, owner);
        if (combatTarget != null)
        {
            return;
        }

        //【3/4 拾取 + 悠闲：无敌人时在玩家附近走动/找金币】
        if (outerMode == 酒狐状态.悠闲 || distToPlayer < 酒狐攻击.GetFollowBoundary())
        {
            //跟随模式贴近玩家：站到玩家身侧偏移点，而非全程悠闲（更贴身）
            if (outerMode == 酒狐状态.跟随 && distToPlayer < 酒狐攻击.GetFollowBoundary())
            {
                贴近玩家(npc, owner);
                return;
            }
            LeisureWander(npc, owner);
            return;
        }

        //【追赶玩家：离玩家较远但未到返回距离 → 走向玩家保持贴近】
        {
            float desiredSpeed = 跑速(npc, distToPlayer > ChaseDistance ? 4.2f : 3.4f);
            面向目标X(npc, owner.Center.X, 24f);
            float desiredVelocityX = npc.direction * desiredSpeed;
            npc.velocity.X = MathHelper.Clamp(npc.velocity.X + Math.Sign(desiredVelocityX - npc.velocity.X) * 0.17f, -desiredSpeed, desiredSpeed);

            if (owner.Center.Y > npc.Center.Y + npc.height)
            {
                //★ 同上：只向下加速，向上交给起跳/重力
                npc.velocity.Y = MathHelper.Clamp(npc.velocity.Y + 0.12f, -2.4f, 3.4f);
            }
            TryJumpOverObstacle(npc);
            TryJumpIfStuck(npc);   //崎岖地形原地踏步则跳跃
            if (IsStuckOnObstacle(npc))
            {
                TeleportToPlayer(npc, owner);
                return;
            }
            TryUnstick(npc, owner);
        }
    }

    //===== 跟随模式贴近玩家：站在玩家身侧偏移点（参考幻影伙伴 FollowOwner）=====
    private static readonly Dictionary<int, int> 贴近侧边计时 = new();
    private static void 贴近玩家(NPC npc, Player owner)
    {
        //玩家站在主人一侧偏后，贴近但不重叠
        float sideOffset = 56f;   //身侧偏移（像素）
        if (贴近侧边计时.TryGetValue(npc.whoAmI, out int st) && st > 0)
            贴近侧边计时[npc.whoAmI] = st - 1;
        else
            贴近侧边计时[npc.whoAmI] = Main.rand.Next(30, 121);   //随机延迟后再换边

        float side = -owner.direction;   //站在主人身后一侧
        Vector2 standPoint = owner.Center + new Vector2(side * sideOffset, 0f);
        Vector2 offset = standPoint - npc.Center;

        //到位门限：水平在 ±40px 内、垂直 ±60px 内 → 站定
        if (Math.Abs(offset.X) <= 40f && Math.Abs(offset.Y) <= 60f)
        {
            npc.velocity.X *= 0.75f;
            if (Math.Abs(npc.velocity.X) < 0.1f) npc.velocity.X = 0f;
            面向目标X(npc, owner.Center.X, 24f);
            return;
        }

        float speed = 跑速(npc, 3.4f);
        面向目标X(npc, standPoint.X, 16f);
        npc.velocity.X = MathHelper.Clamp(npc.velocity.X + Math.Sign(offset.X) * 0.18f, -speed, speed);

        //==== 垂直跟随：玩家在平台上/上方 → 酒狐跳上去；玩家在下方 → 顺势下落 ====
        float vDelta = owner.Center.Y - npc.Center.Y;   // >0 玩家在下，<0 玩家在上
        if (Math.Abs(vDelta) > npc.height * 0.6f)
        {
            bool onGround = Math.Abs(npc.velocity.Y) < 0.1f || (npc.collideY && npc.velocity.Y >= 0f);
            if (vDelta < 0f)
            {
                //玩家在上方（高台/平台）→ 起跳追上去。
                //★ 跳跃能力增强：着地起跳更高(-8.8)；空中还能再踩两脚“空中跳”
                //  （是有限次数的跳跃，不是每tick给推力，所以不算无视重力悬停）
                if (onGround)
                {
                    npc.velocity.Y = -8.8f;
                    SetJumpCount(npc, 1);
                    标记上升宽限(npc, 45);   //本次跳跃允许上升
                }
                else if (GetJumpCount(npc) < 3 && npc.velocity.Y > -1.5f)
                {
                    npc.velocity.Y = -8.0f;   //空中跳（最多再2次）
                    SetJumpCount(npc, GetJumpCount(npc) + 1);
                    标记上升宽限(npc, 40);
                    if (!Main.dedServ)
                    {
                        for (int i = 0; i < 6; i++)
                        {
                            Dust d = Dust.NewDustPerfect(npc.position + new Vector2(Main.rand.NextFloat(npc.width), npc.height),
                                DustID.Silver, new Vector2(Main.rand.NextFloat(-1.5f, 1.5f), Main.rand.NextFloat(0.5f, 2f)),
                                0, new Color(200, 225, 255), 1.0f);
                            d.noGravity = true;
                        }
                    }
                }
            }
            else
            {
                //玩家在下方 → 往下落，穿平台时主动按“下”让平台能穿过（防卡）
                npc.velocity.Y = MathHelper.Clamp(npc.velocity.Y + 0.25f, -2.6f, 4.5f);
            }
        }
        else if (offset.Y > npc.height)
        {
            //一般高差：只给【向下】的轻微加速；向上不再额外推力（交给起跳+重力，避免无视重力）
            npc.velocity.Y = MathHelper.Clamp(npc.velocity.Y + 0.12f, -2.4f, 3.2f);
        }
        TryJumpOverObstacle(npc);
        if (IsStuckOnObstacle(npc))
        {
            TeleportToPlayer(npc, owner);
            return;
        }
    }

    //悠闲逻辑：酒狐与玩家无关，自己在原地附近走走停停（不朝玩家移动，避免高频转向）
    private static void LeisureWander(NPC npc, Player player)
    {
        //走走停停周期（与玩家无关，每150tick换向，中等速度）
        npc.localAI[FollowTimerIndex]++;
        if (npc.localAI[FollowTimerIndex] > 600f) npc.localAI[FollowTimerIndex] -= 600f;
        int cycle = ((int)npc.localAI[FollowTimerIndex] / 150) % 4;   //0右 1左 2右 3停
        float dirSign = cycle == 0 ? 1f : (cycle == 1 ? -1f : (cycle == 2 ? 1f : 0f));

        float speed = 跑速(npc, 1.8f);
        if (dirSign == 0f)
        {
            //停下休息：保持当前朝向不翻转
            npc.velocity.X *= 0.9f;
            if (Math.Abs(npc.velocity.X) < 0.12f) npc.velocity.X = 0;
            return;
        }
        npc.direction = dirSign > 0 ? 1 : -1;
        npc.velocity.X = MathHelper.Clamp(npc.velocity.X + npc.direction * 0.05f, -speed, speed);
        TryJumpOverObstacle(npc);

        //闲逛撞到高墙卡住 → 瞬移回玩家身边脱困
        if (IsStuckOnObstacle(npc))
        {
            TeleportToPlayer(npc, player);
            return;
        }
        //想动却长时间没进展 → 瞬移脱困
        TryUnstick(npc, player);
    }
}
