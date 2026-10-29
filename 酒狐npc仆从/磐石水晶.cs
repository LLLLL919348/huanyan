using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>磐石水晶——使用者获得高额抗击退，并减少5%所受弹幕伤害。</summary>
public sealed class 磐石水晶 : ModItem
{
    public override string Texture => "酒狐npc仆从/饰品/rock_crystal_big";

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;
        Item.rare = ItemRarityID.Orange;
        Item.value = Item.buyPrice(gold: 5);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddRecipeGroup("酒狐npc仆从:AnyGem", 8)   //任意宝石x8
            .AddIngredient(ItemID.CobaltShield, 1)      //钴盾牌x1
            .AddTile(TileID.TinkerersWorkbench)         //工匠作坊
            .Register();
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(120, 200, 255);
                break;
            }
        }
    }
}
