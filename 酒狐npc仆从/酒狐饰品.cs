using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.DataStructures;
using Terraria.ID;
using Terraria.Localization;
using Terraria.ModLoader;
using Terraria.ModLoader.IO;

namespace 酒狐npc仆从;

/// <summary>
/// 酒狐饰品的公共逻辑与全局处理：
/// 判定“玩家/酒狐是否佩戴某饰品”，以及混沌之书的“延迟追击伤害”队列。
/// </summary>
public sealed class 酒狐饰品 : ModSystem
{
    //==================== 音效 ====================
    // 不死图腾复活音效：资源文件 饰品\Totem_of_Undying.ogg（用户自行放入）
    public static readonly Terraria.Audio.SoundStyle 不死图腾音效 =
        new Terraria.Audio.SoundStyle("酒狐npc仆从/饰品/Totem_of_Undying")
        {
            Volume = 1f,
            PitchVariance = 0f,
        };

    //==================== 佩戴判定 ====================
    // 低吟之戒：攻击频率+20%（冷却缩短为80%）
    public static int 攻击冷却(Terraria.Player owner, int cooldown)
    {
        if (酒狐佩戴(owner, ModContent.ItemType<低吟之戒>()))
            return (int)(cooldown * 0.8f);
        return cooldown;
    }
    // 低吟之戒：伤害+20%；梦云水晶变身：伤害翻倍；法术强化核心：酒狐用魔法武器伤害+50%；烬华之戒：按已损失生命比例加攻
    public static int 攻击伤害(Terraria.Player owner, int damage)
    {
        if (酒狐佩戴(owner, ModContent.ItemType<低吟之戒>()))
            damage = (int)(damage * 1.2f);
        if (owner.GetModPlayer<酒狐玩家>().HasDreamCrystalEquipped())
            damage *= 2;
        //烬华之戒：每降低2%最大生命 → 攻击+0.5%
        if (酒狐佩戴(owner, ModContent.ItemType<烬华之戒>()) && owner.statLifeMax2 > 0)
        {
            float ratio = (float)owner.statLife / owner.statLifeMax2;
            damage = (int)(damage * 烬华之戒.攻击加成(ratio));
        }
        //法术强化核心：酒狐当前武器为魔法时 +50%
        if (酒狐佩戴(owner, ModContent.ItemType<法术强化核心>()))
        {
            Item w = owner.GetModPlayer<酒狐玩家>().当前武器;
            if (w != null && !w.IsAir && w.DamageType == DamageClass.Magic)
                damage = (int)(damage * 1.5f);
        }
        //玩家的伤害增益（霸体/暴怒/暴击类buff）叠加给酒狐
        damage = (int)(damage * 玩家伤害增益(owner));
        return damage;
    }

    //玩家当前生效的伤害增益倍率（buff类），供酒狐共享
    public static float 玩家伤害增益(Terraria.Player player)
    {
        float mult = 1f;
        if (player.HasBuff(BuffID.Wrath)) mult += 0.20f;       //暴怒
        if (player.HasBuff(BuffID.Rage)) mult += 0.15f;        //霸体(暴击率，稍增伤)
        if (player.HasBuff(BuffID.WellFed)) mult += 0.10f;     //饱腹
        if (player.HasBuff(BuffID.Sharpened)) mult += 0.10f;   //磨刀石
        return mult;
    }

    // 玩家自身【功能性】饰品槽（armor 3..7 共5个 + 恶魔之心/大师模式的额外槽
    //  + tModLoader 的模组额外饰品槽；不含装饰栏/染料栏）
    public static bool 玩家佩戴(Terraria.Player player, int itemType)
    {
        int 起始 = 3;
        int 数量 = 5 + player.extraAccessorySlots;   //Vanilla 5 个饰品槽 + 额外饰品槽
        for (int i = 起始; i < 起始 + 数量 && i < player.armor.Length; i++)
            if (player.armor[i].type == itemType) return true;

        //★ 模组额外饰品槽（如“更多饰品槽”类mod）：这些物品不在 armor[3..] 里，
        //  而是存在 tModLoader 的 ModAccessorySlotPlayer.exAccessorySlot（非public字段），
        //  必须额外读取，否则装在这些槽里的酒狐饰品不会生效。
        return 额外饰品槽佩戴(player, itemType);
    }

    // tModLoader 额外（mod）饰品槽里是否佩戴了指定饰品
    private static System.Reflection.FieldInfo 额外饰品槽字段;
    private static bool 额外饰品槽字段已找过;
    private static bool 额外饰品槽佩戴(Terraria.Player player, int itemType)
    {
        try
        {
            var modSlots = player.GetModPlayer<Terraria.ModLoader.Default.ModAccessorySlotPlayer>();
            if (modSlots == null) return false;
            if (!额外饰品槽字段已找过)
            {
                额外饰品槽字段已找过 = true;
                额外饰品槽字段 = modSlots.GetType().GetField("exAccessorySlot",
                    System.Reflection.BindingFlags.Instance
                    | System.Reflection.BindingFlags.NonPublic
                    | System.Reflection.BindingFlags.Public);
            }
            if (额外饰品槽字段 == null) return false;
            if (额外饰品槽字段.GetValue(modSlots) is Item[] arr)
            {
                foreach (Item it in arr)
                    if (it != null && !it.IsAir && it.type == itemType) return true;
            }
        }
        catch { }
        return false;
    }

    // 酒狐饰品栏是否佩戴指定饰品类（酒狐主人 = owner）
    //★ 只统计【当前可用】的槽位（默认9格；装备「法术超限」后12格）
    public static bool 酒狐佩戴(Terraria.Player owner, int itemType)
    {
        酒狐玩家 data = owner.GetModPlayer<酒狐玩家>();
        int 数量 = data.饰品槽数量;
        for (int i = 0; i < 数量 && i < data.Accessories.Length; i++)
            if (data.Accessories[i].type == itemType) return true;
        return false;
    }

    // 找到当前存在的酒狐 NPC（可能有多主公酒狐，返回第一个；供伤害共享用）
    public static NPC 找酒狐(Terraria.Player owner)
    {
        for (int i = 0; i < Main.maxNPCs; i++)
        {
            NPC n = Main.npc[i];
            if (n.active && n.type == ModContent.NPCType<酒狐>() && (int)n.localAI[1] == owner.whoAmI)
                return n;
        }
        return null;
    }

    //===== Shift 快捷放入酒狐：饰品优先放饰品槽，其余优先放背包（Storage），放不下原样保留在鼠标 =====
    public static void 存到酒狐(Terraria.Player owner, Item item)
    {
        if (owner == null || item == null || item.IsAir) return;
        酒狐玩家 data = owner.GetModPlayer<酒狐玩家>();

        bool isAccessory = item.accessory;

        //饰品 → 优先空饰品槽（只放入当前可用槽位，避免塞进未解锁的额外3格）
        if (isAccessory)
        {
            for (int i = 0; i < data.饰品槽数量 && i < data.Accessories.Length; i++)
            {
                Item slot = data.Accessories[i];
                if (slot == null || slot.IsAir)
                {
                    if (slot == null) data.Accessories[i] = new Item();
                    data.Accessories[i] = item.Clone();
                    item.TurnToAir();
                    return;
                }
            }
            //饰品槽满 → 落回背包
            存到背包(data, item);
            return;
        }

        //普通物品 → 背包优先；背包满 → 饰品槽
        if (存到背包(data, item)) return;
        for (int i = 0; i < data.饰品槽数量 && i < data.Accessories.Length; i++)
        {
            Item slot = data.Accessories[i];
            if (slot == null || slot.IsAir)
            {
                if (slot == null) data.Accessories[i] = new Item();
                data.Accessories[i] = item.Clone();
                item.TurnToAir();
                return;
            }
        }
    }

    private static bool 存到背包(酒狐玩家 data, Item item)
    {
        //同类叠加
        for (int i = 0; i < data.Storage.Length; i++)
        {
            Item it = data.Storage[i];
            if (it != null && !it.IsAir && it.type == item.type && it.stack < it.maxStack)
            {
                int move = Math.Min(it.maxStack - it.stack, item.stack);
                it.stack += move;
                item.stack -= move;
                if (item.stack <= 0) item.TurnToAir();
                return true;
            }
        }
        //空槽
        for (int i = 0; i < data.Storage.Length; i++)
        {
            Item it = data.Storage[i];
            if (it == null || it.IsAir)
            {
                if (it == null) data.Storage[i] = new Item();
                data.Storage[i] = item.Clone();
                item.TurnToAir();
                return true;
            }
        }
        return false;
    }

    // 酒狐在场（是 owner 的酒狐）且佩戴指定饰品
    public static bool 酒狐在场佩戴(Terraria.Player owner, int itemType)
    {
        NPC fox = 找酒狐(owner);
        if (fox == null) return false;
        return 酒狐佩戴(owner, itemType);
    }

    // 酒狐击退力强化：酒狐造成的击退全部乘 1.6，近战更明显
    public static float 酒狐击退(float baseKnockback)
        => baseKnockback * 1.6f;

    //==================== 紫荆冠刺：命中减防 ====================
    // 命中的目标防御暂时降低（目标最大防御x25% + 20点），N帧后自动恢复。
    // 用字典记录每个目标应用时的【原始防御】，每帧强制 = 原始-减防，到期停止覆盖即可恢复。
    private static readonly Dictionary<int, int> 紫荆原防 = new();       //目标whoAmI -> 应用时的原始防御
    private static readonly Dictionary<int, int> 紫荆减防值 = new();     //目标whoAmI -> 减防数值
    private static readonly Dictionary<int, int> 紫荆减防tick = new();   //剩余帧
    private const int 紫荆减防时长 = 40 * 60;   //40秒

    public static bool 戴紫荆(Terraria.Player owner, bool isFox)
    {
        int t = ModContent.ItemType<紫荆冠刺>();
        return isFox ? 酒狐佩戴(owner, t) : 玩家佩戴(owner, t);
    }

    // 命中目标时调用：给目标挂上临时减防
    public static void 紫荆减防命中(NPC target)
    {
        if (target == null || !target.active || target.dontTakeDamage) return;
        int who = target.whoAmI;
        int reduce = 紫荆冠刺.减防值(target.defense);
        if (reduce < 0) reduce = 0;
        //记录原始防御（若已挂过则保留原有的原始值，避免叠加）
        if (!紫荆原防.ContainsKey(who))
            紫荆原防[who] = target.defense;
        紫荆减防值[who] = reduce;
        紫荆减防tick[who] = 紫荆减防时长;
        target.defense = Math.Max(0, 紫荆原防[who] - reduce);
        target.netUpdate = true;
    }

    // 每tick：覆盖目标防御以维持减防；到期移除覆盖（让原版恢复基础防御）
    public static void 紫荆减防更新()
    {
        var toRemove = new List<int>();
        foreach (var kv in 紫荆减防tick)
        {
            int who = kv.Key;
            int left = kv.Value - 1;
            紫荆减防tick[who] = left;
            if (left <= 0)
            {
                toRemove.Add(who);
            }
            else if (who >= 0 && who < Main.maxNPCs)
            {
                NPC n = Main.npc[who];
                if (n != null && n.active && 紫荆原防.TryGetValue(who, out int baseDef))
                    n.defense = Math.Max(0, baseDef - 紫荆减防值[who]);
            }
        }
        foreach (int who in toRemove)
        {
            紫荆原防.Remove(who);
            紫荆减防值.Remove(who);
            紫荆减防tick.Remove(who);
        }
    }

    //==================== 吸血（嗜血之心）====================
    // 嗜血之心：自身造成伤害的5%回血；玩家佩戴时恢复值减半(2.5%)
    public static int 吸血量(int damageDealt, bool isPlayer)
    {
        float rate = isPlayer ? 0.025f : 0.05f;
        int heal = (int)(damageDealt * rate);
        return heal;
    }

    public static void 治疗玩家(Terraria.Player player, int damageDealt)
    {
        int heal = 吸血量(damageDealt, true);
        if (heal > 0) player.Heal(heal);
    }

    public static void 治疗酒狐(NPC fox, int damageDealt)
    {
        int heal = 吸血量(damageDealt, false);
        if (heal > 0)
        {
            Player owner = 酒狐NPC状态.GetTargetPlayer(fox);
            // 芳心织囊：酒狐吸血翻倍
            if (owner != null && 酒狐佩戴(owner, ModContent.ItemType<芳心织囊>()))
                heal *= 2;
            // 流转之心：所有恢复+20%（含吸血）
            if (owner != null && 酒狐佩戴(owner, ModContent.ItemType<流转之心>()))
                heal = (int)(heal * 1.2f);
            fox.life += heal;
            if (fox.life > fox.lifeMax) fox.life = fox.lifeMax;
        }
    }

    //酒狐近战命中：伤害归酒狐，触发酒狐身上吸血/追加伤害
    public static void 酒狐近战命中(Terraria.Player owner, NPC fox, NPC target, int damageDealt)
    {
        if (酒狐佩戴(owner, ModContent.ItemType<嗜血之心>()))
            治疗酒狐(fox, damageDealt);
        if (酒狐佩戴(owner, ModContent.ItemType<混沌之书>()))
            登记回声(target, damageDealt, true, fox.whoAmI);
        元素减益(target, owner, true);   //超级元素史莱姆
        if (戴紫荆(owner, true))
            紫荆减防命中(target);   //紫荆冠刺：命中减防
    }

    //超级元素史莱姆：攻击附带流血/中毒/着火/剧毒/诅咒焰/灵液/霜冻
    public static void 元素减益(NPC target, Terraria.Player owner, bool isFox)
    {
        if (target == null || !target.active) return;
        bool has = isFox ? 酒狐佩戴(owner, ModContent.ItemType<超级元素史莱姆>()) : 玩家佩戴(owner, ModContent.ItemType<超级元素史莱姆>());
        if (!has) return;
        if (Main.rand.NextFloat() > 0.75f) return;   //约75%概率挂上
        int[] buffs = { BuffID.Bleeding, BuffID.Poisoned, BuffID.OnFire, BuffID.Venom, BuffID.CursedInferno, BuffID.Ichor, BuffID.Frostburn };
        foreach (int b in buffs)
            target.AddBuff(b, 6 * 60);
    }

    //==================== 混沌之书：延迟追击伤害 ====================
    private sealed class 回声
    {
        public int Delay;       // 剩余 tick
        public int Target;      // 目标 whoAmI
        public int Damage;      // 额外伤害(5%)
        public bool FoxSource;  // 来源是酒狐还是玩家
        public int SourceWho;   // 酒狐 whoAmI 或 玩家 whoAmI
    }

    private static readonly List<回声> echoes = new();

    public static void 登记回声(NPC target, int damageDealt, bool foxSource, int sourceWho)
    {
        int extra = (int)(damageDealt * 0.05f);
        if (extra <= 0 || target == null || !target.active) return;
        echoes.Add(new 回声 { Delay = 15, Target = target.whoAmI, Damage = System.Math.Max(1, extra), FoxSource = foxSource, SourceWho = sourceWho });
    }

    public override void PostUpdateEverything()
    {
        // 紫荆冠刺：维持被命中目标的临时减防
        try { 紫荆减防更新(); } catch { }

        // 双心之链：任意一方HP下降就均分伤害
        for (int p = 0; p < Main.maxPlayers; p++)
        {
            Terraria.Player player = Main.player[p];
            if (player == null || !player.active) continue;
            双心之链均衡(player);
            更新玩家护盾(player);

            // 酒狐护盾：为每个存在酒狐更新
            NPC fox = 找酒狐(player);
            if (fox != null && fox.active)
                更新狐护盾(player, fox);
        }

        for (int i = echoes.Count - 1; i >= 0; i--)
        {
            回声 e = echoes[i];
            if (--e.Delay > 0) continue;
            echoes.RemoveAt(i);
            if (e.Target < 0 || e.Target >= Main.maxNPCs) continue;
            NPC target = Main.npc[e.Target];
            if (!target.active || target.life <= 0 || target.dontTakeDamage) continue;

            target.SimpleStrikeNPC(e.Damage, 0, false, 0f, DamageClass.Generic);

            // 追加伤害同样计入吸血（嗜血之心）
            if (e.FoxSource)
            {
                NPC fox = FindFoxByWho(e.SourceWho);
                if (fox != null && fox.active)
                {
                    Terraria.Player owner = 酒狐NPC状态.GetTargetPlayer(fox);
                    if (owner != null && 酒狐佩戴(owner, ModContent.ItemType<嗜血之心>()))
                        治疗酒狐(fox, e.Damage);
                }
            }
            else
            {
                if (e.SourceWho >= 0 && e.SourceWho < Main.maxPlayers)
                {
                    Terraria.Player p = Main.player[e.SourceWho];
                    if (p != null && p.active && 玩家佩戴(p, ModContent.ItemType<嗜血之心>()))
                        治疗玩家(p, e.Damage);
                }
            }
        }
    }

    private static NPC FindFoxByWho(int who)
    {
        if (who < 0 || who >= Main.maxNPCs) return null;
        NPC n = Main.npc[who];
        return n != null && n.active && n.type == ModContent.NPCType<酒狐>() ? n : null;
    }

    //==================== 法术强化核心：护盾 & 魔法箭 ====================
    private const int 护盾间隔 = 30 * 60;   //30秒
    private const int 护盾上限 = 2;
    // 护盾层数 / 计时（按主人索引）。玩家与酒狐分表，避免 whoAmI 冲突。
    private static readonly Dictionary<int, int> 玩家护盾层数 = new();
    private static readonly Dictionary<int, int> 玩家护盾计时 = new();
    private static readonly Dictionary<int, int> 狐护盾层数 = new();
    private static readonly Dictionary<int, int> 狐护盾计时 = new();
    // 护盾流光弹幕索引（按主人索引）
    private static readonly Dictionary<int, int> 玩家护盾弹 = new();
    private static readonly Dictionary<int, int> 狐护盾弹 = new();

    // 佩戴判定：是否装了 法术强化核心（玩家槽 / 酒狐槽）
    public static bool 有法术核心(Terraria.Player owner, bool isFox)
    {
        int t = ModContent.ItemType<法术强化核心>();
        return isFox ? 酒狐佩戴(owner, t) : 玩家佩戴(owner, t);
    }

    public static int 取玩家护盾层数(int who)
        => 玩家护盾层数.TryGetValue(who, out int v) ? v : 0;
    public static int 取护盾层数(int foxWho)
        => 狐护盾层数.TryGetValue(foxWho, out int v) ? v : 0;

    // 每tick调用：玩家护盾充能 + 护盾流光弹幕维持
    private static void 更新玩家护盾(Terraria.Player player)
    {
        int who = player.whoAmI;
        bool has = 玩家佩戴(player, ModContent.ItemType<法术强化核心>());
        if (!has)
        {
            玩家护盾层数.Remove(who);
            玩家护盾计时.Remove(who);
            KillShieldProj(玩家护盾弹, who);
            return;
        }
        int layer = 玩家护盾层数.TryGetValue(who, out int l) ? l : 0;
        int timer = 玩家护盾计时.TryGetValue(who, out int tm) ? tm : 0;
        if (layer < 护盾上限)
        {
            timer++;
            if (timer >= 护盾间隔) { layer++; timer = 0; }
        }
        玩家护盾层数[who] = layer;
        玩家护盾计时[who] = timer;
        维持护盾弹(player, false, null, 玩家护盾弹, who);
    }

    // 每tick调用：酒狐护盾充能 + 护盾流光弹幕维持
    private static void 更新狐护盾(Terraria.Player owner, NPC fox)
    {
        int fWho = fox.whoAmI;
        bool has = 酒狐佩戴(owner, ModContent.ItemType<法术强化核心>());
        if (!has)
        {
            狐护盾层数.Remove(fWho);
            狐护盾计时.Remove(fWho);
            KillShieldProj(狐护盾弹, fWho);
            return;
        }
        int layer = 狐护盾层数.TryGetValue(fWho, out int l) ? l : 0;
        int timer = 狐护盾计时.TryGetValue(fWho, out int tm) ? tm : 0;
        if (layer < 护盾上限)
        {
            timer++;
            if (timer >= 护盾间隔) { layer++; timer = 0; }
        }
        狐护盾层数[fWho] = layer;
        狐护盾计时[fWho] = timer;
        维持护盾弹(owner, true, fox, 狐护盾弹, fWho);
    }

    // 确保护盾流光弹幕存在；摘下时销毁
    private static void 维持护盾弹(Terraria.Player owner, bool isFox, NPC fox, Dictionary<int, int> map, int who)
    {
        if (map.TryGetValue(who, out int proj) && proj >= 0 && proj < Main.maxProjectiles && Main.projectile[proj] != null && Main.projectile[proj].active)
            return;   //已存在
        int spawned = Projectile.NewProjectile(owner.GetSource_Misc("法术核心护盾"),
            isFox && fox != null ? fox.Center : owner.Center, Vector2.Zero,
            ModContent.ProjectileType<强化护盾>(), 0, 0f, owner.whoAmI);
        if (spawned >= 0 && spawned < Main.maxProjectiles && Main.projectile[spawned] != null)
        {
            Terraria.Projectile p = Main.projectile[spawned];
            p.ai[0] = who;
            p.ai[1] = isFox ? 1 : 0;
            p.timeLeft = 2;
            map[who] = spawned;
        }
    }

    private static void KillShieldProj(Dictionary<int, int> map, int who)
    {
        if (map.TryGetValue(who, out int proj))
        {
            if (proj >= 0 && proj < Main.maxProjectiles && Main.projectile[proj] != null && Main.projectile[proj].active)
                Main.projectile[proj].Kill();
            map.Remove(who);
        }
    }

    // 护盾挡住一次伤害：层数-1，返回是否成功挡住。成功时播放破碎粒子
    public static bool 尝试消耗护盾(Terraria.Player owner, bool isFox, NPC fox)
    {
        if (isFox)
        {
            if (fox == null) return false;
            int fWho = fox.whoAmI;
            if (!狐护盾层数.TryGetValue(fWho, out int l) || l <= 0) return false;
            狐护盾层数[fWho] = l - 1;
            护盾破碎特效(fox.Center);
            return true;
        }
        int who = owner.whoAmI;
        if (!玩家护盾层数.TryGetValue(who, out int pl) || pl <= 0) return false;
        玩家护盾层数[who] = pl - 1;
        护盾破碎特效(owner.Center);
        return true;
    }

    private static void 护盾破碎特效(Vector2 center)
    {
        if (Main.dedServ) return;
        for (int i = 0; i < 14; i++)
        {
            Dust d = Dust.NewDustPerfect(center + Main.rand.NextVector2Circular(30f, 30f), DustID.PurpleCrystalShard,
                Main.rand.NextVector2Circular(-4f, -4f), 0, new Color(200, 100, 255), 1.3f);
            d.noGravity = true;
        }
        Terraria.Audio.SoundEngine.PlaySound(Terraria.ID.SoundID.Item44, center);   //水晶碎b声
    }

    // 攻击时额外召唤魔法箭（伤害 +200）
    private static int 魔法箭下次tick = int.MinValue;
    public static void 法术核心魔法箭(Terraria.Player owner, Vector2 from, Vector2 toward, int baseDamage)
    {
        if (Main.GameUpdateCount < 魔法箭下次tick) return;
        魔法箭下次tick = (int)Main.GameUpdateCount + 12;
        Vector2 vel = toward - from;
        if (vel == Vector2.Zero) return;
        vel.Normalize();
        vel *= 14f;
        int dmg = baseDamage + 200;
        int proj = Projectile.NewProjectile(owner.GetSource_Misc("法术核心魔法箭"), from, vel, ModContent.ProjectileType<法术魔法箭>(), dmg, 5f, owner.whoAmI);
        if (proj >= 0 && proj < Main.maxProjectiles) 酒狐攻击.FoxProjectiles.Add(proj);
    }

    //==================== 双心之链：伤害分担执行 ====================
    // 递归/重复触发保护（转移伤害时避免再次被“分担”）
    internal static bool 共享中;

    // 双心之链：酒狐在场并佩戴时才生效。恋还是练任务中，双心之链功能失效。
    public static bool 双心生效(Terraria.Player owner)
    {
        if (共享中) return false;
        //恋还是练：双心之链失效
        NPC fox = 找酒狐(owner);
        if (fox != null && 酒狐任务执行.恋还是练激活(fox))
            return false;
        return 酒狐在场佩戴(owner, ModContent.ItemType<双心之链>());
    }

    // 把一份伤害加给酒狐（带共享保护）
    public static void 伤害到酒狐(NPC fox, int damage)
    {
        if (damage <= 0) return;
        共享中 = true;
        fox.SimpleStrikeNPC(damage, 0, false, 0f, DamageClass.Generic);
        共享中 = false;
    }

    // 把一份伤害精确转给酒狐（不经过酒狐防御减免，保证50/50）
    public static void 伤害到酒狐精确(NPC fox, int damage)
    {
        if (damage <= 0) return;
        共享中 = true;
        fox.life -= damage;
        if (fox.life < 0) fox.life = 0;
        fox.netUpdate = true;
        共享中 = false;
    }

    // 把一份伤害加给玩家（带共享保护）
    public static void 伤害到玩家(Terraria.Player player, int damage)
    {
        if (damage <= 0) return;
        共享中 = true;
        player.Hurt(PlayerDeathReason.ByCustomReason(NetworkText.FromLiteral("被双心之链分担了伤害")), damage, 0);
        共享中 = false;
    }

    // 双心之链的HP基线（记录上一次看到的HP，用于检测“被扣血”）
    private static readonly Dictionary<int, int> shareBase = new();
    private const int FoxKeyOffset = 500000;

    // 每tick调用一次：当玩家或酒狐任意一方HP下降，就把该伤害均分为各一半（另一方承受另一半）
    private void 双心之链均衡(Terraria.Player player)
    {
        NPC fox = 找酒狐(player);
        int pKey = player.whoAmI;
        if (fox == null)
        {
            shareBase[pKey] = player.statLife;   //酒狐不在也刷新玩家基线，避免过期基线导致误判
            return;
        }
        bool active = 酒狐在场佩戴(player, ModContent.ItemType<双心之链>()) && !酒狐任务执行.恋还是练激活(fox);   //恋还是练：双心之链失效

        int fKey = FoxKeyOffset + fox.whoAmI;
        int playerPre = player.statLife;
        int foxPre = fox.life;

        // 玩家受伤的分担由 酒狐玩家.ModifyHurt(减半) + PostHurt(精确转一半) 处理，这里不再处理

        // 酒狐HP下降 → 先按魂之书减伤，再按双心之链与玩家均分
        if (shareBase.TryGetValue(fKey, out int fb))
        {
            int taken = fb - foxPre;
            if (taken > 0 && taken <= 100000)
            {
                bool hasSoulBook = 酒狐佩戴(player, ModContent.ItemType<魂之书>());
                bool hasDoubleHeart = active;

                // 魂之书减伤（降低实际承伤）
                if (hasSoulBook) taken = 魂之书减伤(fox, taken);

                // 双心之链：各承担一半
                if (hasDoubleHeart)
                {
                    int half = taken / 2;
                    if (half > 0) { fox.life += half; if (fox.life > fox.lifeMax) fox.life = fox.lifeMax; }
                    伤害到玩家(player, taken - half);
                }
            }
        }

        shareBase[pKey] = player.statLife;
        shareBase[fKey] = fox.life;
    }

    // 魂之书：酒狐承伤计算。返回"实际承伤"(已按规则降低)，并对超出部分/回血部分直接补回酒狐血。
    private static int 魂之书减伤(NPC fox, int taken)
    {
        int max = fox.lifeMax;
        if (max <= 0) return taken;
        if (taken > max * 0.60f)
        {
            int cap = (int)(max * 0.60f);                                  // 只承受到最大生命60%的伤害
            补血(fox, (taken - cap) + (int)(max * 0.30f));                  // 超出部分 + 立即回30%
            return cap;
        }
        if (taken > max * 0.30f)
        {
            补血(fox, (int)(max * 0.20f));                                 // 大于30%：立即回20%再承伤
            return taken;
        }
        int reduce = taken / 5;                                            // 其余：直接降20%再承伤
        补血(fox, reduce);
        return taken - reduce;
    }

    private static void 补血(NPC fox, int amount)
    {
        if (amount > 0) { fox.life += amount; if (fox.life > fox.lifeMax) fox.life = fox.lifeMax; }
    }

    //==================== 不死图腾 / 绀珠之药：复活 ====================
    // 玩家功能性饰品槽（不含装饰栏/染料栏）里是否存在指定饰品
    public static Item 找玩家饰品槽(Terraria.Player player, int itemType)
    {
        int 起始 = 3;
        int 数量 = 5 + player.extraAccessorySlots;
        for (int i = 起始; i < 起始 + 数量 && i < player.armor.Length; i++)
            if (player.armor[i].type == itemType) return player.armor[i];
        return null;
    }

    // 是否存在可用的复活饰品（不死图腾 / 绀珠之药）
    // isFox=true：先查酒狐饰品栏，再兜底查玩家功能性饰品栏
    public static bool 有复活饰(Terraria.Player owner, bool isFox)
    {
        int totemType = ModContent.ItemType<不死图腾>();
        int orbType = ModContent.ItemType<绀珠之药>();
        int orbInf = ModContent.ItemType<绀珠之药无限>();

        if (!isFox)
            return 找玩家饰品槽(owner, totemType) != null;

        //酒狐：酒狐饰品栏（图腾/绀珠之药）——只扫当前可用槽位
        酒狐玩家 狐数据 = owner.GetModPlayer<酒狐玩家>();
        for (int i = 0; i < 狐数据.饰品槽数量 && i < 狐数据.Accessories.Length; i++)
        {
            Item acc = 狐数据.Accessories[i];
            if (acc != null && (acc.type == totemType || acc.type == orbType || acc.type == orbInf)) return true;
        }
        //兜底：玩家功能性饰品栏里的不死图腾也能救酒狐一次
        return 找玩家饰品槽(owner, totemType) != null;
    }

    public static bool 尝试复活(Terraria.Player owner, bool isFox, NPC fox)
    {
        int totemType = ModContent.ItemType<不死图腾>();
        int orbType = ModContent.ItemType<绀珠之药>();
        int orbInfType = ModContent.ItemType<绀珠之药无限>();
        Item used = null;
        bool isOrb = false;

        if (isFox && fox != null)
        {
            //优先酒狐饰品栏（只扫当前可用槽位）
            酒狐玩家 狐数据2 = owner.GetModPlayer<酒狐玩家>();
            for (int i = 0; i < 狐数据2.饰品槽数量 && i < 狐数据2.Accessories.Length; i++)
            {
                Item acc = 狐数据2.Accessories[i];
                if (acc == null) continue;
                if (acc.type == totemType) { used = acc; break; }
                if (acc.type == orbType) { used = acc; isOrb = true; break; }
                if (acc.type == orbInfType) { used = acc; isOrb = true; break; }
            }
            //兜底：玩家功能性饰品栏里的不死图腾
            if (used == null) used = 找玩家饰品槽(owner, totemType);
        }
        else
        {
            used = 找玩家饰品槽(owner, totemType);
        }
        if (used == null || used.IsAir) return false;

        // 复活：恢复30%最大生命
        if (isFox && fox != null)
        {
            fox.life = (int)(fox.lifeMax * 0.30f);
            fox.HealEffect(3);
        }
        else
        {
            owner.statLife = (int)(owner.statLifeMax2 * 0.30f);
            owner.AddBuff(BuffID.ObsidianSkin, 60 * 60);   //1分钟抗火+免疫岩浆
            owner.AddBuff(BuffID.Ironskin, 30 * 60);       //30s铁皮
            owner.AddBuff(BuffID.Honey, 20 * 60);          //20s生命恢复
        }

        //====先消耗道具，再播特效====（顺序很重要：若特效抛异常也不会导致重复触发/不消耗）
        if (isOrb)
        {
            if (used.type == orbInfType)
            {
                Main.NewText("绀珠之药触发", new Color(120, 210, 255));
            }
            else
            {
                int before = 绀珠之药.获取次数(used);
                bool stillUsable = 绀珠之药.消耗一次(used);
                int left = before - 1;
                if (!stillUsable) Main.NewText("绀珠之药触发（已用尽）", new Color(120, 210, 255));
                else Main.NewText($"绀珠之药触发（剩余{left}次）", new Color(120, 210, 255));
            }
        }
        else
        {
            Main.NewText("不死图腾触发", new Color(255, 190, 70));
            used.TurnToAir();   //一次性消耗（必须先消耗）
        }

        //====特效（任何异常都不影响上面的消耗结果）====
        try { 播放复活特效(owner, isFox ? fox : null, isOrb); } catch { }
        return true;
    }

    private static void 播放复活特效(Terraria.Player owner, NPC fox, bool isOrb)
    {
        Vector2 center = fox != null ? fox.Center : owner.Center;
        if (!isOrb)
        {
            if (!Main.dedServ)
            {
                // 复活音效（自定义资源；若资源缺失则回退原版音效，绝不因此中断复活流程）
                try { Terraria.Audio.SoundEngine.PlaySound(不死图腾音效, center); }
                catch { Terraria.Audio.SoundEngine.PlaySound(SoundID.Item29 with { Volume = 1f }, center); }
            }
            Projectile.NewProjectile(owner.GetSource_Misc("不死图腾"), center + new Vector2(0f, -30f), Vector2.Zero, ModContent.ProjectileType<不死图腾特效>(), 0, 0f, owner.whoAmI);
        }
        // 复活粒子（非图腾少量，图腾大量）
        int count = isOrb ? 12 : 60;
        for (int i = 0; i < count; i++)
        {
            Dust d = Dust.NewDustDirect(center - new Vector2(20f, 20f), 40, 40, DustID.GoldFlame,
                Main.rand.NextFloat(-6f, 6f), Main.rand.NextFloat(-8f, 2f), 0, new Color(255, 220, 90), isOrb ? 1.1f : 2.2f);
            d.noGravity = true;
        }
    }

    //==================== 宝箱产出 ====================
    // ★ 概率统一放在这里，方便随时改（0=不产出，1=必定产出）。
    // 数值说明：野外/普通箱子数量极多，概率稍低也容易碰到；暗影/地牢/丛林箱较少，概率给足一些。
    private const float 概率_嗜血之心 = 0.25f;   //地狱暗影宝箱
    private const float 概率_绀珠之药 = 0.12f;   //丛林宝箱
    private const float 概率_低吟之戒 = 0.25f;   //地牢宝箱
    private const float 概率_不死图腾 = 0.18f;   //野外/普通箱子

    // 是否已经给这个世界注入过酒狐饰品（世界存档，避免重复注入）
    private bool 宝箱已注入;

    // 新世界生成时：给所有箱子注入酒狐饰品
    public override void PostWorldGen()
    {
        注入全部宝箱();
        宝箱已注入 = true;
    }

    // 已存在的旧世界（在本模组加入之前生成）：进世界时也补注一次，
    // 这样即使是在旧存档里开胸箱也能拿到饰品，而不是永远开不到。
    public override void OnWorldLoad()
    {
        if (!宝箱已注入)
        {
            注入全部宝箱();
            宝箱已注入 = true;
        }
    }

    public override void SaveWorldData(TagCompound tag) => tag["宝箱已注入"] = 宝箱已注入;
    public override void LoadWorldData(TagCompound tag) => 宝箱已注入 = tag.ContainsKey("宝箱已注入") && tag.GetBool("宝箱已注入");

    private void 注入全部宝箱()
    {
        for (int i = 0; i < Main.chest.Length; i++)
        {
            Chest c = Main.chest[i];
            if (c == null) continue;
            Tile tile = Main.tile[c.x, c.y];
            if (!tile.HasTile) continue;

            // 地狱暗影宝箱（无论上锁）→ 嗜血之心
            bool shadowChest = c.y > Main.maxTilesY - 201;
            if (shadowChest)
            {
                塞入箱子(c, ModContent.ItemType<嗜血之心>(), 概率_嗜血之心);
            }
            // 丛林宝箱（周围有丛林泥土/草地）→ 绀珠之药
            else if (在丛林(c))
            {
                塞入箱子(c, ModContent.ItemType<绀珠之药>(), 概率_绀珠之药);
            }
            // 地牢宝箱 → 低吟之戒
            else if (在地牢(c))
            {
                塞入箱子(c, ModContent.ItemType<低吟之戒>(), 概率_低吟之戒);
            }
            // 大部分野外箱子 → 不死图腾
            else
            {
                塞入箱子(c, ModContent.ItemType<不死图腾>(), 概率_不死图腾);
            }
        }
    }

    // 判断是否处于地牢（周围是地牢墙）
    private static bool 在地牢(Chest c)
    {
        for (int dy = -3; dy <= 3; dy++)
        {
            int wall = Main.tile[c.x, c.y + dy].WallType;
            if (wall == Terraria.ID.WallID.BlueDungeon || wall == Terraria.ID.WallID.GreenDungeon
                || wall == Terraria.ID.WallID.PinkDungeon)
                return true;
        }
        return false;
    }

    private static void 塞入箱子(Chest c, int itemType, float chance)
    {
        for (int s = 0; s < c.item.Length; s++)
        {
            if (c.item[s] == null || c.item[s].IsAir)
            {
                if (Main.rand.NextFloat() < chance)
                {
                    if (c.item[s] == null) c.item[s] = new Item();
                    c.item[s].SetDefaults(itemType);
                }
                break;
            }
        }
    }

    private static bool 在丛林(Chest c)
    {
        for (int dx = -2; dx <= 2; dx++)
        {
            for (int dy = -2; dy <= 2; dy++)
            {
                int x = c.x + dx, y = c.y + dy;
                if (x < 1 || y < 1 || x >= Main.maxTilesX - 1 || y >= Main.maxTilesY - 1) continue;
                Tile t = Main.tile[x, y];
                if (t.HasTile && (t.TileType == Terraria.ID.TileID.Mud || t.TileType == Terraria.ID.TileID.JungleGrass))
                    return true;
            }
        }
        return false;
    }
}
