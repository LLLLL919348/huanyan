using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.DataStructures;
using Terraria.ID;
using Terraria.ModLoader;
using Terraria.ModLoader.IO;

namespace 酒狐npc仆从;

public sealed class 酒狐玩家 : ModPlayer
{
    public int Affection;
    public bool HasReceivedSoulTalisman;
    public bool HasReceivedGuide;   //是否已赠送过“酒狐饰品图鉴”
    public bool HasReceivedOverlimit;   //是否已赠送过“法术超限”（好感度2级）
    public bool FoxActive;   //是否在世界上召唤了酒狐（用于退出重进后重生）
    public bool FoxDead;     //酒狐是否已死亡（用于 寻风之铃 复活判断）
    public int 上次喂食tick;  //上次喂食时的GameUpdateCount
    public int 上次好感tick;  //上次加好感度时的GameUpdateCount
    public int 上次摸摸好感tick;  //上次摸摸加好感时的GameUpdateCount
    public int 上次药剂tick;  //酒狐喝药水时的GameUpdateCount

    //进食冷却：手动喂食 / 酒狐自己吃 共用（原30s，现加长为60s）
    public const int 进食冷却 = 60 * 60;
    private readonly Dictionary<int, int> hostileNPCs = new();
    //武器槽1/2（"当前武器"栏）与武器槽3（法术超限解锁，加在最左边）
    public Item Weapon { get; private set; } = new();
    public Item Weapon2 { get; private set; } = new();
    public Item Weapon3 { get; private set; } = new();
    public int 当前武器槽;   //0=武器槽1，1=武器槽2，2=武器槽3

    //===== 当前手持武器：酒狐的近战/远程逻辑与贴图渲染都只看这一个 =====
    public Item 槽武器(int slot)
    {
        Item it = slot switch
        {
            1 => Weapon2,
            2 => Weapon3,
            _ => Weapon,
        };
        return it ?? new Item();
    }

    //武器槽数量：默认2，装备「法术超限」后3
    public int 武器槽数量 => 法术超限.已装备(Player) ? 3 : 2;

    //酒狐饰品槽数量：默认9（3x3），装备「法术超限」后12（下面再加一行）
    public int 饰品槽数量 => Math.Min(法术超限.已装备(Player) ? 12 : 9, Accessories.Length);

    public Item 当前武器
    {
        get
        {
            Item cur = 槽武器(当前武器槽);
            if (cur != null && !cur.IsAir) return cur;
            //当前槽为空 → 退回第一个非空武器槽，避免"手持空"
            for (int i = 0; i < 武器槽数量; i++)
            {
                Item it = 槽武器(i);
                if (it != null && !it.IsAir) return it;
            }
            return Weapon ?? new Item();
        }
    }

    public void 切换武器槽(int slot) => 当前武器槽 = Math.Clamp(slot, 0, 武器槽数量 - 1);

    public Item[] Armor { get; } = { new(), new(), new() };   //头盔/胸甲/护腿
    //饰品槽：9（3x3）+3（法术超限）=12
    public Item[] Accessories { get; } = new Item[12];
    public Item[] Storage { get; } = new Item[40];

    public override void Initialize()
    {
        Weapon = new Item();
        Weapon2 = new Item();
        Weapon3 = new Item();
        for (int index = 0; index < Armor.Length; index++)
            Armor[index] = new Item();
        for (int index = 0; index < Accessories.Length; index++)
            Accessories[index] = new Item();
        for (int index = 0; index < Storage.Length; index++)
            Storage[index] = new Item();
    }

    //酒狐享用的护甲防御力（不含星尘全套/仆从数量加成；这里只取护甲防御）
    public int GetArmorDefense()
    {
        int def = 0;
        foreach (Item a in Armor)
            if (a != null && !a.IsAir) def += a.defense;
        return def;
    }

    public override void OnEnterWorld()
    {
        if (!HasReceivedSoulTalisman && Player.whoAmI == Main.myPlayer)
        {
            酒狐魂符.SpawnContainingFox(Player);   //赠送“藏有酒狐的”魂符
            HasReceivedSoulTalisman = true;
        }
        if (!HasReceivedGuide && Player.whoAmI == Main.myPlayer)
        {
            Player.QuickSpawnItem(Player.GetSource_Misc("酒狐首次进入世界"), ModContent.ItemType<酒狐图鉴>());
            HasReceivedGuide = true;
        }
        //酒狐活着（召唤过且未死亡）→ 重进世界重生一次（长存）；死亡/主动收起则不自动放
        if (FoxActive && !FoxDead && Player.whoAmI == Main.myPlayer)
            TryResummonFox();
    }

    //记录玩家开过的箱子（避免把玩家放置/使用的箱子当自然宝箱）
    private int lastChestIndex = -1;
    public override void PostUpdate()
    {
        if (Player.chest >= 0 && Player.chest < Main.chest.Length && Player.chest != lastChestIndex)
        {
            Chest c = Main.chest[Player.chest];
            if (c != null)
                酒狐NPC状态.记录已开箱子(c.x, c.y);
            lastChestIndex = Player.chest;
        }
        else if (Player.chest < 0)
        {
            lastChestIndex = -1;
        }

        //★【保底·酒狐不会消失】复活（不死图腾/绀珠之药/死亡复活）后血>0，但原版死亡流程收尾
        // 仍可能把它置为未激活 → 这里把它拉回激活。血<=0（真死）不处理，交给 寻风之铃。
        if (Main.netMode != Terraria.ID.NetmodeID.MultiplayerClient && !FoxDead
            && Main.GameUpdateCount % 5 == 0)
        {
            for (int i = 0; i < Main.maxNPCs; i++)
            {
                NPC n = Main.npc[i];
                if (n == null || n.active || n.life <= 0) continue;
                if (n.type != ModContent.NPCType<酒狐>()) continue;
                if ((int)n.localAI[1] != Player.whoAmI) continue;
                if (酒狐NPC状态.是已收纳(n)) continue;   //★ 被魂符主动收纳的不要拉回来
                n.active = true;
                n.netUpdate = true;
            }
        }

        //★ 好感度达到2级（Affection ≥ 40）→ 直接赠送「法术超限」
        if (!HasReceivedOverlimit && Player.whoAmI == Main.myPlayer
            && GetLevel(Player) >= 2)
        {
            HasReceivedOverlimit = true;
            if (Main.netMode != Terraria.ID.NetmodeID.MultiplayerClient)
            {
                Player.QuickSpawnItem(Player.GetSource_Misc("酒狐好感度2级"), ModContent.ItemType<法术超限>());
                if (Main.netMode != Terraria.ID.NetmodeID.Server)
                    Main.NewText("酒狐：好感度到2级啦，这个「法术超限」送给你！", new Color(200, 140, 255));
            }
        }
    }

    private void TryResummonFox()
    {
        //已存在则跳过
        for (int index = 0; index < Main.maxNPCs; index++)
        {
            NPC npc = Main.npc[index];
            if (npc.active && npc.type == ModContent.NPCType<酒狐>() && (int)npc.localAI[1] == Player.whoAmI)
                return;
        }
        if (Main.netMode == Terraria.ID.NetmodeID.MultiplayerClient)
            return;
        int spawned = NPC.NewNPC(Player.GetSource_Misc("酒狐重生"), (int)Player.Center.X, (int)Player.Center.Y, ModContent.NPCType<酒狐>());
        if (spawned >= 0 && spawned < Main.maxNPCs)
            酒狐NPC状态.SetFollowTarget(Main.npc[spawned], Player.whoAmI);
    }

    public override void ResetEffects()
    {
        foreach (int npcWhoAmI in new List<int>(hostileNPCs.Keys))
        {
            hostileNPCs[npcWhoAmI]--;
            if (hostileNPCs[npcWhoAmI] <= 0)
                hostileNPCs.Remove(npcWhoAmI);
        }
    }

    //酒狐喝药水：背包里有治疗药水且受伤时使用，间隔10s，消耗1瓶。
    //返回 true 表示本帧使用了药水（已回血并扣除）。
    public bool 酒狐喝药水(NPC fox)
    {
        if (fox == null || !fox.active) return false;
        if (fox.life >= fox.lifeMax) return false;   //满血不喝
        if (Main.netMode == Terraria.ID.NetmodeID.MultiplayerClient) return false;

        int now = (int)Main.GameUpdateCount;
        if (now - 上次药剂tick < 10 * 60) return false;   //10s间隔

        //找一颗治疗药水（healLife>0）——酒狐背包(Storage)/武器槽(Weapon)
        Item potion = 找治疗药水();
        if (potion == null) return false;

        int heal = Math.Max(1, potion.healLife);
        //芳心织囊：恢复药剂翻倍
        if (酒狐饰品.酒狐佩戴(Player, ModContent.ItemType<芳心织囊>()))
            heal *= 2;
        //流转之心：所有恢复+20%
        if (酒狐饰品.酒狐佩戴(Player, ModContent.ItemType<流转之心>()))
            heal = (int)(heal * 1.2f);

        potion.stack--;
        if (potion.stack <= 0) potion.TurnToAir();
        fox.life += heal;
        if (fox.life > fox.lifeMax) fox.life = fox.lifeMax;
        fox.HealEffect(heal);
        fox.netUpdate = true;
        上次药剂tick = now;
        if (Main.netMode != NetmodeID.Server)
            Main.NewText("酒狐：喝下一瓶治疗药水，感觉好多了~", new Color(140, 230, 160));
        return true;
    }

    private Item 找治疗药水()
    {
        //武器槽1/2
        if (Weapon != null && !Weapon.IsAir && Weapon.healLife > 0 && Weapon.stack > 0) return Weapon;
        if (Weapon2 != null && !Weapon2.IsAir && Weapon2.healLife > 0 && Weapon2.stack > 0) return Weapon2;
        //酒狐背包
        foreach (Item it in Storage)
            if (it != null && !it.IsAir && it.healLife > 0 && it.stack > 0) return it;
        //玩家背包（退而求其次）
        foreach (Item it in Player.inventory)
            if (it != null && !it.IsAir && it.healLife > 0 && it.stack > 0) return it;
        return null;
    }

    //===== 背包功能 =====
    // 获取全部：把酒狐背包所有物品搬到玩家背包（同类叠加优先，其次空槽）；放不下的留原地
    public static void 获取全部到玩家(Player player)
    {
        酒狐玩家 data = player.GetModPlayer<酒狐玩家>();
        foreach (Item it in data.Storage)
        {
            if (it == null || it.IsAir) continue;
            if (TryStackOrPlace(player.inventory, it))
                it.TurnToAir();
        }
    }

    private static bool TryStackOrPlace(Item[] inv, Item item)
    {
        //同类叠加
        foreach (Item slot in inv)
        {
            if (slot == null || slot.IsAir || slot.type != item.type) continue;
            int can = slot.maxStack - slot.stack;
            if (can > 0)
            {
                int move = Math.Min(can, item.stack);
                slot.stack += move;
                item.stack -= move;
                if (item.stack <= 0) return true;
            }
        }
        //空槽
        for (int i = 0; i < inv.Length; i++)
            if (inv[i] == null || inv[i].IsAir)
            {
                if (inv[i] == null) inv[i] = new Item();
                inv[i] = item.Clone();
                return true;
            }
        return false;
    }

    // 堆叠附近箱子：找玩家附近(约10格)的箱子，把酒狐背包里同类型的物品堆进去
    public static void 堆叠到附近箱子(Player player)
    {
        酒狐玩家 data = player.GetModPlayer<酒狐玩家>();
        int cx = (int)(player.Center.X / 16f), cy = (int)(player.Center.Y / 16f);
        int range = 10;   //约10格
        var chests = new List<Chest>();
        for (int i = 0; i < Main.chest.Length; i++)
        {
            Chest c = Main.chest[i];
            if (c == null) continue;
            int tx = c.x, ty = c.y;
            if (Math.Abs(tx - cx) <= range && Math.Abs(ty - cy) <= range)
                chests.Add(c);
        }
        if (chests.Count == 0) return;

        foreach (Item it in data.Storage)
        {
            if (it == null || it.IsAir) continue;
            foreach (Chest c in chests)
            {
                for (int s = 0; s < c.item.Length; s++)
                {
                    Item slot = c.item[s];
                    if (slot != null && !slot.IsAir && slot.type == it.type && slot.stack < slot.maxStack)
                    {
                        int can = slot.maxStack - slot.stack;
                        int move = Math.Min(can, it.stack);
                        slot.stack += move;
                        it.stack -= move;
                        if (it.stack <= 0) { it.TurnToAir(); break; }
                    }
                }
                if (it.IsAir) break;
            }
        }
    }

    // 一键整理背包：把酒狐背包按类型分堆，同类合并、空格压到后面
    public static void 一键整理背包(Player player)
    {
        酒狐玩家 data = player.GetModPlayer<酒狐玩家>();
        Item[] arr = data.Storage;
        for (int i = 0; i < arr.Length; i++)
        {
            if (arr[i] == null || arr[i].IsAir) continue;
            for (int j = i + 1; j < arr.Length; j++)
            {
                if (arr[j] == null || arr[j].IsAir || arr[j].type != arr[i].type) continue;
                int can = arr[i].maxStack - arr[i].stack;
                int move = Math.Min(can, arr[j].stack);
                arr[i].stack += move;
                arr[j].stack -= move;
                if (arr[j].stack <= 0) arr[j].TurnToAir();
                if (arr[i].stack >= arr[i].maxStack) break;
            }
        }
        //把空/空气物品挤到末尾
        for (int i = 0; i < arr.Length; i++)
        {
            if (arr[i] != null && !arr[i].IsAir) continue;
            for (int j = i + 1; j < arr.Length; j++)
            {
                if (arr[j] != null && !arr[j].IsAir)
                {
                    Item tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
                    break;
                }
            }
        }
    }

    //摸摸加好感：20%概率+1点；加好感后180s(10800tick)冷却
    public static void 摸摸好感(NPC fox)
    {
        if (fox == null || !fox.active) return;
        if (Main.netMode == Terraria.ID.NetmodeID.MultiplayerClient) return;
        Player p = 酒狐NPC状态.GetTargetPlayer(fox);
        if (p == null) return;
        酒狐玩家 data = p.GetModPlayer<酒狐玩家>();
        int now = (int)Main.GameUpdateCount;
        //冷却中不再判定
        if (now - data.上次摸摸好感tick < 180 * 60) return;
        if (Main.rand.NextFloat() >= 0.20f) return;   //20%成功
        data.Affection++;
        data.上次摸摸好感tick = now;
        if (Main.netMode != NetmodeID.Server)
        {
            酒狐头顶文本.直接说话(fox, "酒狐：好开心！好感度+1");
            fox.HealEffect(1);
        }
    }

    //====喂食酒狐：玩家拿食物/恢复药剂右键酒狐====
    public bool 尝试喂食(Item food)
    {
        if (food == null || food.IsAir || !(food.buffType > 0 || food.healLife > 0))
            return false;
        NPC fox = 酒狐饰品.找酒狐(Player);
        if (fox == null)
        {
            Main.NewText("酒狐不在身边", new Microsoft.Xna.Framework.Color(220, 170, 140));
            return false;
        }

        bool isPotion = food.healLife > 0;

        //【药剂】新设定：可一直喂，无冷却、无文本、不加好感度
        if (isPotion)
        {
            food.stack--;
            if (food.stack <= 0) food.TurnToAir();
            酒狐.TriggerHearts(fox.whoAmI);
            int potionHeal = food.healLife;
            // 芳心织囊：酒狐恢复药剂翻倍
            if (酒狐饰品.酒狐佩戴(Player, ModContent.ItemType<芳心织囊>()))
                potionHeal *= 2;
            fox.life += potionHeal;
            if (fox.life > fox.lifeMax) fox.life = fox.lifeMax;
            fox.HealEffect(potionHeal);
            return true;
        }

        //【食物】原有：进食间隔 + 好感度(3分钟冷却) + 头顶文本提示
        int now = (int)Main.GameUpdateCount;
        if (now - 上次喂食tick < 进食冷却)
        {
            酒狐头顶文本.直接说话(fox, "酒狐：现在不想吃（稍后再试）");
            return false;
        }
        return 吃下食物(food, fox, now, false);
    }

    //===== 真正的“吃”逻辑（被喂食 / 酒狐自己从背包拿，共用同一套效果）=====
    private bool 吃下食物(Item food, NPC fox, int now, bool 自己吃)
    {
        if (food == null || food.IsAir || food.stack <= 0) return false;

        food.stack--;
        if (food.stack <= 0) food.TurnToAir();
        酒狐.TriggerHearts(fox.whoAmI);

        int snack = (int)(fox.lifeMax * 0.06f) + 5;
        fox.life += snack;
        if (fox.life > fox.lifeMax) fox.life = fox.lifeMax;
        fox.HealEffect(snack);
        fox.netUpdate = true;

        // 好感度：+1，且需等3分钟(3*60*60 tick)才能再加（芳心织囊额外+1）
        if (now - 上次好感tick >= 3 * 60 * 60)
        {
            int gain = 1;
            if (酒狐饰品.酒狐佩戴(Player, ModContent.ItemType<芳心织囊>()))
                gain++;
            Affection += gain;
            上次好感tick = now;
            酒狐头顶文本.直接说话(fox, 自己吃 ? $"酒狐：自己翻到好吃的了！好感度+{gain}" : $"酒狐：好开心！好感度+{gain}");
        }
        else
        {
            酒狐头顶文本.直接说话(fox, 自己吃 ? "酒狐：背包里的点心，吃掉啦~" : "酒狐：吃得很满足~");
        }

        上次喂食tick = now;   //进食间隔（手动喂 / 自己吃 共用同一个冷却）
        //进食后：重置讨食倒计时（重新计时）
        酒狐NPC状态.重置讨食(fox);
        return true;
    }

    //===== 酒狐主动进食：背包/武器槽里有食物，进食冷却一好就直接自己吃掉 =====
    //效果与“被玩家喂食”完全一致（回血、好感度、头顶台词、重置讨食倒计时）。
    public bool 酒狐主动进食(NPC fox)
    {
        if (fox == null || !fox.active) return false;
        if (Main.netMode == NetmodeID.MultiplayerClient) return false;

        int now = (int)Main.GameUpdateCount;
        if (now - 上次喂食tick < 进食冷却) return false;   //进食冷却未到

        Item food = 找食物();
        if (food == null) return false;

        return 吃下食物(food, fox, now, true);
    }

    //在酒狐自己的“武器槽1/2 + 背包”里找可吃的食物（buffType>0 即食物/增益类消耗品）
    private Item 找食物()
    {
        if (Weapon != null && !Weapon.IsAir && Weapon.buffType > 0 && Weapon.stack > 0) return Weapon;
        if (Weapon2 != null && !Weapon2.IsAir && Weapon2.buffType > 0 && Weapon2.stack > 0) return Weapon2;
        foreach (Item it in Storage)
            if (it != null && !it.IsAir && it.buffType > 0 && it.stack > 0) return it;
        return null;
    }

    //芳心织囊：玩家使用恢复药剂治疗量+50%；流转之心：所有恢复+20%
    public override void GetHealLife(Item item, bool quickHeal, ref int healValue)
    {
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<芳心织囊>()))
            healValue = (int)(healValue * 1.5f);
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<流转之心>()))
            healValue = (int)(healValue * 1.2f);
    }

    public override void OnHitNPCWithItem(Item item, NPC target, NPC.HitInfo hit, int damageDone)
    {
        MarkHostile(target);
        玩家攻击命中(target, damageDone);
        //法术强化核心：攻击命中额外召唤魔法箭
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<法术强化核心>()))
            酒狐饰品.法术核心魔法箭(Player, Player.Center, target.Center, damageDone);
    }

    //法术强化核心：射击类武器额外召唤魔法箭
    public override bool Shoot(Item item, EntitySource_ItemUse_WithAmmo source, Vector2 position, Vector2 velocity, int type, int damage, float knockback)
    {
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<法术强化核心>()))
            酒狐饰品.法术核心魔法箭(Player, position, position + velocity, damage);
        return true;
    }

    public override void OnHitNPCWithProj(Projectile projectile, NPC target, NPC.HitInfo hit, int damageDone)
    {
        MarkHostile(target);
        //酒狐发射的弹幕（主人=玩家）：伤害归酒狐，触发酒狐身上的吸血/追加伤害
        if (酒狐攻击.FoxProjectiles.Contains(projectile.whoAmI))
        {
            酒狐弹幕命中(target, damageDone);
            return;
        }
        玩家攻击命中(target, damageDone);
    }

    //玩家自身攻击：命中敌人时的吸血（嗜血之心）与追加伤害登记（混沌之书）
    private void 玩家攻击命中(NPC target, int damageDone)
    {
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<嗜血之心>()))
            酒狐饰品.治疗玩家(Player, damageDone);
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<混沌之书>()))
            酒狐饰品.登记回声(target, damageDone, false, Player.whoAmI);
        酒狐饰品.元素减益(target, Player, false);   //超级元素史莱姆
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<紫荆冠刺>()))
            酒狐饰品.紫荆减防命中(target);   //紫荆冠刺：命中减防
    }

    //酒狐弹幕命中：伤害归酒狐，触发酒狐身上的吸血/追加伤害
    private void 酒狐弹幕命中(NPC target, int damageDone)
    {
        NPC fox = 酒狐饰品.找酒狐(Player);
        if (fox == null || !fox.active) return;
        if (酒狐饰品.酒狐佩戴(Player, ModContent.ItemType<嗜血之心>()))
            酒狐饰品.治疗酒狐(fox, damageDone);
        if (酒狐饰品.酒狐佩戴(Player, ModContent.ItemType<混沌之书>()))
            酒狐饰品.登记回声(target, damageDone, true, fox.whoAmI);
        酒狐饰品.元素减益(target, Player, true);   //超级元素史莱姆(酒狐)
    }

    //双心之链：玩家受伤时先减半；救赎之戒：受到任意来源伤害降为75%
    public override void ModifyHurt(ref Player.HurtModifiers modifiers)
    {
        // 恋还是练：玩家受致命伤害时→任务结束 + 短暂无敌 + 恢复友方
        if (酒狐饰品.有法术核心(Player, false) && 酒狐饰品.尝试消耗护盾(Player, false, null) && modifiers.DamageSource != null)
        {
            modifiers.IncomingDamageMultiplier *= 0f;
            return;
        }
        // 恋还是练：酒狐短暂无敌期间，玩家也免疫所有伤害
        NPC fox = 酒狐饰品.找酒狐(Player);
        if (fox != null && 酒狐任务执行.恋还是练激活(fox) && 酒狐任务执行.无敌中(fox))
        {
            modifiers.IncomingDamageMultiplier *= 0f;
            return;
        }
        if (酒狐饰品.双心生效(Player))
            modifiers.IncomingDamageMultiplier *= 0.5f;
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<救赎之戒>()))
            modifiers.IncomingDamageMultiplier *= 0.75f;
        // 磐石水晶：减少5%所受弹幕伤害
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<磐石水晶>())
           && modifiers.DamageSource != null && modifiers.DamageSource.SourceProjectileLocalIndex >= 0)
        {
            modifiers.IncomingDamageMultiplier *= 0.95f;
        }
        // 紫荆冠刺：受到的近战伤害降低20%
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<紫荆冠刺>())
           && modifiers.DamageSource != null && modifiers.DamageSource.SourceProjectileLocalIndex < 0
           && modifiers.DamageSource.SourceNPCIndex >= 0)
        {
            modifiers.IncomingDamageMultiplier *= 0.8f;
        }
    }

    //法术强化核心：玩家自己使用的法术武器伤害+50%（酒狐的武器伤害在 酒狐饰品.攻击伤害 单独处理）
    public override void ModifyWeaponDamage(Item item, ref StatModifier damage)
    {
        if (item.DamageType == DamageClass.Magic && 酒狐饰品.玩家佩戴(Player, ModContent.ItemType<法术强化核心>()))
            damage *= 1.5f;
    }

    //法术强化核心：魔力值+200；烬华之戒：玩家+5防御力；流转之心：防御+5%
    public override void PostUpdateEquips()
    {
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<法术强化核心>()))
            Player.statManaMax2 += 200;
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<烬华之戒>()))
            Player.statDefense += 5;
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<紫荆冠刺>()))
            Player.statDefense += 15;
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<流转之心>()))
            Player.statDefense += (int)(Player.statDefense * 0.05f);
    }

    //流转之心：最大生命+10%
    public override void ModifyMaxStats(out StatModifier health, out StatModifier mana)
    {
        health = StatModifier.Default;
        mana = StatModifier.Default;
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<流转之心>()))
            health *= 1.10f;
    }

    //法术强化核心：魔法恢复+50%；救赎之戒：玩家持续生命恢复；流转之心：加速自然生命恢复+魔法恢复
    public override void PostUpdateBuffs()
    {
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<法术强化核心>()))
            Player.manaRegenBonus += (int)(Player.manaRegen * 0.5f);
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<救赎之戒>()))
            Player.lifeRegen += 5;
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<流转之心>()))
        {
            Player.lifeRegen += (int)(Player.lifeRegen * 0.4f) + 3;
            Player.manaRegenBonus += (int)(Player.manaRegen * 0.5f);
        }
    }

    //救赎之戒：玩家造成伤害+20%；烬华之戒：每降低2%最大生命 → 攻击+0.5%
    public override void ModifyHitNPCWithItem(Item item, NPC target, ref NPC.HitModifiers modifiers)
    {
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<救赎之戒>()))
            modifiers.SourceDamage = modifiers.SourceDamage * 1.2f;
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<烬华之戒>()) && Player.statLifeMax2 > 0)
            modifiers.SourceDamage = modifiers.SourceDamage * 烬华之戒.攻击加成((float)Player.statLife / Player.statLifeMax2);
    }
    public override void ModifyHitNPCWithProj(Projectile proj, NPC target, ref NPC.HitModifiers modifiers)
    {
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<救赎之戒>()))
            modifiers.SourceDamage = modifiers.SourceDamage * 1.2f;
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<烬华之戒>()) && Player.statLifeMax2 > 0)
            modifiers.SourceDamage = modifiers.SourceDamage * 烬华之戒.攻击加成((float)Player.statLife / Player.statLifeMax2);
    }

    public override void PostHurt(Player.HurtInfo info)
    {
        if (酒狐饰品.双心生效(Player))
        {
            int half = info.Damage;   //玩家已减半，这里就是把另一半精确转给酒狐
            if (half > 0)
            {
                NPC fox = 酒狐饰品.找酒狐(Player);
                if (fox != null && fox.active)
                    酒狐饰品.伤害到酒狐精确(fox, half);
            }
        }
        //烬华之戒：受击后短暂无敌（若无敌帧不足，补足到 45tick=0.75s）
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<烬华之戒>()) && Player.immuneTime < 45)
            Player.immuneTime = 45;
        //紫荆冠刺：受到的伤害全额返还给伤害者（NPC近战）
        if (酒狐饰品.玩家佩戴(Player, ModContent.ItemType<紫荆冠刺>()) && info.Damage > 0 && info.DamageSource != null)
        {
            int srcNpc = info.DamageSource.SourceNPCIndex;
            if (srcNpc >= 0 && srcNpc < Main.maxNPCs)
            {
                NPC source = Main.npc[srcNpc];
                if (source != null && source.active && !source.dontTakeDamage)
                    source.SimpleStrikeNPC(info.Damage, 0, false, 0f, DamageClass.Generic);
            }
        }
    }

    public void MarkHostile(NPC target)
    {
        if (target.active && !target.dontTakeDamage && target.type != NPCID.TargetDummy)
            hostileNPCs[target.whoAmI] = 60 * 20;
    }

    //钓鱼约5%概率钓到不死图腾（替代鱼获）
    public override void CatchFish(FishingAttempt attempt, ref int itemDrop, ref int npcSpawn, ref AdvancedPopupRequest sonar, ref Vector2 sonarPosition)
    {
        if (Main.rand.NextFloat() < 0.05f)
            itemDrop = ModContent.ItemType<不死图腾>();
    }

    //不死图腾：玩家生命归零/死亡时复活（恢复30%最大生命+增益+特效，随后道具销毁）
    public override bool PreKill(double damage, int hitDirection, bool pvp, ref bool playSound, ref bool genDust, ref PlayerDeathReason damageSource)
    {
        // 恋还是练：玩家受致命伤害时，结束任务并短暂无敌、恢复友方
        if (酒狐任务执行.玩家致命保护(Player))
        {
            playSound = false;
            genDust = false;
            Player.dead = false;
            return false;   //不死
        }
        if (酒狐饰品.尝试复活(Player, false, null))
        {
            playSound = false;
            genDust = false;
            Player.dead = false;
            return false;   //不死
        }
        return true;
    }

    public bool IsHostile(NPC target)
    {
        return hostileNPCs.TryGetValue(target.whoAmI, out int timeLeft) && timeLeft > 0;
    }

    public bool IsBeingThreatenedBy(NPC target)
    {
        return target.active && !target.friendly && target.target == Player.whoAmI;
    }

    public int AffectionLevel => GetLevel(Player);

    public void SetWeapon(Item item)
    {
        Weapon = item ?? new Item();
    }

    public void SetWeapon2(Item item)
    {
        Weapon2 = item ?? new Item();
    }

    public void SetWeapon3(Item item)
    {
        Weapon3 = item ?? new Item();
    }

    //是否装备了「梦云水晶」（检查酒狐饰品栏 + 玩家饰品槽）
    public bool HasDreamCrystalEquipped()
    {
        int crystalType = ModContent.ItemType<梦云水晶>();
        for (int i = 0; i < 饰品槽数量 && i < Accessories.Length; i++)
        {
            if (Accessories[i].type == crystalType)
                return true;
        }
        //玩家功能性饰品槽（不含装饰栏）
        return 酒狐饰品.玩家佩戴(Player, crystalType);
    }

    public static int GetLevel(Terraria.Player player)
    {
        int affection = player.GetModPlayer<酒狐玩家>().Affection;
        if (affection >= 80)
            return 3;
        if (affection >= 40)
            return 2;
        if (affection >= 20)
            return 1;
        return 0;
    }

    public static int GetNextRequirement(Terraria.Player player)
    {
        return GetLevel(player) switch
        {
            0 => 20,
            1 => 40,
            2 => 80,
            _ => 80
        };
    }

    public override void SaveData(TagCompound tag)
    {
        tag["Affection"] = Affection;
        tag["HasReceivedSoulTalisman"] = HasReceivedSoulTalisman;
        tag["HasReceivedGuide"] = HasReceivedGuide;
        tag["HasReceivedOverlimit"] = HasReceivedOverlimit;
        tag["上次摸摸好感tick"] = 上次摸摸好感tick;
        tag["上次药剂tick"] = 上次药剂tick;
        tag["FoxActive"] = FoxActive;
        tag["FoxDead"] = FoxDead;
        tag["Weapon"] = ItemIO.Save(Weapon);
        tag["Weapon2"] = ItemIO.Save(Weapon2);
        tag["Weapon3"] = ItemIO.Save(Weapon3);
        tag["当前武器槽"] = 当前武器槽;
        tag["Armor"] = new List<TagCompound>(Array.ConvertAll(Armor, ItemIO.Save));
        tag["Accessories"] = new List<TagCompound>(Array.ConvertAll(Accessories, ItemIO.Save));
        tag["Storage"] = new List<TagCompound>(Array.ConvertAll(Storage, ItemIO.Save));
    }

    public override void LoadData(TagCompound tag)
    {
        Affection = tag.GetInt("Affection");
        HasReceivedSoulTalisman = tag.ContainsKey("HasReceivedSoulTalisman") && tag.GetBool("HasReceivedSoulTalisman");
        HasReceivedGuide = tag.ContainsKey("HasReceivedGuide") && tag.GetBool("HasReceivedGuide");
        HasReceivedOverlimit = tag.ContainsKey("HasReceivedOverlimit") && tag.GetBool("HasReceivedOverlimit");
        上次摸摸好感tick = tag.ContainsKey("上次摸摸好感tick") ? tag.GetInt("上次摸摸好感tick") : 0;
        上次药剂tick = tag.ContainsKey("上次药剂tick") ? tag.GetInt("上次药剂tick") : 0;
        FoxActive = tag.ContainsKey("FoxActive") && tag.GetBool("FoxActive");
        FoxDead = tag.ContainsKey("FoxDead") && tag.GetBool("FoxDead");
        Weapon = tag.ContainsKey("Weapon") ? ItemIO.Load(tag.GetCompound("Weapon")) : new Item();
        Weapon2 = tag.ContainsKey("Weapon2") ? ItemIO.Load(tag.GetCompound("Weapon2")) : new Item();
        Weapon3 = tag.ContainsKey("Weapon3") ? ItemIO.Load(tag.GetCompound("Weapon3")) : new Item();
        当前武器槽 = tag.ContainsKey("当前武器槽") ? tag.GetInt("当前武器槽") : 0;
        LoadItems(tag, "Armor", Armor);
        LoadItems(tag, "Accessories", Accessories);
        LoadItems(tag, "Storage", Storage);
    }

    private static void LoadItems(TagCompound tag, string key, Item[] destination)
    {
        if (!tag.ContainsKey(key))
            return;

        IList<TagCompound> source = tag.GetList<TagCompound>(key);
        for (int index = 0; index < destination.Length && index < source.Count; index++)
            destination[index] = ItemIO.Load(source[index]);
    }
}
