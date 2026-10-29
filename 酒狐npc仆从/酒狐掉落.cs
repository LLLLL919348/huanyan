using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>酒狐饰品的NPC掉落：嗜血之心（血肉墙30%、吸血鬼5%）、混沌之书（混沌元素0.5%）。</summary>
public sealed class 酒狐掉落 : GlobalNPC
{
    //酒狐所在的区域常加载、但不刷怪：在酒狐周围一定半径内禁止普通刷怪
    public override void EditSpawnPool(IDictionary<int, float> pool, NPCSpawnInfo spawnInfo)
    {
        if (pool.Count == 0) return;
        //只拦截常规刷怪（天空/入侵等不管），若刷怪点附近有酒狐则清空
        if (spawnInfo.Sky || spawnInfo.Invasion) return;
        float spawnX = spawnInfo.SpawnTileX * 16f;
        float spawnY = spawnInfo.SpawnTileY * 16f;
        for (int i = 0; i < Main.maxNPCs; i++)
        {
            NPC n = Main.npc[i];
            if (!n.active || n.type != ModContent.NPCType<酒狐>()) continue;
            //酒狐周围 12 格（192px）不刷怪
            float d = Vector2.Distance(new Vector2(spawnX, spawnY), n.Center);
            if (d < 192f)
            {
                pool.Clear();
                return;
            }
        }
    }

    public override void OnKill(NPC npc)
    {
        Terraria.Player pl = Main.LocalPlayer;
        if (npc.lastInteraction >= 0 && npc.lastInteraction < Main.maxPlayers)
        {
            Terraria.Player killer = Main.player[npc.lastInteraction];
            if (killer != null && killer.active)
                pl = killer;
        }

        //====击杀boss → 酒狐夸奖（≥100s间隔）====
        if (npc.boss)
        {
            NPC fox = 酒狐饰品.找酒狐(pl);
            if (fox != null && fox.active)
                酒狐NPC状态.酒狐夸奖Boss(fox);
        }

        if (npc.type == NPCID.WallofFlesh && Main.rand.NextFloat() < 0.30f)
            pl.QuickSpawnItem(pl.GetSource_Loot(), ModContent.ItemType<嗜血之心>());
        else if (npc.type == NPCID.Vampire && Main.rand.NextFloat() < 0.05f)
            pl.QuickSpawnItem(pl.GetSource_Loot(), ModContent.ItemType<嗜血之心>());
        else if (npc.type == NPCID.ChaosElemental && Main.rand.NextFloat() < 0.005f)
            pl.QuickSpawnItem(pl.GetSource_Loot(), ModContent.ItemType<混沌之书>());
        //低吟之戒：任意名字带“法师”的生物1%掉落（黑法师/符文法师/蒂姆）
        else if ((npc.type == NPCID.DarkCaster || npc.type == NPCID.RuneWizard || npc.type == NPCID.Tim)
              && Main.rand.NextFloat() < 0.01f)
            pl.QuickSpawnItem(pl.GetSource_Loot(), ModContent.ItemType<低吟之戒>());
        //磐石水晶：圣骑士 或 名字带“巨人”的非boss怪物 3%掉落
        else if ((npc.type == NPCID.Paladin || (npc.FullName.Contains("巨人") && !npc.boss))
              && Main.rand.NextFloat() < 0.03f)
            pl.QuickSpawnItem(pl.GetSource_Loot(), ModContent.ItemType<磐石水晶>());
        //烬华之戒：击败克苏鲁之眼15%掉落
        else if (npc.type == NPCID.EyeofCthulhu && Main.rand.NextFloat() < 0.15f)
            pl.QuickSpawnItem(pl.GetSource_Loot(), ModContent.ItemType<烬华之戒>());
        //紫荆冠刺：击杀尖刺史莱姆5%掉落
        else if (是尖刺史莱姆(npc) && Main.rand.NextFloat() < 0.05f)
            pl.QuickSpawnItem(pl.GetSource_Loot(), ModContent.ItemType<紫荆冠刺>());
    }

    // 尖刺史莱姆一族：普通尖刺史莱姆 / 丛林尖刺史莱姆 / 冰雪尖刺史莱姆
    private static bool 是尖刺史莱姆(NPC npc)
    {
        switch (npc.type)
        {
            case NPCID.SlimeSpiked:
            case NPCID.SpikedJungleSlime:
            case NPCID.SpikedIceSlime:
            case NPCID.DungeonSlime:
                return true;
            default:
                return false;
        }
    }
}
