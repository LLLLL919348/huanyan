using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>双心之链——玩家与酒狐各承担一半任意一方所受的伤害。仅酒狐可佩戴有用。</summary>
public sealed class 双心之链 : ModItem
{
    public override string Texture => "酒狐npc仆从/饰品/double_heart_chain_big";

    public override void SetDefaults()
    {
        Item.width = 32;
        Item.height = 32;
        Item.accessory = true;
        Item.maxStack = 1;
        Item.rare = ItemRarityID.Cyan;
        Item.value = Item.buyPrice(gold: 6);
        Item.useTime = 30;
        Item.useAnimation = 30;
        Item.useStyle = ItemUseStyleID.Swing;
    }

    public override void AddRecipes()
    {
        CreateRecipe()
            .AddIngredient(ItemID.LifeCrystal, 2)    //生命水晶x2
            .AddIngredient(ItemID.PlatinumBar, 5)    //铂金锭x5
            .AddIngredient(ItemID.GoldBar, 2)        //金锭x2
            .AddTile(TileID.TinkerersWorkbench)      //工匠作坊
            .Register();
    }

    public override void ModifyTooltips(List<TooltipLine> tooltips)
    {
        foreach (TooltipLine line in tooltips)
        {
            if (line.Name == "ItemName")
            {
                line.OverrideColor = new Color(165, 205, 235);   //银蓝字体（契合链条）
                break;
            }
        }
    }
}
