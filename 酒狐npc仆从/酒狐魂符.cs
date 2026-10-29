using System.Collections.Generic;
using System.IO;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;
using Terraria.ModLoader.IO;

namespace 酒狐npc仆从;

/// <summary>
/// 酒狐魂符：收纳 / 召唤酒狐的道具。
/// 左键使用：把酒狐（若在世界）收纳进魂符，或把收纳的酒狐召唤到左键指向位置。
/// 物品名称会随“是否带有酒狐”动态改变。
/// </summary>
public sealed class 酒狐魂符 : ModItem
{
    private bool containsFox;

    public override string Texture => "酒狐npc仆从/Content/Images/JiuHuSummon";

    public override void SetDefaults()
    {
        Item.width = 40;
        Item.height = 40;
        Item.maxStack = 1;
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
        Item.rare = ItemRarityID.Orange;
        Item.value = Item.buyPrice(gold: 1);
        Item.UseSound = SoundID.Item44;
        Item.ResearchUnlockCount = 1;
    }

    public override bool AltFunctionUse(Player player) => false;

    public override bool CanUseItem(Player player)
    {
        //任意时刻左键都可使用：收纳（世界有酒狐时）或召唤（魂符藏有酒狐时）
        int npcIndex = FindOwnedNPC(player);
        bool hasWorldFox = npcIndex >= 0;
        bool foxDead = player.GetModPlayer<酒狐玩家>().FoxDead;
        //魂符未藏酒狐、世界也没有酒狐 → 若酒狐已死亡应允许使用（用于提示复活）；否则不可用
        if (!containsFox && !hasWorldFox)
            return foxDead;   //酒狐已死亡：允许使用，用来提示需用寻风之铃
        return containsFox ? !hasWorldFox : hasWorldFox;
    }

    public override bool? UseItem(Player player)
    {
        int npcIndex = FindOwnedNPC(player);
        if (!containsFox && npcIndex >= 0)
        {
            //收纳：把世界上的酒狐存进魂符
            酒狐NPC状态.Store(npcIndex, player.whoAmI);
            containsFox = true;
            player.GetModPlayer<酒狐玩家>().FoxActive = false;   //收入魂符
            酒狐任务执行.酒狐被收集(player);   //暂停执行中的任务
            Main.NewText("酒狐收进了魂符", new Color(180, 160, 240));
            return true;
        }

        //未藏酒狐、世界也没有酒狐，且酒狐已死亡 → 提示需用寻风之铃复活
        if (!containsFox && npcIndex < 0 && player.GetModPlayer<酒狐玩家>().FoxDead)
        {
            Main.NewText("酒狐已经死了，需要用［寻风之铃］复活它……", new Color(220, 170, 140));
            return true;
        }

        if (containsFox && Main.netMode != NetmodeID.MultiplayerClient)
        {
            //召唤：把魂符内的酒狐召唤到左键指向位置
            Vector2 spawnPos = Main.MouseWorld;
            //确保落点不在地形内：简单上移找空位
            int sx = (int)(spawnPos.X / 16f);
            int sy = (int)(spawnPos.Y / 16f);
            if (SyIsSolid(sx, sy))
                sy -= 2;
            int spawned = NPC.NewNPC(player.GetSource_ItemUse(Item), sx * 16 + 8, sy * 16 + 8, ModContent.NPCType<酒狐>());
            if (spawned >= 0 && spawned < Main.maxNPCs)
            {
                酒狐NPC状态.SetFollowTarget(Main.npc[spawned], player.whoAmI);
                containsFox = false;
                player.GetModPlayer<酒狐玩家>().FoxActive = true;   //已召唤到世界上
                player.GetModPlayer<酒狐玩家>().FoxDead = false;
            }
        }

        return true;
    }

    private static bool SyIsSolid(int x, int y)
    {
        if (x < 0 || y < 0 || x >= Main.maxTilesX || y >= Main.maxTilesY) return false;
        return Main.tile[x, y].HasTile && Main.tileSolid[Main.tile[x, y].TileType];
    }

    public override void SaveData(TagCompound tag)
    {
        tag["ContainsNPC"] = containsFox;
    }

    // 生成一个“藏有酒狐”的魂符（首次进入世界赠送）：避免玩家空手需先收一只
    public static void SpawnContainingFox(Player player)
    {
        int type = ModContent.ItemType<酒狐魂符>();
        int index = player.QuickSpawnItem(player.GetSource_Misc("酒狐首次进入世界"), type);
        if (index >= 0 && index < Main.item.Length)
        {
            Item it = Main.item[index];
            if (it != null && it.type == type && it.ModItem is 酒狐魂符 summon)
                summon.containsFox = true;   //标记为藏有酒狐
        }
    }

    public override void LoadData(TagCompound tag)
    {
        containsFox = tag.ContainsKey("ContainsNPC") && tag.GetBool("ContainsNPC");
    }

    public override void NetSend(BinaryWriter writer)
    {
        writer.Write(containsFox);
    }

    public override void NetReceive(BinaryReader reader)
    {
        containsFox = reader.ReadBoolean();
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        //物品名随状态变化：带有酒狐 / 未带酒狐
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.Text = containsFox ? "酒狐魂符（藏有酒狐）" : "酒狐魂符（未带酒狐）";
                line.OverrideColor = containsFox ? new Color(140, 200, 255) : new Color(170, 170, 190);
                break;
            }
        }
        //额外说明
        if (containsFox)
            tooltips.Add(new TooltipLine(Mod, "FoxTip", "左键使用：把酒狐召唤到指定位置"));
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddRecipeGroup("酒狐npc仆从:AnyFlower", 4)
            .AddTile(TileID.WorkBenches)
            .Register();
    }

    private static int FindOwnedNPC(Player player)
    {
        for (int index = 0; index < Main.maxNPCs; index++)
        {
            NPC npc = Main.npc[index];
            if (npc.active && npc.type == ModContent.NPCType<酒狐>() && (int)npc.localAI[1] == player.whoAmI)
                return index;
        }

        return -1;
    }
}
