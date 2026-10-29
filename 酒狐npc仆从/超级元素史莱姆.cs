using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>超级元素史莱姆——装备后攻击附带流血/中毒/着火/剧毒/诅咒焰/灵液/霜冻效果。</summary>
public sealed class 超级元素史莱姆 : ModItem
{
    public override string Texture => "酒狐npc仆从/饰品/super_elemental_slime_big";

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;
        Item.rare = ItemRarityID.Lime;
        Item.value = Item.buyPrice(gold: 8);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddIngredient(ItemID.Spike, 1)            //尖刺x1
            .AddIngredient(ItemID.PoisonStaff, 1)      //剧毒法杖x1
            .AddIngredient(ItemID.FieryGreatsword, 1)    //火山（炽焰巨剑）x1
            .AddIngredient(ItemID.VenomStaff, 1)       //毒液法杖x1
            .AddIngredient(ItemID.CursedFlames, 1)     //诅咒焰x1
            .AddIngredient(ItemID.GoldenShower, 1)     //黄金雨x1
            .AddIngredient(ItemID.FrostStaff, 1)       //结霜魔棒x1
            .AddIngredient(ItemID.Gel, 100)            //凝胶x100
            .AddTile(TileID.DemonAltar)                //恶魔祭坛
            .Register();
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(110, 200, 90);
                break;
            }
        }
    }
}
