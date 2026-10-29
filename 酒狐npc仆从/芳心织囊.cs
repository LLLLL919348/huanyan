using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>芳心织囊——正面buff时间翻倍、恢复药剂+50%、负面buff减半</summary>
public sealed class 芳心织囊 : ModItem
{
    public override string Texture => "酒狐npc仆从/饰品/fragrant_ingenuity_big";

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;
        Item.rare = ItemRarityID.Pink;
        Item.value = Item.buyPrice(gold: 6);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddIngredient(ItemID.Silk, 20)            //丝绸x20
            .AddIngredient(ItemID.StrangePlant1, 1)     //任意奇异植物x1（此处用奇异植物之一）
            .AddIngredient(ItemID.Feather, 2)           //普通羽毛x2
            .AddTile(TileID.Loom)                       //织布机
            .Register();
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(255, 150, 190);
                break;
            }
        }
    }
}
