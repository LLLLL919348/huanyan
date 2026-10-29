using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>
/// 寻风之铃——消耗品。使用后复活已故的酒狐。
/// 仅当酒狐确实死亡时才会生效并消耗（否则不消耗、不生效）。
/// 生命水晶x1+任意玩偶x1+金锭x1 在恶魔祭坛合成。
/// </summary>
public sealed class 寻风之铃 : ModItem
{
    public override string Texture => "酒狐npc仆从/饰品/wind_seeking_bell_big";

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.maxStack = 1;
        Item.consumable = true;
        Item.useTime = 26;
        Item.useAnimation = 26;
        Item.useStyle = ItemUseStyleID.HoldUp;
        Item.rare = ItemRarityID.Lime;
        Item.value = Item.buyPrice(gold: 2);
        Item.UseSound = SoundID.Item29;
        Item.ResearchUnlockCount = 1;
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddIngredient(ItemID.LifeCrystal, 1)            //生命水晶x1
            .AddRecipeGroup("酒狐npc仆从:AnyDoll", 1)        //任意玩偶x1
            .AddIngredient(ItemID.GoldBar, 1)                //金锭x1
            .AddTile(TileID.DemonAltar)                      //恶魔祭坛
            .Register();
    }

    public override bool CanUseItem(Player player)
    {
        //确保酒狐确实死亡（且世界上当前没有该玩家的酒狐）才可使用
        return 酒狐确认死亡(player) && 酒狐饰品.找酒狐(player) == null;
    }

    public override bool? UseItem(Player player)
    {
        //二次确认：只有确实死亡才复活并消耗
        if (!酒狐确认死亡(player)) return false;
        if (Main.netMode == NetmodeID.MultiplayerClient) return false;

        //玩家身旁复活
        Vector2 pos = player.Center + new Vector2(player.direction * 60f, -20f);
        int spawned = NPC.NewNPC(player.GetSource_ItemUse(Item), (int)pos.X, (int)pos.Y, ModContent.NPCType<酒狐>());
        if (spawned >= 0 && spawned < Main.maxNPCs)
        {
            酒狐NPC状态.SetFollowTarget(Main.npc[spawned], player.whoAmI);
            酒狐玩家 data = player.GetModPlayer<酒狐玩家>();
            data.FoxActive = true;
            data.FoxDead = false;

            //复活台词：改在【头顶】显示（不再走左下角聊天框）
            if (!Main.dedServ)
            {
                string[] texts = {
                    "酒狐：主人我回来啦~",
                    "酒狐：风吹到哪儿，我就在哪儿~",
                    "酒狐：呀，又见面啦！",
                    "酒狐：铃铛一响，我就回来啦！",
                    "酒狐：主人，我回来陪你啦~",
                    "酒狐：沿着风的味道找到你啦~"
                };
                酒狐头顶文本.直接说话(Main.npc[spawned], texts[Main.rand.Next(texts.Length)]);
            }
            return true;
        }
        return false;
    }

    //酒狐“确实死亡”：玩家持有过酒狐（FoxActive 或 FoxDead）且当前世界上没有该玩家的酒狐，且标记为死亡
    private static bool 酒狐确认死亡(Player player)
    {
        酒狐玩家 data = player.GetModPlayer<酒狐玩家>();
        //若世界上有该玩家酒狐 → 未死
        if (酒狐饰品.找酒狐(player) != null) return false;
        //酒狐已死亡（曾在世界上且死亡）才视为可复活；纯“从未拥有过”不消耗
        return data.FoxDead;
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(150, 220, 160);
                break;
            }
        }
    }
}
