using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Terraria;
using Terraria.Audio;
using Terraria.DataStructures;
using Terraria.GameContent;
using Terraria.ID;
using Terraria.Localization;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

internal static class 酒狐攻击
{
    private const int AttackCooldownIndex = 3;
    internal const int DashTimerIndex = 3;

    //酒狐发射出的弹幕索引集合 + 当前攻击目标（供 酒狐弹幕修正 朝目标导航）
    internal static readonly HashSet<int> FoxProjectiles = new HashSet<int>();
    internal static int CurrentTargetIndex = -1;

    //战斗状态：距上次发现目标的tick数（脱战2秒=120tick后恢复）
    private static int combatTimer = int.MaxValue;
    internal static bool IsInCombat() => combatTimer < 120;
    internal static float GetFollowBoundary() => IsInCombat() ? 420f : 200f;   //战斗时26格(420px)，脱战13格(200px)，更贴身
    internal static float GetFindRange() => IsInCombat() ? 900f : 600f;         //寻敌范围提升
    //★ 需回到玩家身边的距离限制（已放宽：战斗1100px≈68格 / 脱战900px≈56格；原来只有512/400）
    internal static float GetReturnTrigger() => IsInCombat() ? 1100f : 900f;

    //战斗参数
    private const float MeleeAttackRange = 55f;   //近战基础攻击距离
    private const float RangedMinDist = 140f;     //远程：低于此距离后退
    private const float RangedMaxDist = 380f;     //远程：高于此距离靠近
    private const float RangedFireRange = 520f;   //远程：超出此距离不射击

    //==================== 近战距离/判定：随武器贴图大小变化 ====================
    private static int 武器贴图尺寸(Item weapon)
    {
        if (weapon == null || weapon.IsAir) return 0;
        int t = weapon.type;
        if (t <= 0 || t >= TextureAssets.Item.Length) return 0;
        Texture2D tex = TextureAssets.Item[t].Value;
        if (tex == null) return 0;
        return Math.Max(tex.Width, tex.Height);
    }

    //近战攻击距离：基础55 + 贴图越大越远（40px→69，60px→76）
    internal static float 近战攻击距离(Player owner)
        => MeleeAttackRange + 武器贴图尺寸(owner?.GetModPlayer<酒狐玩家>().当前武器) * 0.35f;

    //近战“判定箱”半径：酒狐半身 + 武器贴图尺寸的一部分（大武器判定更大）
    internal static float 近战判定半径(Player owner)
    {
        int 尺寸 = 武器贴图尺寸(owner?.GetModPlayer<酒狐玩家>().当前武器);
        return 24f + Math.Max(尺寸, 24) * 0.35f;
    }

    //==================== 武器槽（远近自动切换）====================
    private const float 近身切换距离 = 150f;   //敌人贴脸 → 切近战
    private const float 远程切换距离 = 320f;   //敌人变远 → 切远程
    private static readonly Dictionary<int, int> 远程换枪计时 = new();   //定期随机切换远程武器
    private static readonly Dictionary<int, int> 交叉射击冷却 = new();

    internal static bool 是远程武器(Item it)
        => !it.IsAir && it.type != ItemID.LastPrism
           && (it.DamageType == DamageClass.Ranged || it.DamageType == DamageClass.Magic);

    internal static bool 是近战武器(Item it)
        => !it.IsAir && !是远程武器(it) && it.damage > 0;

    //在武器槽里找一个指定类型的武器槽（返回槽号，-1=没有）
    private static int 找武器槽(酒狐玩家 data, bool 要远程)
    {
        int 数量 = data.武器槽数量;
        for (int i = 0; i < 数量; i++)
        {
            Item it = data.槽武器(i);
            if (要远程 ? 是远程武器(it) : 是近战武器(it)) return i;
        }
        return -1;
    }

    //============ 法术超限：额外武器攻击的强化 ============
    //  频率 +100%（冷却减半 / 概率翻倍）、伤害 +20%、可同时调用的武器更多
    private static bool 超限(Player owner) => 法术超限.已装备(owner);
    private static float 额外攻击伤害倍率(Player owner) => 超限(owner) ? 1.2f : 1f;

    //按“目标距离 + 当前手持武器”决定用哪把。
    //前提：必须先确认武器槽里确实有那类武器，否则不主动切换（保持当前手持）。
    //酒狐的近战/远程逻辑与贴图渲染只与【当前手持武器】有关。
    private static void 选择武器(NPC npc, 酒狐玩家 data, float distance)
    {
        int who = npc.whoAmI;
        Item cur = data.当前武器;
        bool 当前是远程 = 是远程武器(cur);

        //1) 敌人近身 → 有近战武器就换成近战
        if (distance <= 近身切换距离)
        {
            if (是近战武器(cur)) return;                       //已经是近战，不动
            int slot = 找武器槽(data, 要远程: false);
            if (slot >= 0 && slot != data.当前武器槽)
            {
                data.切换武器槽(slot);
                远程换枪计时.Remove(who);
                npc.netUpdate = true;
            }
            return;
        }

        //2) 敌人较远 → 有远程武器就换成远程
        if (distance >= 远程切换距离)
        {
            if (当前是远程) return;                            //已经是远程，不动
            int slot = 找武器槽(data, 要远程: true);
            if (slot >= 0)
            {
                data.切换武器槽(slot);
                远程换枪计时[who] = Main.rand.Next(10 * 60, 21 * 60);
                npc.netUpdate = true;
            }
            return;
        }

        //3) 中距离：槽里有≥2把远程武器时，每过一段时间随机换一把远程武器
        if (当前是远程)
        {
            if (!远程换枪计时.TryGetValue(who, out int t) || t <= 0)
            {
                //收集所有远程武器槽（排除当前槽），随机换一把
                Span<int> 候选 = stackalloc int[4];
                int n = 0;
                for (int i = 0; i < data.武器槽数量 && n < 候选.Length; i++)
                    if (i != data.当前武器槽 && 是远程武器(data.槽武器(i))) 候选[n++] = i;
                if (n > 0)
                {
                    data.切换武器槽(候选[Main.rand.Next(n)]);
                    npc.netUpdate = true;
                }
                远程换枪计时[who] = Main.rand.Next(10 * 60, 21 * 60);   //10~20秒
            }
            else
            {
                远程换枪计时[who] = t - 1;
            }
        }
    }

    public static bool IsDashing(NPC npc)
    {
        return npc.ai[DashTimerIndex] > 0f;
    }

    public static void Update(NPC npc)
    {
        // 战斗在【跟随/悠闲】都可进行（优先级仅低于返回）；坐下不战斗
        if (Main.netMode == NetmodeID.MultiplayerClient || 酒狐NPC状态.GetMode(npc) == 酒狐状态.坐下)
            return;

        //==== 计时器：必须在“返回”提前返回之前递减，否则冲刺会被卡住不结束 ====
        if (npc.localAI[AttackCooldownIndex] > 0f)
            npc.localAI[AttackCooldownIndex]--;
        if (交叉射击冷却.TryGetValue(npc.whoAmI, out int xcd) && xcd > 0) 交叉射击冷却[npc.whoAmI] = xcd - 1;
        if (屏幕换边冷却.TryGetValue(npc.whoAmI, out int scd) && scd > 0) 屏幕换边冷却[npc.whoAmI] = scd - 1;
        if (换边残影计时.TryGetValue(npc.whoAmI, out int gttl) && gttl > 0)
        {
            if (gttl - 1 <= 0) { 换边残影计时.Remove(npc.whoAmI); 换边残影起点.Remove(npc.whoAmI); }
            else 换边残影计时[npc.whoAmI] = gttl - 1;
        }

        //★ 冲刺穿刺中：保持高速位移 + 命中目标穿刺一次（每段冲刺只穿一次）
        if (npc.ai[DashTimerIndex] > 0f)
        {
            npc.ai[DashTimerIndex]--;
            if (npc.ai[DashTimerIndex] <= 0f)
                穿刺已命中.Remove(npc.whoAmI);
            else
                冲刺穿刺(npc);
            return;
        }

        // 返回优先：距离超限直接返回，不战斗
        if (酒狐NPC状态.IsNeedReturnToPlayer(npc))
        {
            return;
        }

        Player owner = 酒狐NPC状态.GetTargetPlayer(npc);

        //====恋还是练挑衅：把主人当敌人，酒狐用武器/饰品弹幕朝主人开火（弹幕统一由 酒狐弹幕修正 转打主人）====
        if (酒狐任务执行.恋还是练激活(npc) && 酒狐任务执行.挑衅激活(npc) && owner != null && owner.active)
        {
            CurrentTargetIndex = -1;
            combatTimer = 0;
            面向玩家开火(npc, owner);
            return;
        }

        NPC target = FindTarget(npc, owner);
        if (target == null)
        {
            CurrentTargetIndex = -1;
            if (combatTimer < int.MaxValue) combatTimer++;   //脱战计时
            return;
        }
        CurrentTargetIndex = target.whoAmI;
        combatTimer = 0;

        // 定期清理已失效的酒狐弹幕记录
        if ((Main.GameUpdateCount & 63) == 0)
            FoxProjectiles.RemoveWhere(id => id < 0 || id >= Main.maxProjectiles || !Main.projectile[id].active);

        Item weapon = owner.GetModPlayer<酒狐玩家>().当前武器;
        酒狐NPC状态.面向目标X(npc, target.Center.X);
        float distance = Vector2.Distance(npc.Center, target.Center);

        //★ 按距离决定用哪把武器（切换只改“当前手持武器”，后面的远近判断与贴图都跟着它走）
        选择武器(npc, owner.GetModPlayer<酒狐玩家>(), distance);
        weapon = owner.GetModPlayer<酒狐玩家>().当前武器;

        //终极棱镜按近战处理（不产生弹幕/特效）
        bool ranged = !weapon.IsAir && weapon.type != ItemID.LastPrism && (weapon.DamageType == DamageClass.Ranged || weapon.DamageType == DamageClass.Magic);
        //远程武器没对应弹药 → 变为近战
        if (ranged && weapon.useAmmo != AmmoID.None && !HasAmmo(owner, weapon))
            ranged = false;
        //清理门户：目标是友好NPC时改用近战（统一弹/远程弹无法命中友好NPC）
        if (ranged && target.friendly)
            ranged = false;
        if (ranged)
            UpdateRanged(npc, owner, target, weapon, distance);
        else
            UpdateMelee(npc, owner, target, weapon, distance);
    }

    private static bool HasAmmo(Player player, Item weapon)
    {
        if (weapon.useAmmo == AmmoID.None) return true;
        for (int i = 0; i < player.inventory.Length; i++)
        {
            Item it = player.inventory[i];
            if (!it.IsAir && it.ammo == weapon.useAmmo && it.stack > 0)
                return true;
        }
        return false;
    }

    //恋还是练挑衅：酒狐用武器/饰品弹幕朝主人开火（弹幕统一由 酒狐弹幕修正 转打主人）
    private static void 面向玩家开火(NPC npc, Player owner)
    {
        Item weapon = owner.GetModPlayer<酒狐玩家>().当前武器;
        酒狐NPC状态.面向目标X(npc, owner.Center.X);
        float dist = Vector2.Distance(npc.Center, owner.Center);

        bool ranged = !weapon.IsAir && weapon.type != ItemID.LastPrism && (weapon.DamageType == DamageClass.Ranged || weapon.DamageType == DamageClass.Magic);
        if (ranged && weapon.useAmmo != AmmoID.None && !HasAmmo(owner, weapon))
            ranged = false;

        //远程：距离够且冷却好 → 朝主人开火
        if (ranged && dist <= 520f && npc.localAI[AttackCooldownIndex] <= 0f)
        {
            if (FireWeaponProjectileAt(npc, owner, weapon, owner.Center, true))
            {
                npc.ai[0] = 22f;
                npc.ai[1] = 1;
                npc.localAI[AttackCooldownIndex] = 酒狐饰品.攻击冷却(owner, GetUseCooldown(weapon));
            }
        }
        //近战/无远程：靠近主人接触
        else
        {
            if (dist > 46f)
            {
                npc.velocity.X = MathHelper.Clamp(npc.velocity.X + Math.Sign(owner.Center.X - npc.Center.X) * 0.22f, -3.2f, 3.2f);
                if (owner.Center.Y > npc.Center.Y + npc.height)
                    npc.velocity.Y = MathHelper.Clamp(npc.velocity.Y + 0.15f, -3f, 3.4f);   //只向下，向上交给起跳/重力
                酒狐NPC状态.TryJumpOverObstacle(npc);
            }
            else if (npc.localAI[AttackCooldownIndex] <= 0f)
            {
                //接触打击主人
                int dmg = weapon.IsAir ? 12 : Math.Max(1, 酒狐饰品.攻击伤害(owner, owner.GetWeaponDamage(weapon)));
                owner.Hurt(PlayerDeathReason.ByCustomReason(NetworkText.FromLiteral("被酒狐教训了")), dmg, npc.direction);
                npc.localAI[AttackCooldownIndex] = 酒狐饰品.攻击冷却(owner, GetUseCooldown(weapon));
            }
        }
    }

    //============ 投掷近战武器（武器槽里所有【非主手】的近战武器都会被调用）============
    //★ 不再限定“两把都是近战”：只要武器槽里存在不在主手的近战武器就能扔。
    //   装备「法术超限」时：冷却减半（频率+100%）、伤害+20%、可同时扔出所有非主手近战武器。
    private const int 投掷冷却帧 = 180;          //约3秒一次（超限后减半）
    private const float 投掷最大距离 = 900f;
    private const float 双发起始偏移 = 26f;      //双发时从酒狐两侧多远处飞出
    private static readonly Dictionary<int, uint> 投掷冷却到 = new();
    private static int 投掷模式计数;             //单发/双发交替

    private static void 尝试投掷近战武器(NPC npc, Player owner, NPC target)
    {
        if (target == null) return;
        酒狐玩家 data = owner.GetModPlayer<酒狐玩家>();
        if (Vector2.Distance(npc.Center, target.Center) > 投掷最大距离) return;
        if (投掷冷却到.TryGetValue(npc.whoAmI, out uint until) && Main.GameUpdateCount < until) return;

        //收集所有【非主手】的近战武器
        bool 超限中 = 超限(owner);
        Item 主手 = data.当前武器;
        Item[] 可扔 = new Item[4];
        int n = 0;
        for (int i = 0; i < data.武器槽数量 && n < 可扔.Length; i++)
        {
            Item it = data.槽武器(i);
            if (it == 主手 || it.IsAir) continue;   //只调用“不在主手”的
            if (是近战武器(it)) 可扔[n++] = it;
        }
        if (n == 0) return;

        投掷冷却到[npc.whoAmI] = Main.GameUpdateCount + (uint)(超限中 ? 投掷冷却帧 / 2 : 投掷冷却帧);
        int 弹Type = ModContent.ProjectileType<投掷近战弹>();
        bool 双发 = (投掷模式计数++ & 1) == 1;
        Vector2 toT = target.Center - npc.Center;
        if (toT == Vector2.Zero) return;
        Vector2 单位 = Vector2.Normalize(toT);
        Vector2 perp = new(-单位.Y, 单位.X);

        //超限时把每个非主手近战武器都扔一遍；否则只扔第一个（密集程度增加）
        int 扔数量 = 超限中 ? n : 1;
        for (int k = 0; k < 扔数量; k++)
        {
            Item 投掷武器 = 可扔[k];
            int 面板 = Math.Max(1, 酒狐饰品.攻击伤害(owner, owner.GetWeaponDamage(投掷武器)));
            面板 = (int)(面板 * 额外攻击伤害倍率(owner));   //超限：+20%
            float 击退 = 酒狐饰品.酒狐击退(3f);

            if (!双发)
            {
                //模式0：单发直飞，体积更大、伤害×1.5、速度更快
                int dmg = (int)(面板 * 1.5f);
                int idx = Projectile.NewProjectile(npc.GetSource_FromAI(), npc.Center + 单位 * 18f, 单位 * 17f,
                    弹Type, dmg, 击退, owner.whoAmI, target.whoAmI, 0f, 投掷武器.type);
                if (idx >= 0 && idx < Main.maxProjectiles) FoxProjectiles.Add(idx);
            }
            else
            {
                //模式1：双发，从酒狐两侧旋转甩出，椭圆轨迹飞向目标，体积较小、速度稍慢
                for (int s = -1; s <= 1; s += 2)
                {
                    Vector2 起点 = npc.Center + perp * (双发起始偏移 * s);
                    Vector2 初速 = 单位 * 4f + perp * (9f * s);   //先朝侧外甩出去
                    //ai[1]：1=左侧、2=右侧（只用自动同步的ai，联机也不会不同步）
                    int idx = Projectile.NewProjectile(npc.GetSource_FromAI(), 起点, 初速,
                        弹Type, 面板, 击退, owner.whoAmI, target.whoAmI, s < 0 ? 1f : 2f, 投掷武器.type);
                    if (idx >= 0 && idx < Main.maxProjectiles) FoxProjectiles.Add(idx);
                }
            }
            if (投掷武器.UseSound != null) SoundEngine.PlaySound(投掷武器.UseSound, npc.Center);
        }
    }

    //============ 近战：高速位移 → 穿刺目标 ============
    private const float 冲刺速度 = 16f;        //冲刺初速度（高速位移）
    private const int 冲刺时长 = 16;           //冲刺持续tick
    private const float 穿刺启动距离 = 220f;   //★ 必须先接近到这个距离内才能穿刺（原为420）
    private const int 穿刺同目标冷却 = 90;     //★ 同一目标1.5秒内不能被再次穿刺
    private static readonly HashSet<int> 穿刺已命中 = new();   //本段冲刺是否已穿刺（每段只穿一次）
    private static readonly Dictionary<long, uint> 穿刺目标冷却到 = new();   //key=酒狐/目标 → 可再次穿刺的GameUpdateCount

    private static long 穿刺键(NPC npc, NPC target) => (long)npc.whoAmI * 1000L + target.whoAmI;

    private static bool 穿刺冷却中(NPC npc, NPC target)
        => 穿刺目标冷却到.TryGetValue(穿刺键(npc, target), out uint until) && Main.GameUpdateCount < until;

    //★ 远程“高速换边”的残影：起点 + 剩余tick（供 酒狐.PreDraw 拉出残影）
    internal static readonly Dictionary<int, Vector2> 换边残影起点 = new();
    internal static readonly Dictionary<int, int> 换边残影计时 = new();

    private static void 启动冲刺(NPC npc, Player owner, NPC target)
    {
        Vector2 dir = target.Center - npc.Center;
        if (dir == Vector2.Zero) return;
        dir.Normalize();
        if (Math.Abs(dir.X) > 0.1f) npc.direction = dir.X >= 0f ? 1 : -1;
        //朝目标方向高速位移（纵向不超过 ±9，免得直接飞起来）
        npc.velocity = new Vector2(dir.X * 冲刺速度, MathHelper.Clamp(dir.Y * 冲刺速度, -9f, 9f));
        npc.ai[DashTimerIndex] = 冲刺时长;
        npc.localAI[AttackCooldownIndex] = 冲刺时长 + 18;   //冲完稍等一下再来一段（连续穿刺）
        穿刺已命中.Remove(npc.whoAmI);
        穿刺目标冷却到[穿刺键(npc, target)] = Main.GameUpdateCount + (uint)穿刺同目标冷却;   //同一目标短时间不能再穿刺
        npc.netUpdate = true;
        if (!Main.dedServ)
        {
            for (int i = 0; i < 8; i++)
            {
                Dust d = Dust.NewDustPerfect(npc.Center, DustID.Silver,
                    new Vector2(-npc.direction * Main.rand.NextFloat(1f, 3.5f), Main.rand.NextFloat(-1f, 1f)), 0, default, 1.1f);
                d.noGravity = true;
            }
        }
    }

    //冲刺途中：贴到目标就穿刺一次
    private static void 冲刺穿刺(NPC npc)
    {
        npc.velocity.X *= 0.985f;   //轻微衰减，保持“高速位移”而不是瞬停
        int who = npc.whoAmI;

        //★ 冲刺粒子：每一tick沿路径撒白色速度线，配合残影表现高速位移
        if (!Main.dedServ)
        {
            for (int i = 0; i < 2; i++)
            {
                Vector2 p = npc.Center + new Vector2(Main.rand.NextFloat(-npc.width / 2f, npc.width / 2f),
                                                     Main.rand.NextFloat(-npc.height / 2f, npc.height / 2f));
                Dust d = Dust.NewDustPerfect(p, DustID.Silver,
                    -npc.velocity * Main.rand.NextFloat(0.05f, 0.16f), 0, new Color(200, 225, 255), 1.0f);
                d.noGravity = true;
            }
        }

        Player owner = 酒狐NPC状态.GetTargetPlayer(npc);
        if (owner == null) return;

        if (穿刺已命中.Contains(who)) return;
        if (CurrentTargetIndex < 0 || CurrentTargetIndex >= Main.maxNPCs) return;
        NPC target = Main.npc[CurrentTargetIndex];
        if (target == null || !target.active || target.life <= 0) return;
        //★ 判定半径随武器贴图大小变化（大武器够得更远）
        if (Vector2.Distance(npc.Center, target.Center) > 近战判定半径(owner) + target.width * 0.5f) return;

        Item weapon = owner.GetModPlayer<酒狐玩家>().当前武器;
        int damage = Math.Max(1, 酒狐饰品.攻击伤害(owner, owner.GetWeaponDamage(weapon)));
        damage = (int)(damage * 1.5f);   //★ 突刺伤害 +50%
        float knockback = 酒狐饰品.酒狐击退(owner.GetWeaponKnockback(weapon, weapon.IsAir ? 2f : weapon.knockBack));
        target.SimpleStrikeNPC(damage, npc.direction, false, knockback, DamageClass.Melee);
        酒狐饰品.酒狐近战命中(owner, npc, target, damage);
        //梦云水晶：穿刺同样附带目标最大生命5%
        if (owner.GetModPlayer<酒狐玩家>().HasDreamCrystalEquipped())
        {
            int bonus = (int)(target.lifeMax * 0.05f);
            if (bonus > 0) target.SimpleStrikeNPC(bonus, npc.direction, false, 0f, DamageClass.Magic);
        }
        穿刺已命中.Add(who);

        if (!Main.dedServ)
        {
            for (int i = 0; i < 10; i++)
                Dust.NewDustPerfect(target.Center, DustID.Silver, Main.rand.NextVector2Circular(3.5f, 3.5f), 0, default, 1.3f);
            CombatText.NewText(target.Hitbox, new Color(255, 170, 90), "穿刺", true);
        }
    }

    //============ 近战：接近 → 攻击 → 迂回拉扯 ============
    private static void UpdateMelee(NPC npc, Player owner, NPC target, Item weapon, float distance)
    {
        npc.damage = weapon.IsAir ? 12 : Math.Max(1, 酒狐饰品.攻击伤害(owner, owner.GetWeaponDamage(weapon)));

        //★ 两把武器槽都是近战时：周期性把“另一把”当弹幕扔向目标
        尝试投掷近战武器(npc, owner, target);

        float 攻击距离 = 近战攻击距离(owner);   //★ 随武器贴图大小变化
        if (distance > 攻击距离)
        {
            //★ 高速位移穿刺：要先接近到【穿刺启动距离】内、能看见目标，且同一目标短时间内没被穿刺过
            if (npc.localAI[AttackCooldownIndex] <= 0f && distance <= 穿刺启动距离
                && !穿刺冷却中(npc, target)
                && Collision.CanHit(npc.position, npc.width, npc.height, target.position, target.width, target.height))
            {
                启动冲刺(npc, owner, target);
                return;
            }
            //拉扯后重新贴上去接近目标
            float approachSpeed = 酒狐NPC状态.跑速(npc, distance > 240f ? 3.8f : 3.0f);
            npc.velocity.X = MathHelper.Clamp(npc.velocity.X + npc.direction * 0.18f, -approachSpeed, approachSpeed);
            MoveVertically(npc, target.Center.Y, 2.4f);
            酒狐NPC状态.TryJumpOverObstacle(npc);
            return;
        }

        //进入攻击距离
        if (npc.localAI[AttackCooldownIndex] <= 0f)
        {
            //特殊近战武器：天顶剑 → 剑阵环绕；鞭子 → 甩鞭（均由酒狐本体驱动，不从玩家发射）
            if (weapon.type == ItemID.Zenith)
            {
                npc.ai[0] = 22f;
                npc.ai[1] = 2;
                if (weapon.UseSound != null) SoundEngine.PlaySound(weapon.UseSound, npc.Center);
                npc.localAI[AttackCooldownIndex] = 酒狐饰品.攻击冷却(owner, GetUseCooldown(weapon));
                酒狐武器特效.TriggerZenith(npc.whoAmI);
                return;
            }
            if (weapon.shoot > ProjectileID.None && ProjectileID.Sets.IsAWhip[weapon.shoot])
            {
                npc.ai[0] = 22f;
                npc.ai[1] = 2;
                if (weapon.UseSound != null) SoundEngine.PlaySound(weapon.UseSound, npc.Center);
                npc.localAI[AttackCooldownIndex] = 酒狐饰品.攻击冷却(owner, GetUseCooldown(weapon));
                酒狐武器特效.TriggerWhip(npc.whoAmI);
                return;
            }

            //像玩家一样挥砍（带玩家伤害加成与击退）
            int damage = Math.Max(1, 酒狐饰品.攻击伤害(owner, owner.GetWeaponDamage(weapon)));
            float knockback = 酒狐饰品.酒狐击退(owner.GetWeaponKnockback(weapon, weapon.IsAir ? 2f : weapon.knockBack));
            target.SimpleStrikeNPC(damage, npc.direction, false, knockback, DamageClass.Melee);
            //梦云水晶：酒狐近战命中无视防御 + 附带目标最大生命x5%伤害
            if (owner.GetModPlayer<酒狐玩家>().HasDreamCrystalEquipped())
            {
                int bonus = (int)(target.lifeMax * 0.05f);
                if (bonus > 0) target.SimpleStrikeNPC(bonus, npc.direction, false, 0f, DamageClass.Magic);
            }
            酒狐饰品.酒狐近战命中(owner, npc, target, damage);
            //法术强化核心：近战命中额外召唤魔法箭
            if (酒狐饰品.酒狐佩戴(owner, ModContent.ItemType<法术强化核心>()))
                酒狐饰品.法术核心魔法箭(owner, npc.Center, target.Center, damage);
            //近战挥砍特效：银色挥砍粒子（不额外发射弹幕，避免弹道异常）
            if (!Main.dedServ)
            {
                for (int i = 0; i < 6; i++)
                    Dust.NewDustPerfect(npc.Center + new Vector2(npc.direction * 12f, -4f), DustID.Silver,
                        new Vector2(npc.direction * Main.rand.NextFloat(2f, 5f), Main.rand.NextFloat(-2f, 1f)), 0, default, 1.2f);
            }
            npc.ai[0] = 22f;
            npc.ai[1] = 2;

            //附带弹幕的近战武器（泰拉刃等）也像玩家一样挥出剑气（悠悠球/终极棱镜除外）
            if (weapon.type != ItemID.LastPrism && weapon.shoot > ProjectileID.None && ProjectileID.Sets.YoyosTopSpeed[weapon.shoot] <= 0f)
                FireWeaponProjectile(npc, owner, weapon, target, consumeAmmo: false);

            if (weapon.UseSound != null)
                SoundEngine.PlaySound(weapon.UseSound, npc.Center);

            //近战更激进：冷却更快（挥速提升）
            int meleeCd = 酒狐饰品.攻击冷却(owner, GetUseCooldown(weapon));
            npc.localAI[AttackCooldownIndex] = (int)(meleeCd * 0.8f);

            //穿刺/连击：高概率(约40%)额外打中目标一次(穿身而过)，并有概率再打一次
            if (Main.rand.NextFloat() < 0.40f)
                target.SimpleStrikeNPC(damage, npc.direction, false, knockback, DamageClass.Melee);
            if (Main.rand.NextFloat() < 0.20f)
                target.SimpleStrikeNPC((int)(damage * 0.6f), npc.direction, false, knockback, DamageClass.Melee);

            //额外附带攻击：高概率再来一次横扫（跳过冷却施放一次轻击）
            if (Main.rand.NextFloat() < 0.30f)
                target.SimpleStrikeNPC((int)(damage * 0.7f), npc.direction, false, knockback, DamageClass.Melee);

            //拉扯：攻击后向后跳开拉开身位，再重新接近（避免贴脸站桩）
            npc.velocity.X = -npc.direction * Main.rand.NextFloat(1.6f, 3.0f);
            if (distance < 攻击距离 * 0.75f)
            {
                npc.velocity.Y = -3.2f;
                酒狐NPC状态.标记上升宽限(npc);   //小跳，允许短暂上升
            }

            //冲刺突进概率提高（更灵活）
            if (Main.rand.NextFloat() < 0.20f)
            {
                npc.ai[DashTimerIndex] = 12f;
                npc.velocity.X = npc.direction * 8f;
                npc.localAI[AttackCooldownIndex] = Math.Max(npc.localAI[AttackCooldownIndex], 30);
            }
        }
        else
        {
            //冷却中：绕圈迂回走位，太贴身时往外侧退
            float strafeDir = Main.rand.NextBool(2) ? 1f : -1f;
            float meleeStrafeMax = 酒狐NPC状态.跑速(npc, 2.2f);
            npc.velocity.X = MathHelper.Clamp(npc.velocity.X + strafeDir * 0.10f, -meleeStrafeMax, meleeStrafeMax);
            if (distance < 攻击距离 * 0.7f)
                npc.velocity.X -= npc.direction * 0.08f;
            酒狐NPC状态.TryJumpOverObstacle(npc);
        }
    }

    //============ 远程：保持距离 + 横向迂回 + 像玩家一样射击 ============
    //走位时用【粘滞方向】：选定一个绕行方向后保持一段时间，避免每tick随机翻转导致几乎不动（参考幻影伙伴）
    private static readonly Dictionary<int, int> 远程走位方向 = new();
    private static readonly Dictionary<int, int> 远程走位计时 = new();
    private static void 远程走位(NPC npc, float distance)
    {
        int who = npc.whoAmI;
        //太近→拉远，太远→靠近（无方向粘滞）
        if (distance < RangedMinDist)
        {
            远程走位方向.Remove(who);
            npc.velocity.X = MathHelper.Clamp(npc.velocity.X - npc.direction * 0.20f, -2.8f, 2.8f);
            return;
        }
        if (distance > RangedMaxDist)
        {
            远程走位方向.Remove(who);
            npc.velocity.X = MathHelper.Clamp(npc.velocity.X + npc.direction * 0.20f, -3.4f, 3.4f);
            return;
        }
        //理想距离：粘滞横向绕行（选方向后保持40~80tick再考虑换向）
        if (!远程走位方向.TryGetValue(who, out int dir) || 远程走位计时.TryGetValue(who, out int t) == false || t <= 0)
        {
            远程走位方向[who] = Main.rand.NextBool(2) ? 1 : -1;
            远程走位计时[who] = Main.rand.Next(40, 81);
        }
        else
        {
            远程走位计时[who] = t - 1;
        }
        float strafeMax = 酒狐NPC状态.跑速(npc, 2.6f);
        npc.velocity.X = MathHelper.Clamp(npc.velocity.X + 远程走位方向[who] * 0.16f, -strafeMax, strafeMax);
    }

    //============ 远程：贴屏幕边被近身 → 高速换到另一边 ============
    private static readonly Dictionary<int, int> 屏幕换边冷却 = new();
    private const float 换边触发距离 = 280f;   //目标接近到这个距离内才考虑换边
    private const float 换边偏移 = 220f;       //换到玩家另一侧多远

    private static bool 尝试屏幕换边(NPC npc, Player owner, float distance)
    {
        int who = npc.whoAmI;
        if (屏幕换边冷却.TryGetValue(who, out int cd) && cd > 0) return false;
        if (Main.dedServ || distance > 换边触发距离) return false;

        //酒狐是否贴在玩家屏幕的左/右边缘
        float 屏X = npc.Center.X - Main.screenPosition.X;
        bool 贴左 = 屏X < Main.screenWidth * 0.22f;
        bool 贴右 = 屏X > Main.screenWidth * 0.78f;
        if (!贴左 && !贴右) return false;

        //换到玩家的另一侧
        float 目标X = owner.Center.X + (贴左 ? 1f : -1f) * 换边偏移;
        if (Math.Abs(目标X - npc.Center.X) < 100f) return false;
        Vector2 落点 = new(目标X, npc.Center.Y);
        if (Collision.SolidCollision(new Vector2(落点.X - npc.width / 2f, 落点.Y - npc.height / 2f), npc.width, npc.height))
            return false;   //落点卡墙就放弃，等下次

        Vector2 旧 = npc.Center;
        npc.Center = 落点;
        npc.velocity = Vector2.Zero;
        npc.netUpdate = true;
        屏幕换边冷却[who] = 5 * 60;   //5秒冷却
        远程走位方向.Remove(who);
        远程走位计时.Remove(who);

        //★ 残影：记录起点，由 酒狐.PreDraw 在接下来14tick里沿路径画出残影
        换边残影起点[who] = 旧;
        换边残影计时[who] = 14;

        if (!Main.dedServ)
        {
            //起点→终点拉一条速度线尘，看起来像高速掠过
            for (int i = 0; i <= 20; i++)
            {
                Vector2 p = Vector2.Lerp(旧, 落点, i / 20f);
                Dust d = Dust.NewDustPerfect(p, DustID.Silver,
                    new Vector2(Main.rand.NextFloat(-1.5f, 1.5f), Main.rand.NextFloat(-1.5f, 1.5f)),
                    0, new Color(180, 220, 255), Main.rand.NextFloat(0.9f, 1.4f));
                d.noGravity = true;
            }
            //两端各来一圈爆散粒子
            for (int i = 0; i < 10; i++)
            {
                Dust d = Dust.NewDustPerfect(旧, DustID.Silver, Main.rand.NextVector2Circular(3f, 3f), 0, new Color(200, 230, 255), 1.1f);
                d.noGravity = true;
                Dust d2 = Dust.NewDustPerfect(落点, DustID.Silver, Main.rand.NextVector2Circular(3f, 3f), 0, new Color(200, 230, 255), 1.1f);
                d2.noGravity = true;
            }
        }
        return true;
    }

    private static void UpdateRanged(NPC npc, Player owner, NPC target, Item weapon, float distance)
    {
        //★ 目标近身 + 酒狐贴在屏幕左/右边 → 直接高速换到另一边
        if (尝试屏幕换边(npc, owner, distance))
            return;

        //迂回走位：太近后退、太远靠近、理想距离内水平绕行（不傻站着）
        远程走位(npc, distance);
        MoveVertically(npc, target.Center.Y, 1.8f);
        酒狐NPC状态.TryJumpOverObstacle(npc);

        //射击：模拟玩家按住鼠标（连发武器持续发射，单发武器打一发歇一下）
        //★ 正在闪避时放宽射程：让酒狐“边躲边打”，而不是一路后退到打不到人
        float 射程 = 酒狐NPC状态.正在闪避(npc) ? RangedFireRange * 1.7f : RangedFireRange;
        if (npc.localAI[AttackCooldownIndex] <= 0f && distance <= 射程)
        {
            //特殊武器：代达罗斯风暴弓（箭雨）——由酒狐本体驱动
            if (weapon.type == ItemID.DaedalusStormbow)
            {
                npc.ai[0] = 22f;
                npc.ai[1] = 1;
                if (weapon.UseSound != null) SoundEngine.PlaySound(weapon.UseSound, npc.Center);
                npc.localAI[AttackCooldownIndex] = 酒狐饰品.攻击冷却(owner, GetUseCooldown(weapon));
                FireStormbow(npc, owner, weapon, target);
                return;
            }

            //持续蓄力类武器（如魔法光束/棱镜等）：以玩家为弹幕主人时会连带“玩家也一直使用武器特效”。
            //宁可不调用玩家弹幕，改用酒狐本体直接打击目标。
            if (weapon.channel)
            {
                int chDmg = Math.Max(1, 酒狐饰品.攻击伤害(owner, owner.GetWeaponDamage(weapon)));
                float chKb = 酒狐饰品.酒狐击退(owner.GetWeaponKnockback(weapon, weapon.knockBack));
                target.SimpleStrikeNPC(chDmg, npc.direction, false, chKb, weapon.DamageType);
                酒狐饰品.酒狐近战命中(owner, npc, target, chDmg);
                npc.ai[0] = 22f;
                npc.ai[1] = 1;
                if (weapon.UseSound != null) SoundEngine.PlaySound(weapon.UseSound, npc.Center);
                npc.localAI[AttackCooldownIndex] = 酒狐饰品.攻击冷却(owner, GetUseCooldown(weapon));
                return;
            }

            if (FireWeaponProjectile(npc, owner, weapon, target, consumeAmmo: true))
            {
                npc.ai[0] = 22f;
                npc.ai[1] = 1;
                npc.localAI[AttackCooldownIndex] = 酒狐饰品.攻击冷却(owner, GetUseCooldown(weapon));
                //射击后坐力：微微后仰
                npc.velocity.X -= npc.direction * 0.5f;
                //★ 额外武器攻击：调用武器槽里其他非主手武器
                尝试交叉射击(npc, owner, target);
                尝试投掷近战武器(npc, owner, target);
            }
        }
    }

    //★ 额外武器攻击（远程部分）：武器槽里所有【非主手】的远程武器都可能被顺带调用。
    //  不再限定“两把都是远程”；装备「法术超限」时概率翻倍(频率+100%)、冷却减半(更密集)、伤害+20%。
    private const float 交叉射击概率 = 0.35f;
    private static void 尝试交叉射击(NPC npc, Player owner, NPC target)
    {
        int who = npc.whoAmI;
        if (交叉射击冷却.TryGetValue(who, out int cd) && cd > 0) return;

        酒狐玩家 data = owner.GetModPlayer<酒狐玩家>();
        bool 超限中 = 超限(owner);
        Item 主手 = data.当前武器;

        //收集所有非主手的远程武器（超限时可以同时调用多把）
        Item[] 候选 = new Item[4];
        int n = 0;
        for (int i = 0; i < data.武器槽数量 && n < 候选.Length; i++)
        {
            Item it = data.槽武器(i);
            if (it == 主手 || it.IsAir) continue;
            if (!是远程武器(it)) continue;
            if (it.useAmmo != AmmoID.None && !HasAmmo(owner, it)) continue;   //没弹药射不出来
            候选[n++] = it;
        }
        if (n == 0) return;

        float 概率 = 超限中 ? Math.Min(交叉射击概率 * 2f, 1f) : 交叉射击概率;   //频率+100%
        int 调用数 = 超限中 ? n : 1;                                           //密集程度增加
        bool 射出 = false;
        for (int k = 0; k < 调用数; k++)
        {
            if (Main.rand.NextFloat() >= 概率) continue;
            //超限：额外攻击伤害+20%（临时提升，打完恢复由武器面板重新计算）
            if (FireWeaponProjectile(npc, owner, 候选[k], target, consumeAmmo: true, 伤害倍率: 额外攻击伤害倍率(owner)))
                射出 = true;
        }
        if (射出)
            交叉射击冷却[who] = 超限中 ? 12 : 25;   //“少量”：超限后更密集
    }

    //代达罗斯风暴弓：从目标上方斜向落下的箭雨（还原原版，一格箭矢带起多发）
    private static void FireStormbow(NPC npc, Player owner, Item weapon, NPC target)
    {
        int shoot = weapon.shoot;
        float speed = weapon.shootSpeed;
        int damage = 酒狐饰品.攻击伤害(owner, owner.GetWeaponDamage(weapon));
        float knockback = 酒狐饰品.酒狐击退(owner.GetWeaponKnockback(weapon, weapon.knockBack));
        //消耗一格箭，取箭种与射速（70%概率不消耗）
        bool dontConsume = Main.rand.NextFloat() < 0.7f;
        if (!owner.PickAmmo(weapon, out int projToShoot, out float ammoSpeed, out int ammoDamage, out float ammoKnockBack, out int usedAmmo, dontConsume))
            return;
        if (projToShoot <= ProjectileID.None) return;
        shoot = projToShoot;
        speed = ammoSpeed > 0 ? ammoSpeed : 12f;

        int count = Main.rand.Next(2, 4);
        for (int i = 0; i < count; i++)
        {
            Vector2 origin = target.Center + new Vector2(Main.rand.NextFloat(-70f, 70f), -240f - Main.rand.NextFloat(0f, 70f));
            Vector2 aim = target.Center + new Vector2(Main.rand.NextFloat(-40f, 40f), Main.rand.NextFloat(0f, 30f));
            Vector2 vel = aim - origin;
            if (vel == Vector2.Zero) continue;
            vel.Normalize();
            vel *= speed;
            int projIndex = Projectile.NewProjectile(npc.GetSource_FromAI(), origin, vel, shoot, damage, knockback, owner.whoAmI);
            if (projIndex >= 0 && projIndex < Main.maxProjectiles)
                FoxProjectiles.Add(projIndex);
        }
    }

    // 会读玩家手持物品、导致误触发玩家武器的武器 → 改用酒狐统一弹（其余保留原版弹幕）
    private static readonly int[] 误触发武器 = { 3570 };   //月耀(Lunar Flare)
    private static bool 需统一弹(Item weapon)
    {
        foreach (int t in 误触发武器)
            if (weapon.type == t) return true;
        return false;
    }

    //像玩家一样使用武器射击：消耗弹药、使用玩家伤害/击退/射速；仅危险武器用酒狐统一弹
    private static bool FireWeaponProjectile(NPC npc, Player owner, Item weapon, NPC target, bool consumeAmmo, float 伤害倍率 = 1f)
        => FireWeaponProjectileAt(npc, owner, weapon, target != null ? target.Center : npc.Center, consumeAmmo, 伤害倍率);

    //朝指定坐标开火（练功挑衅时朝主人）
    private static bool FireWeaponProjectileAt(NPC npc, Player owner, Item weapon, Vector2 aimCenter, bool consumeAmmo, float 伤害倍率 = 1f)
    {
        if (weapon.IsAir)
            return false;

        int shoot = weapon.shoot;
        float speed = weapon.shootSpeed;
        int damage = (int)(酒狐饰品.攻击伤害(owner, owner.GetWeaponDamage(weapon)) * 伤害倍率);
        float knockback = 酒狐饰品.酒狐击退(owner.GetWeaponKnockback(weapon, weapon.knockBack));

        if (consumeAmmo && weapon.useAmmo != AmmoID.None)
        {
            //消耗弹药（弓/枪等）；没有弹药就射不出来（和玩家一样）；酒狐70%概率不消耗
            bool dontConsume = Main.rand.NextFloat() < 0.7f;
            if (!owner.PickAmmo(weapon, out int projToShoot, out float ammoSpeed, out int ammoDamage, out float ammoKnockBack, out int usedAmmo, dontConsume))
                return false;
            shoot = projToShoot;
            if (ammoSpeed > 0f) speed = ammoSpeed;
        }

        if (shoot <= ProjectileID.None)
            return false;
        if (speed <= 0f)
            speed = 8f;

        // 危险武器 → 酒狐统一弹；正常武器 → 原版弹幕
        int finalShoot = 需统一弹(weapon) ? ModContent.ProjectileType<酒狐弹>() : shoot;

        //====【参考幻影伙伴 ComputeInterceptAim】弹道预判提前量：朝目标未来位置发射====
        Vector2 targetPoint = aimCenter;
        int tgtIndex = 酒狐攻击.CurrentTargetIndex;
        if (tgtIndex >= 0 && tgtIndex < Main.maxNPCs)
        {
            NPC t = Main.npc[tgtIndex];
            if (t != null && t.active && t.life > 0)
            {
                targetPoint = 计算拦截点(npc.Center, t, finalShoot, speed);
            }
        }

        Vector2 toTarget = targetPoint - npc.Center;
        if (toTarget == Vector2.Zero)
            return false;
        toTarget.Normalize();
        toTarget *= speed;

        Vector2 muzzle = npc.Center + new Vector2(npc.direction * 16f, 4f);
        int projIndex = Projectile.NewProjectile(npc.GetSource_FromAI(), muzzle, toTarget, finalShoot, damage, knockback, owner.whoAmI);
        if (projIndex >= 0 && projIndex < Main.maxProjectiles)
            FoxProjectiles.Add(projIndex);
        //法术强化核心：射击时额外召唤魔法箭（挑衅时也朝主人）
        if (酒狐饰品.酒狐佩戴(owner, ModContent.ItemType<法术强化核心>()))
            酒狐饰品.法术核心魔法箭(owner, muzzle, aimCenter, damage);
        if (weapon.UseSound != null)
            SoundEngine.PlaySound(weapon.UseSound, npc.Center);
        return true;
    }

    // 弹道预判拦截点（参考 ComputeInterceptAim）：慢速目标不预判；否则3次定点迭代求拦截点
    private static Vector2 计算拦截点(Vector2 from, NPC target, int projectileType, float shootSpeed)
    {
        Vector2 fallback = target.Center;
        if (target.velocity.LengthSquared() < 2.25f)
            return fallback;   //目标速度太慢 → 直接指当前中心

        int extraUpdates = 0;
        if (projectileType > ProjectileID.None && projectileType < Main.projectile.Length)
            extraUpdates = ContentSamples.ProjectilesByType.TryGetValue(projectileType, out Projectile s) ? s.extraUpdates : 0;
        float effectiveSpeed = Math.Max(6f, shootSpeed) * (1 + extraUpdates);

        Vector2 aim = fallback;
        for (int i = 0; i < 3; i++)
        {
            float travelTicks = MathHelper.Clamp(Vector2.Distance(from, aim) / effectiveSpeed, 0f, 40f);
            aim = target.Center + target.velocity * travelTicks;   //3次定点迭代收敛
        }
        return aim;
    }

    //模拟玩家按住鼠标的射击节奏
    private static int GetUseCooldown(Item weapon)
    {
        int useTime = Math.Max(1, weapon.useTime);
        if (weapon.autoReuse)
            return useTime; //连发武器：按住鼠标不停发射
        //单发武器：打一发后要“松开再按”，中间停顿一下，不会连发
        return Math.Max(weapon.useAnimation, useTime) + 20;
    }

    //高低差跟随：只在目标在【下方】时给向下的加速（向上交给起跳与重力，避免无视重力浮空）
    private static void MoveVertically(NPC npc, float targetY, float maxSpeed)
    {
        float delta = targetY - npc.Center.Y;
        if (delta > npc.height)
            npc.velocity.Y = MathHelper.Clamp(npc.velocity.Y + 0.12f, -maxSpeed, maxSpeed);
    }

    public static NPC FindTarget(NPC npc, Player owner)
    {
        bool 主动防御 = 酒狐任务执行.主动防御激活(npc);
        bool 清理门户 = 酒狐任务执行.清理门户激活(npc);
        bool 恋还是练 = 酒狐任务执行.恋还是练激活(npc);
        bool 挑衅 = 酒狐任务执行.挑衅激活(npc);

        //恋还是练：无论中立或挑衅都不走普通NPC索敌（挑衅时改由 酒狐任务执行 直接打玩家）
        if (恋还是练)
            return null;

        NPC result = null;
        float closest = GetFindRange();
        // 主动防御：索敌范围用配置（格→像素）
        if (主动防御)
        {
            float cfg = ModContent.GetInstance<酒狐任务配置>().主动防御最大索敌距离;
            closest = Math.Max(closest, cfg * 16f);
        }
        // 悠闲模式：索敌范围变小
        if (酒狐NPC状态.GetMode(npc) == 酒狐状态.悠闲)
            closest = Math.Min(closest, 300f);
        // 梦云水晶变身：索敌范围大幅增大
        if (owner != null && owner.GetModPlayer<酒狐玩家>().HasDreamCrystalEquipped())
            closest *= 1.8f;

        //====【参考幻影伙伴】打分制选敌：boss/小boss > 贴脸威胁 > 集群 > 血多 > 越近，而非单纯最近====
        酒狐玩家 ownerData = owner.GetModPlayer<酒狐玩家>();
        float bestScore = float.MinValue;
        for (int index = 0; index < Main.maxNPCs; index++)
        {
            NPC candidate = Main.npc[index];
            if (!candidate.active || candidate.dontTakeDamage || candidate.life <= 0 || candidate.type == npc.type)
                continue;

            //清理门户：主动打所有友方/中立/城镇/小动物（通通作为敌人）
            bool 清门户目标 = 清理门户 && !candidate.townNPC && !NPCID.Sets.CountsAsCritter[candidate.type];
            //也要打城镇NPC和小动物：只要是友方或中立、非酒狐自己、非假人即可
            bool 清门户通吃 = 清理门户 && candidate.type != NPCID.TargetDummy;
            if (清门户通吃)
            {
                //城镇NPC、中立NPC、小动物、友方怪都纳入
                if (candidate.townNPC || NPCID.Sets.CountsAsCritter[candidate.type] || candidate.friendly)
                    清门户目标 = true;
            }
            if (!清门户目标)
            {
                //常规：跳过友方/村民/小动物
                if (candidate.friendly || candidate.townNPC || NPCID.Sets.CountsAsCritter[candidate.type])
                    continue;
                //非友方但没被主人打/不威胁主人 → 忽略
                if (!ownerData.IsHostile(candidate) && !ownerData.IsBeingThreatenedBy(candidate))
                    continue;
            }

            float distance = Vector2.Distance(npc.Center, candidate.Center);
            //主动防御 / 清理门户：可穿墙寻敌（不看碰撞）；否则要求视线可达
            if (distance >= closest) continue;
            if (!(主动防御 || 清门户目标 || Collision.CanHit(npc.position, npc.width, npc.height, candidate.position, candidate.width, candidate.height)))
                continue;

            // 打分：越接近“值得打”的得分越高
            float score = 0f;
            float d0 = Vector2.Distance(npc.Center, candidate.Center);
            float d1 = Vector2.Distance(owner.Center, candidate.Center);
            if (candidate.boss) score += 1_000_000f;
            else if (NPCID.Sets.ShouldBeCountedAsBoss[candidate.type] || candidate.rarity > 0 || candidate.lifeMax >= 10000) score += 500_000f;
            if (score != 0f) {} //已加成
            bool closeThreat = Math.Min(d0, d1) <= 15f * 16f;
            if (closeThreat) score += 80_000f;
            //抱团：目标周围10格内的友好“敌方”数量加成
            int cluster = 0;
            for (int ci = 0; ci < Main.maxNPCs; ci++)
            {
                NPC other = Main.npc[ci];
                if (!other.active || other.friendly || other.dontTakeDamage) continue;
                if (Vector2.Distance(candidate.Center, other.Center) < 10f * 16f) cluster++;
            }
            score += cluster * 12_000f;
            score += Math.Min(candidate.lifeMax, 100_000) * 0.2f;
            score -= Math.Min(d0, d1) * 8f;

            if (score > bestScore)
            {
                bestScore = score;
                result = candidate;
            }
        }
        return result;
    }
}
