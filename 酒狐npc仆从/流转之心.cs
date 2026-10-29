using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.DataStructures;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>
/// 流转之心（flow-core）——提高佩戴者20%恢复效力（任何恢复都+20%，含吸血）、
/// 最大生命+10%、防御力+5%，并加速自然生命恢复与魔法恢复（酒狐即加速自然生命恢复）。
/// 获取：光明之魂x10 + 黑暗之魂x10 + 天界石x1。玩家与酒狐都可佩戴。
/// </summary>
public sealed class 流转之心 : ModItem
{
    public override string Texture => "酒狐npc仆从/饰品/flow_core_big";

    //贴图是垂直动画（32×1152 = 36帧）：在物品栏循环播放
    public override void SetStaticDefaults()
    {
        Main.itemAnimations[Item.type] = new DrawAnimationVertical(6, 36);
    }

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;
        Item.rare = ItemRarityID.Pink;
        Item.value = Item.buyPrice(gold: 9);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddIngredient(ItemID.SoulofLight, 10)
            .AddIngredient(ItemID.SoulofNight, 10)
            .AddIngredient(ItemID.CelestialStone, 1)
            .AddTile(TileID.TinkerersWorkbench)
            .Register();
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(150, 220, 255);
                break;
            }
        }
    }

    // 恢复效力加成：所有恢复(含吸血) *1.2
    public static int 恢复量(int amount) => (int)(amount * 1.2f);
}
